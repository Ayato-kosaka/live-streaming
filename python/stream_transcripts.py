"""配信アーカイブの文字起こし（自動字幕）とチャットを取り、`streams/` に置く。

    python3 python/stream_transcripts.py plan  --count 150 --out-dir plan/   # 何を取るか・3つに分ける（BQ だけ）
    python3 python/stream_transcripts.py fetch plan/todo-0.json --out-dir out/  # 1つぶんを取る
    python3 python/stream_transcripts.py merge got/                          # 集めて streams/ と manifest に足す
    python3 python/stream_transcripts.py next  --ok 12                       # 続きを起こすか（BQ と Actions）

    python3 python/stream_transcripts.py fetch todo.json     # --out-dir 無し: streams/ に直に書く（手元用）

Actions（`.github/workflows/stream_transcripts.yml`）で回す。作業箱からは YouTube の
字幕が 429 で断られ、BigQuery にも届かないので。

## 何を取るか（plan）

BQ の `videos` から、開始時刻のある配信を**新しい順**に並べ、`streams/manifest.tsv` で
済みでないもの（字幕が ok でない・まだ3回取りに行っていない）を最大 N 本。
チャットの取り込みが落ち着いていない配信（PENDING / WAITING）は待つ。
いま書くとチャットが0件のまま「済み」になって、あとから増えた分を取り直さないので。

**3つに分けて並べて取る**（`split`）。1本ずつ順に取ると、溜まった数百本が
1晩40本ずつしか減らなかった。字幕は1本ごとに数十秒待つ仕事なので、ランナー（＝IP）を
分ければそのまま速くなる。**配る順は新しいものから交互に**——どの1つが落ちても、
いちばん新しい配信がまとめて取り残されないように。

## 取り方（fetch）

- 字幕は yt-dlp で `--skip-download`（動画は落とさない）。口の当たり方・PO Token・Cookie は
  ショートの取り込み（`tools/shorts/ingest/download.py`）のをそのまま使う
- **Cookie を使うほかの取り込みと同時に使わない。** 1本ごとに `gate.py` で見る。
  見るのは run ではなく **Cookie を握る job**（`job_aware`）。ショートの取り込みの解析は
  Cookie に触らないまま何時間も run を開けておくので、run で見ると毎晩それを待って諦める
- 1本ごとに数秒あける
- **429 か「ボット確認」が出ても打ち切らない。** 60→120→240→480秒と待って、同じ配信を
  取り直す。前は2本続いたらその回をやめていたので、1晩の締め出しで残りが丸ごと次の晩に
  回っていた。**待ち切っても続くときだけ**、その1つの残りを次回に回す。
  **回したものは manifest に書かない**——書くと「取りに行った回数」を締め出しで使い切って、
  字幕があるのに諦めることになる
- チャットは BQ の `chat_messages` から1回のクエリでまとめて引く

`--out-dir` を付けると、書くのは `<out-dir>/streams/…` と `<out-dir>/rows.json` だけ。
並べて取るとき、3つが同じ `manifest.tsv` を書くと最後の1つしか残らないので、
行は別に出して最後の1か所（merge）で足す。

## 続きを起こす（next）

残りがあって、今回1本でも取れていれば、ワークフローが自分をもう一度起こす（`should_chain`）。
**1本も取れなかった回は起こさない**——取れない理由が続いているのに起こし続けると止まらない。
1回に1本以上「ok」が増えるので、起こす回数は未取得の本数で必ず尽きる。

## ログに出すもの

動画ID・本数・字数・件数・成否の理由だけ。**題名・字幕・視聴者さんの名前やコメントは出さない**
（このリポジトリは公開で、Actions のログも誰でも読める）。中身はファイルにだけ書く。
"""

from __future__ import annotations

import argparse
import datetime as dt
import importlib.util
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))
import stream_text as st  # noqa: E402

STREAMS = ROOT / "streams"
MANIFEST = STREAMS / "manifest.tsv"
DATASET = "youtube_chat"
WORKFLOW = "stream_transcripts.yml"
WF_DIR = ROOT / ".github/workflows"
# 1本ごとにあける秒。字幕は1本1〜2回の要求なので、これで1分に数本に収まる
PAUSE_SEC = 8
# 並べて取る数と、1つあたりの上限。3つ × 50本で、1回の上限が 150本
SHARDS = 3
PER_SHARD = 50
# 429 / ボット確認が出たら待つ秒。倍々にするのは、締め出しが数分で明けることも
# 十数分続くこともあるから。合わせて15分待っても続く日は、その1つを次回に回す
BACKOFF = (60, 120, 240, 480)
THROTTLE = ("429", "429（取りすぎ）", "ボット確認")
# 1つの持ち時間（分）。ここを過ぎたら新しい配信に手を付けない。job の timeout で
# 殺されると rows.json を上げる step が走るとは限らないので、自分で先に止まる
BUDGET_MIN = 125
# 同じ concurrency の枠で「空き待ち」の状態。**新しい run が枠に並ぶと、先に待っていた
# run は GitHub に消される**（同じ枠の pending は1つだけ）。続きを起こすとき、
# 毎晩の取り込みが待っていたらそれを消してしまうので、ここで見て起こさない
SLOT_WAITING = ("requested", "queued", "pending", "waiting")


def bq():
    from google.cloud import bigquery

    project = os.environ.get("BQ_PROJECT_ID", "")
    if not project:
        raise SystemExit("BQ_PROJECT_ID が無い")
    return bigquery, bigquery.Client(project=project), project


# ---------------------------------------------------------------- plan

def videos() -> list[dict]:
    bigquery, client, project = bq()
    sql = f"""
SELECT video_id, title, actual_start_time, status
FROM `{project}.{DATASET}.videos`
WHERE actual_start_time IS NOT NULL
ORDER BY actual_start_time DESC
"""
    return [{"video_id": r.video_id, "title": r.title or "", "status": r.status,
             "start": r.actual_start_time.astimezone(dt.timezone.utc)}
            for r in client.query(sql).result()]


def select(rows: list[dict], man: dict[str, dict], count: int | None) -> tuple[list[dict], int]:
    """取るもの（新しい順・最大 count 本。None なら全部）と、チャット待ちの本数。

    plan と next（残りを数える）が**同じ数え方**をするために、ここ1つにしてある。
    数え方がずれると「残りがあるのに選ばれない」配信が出て、続きを起こし続けて止まらない。
    """
    rows = sorted(rows, key=lambda r: r["start"], reverse=True)
    todo, waiting = [], 0
    for r in rows:
        prev = man.get(r["video_id"])
        if not st.wanted(prev):
            continue
        if r["status"] in ("PENDING", "WAITING"):
            waiting += 1
            continue
        todo.append({"video_id": r["video_id"], "title": r["title"],
                     "start": r["start"].isoformat(), "tries": int((prev or {}).get("tries") or 0)})
        if count is not None and len(todo) >= count:
            break
    return todo, waiting


def split(todo: list[dict], n: int = SHARDS) -> list[list[dict]]:
    """n 個に分ける。新しい順のまま**交互に**配る（空の分は返さない）。

    頭から50本ずつに切ると、1つ目が落ちた日にいちばん新しい50本がまとめて残る。
    交互なら、どれが落ちても新しいものは他の2つにも散っている。
    """
    n = max(1, n)
    parts = [todo[i::n] for i in range(n)]
    return [p for p in parts if p]


def plan(count: int, out_dir: Path) -> int:
    cap = SHARDS * PER_SHARD
    if count > cap:
        print(f"1回の上限は {cap}本（{SHARDS}つ × {PER_SHARD}本）。{count}本は {cap}本に詰める",
              flush=True)
        count = cap
    rows = videos()
    man = st.read_manifest(MANIFEST)
    todo, waiting = select(rows, man, count)
    parts = split(todo)
    done = sum(1 for r in man.values() if r.get("caption") == "ok")
    print(f"配信 {len(rows)}本 / 済み {done}本 / チャット待ち {waiting}本 / 今回取る {len(todo)}本"
          f"（{len(parts)}つに分ける: {' / '.join(str(len(p)) for p in parts) or '-'}）", flush=True)
    out_dir.mkdir(parents=True, exist_ok=True)
    for i, part in enumerate(parts):
        (out_dir / f"todo-{i}.json").write_text(json.dumps(part, ensure_ascii=False),
                                                 encoding="utf-8")
    gh_out = os.environ.get("GITHUB_OUTPUT")
    if gh_out:
        with open(gh_out, "a", encoding="utf-8") as f:
            f.write(f"count={len(todo)}\nshards={json.dumps(list(range(len(parts))))}\n")
    return 0


# ---------------------------------------------------------------- チャット

def fetch_chat(ids: list[str]) -> dict[str, list[dict]]:
    """動画ごとのチャット。配信内の時刻の手がかり（msec / timestampText）は生データから抜く。"""
    bigquery, client, project = bq()
    sql = f"""
SELECT
  video_id, event_type, published_at, author_name, message_text, purchase_amount_text,
  REGEXP_EXTRACT(TO_JSON_STRING(raw_item_json), r'"videoOffsetTimeMsec":"?(\\d+)') AS offset_msec,
  REGEXP_EXTRACT(TO_JSON_STRING(raw_item_json), r'"timestampText":\\{{"simpleText":"([^"]+)"') AS clock
FROM `{project}.{DATASET}.chat_messages`
WHERE video_id IN UNNEST(@ids) AND event_type IN ('TEXT', 'PAID', 'MEMBERSHIP')
ORDER BY video_id, timestamp_usec
"""
    cfg = bigquery.QueryJobConfig(query_parameters=[
        bigquery.ArrayQueryParameter("ids", "STRING", ids)])
    out: dict[str, list[dict]] = {i: [] for i in ids}
    for r in client.query(sql, job_config=cfg).result():
        out[r.video_id].append(dict(r.items()))
    return out


# ---------------------------------------------------------------- 字幕

def _load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.path.insert(0, str(path.parent))
    # 先に sys.modules に置く。gate.py の @dataclass は自分のモジュールを sys.modules から
    # 引くので、置かずに読むと next（続きを起こすか）だけが落ちる（run 10 で踏んだ）
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


def caption_kind(info: dict, files: dict[str, Path]) -> tuple[str, Path, str] | None:
    """使う字幕を選ぶ。手動の ja があればそれ、無ければ自動の ja-orig、無ければ自動の ja。"""
    manual = info.get("subtitles") or {}
    for lang, src in (("ja", "manual"), ("ja-orig", "auto"), ("ja", "auto")):
        if lang in files and (src == "auto" or lang in manual):
            return lang, files[lang], ("手動" if lang in manual else "自動")
    return None


def grab_captions(dl, vid: str, work: Path, client: str) -> dict:
    """1本ぶんの字幕と info を取る。結果は {ok, why, lang, path, kind, info}。"""
    url = f"https://www.youtube.com/watch?v={vid}"
    log = work / "ytdlp.log"
    cmd = dl.yt_args(client) + [
        "--skip-download", "--write-info-json", "--write-subs", "--write-auto-subs",
        "--sub-langs", "ja-orig,ja", "--sub-format", "json3/vtt/best",
        "--sleep-subtitles", "3", "-o", str(work / "src.%(ext)s"), url]
    rc = dl.run_ytdlp(cmd, log, 600)
    info = {}
    try:
        info = json.loads((work / "src.info.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        pass
    files = {}
    for p in sorted(work.glob("src.*")):
        parts = p.name.split(".")
        if len(parts) == 3 and parts[2] in ("json3", "vtt"):
            files.setdefault(parts[1], p)
    text = log.read_text(errors="ignore") if log.exists() else ""
    pick = caption_kind(info, files)
    if pick:
        lang, path, kind = pick
        return {"ok": True, "lang": lang, "path": path, "kind": kind, "info": info, "rc": rc}
    have = [k for k in list((info.get("automatic_captions") or {})) +
            list((info.get("subtitles") or {})) if k.startswith("ja")]
    if "HTTP Error 429" in text:
        why = "429"
    elif "Sign in to confirm" in text:
        why = "ボット確認"
    elif info and not have:
        why = "ja の字幕が無い"
    elif not info:
        why = dl.why_failed(text)
    else:
        why = "ja の字幕はあるが取れなかった"
    return {"ok": False, "why": why, "info": info, "rc": rc}


def next_client(dl, cur: str) -> str:
    """口の並び（tools/clip/fetch.py の CLIENTS）で、いまの次のもの。"""
    cs = list(dl.clip.CLIENTS)
    return cs[(cs.index(cur) + 1) % len(cs)] if cur in cs else cs[0]


# ---------------------------------------------------------------- Cookie を握る job

# gate.py は「Cookie を使うワークフローの run が動いているか」を **run 単位**で見る。
# ショートの取り込みは Cookie を握るのが fetch の job（数分）だけで、そのあとの解析
# （whisper・最長330分）は Cookie に触らないのに、run は in_progress のまま残る。
# ショートは配信の翌朝に頼まれ、毎晩の取り込みの完了でこちらが起きるのもその時間帯なので、
# **こちらは解析が終わるまで60分待って、1本も取らずに諦める**（2026-10-22 の晩がそれ）。
# そこで、動いている run は job まで見て、Cookie を握る job が全部終わっていれば数えない。
# **見分けられないときは握っているとみなす**（前と同じに倒す）。
SECRET = "YOUTUBE_COOKIES"
RUN_BUSY = ("requested", "queued", "in_progress")


def cookie_jobs(wf_path: Path) -> list[str | None]:
    """Cookie を握る job の、Actions の API に出る名前。式で名前が決まるものは None（見分けられない）。"""
    import yaml

    try:
        doc = yaml.safe_load(wf_path.read_text(encoding="utf-8")) or {}
    except (OSError, UnicodeDecodeError, yaml.YAMLError):
        return [None]
    out: list[str | None] = []
    for key, job in (doc.get("jobs") or {}).items():
        # yaml を通すのでコメントは落ちる（gate.py の「コメントだけのものは数えない」と同じ）
        if SECRET not in yaml.safe_dump(job, allow_unicode=True):
            continue
        name = job.get("name") if isinstance(job, dict) else None
        out.append(None if name and "${{" in str(name) else str(name or key))
    # ワークフローの頭（env など）で Cookie を読んでいるものは、どの job とも言えない
    if not out and SECRET in yaml.safe_dump({k: v for k, v in doc.items() if k != "jobs"},
                                            allow_unicode=True):
        out.append(None)
    return out


def holds_cookie(jobs: list[dict] | None, names: list[str | None]) -> bool:
    """この run が、まだ Cookie を握っている（これから握りうる）か。"""
    if jobs is None or not names or None in names:
        return True
    for n in names:
        mine = [j for j in jobs if j.get("name") == n or str(j.get("name") or "").startswith(f"{n} (")]
        # まだ一覧に無い job は、前の job が終わるのを待っているだけで、これから握る
        if not mine or any(j.get("status") != "completed" for j in mine):
            return True
    return False


def jobs_lister(repo: str, token: str, api: str = "https://api.github.com"):
    """run 1本ぶんの job の一覧。読めない・一覧が切れているなら None（握っているとみなす側）。"""
    import urllib.request

    def list_jobs(run_id) -> list[dict] | None:
        if not repo:
            return None
        req = urllib.request.Request(f"{api}/repos/{repo}/actions/runs/{run_id}/jobs?per_page=100",
                                     headers={"Accept": "application/vnd.github+json",
                                              "X-GitHub-Api-Version": "2022-11-28"})
        if token:
            req.add_header("Authorization", f"Bearer {token}")
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                d = json.load(r)
        except Exception:  # noqa: BLE001 — どの落ち方でも「握っている」に倒すだけ
            return None
        jobs = d.get("jobs") if isinstance(d, dict) else None
        if not isinstance(jobs, list) or int(d.get("total_count") or 0) > len(jobs):
            return None
        return jobs

    return list_jobs


def job_aware(list_runs, list_jobs, names_of):
    """gate に渡す run の一覧から、Cookie を握る job が全部終わった run を外す。"""

    def wrapped(wf: str) -> list:
        out = []
        for r in list_runs(wf):
            if r.get("status") in RUN_BUSY and not holds_cookie(list_jobs(r.get("id")), names_of(wf)):
                continue
            out.append(r)
        return out

    return wrapped


# ---------------------------------------------------------------- fetch

def write_one(item: dict, cap: dict | None, chat: list[dict], fetched: str,
              root: Path = STREAMS) -> dict:
    start = dt.datetime.fromisoformat(item["start"])
    stem = st.stem_for(item["video_id"], start)
    d = root / st.rel_dir(start)
    d.mkdir(parents=True, exist_ok=True)
    head = {"video_id": item["video_id"], "title": item["title"], "start": start}
    row = {"video_id": item["video_id"], "start_jst": f"{start.astimezone(st.JST):%Y-%m-%d %H:%M}",
           "stem": f"{st.rel_dir(start)}/{stem}", "fetched_at": fetched,
           "tries": item["tries"] + 1}
    lines, src = st.chat_lines(chat, start)
    chat_body = st.chat_text(head, lines, src)
    (d / f"{stem}.chat.txt").write_text(chat_body, encoding="utf-8")
    row["chat_count"] = len(lines)
    if cap and cap.get("ok"):
        raw = st.bin_captions(cap["rows"] if "rows" in cap else st.read_captions(cap["path"]))
        bins, n_music = st.mask_music(raw)
        head["caption_desc"] = f"{cap['lang']}（{cap['kind']}・{cap['path'].suffix[1:]}）"
        body = st.transcript_text(head, bins)
        (d / f"{stem}.transcript.txt").write_text(body, encoding="utf-8")
        # chars は**伏せる前**の字数。議事録の目安字数（stream_notes.py）がこの数から出ていて、
        # 伏せたあとで数えると、伏せる前に書いた議事録が目安の外に押し出される（実際に14本出た）。
        # 列の意味を「字幕の字数」で揃えておく
        row.update(caption="ok", chars=sum(len(s) for _, s in raw),
                   note=st.music_note(head["caption_desc"], n_music))
    else:
        why = (cap or {}).get("why") or "取りに行かなかった"
        row.update(caption="none" if why == "ja の字幕が無い" else "error", chars=0, note=why)
    return row


def throttled(cap: dict | None) -> bool:
    return bool(cap) and not cap.get("ok") and cap.get("why") in THROTTLE


def drive(todo: list[dict], take, record, *, gate_wait=None, waits=BACKOFF, pause=PAUSE_SEC,
          deadline: float | None = None, clock=time.monotonic, sleep=time.sleep,
          log=lambda s: print(s, flush=True)) -> dict:
    """1つぶんを順に取る。take(item, n) が字幕の結果、record(item, cap) が manifest の行。

    **429 / ボット確認は、その配信を記録せずに待って取り直す。** 待ち切っても続いたら、
    その配信から後ろを丸ごと次回に回す（記録しないので、次の plan でまた選ばれる）。
    YouTube も gate も触らない形にしてあるのは、待ち方と回し方を見張りで当てるため。
    """
    tally = {"ok": 0, "none": 0, "error": 0}
    stopped, waited, done = "", 0.0, 0
    for n, item in enumerate(todo):
        left = len(todo) - n
        if deadline is not None and clock() >= deadline:
            stopped = f"持ち時間を使い切った（残り {left}本は次回）"
            break
        log(f"\n== [{n + 1}/{len(todo)}] {item['video_id']}")
        if gate_wait is not None:
            v = gate_wait(n)
            if not v.ok:
                stopped = f"Cookie を使い始めなかった（{v.how}。残り {left}本は次回）"
                break
        k = 0
        while True:
            cap = take(item, n)
            if not throttled(cap) or k >= len(waits):
                break
            w = waits[k]
            if deadline is not None and clock() + w >= deadline:
                break
            log(f"   {cap['why']}。{w}秒待って同じ配信を取り直す（{k + 1}/{len(waits)}）")
            sleep(w)
            waited += w
            k += 1
        if throttled(cap):
            stopped = f"{cap['why']} が待っても続いた（{k}回待った。残り {left}本は次回）"
            break
        row = record(item, cap)
        done += 1
        tally[row["caption"]] += 1
        log(f"   字幕 {row['caption']}（{row['note'] if row['caption'] != 'ok' else '済'}）"
            f"  字数 {row['chars']}  チャット {row['chat_count']}件  {row['tries']}回目")
        sleep(pause)
    return {"tally": tally, "stopped": stopped, "done": done,
            "deferred": len(todo) - done, "waited": waited}


def fetch(todo_path: Path, out_dir: Path | None = None, budget_min: float = BUDGET_MIN) -> int:
    started = time.monotonic()
    todo = json.loads(todo_path.read_text(encoding="utf-8"))
    if not todo:
        print("取るものが無い", flush=True)
        return 0
    dl = _load("shorts_download", ROOT / "tools/shorts/ingest/download.py")
    gate_mod = sys.modules["gate"]
    # **自分以外の、Cookie を使うワークフローを全部見る。** `Gate.from_env` は
    # ショートの取り込みを自分として外すので、そのままだとショートとぶつかる。
    # 並べて取るほかの2つは同じ run（GITHUB_RUN_ID が同じ）なので、own_run で外れる
    e = os.environ.get
    repo, token = e("GITHUB_REPOSITORY", ""), e("GH_TOKEN") or e("GITHUB_TOKEN") or ""
    api = e("GITHUB_API_URL") or "https://api.github.com"
    names: dict[str, list[str | None]] = {}
    gate = gate_mod.Gate(gate_mod.cookie_workflows(exclude={WORKFLOW}),
                         job_aware(gate_mod.api_lister(repo, token, api), jobs_lister(repo, token, api),
                                   lambda wf: names.setdefault(wf, cookie_jobs(WF_DIR / wf))),
                         own_run=e("GITHUB_RUN_ID", ""), count_pending=False)
    print(gate.heading(), flush=True)
    chats = fetch_chat([t["video_id"] for t in todo])
    root = (out_dir / "streams") if out_dir else STREAMS
    rows_path = out_dir / "rows.json" if out_dir else None
    man = {} if out_dir else st.read_manifest(MANIFEST)
    fetched = dt.datetime.now(st.JST).strftime("%Y-%m-%d")
    good: str | None = None

    def gate_wait(n: int):
        v = gate.wait()
        if n == 0 or v.waited or not v.ok:
            print(f"   判定: {v.why}", flush=True)
        return v

    def take(item: dict, n: int) -> dict:
        nonlocal good
        vid = item["video_id"]
        work = Path(tempfile.mkdtemp(prefix=f"cap-{vid}-"))
        try:
            url = f"https://www.youtube.com/watch?v={vid}"
            if not good:
                good, nowhy = dl.find_client(url, None, rounds=1 if n else 2, pause=30)
            if not good:
                return {"ok": False, "why": nowhy}
            cap = grab_captions(dl, vid, work, good)
            # 取れなかったら、次の口で1回だけ当たり直す。「字幕が無い」も口によって
            # 一覧が空で返ることがあるので、無いと決める前に別の口でもう一度見る。
            # **429 だけは当たり直さない。** 口を変えても同じ IP なので、締め出しを延ばすだけ
            if not cap["ok"] and cap["why"] != "429":
                alt = next_client(dl, good)
                print(f"   取れなかった（{cap['why']}）。口 {alt} で当たり直す", flush=True)
                for p in work.glob("src.*"):
                    p.unlink()
                cap2 = grab_captions(dl, vid, work, alt)
                if cap2["ok"] or cap["why"] == "ja の字幕が無い":
                    cap = cap2
                if cap2["ok"]:
                    good = alt
            if throttled(cap):
                # 待ったあとは口を選び直す（締め出しが明けた口が前と同じとは限らない）
                good = None
            elif cap.get("ok"):
                # 書くのは record で。ここで消す work の中の字幕を読むので、読んで持っておく
                cap["rows"] = st.read_captions(cap["path"])
            return cap
        finally:
            shutil.rmtree(work, ignore_errors=True)

    def record(item: dict, cap: dict) -> dict:
        row = write_one(item, cap, chats.get(item["video_id"], []), fetched, root)
        man[item["video_id"]] = row
        if rows_path:
            # 1本ごとに書き直す。途中で落ちても、そこまでの行は上げられるように
            rows_path.write_text(json.dumps(list(man.values()), ensure_ascii=False),
                                 encoding="utf-8")
        else:
            st.write_manifest(MANIFEST, man)
        return row

    if out_dir:
        out_dir.mkdir(parents=True, exist_ok=True)
        rows_path.write_text("[]", encoding="utf-8")
    res = drive(todo, take, record, gate_wait=gate_wait,
                deadline=started + budget_min * 60)
    tally, stopped = res["tally"], res["stopped"]
    print(f"\n字幕 ok {tally['ok']} / 無い {tally['none']} / 取れなかった {tally['error']}"
          f" / 次回に回した {res['deferred']}（頼んだ {len(todo)}本・待った {res['waited']:.0f}秒）",
          flush=True)
    if stopped:
        print(f"途中で止めた: {stopped}", flush=True)
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as f:
            f.write(f"### 配信の文字起こし（この1つぶん）\n\n字幕 ok **{tally['ok']}** / "
                    f"無い {tally['none']} / 取れなかった {tally['error']} / "
                    f"次回に回した {res['deferred']}（頼んだ {len(todo)}本）\n\n")
            if stopped:
                f.write(f"**途中で止めた:** {stopped}\n\n")
    gh_out = os.environ.get("GITHUB_OUTPUT")
    if gh_out:
        with open(gh_out, "a", encoding="utf-8") as f:
            f.write(f"ok={tally['ok']}\nnone={tally['none']}\nerror={tally['error']}\n"
                    f"deferred={res['deferred']}\nstopped={'1' if stopped else '0'}\n")
    return 0


# ---------------------------------------------------------------- merge

# 並べて取った1つが置いてよいもの。**議事録（.md）は人が書くもの**なので、
# 取り込みの側から1枚も上書きしない
TAKEN = (".transcript.txt", ".chat.txt")


def merge(dirs: list[Path], streams: Path = STREAMS, manifest: Path = MANIFEST) -> dict:
    """並べて取ったぶん（<dir>/streams/… と <dir>/rows.json）を streams/ と manifest に足す。"""
    man = st.read_manifest(manifest)
    files, rows = 0, []
    for d in dirs:
        for rp in sorted(d.rglob("rows.json")):
            try:
                got = json.loads(rp.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                print(f"{rp.parent.name}: rows.json が読めない。その1つは足さない", flush=True)
                continue
            src = rp.parent / "streams"
            for f in sorted(src.rglob("*")) if src.is_dir() else []:
                if not f.is_file() or not f.name.endswith(TAKEN):
                    continue
                dst = streams / f.relative_to(src)
                dst.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(f, dst)
                files += 1
            rows.extend(r for r in got if isinstance(r, dict) and r.get("video_id"))
    tally = {"ok": 0, "none": 0, "error": 0}
    for r in rows:
        man[r["video_id"]] = r
        tally[r.get("caption", "error")] = tally.get(r.get("caption", "error"), 0) + 1
    if rows:
        st.write_manifest(manifest, man)
    return {"rows": len(rows), "files": files, "tally": tally}


# ---------------------------------------------------------------- next

def should_chain(remaining: int, ok: int, waiting: list[dict] | None = None,
                 unreadable: str = "") -> tuple[bool, str]:
    """続きを自分で起こすか。(起こすか, 理由)。"""
    if remaining <= 0:
        return False, "残りが0本"
    if ok < 1:
        # 取れない理由（締め出し・Cookie 切れ）が続いているのに起こすと、止まらずに回り続ける
        return False, f"今回1本も取れなかった（残り {remaining}本は次の晩に）"
    if unreadable:
        return False, f"同じ枠で待っている run が読めない（{unreadable}）。次の晩に"
    if waiting:
        names = "、".join(f"{w['workflow']} #{w['id']}" for w in waiting)
        return False, (f"同じ枠で {names} が待っている。いま起こすとそちらが消されるので起こさない"
                       "（毎晩の取り込みなら、その完了でまた起きる）")
    return True, f"残り {remaining}本"


def slot_sharers(wf_dir: Path = WF_DIR, exclude: set[str] = frozenset({WORKFLOW})) -> list[str]:
    """同じ concurrency の枠（`fetch-chat-…`）を使うワークフローを、置き場から grep して求める。

    手で並べると、枠に入るものが増えた日に黙ってずれる（gate.py の cookie_workflows と同じ考え）。
    """
    out = []
    for p in sorted(list(wf_dir.glob("*.yml")) + list(wf_dir.glob("*.yaml"))):
        if p.name in exclude:
            continue
        try:
            text = p.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        for line in text.splitlines():
            body = re.split(r"(?:^|\s)#", line, maxsplit=1)[0]
            if re.search(r"\bgroup:\s*fetch-chat-", body):
                out.append(p.name)
                break
    return out


def slot_waiting(workflows: list[str], list_runs, ref: str) -> list[dict]:
    """同じ枝で、枠の空きを待っている run。"""
    out = []
    for wf in workflows:
        for r in list_runs(wf):
            if r.get("status") in SLOT_WAITING and (r.get("head_branch") or ref) == ref:
                out.append({"workflow": wf, "id": r.get("id"), "status": r.get("status")})
    return out


def next_run(ok: int) -> int:
    rows = videos()
    man = st.read_manifest(MANIFEST)
    todo, waiting_chat = select(rows, man, None)
    remaining = len(todo)
    e = os.environ.get
    waiting, unreadable = [], ""
    if remaining > 0 and ok >= 1:
        gate_mod = _load("gate", ROOT / "tools/shorts/ingest/gate.py")
        lister = gate_mod.api_lister(e("GITHUB_REPOSITORY", ""),
                                     e("GH_TOKEN") or e("GITHUB_TOKEN") or "",
                                     e("GITHUB_API_URL") or "https://api.github.com")
        try:
            waiting = slot_waiting(slot_sharers(), lister, e("GITHUB_REF_NAME", "master"))
        except gate_mod.Unreadable as ex:
            unreadable = str(ex)
    go, why = should_chain(remaining, ok, waiting, unreadable)
    print(f"残り {remaining}本（チャット待ち {waiting_chat}本は数えない）/ 今回 ok {ok}本 → "
          f"{'続きを起こす' if go else '起こさない'}: {why}", flush=True)
    summary = e("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as f:
            f.write(f"### 続き\n\n残り **{remaining}本** / 今回 ok {ok}本 → "
                    f"**{'続きを起こす' if go else '起こさない'}**（{why}）\n\n")
    gh_out = e("GITHUB_OUTPUT")
    if gh_out:
        with open(gh_out, "a", encoding="utf-8") as f:
            f.write(f"remaining={remaining}\nchain={'1' if go else '0'}\n")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("plan")
    p.add_argument("--count", type=int, default=SHARDS * PER_SHARD)
    p.add_argument("--out-dir", type=Path, required=True)
    f = sub.add_parser("fetch")
    f.add_argument("todo", type=Path)
    f.add_argument("--out-dir", type=Path, default=None)
    f.add_argument("--budget-min", type=float, default=BUDGET_MIN)
    m = sub.add_parser("merge")
    m.add_argument("dirs", type=Path, nargs="+")
    n = sub.add_parser("next")
    n.add_argument("--ok", type=int, required=True)
    a = ap.parse_args()
    if a.cmd == "plan":
        return plan(max(1, a.count), a.out_dir)
    if a.cmd == "fetch":
        return fetch(a.todo, a.out_dir, a.budget_min)
    if a.cmd == "merge":
        res = merge(a.dirs)
        t = res["tally"]
        print(f"足した行 {res['rows']} / ファイル {res['files']}"
              f"（字幕 ok {t.get('ok', 0)} / 無い {t.get('none', 0)} / 取れなかった {t.get('error', 0)}）",
              flush=True)
        gh_out = os.environ.get("GITHUB_OUTPUT")
        if gh_out:
            with open(gh_out, "a", encoding="utf-8") as fo:
                fo.write(f"ok={t.get('ok', 0)}\nrows={res['rows']}\n")
        return 0
    return next_run(a.ok)


if __name__ == "__main__":
    sys.exit(main())
