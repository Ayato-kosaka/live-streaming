#!/usr/bin/env python3
"""同じ動画を同じ場所へ2回出さないための台帳（`posted.json`）を引く・書く。

`post.py` の投稿の段（`yt-draft` / `tt-post`）が、**EC2 に触る前に**ここを引く。

- 同じ sha256 × 同じ場所の、いちばん新しい記録が `done` → 止める（出ている投稿 ID を出す）
- `pending` → 止める（前の回が途中で切れた。投稿先で見てから `mark --done --id …` か `--again`）
- `--again` を付けたときだけ、記録があっても通す（後ろに新しい記録を足す。前の記録は消さない）
- 投稿を始める直前に `pending` を書き、ID が取れたら `done` に書き換える。
  **落ちたら `pending` のまま残る**——それが狙い

1件 = 案（`<元の動画ID>/<案>`）・場所（youtube / tiktok）・状態・投稿 ID（分かれば）・
動画の sha256・時刻（始めた時刻、UTC）。視聴者さんの名前や鍵は入れない。

## なぜ要るか（#920）

2026-10-17 に C の TikTok が WebSocket の待ち切れで落ちて、「出たのか出ていないのか」を
人の目で確かめてから出し直した。道具は何も覚えていなかった。
セッションをまたいでも残るように、台帳は git に入れる。

見張りは同じ置き場の `posted_selftest.py`（EC2 には触らない）。
"""
import hashlib
import json
import os
import re
import time

HERE = os.path.dirname(os.path.abspath(__file__))
# 見張りは使い捨ての台帳に差し替えて回す（本物の台帳を書き換えない）
LEDGER = os.path.join(HERE, "posted.json")
PLACES = ("youtube", "tiktok")
STATES = ("pending", "done")
SHA_RE = re.compile(r"[0-9a-f]{64}")
# 投稿 ID の形。URL ごと貼る・場所を取り違える、を書き込む前に断る
ID_RE = {"youtube": re.compile(r"[\w-]{11}"), "tiktok": re.compile(r"\d{15,25}")}
# 止めたときに「何を見ればいいか」として出す先
SEE = {"youtube": "https://studio.youtube.com/video/{}/edit",
       "tiktok": "https://www.tiktok.com/@ayato_arigato/video/{}"}
POST = "python3 tools/shorts/post/post.py"


class Broken(Exception):
    """台帳が読めない。**読めないときは通さない**（空として扱うと、守りが黙って外れる）"""


class Refused(Exception):
    """書き込みを断った（ID の形が違う・記録が無い・もう done）"""


def now():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def sha256_of(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def bad_record(r):
    """記録の形がおかしければ、その理由。正しければ None"""
    if not isinstance(r, dict):
        return "記録が dict ではない"
    if r.get("place") not in PLACES:
        return f"場所が {PLACES} のどれでもない: {r.get('place')!r}"
    if r.get("state") not in STATES:
        return f"状態が {STATES} のどれでもない: {r.get('state')!r}"
    if not (isinstance(r.get("sha256"), str) and SHA_RE.fullmatch(r["sha256"])):
        return "sha256 が 64 桁の16進ではない"
    if not (isinstance(r.get("plan"), str) and "/" in r["plan"]):
        return "案が <元の動画ID>/<案> の形ではない"
    if not isinstance(r.get("at"), str):
        return "時刻が無い"
    vid = r.get("id")
    if vid is not None and not (isinstance(vid, str) and ID_RE[r["place"]].fullmatch(vid)):
        return f"{r['place']} の投稿 ID の形ではない: {vid!r}"
    if r["state"] == "done" and vid is None:
        return "done なのに投稿 ID が無い（止めたときに、何を見ればいいか言えない）"
    return None


def load(path=None):
    p = path or LEDGER
    try:
        with open(p, encoding="utf-8") as f:
            rows = json.load(f)
    except FileNotFoundError:
        raise Broken(f"台帳 {p} が無い（git に入っているはず。消えたなら戻してから出す）")
    except ValueError as e:
        raise Broken(f"台帳 {p} が JSON として読めない: {e}")
    if not isinstance(rows, list):
        raise Broken(f"台帳 {p} が並び（list）ではない")
    for i, r in enumerate(rows):
        why = bad_record(r)
        if why:
            raise Broken(f"台帳 {p} の {i} 件目: {why}")
    return rows


def save(rows, path=None):
    p = path or LEDGER
    # 1件1行。git の差分が「どの記録が増えた・変わったか」の1行で読める
    text = "[\n" + ",\n".join(" " + json.dumps(r, ensure_ascii=False) for r in rows) + "\n]\n"
    tmp = p + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(text)
    # 書きかけで落ちても、半分の台帳を残さない
    os.replace(tmp, p)


def latest(rows, sha, place):
    """同じ動画 × 同じ場所の、いちばん新しい記録（無ければ None）。`--again` は後ろに足すので、後ろが勝つ"""
    hit = None
    for r in rows:
        if r["sha256"] == sha and r["place"] == place:
            hit = r
    return hit


def next_step(r):
    return (f"  投稿先で出ているかを見てから:\n"
            f"    出ていれば     {POST} mark --place {r['place']} --sha {r['sha256']} --done --id <投稿ID>\n"
            f"    出ていなければ 同じコマンドに --again を付けてやり直す")


def done_msg(r):
    return (f"止めた: この動画（sha256 {r['sha256'][:8]}…）は {r['place']} にもう出ている"
            f"（{r['plan']}・投稿 ID {r['id']}・{r['at']}）。\n"
            f"  見るところ: {SEE[r['place']].format(r['id'])}\n"
            f"  わざともう一度出すときだけ --again を付ける")


def pending_msg(r):
    clue = f"・ID の手がかり {r['id']}" if r.get("id") else ""
    return (f"止めた: {r['plan']} の {r['place']} は、前の回が途中で切れた"
            f"（{r['at']} に始めて、終わりを書けていない{clue}）。\n" + next_step(r))


def refusal(rows, sha, place, again=False):
    """止めるなら、その理由と次の一手（字）。通すなら None"""
    r = latest(rows, sha, place)
    if r is None:
        return None
    if again:
        return None
    if r["state"] == "done":
        return done_msg(r)
    if r["state"] == "pending":
        return pending_msg(r)
    return f"止めた: 知らない状態 {r['state']!r}"


def begin(sha, place, plan, again=False, path=None):
    """投稿を始める直前に pending を書く。**落ちたら pending のまま残る**のが狙い"""
    rows = load(path)
    rec = {"plan": plan, "place": place, "state": "pending", "id": None, "sha256": sha, "at": now()}
    if again and latest(rows, sha, place):
        rec["again"] = True
    rows.append(rec)
    save(rows, path)
    return rec


def _index(rows, rec):
    for i in range(len(rows) - 1, -1, -1):
        if rows[i] == rec:
            return i
    return None


def finish(rec, vid=None, done=False, path=None):
    """投稿の段が戻ったら書き戻す。done は ID が取れたときだけ。取れなければ pending のまま、ID の手がかりだけ残す"""
    rows = load(path)
    new = dict(rec, id=vid or rec.get("id"))
    new["state"] = "done" if (done and new["id"]) else "pending"
    i = _index(rows, rec)
    if i is None:
        # 走っているあいだに誰かが台帳を書き換えた。出たかもしれない事実は落とさない
        rows.append(new)
    else:
        rows[i] = new
    save(rows, path)
    return new


def forget(rec, path=None):
    """何も始まらなかった回（遠隔デスクトップが使われていた）の pending を消す"""
    rows = load(path)
    i = _index(rows, rec)
    if i is not None:
        del rows[i]
        save(rows, path)


def mark(sha, place, vid, plan=None, path=None):
    """人が投稿先で見て確かめた結果を書く（pending → done）。記録が無ければ、案が分かるときだけ足す"""
    if place not in PLACES:
        raise Refused(f"--place は {' / '.join(PLACES)} のどれか（{place!r}）")
    if not (isinstance(vid, str) and ID_RE[place].fullmatch(vid)):
        raise Refused(f"{place} の投稿 ID の形ではない: {vid!r}（URL ではなく ID だけを渡す）")
    rows = load(path)
    r = latest(rows, sha, place)
    if r is None:
        if not plan:
            raise Refused("この動画 × 場所の記録が無い。足すなら --video と --option も付ける")
        r = {"plan": plan, "place": place, "state": "done", "id": vid, "sha256": sha, "at": now()}
        rows.append(r)
    elif r["state"] == "done":
        raise Refused(f"もう done になっている（投稿 ID {r['id']}）。直すなら posted.json を手で直してコミットする")
    else:
        r.update(state="done", id=vid)
    save(rows, path)
    return r


def id_of(place, res):
    """EC2 の結果（RESULT の1行）から投稿 ID を読む。読めなければ None"""
    if place == "youtube":
        v = res.get("video_id")
        return v if isinstance(v, str) and ID_RE["youtube"].fullmatch(v) else None
    ids = set()
    for u in res.get("urls") or []:
        m = re.search(r"/video/(\d+)", u or "")
        if m:
            ids.add(m.group(1))
    # 同じ題の行が2つ以上あると、どれが今の投稿か決められない。決めずに人に見てもらう
    return ids.pop() if len(ids) == 1 else None
