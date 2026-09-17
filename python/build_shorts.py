"""ショート動画の棚を、YouTube から取り直して `site/content/shorts.ts` に焼く。

    python python/build_shorts.py            # 取り直して焼く（毎晩ぶんはこれ）
    python python/build_shorts.py --fetch    # 取り直すだけ（python/data/shorts.json を更新）
    python python/build_shorts.py --build    # 焼くだけ
    python python/build_shorts.py --dates    # 日付の取れなかったものを、もう一度だけ取りにいく

## どこから取るか

**チャンネルのショートのタブそのもの。** 鍵は要らない。

  1. `https://www.youtube.com/channel/<id>/shorts` の HTML に
     `var ytInitialData = {...}` が埋まっている。ここに1ページ目の48本が入る
  2. 続きは遅延で読まれるので、**1ページ目だけでは全部にならない**。
     格子のいちばん下にある `continuationItemRenderer` の token を
     `POST /youtubei/v1/browse` に投げると次のぶんが返る。
     返るのは `onResponseReceivedActions` の下で、そこにまた token が付いている
  3. 題名は一覧の `accessibilityText`（「〜, 1,234回視聴 - ショート動画を再生」）から取る。
     **1本ずつ開かなくていい**ので、ここでは YouTube を叩かない
  4. **公開日だけは一覧に入っていない。** 視聴ページの HTML を1本ずつ開く。
     叩くのは**手元にまだ無いものだけ**なので、毎晩の追加ぶんは0〜数本

**加減する。** 視聴ページは連打すると reCAPTCHA の頁が返る（実際に踏んだ）。
既定で1本につき5秒あける。急いでも何も得しない。

## 前はなぜ手書きの表だったか（2026-09-17 に変えた）

「BigQuery に無いから機械では取れない」と書いてあった。前半は正しく、後半が違った。
`youtube_chat.videos` に入っているのは配信だけでショートは1本も無いが、
**出どころは BigQuery だけではない。** 公開のチャンネルそのものが本番の値で、
鍵なしで読める。手書きのままにしていたので、**棚は 2026-05-12 で127日止まっていた**。

`docs/island-fresh.md` の仕分けで言うと、軸は「BigQuery か」ではなく
**「本番を読めば答えが出るか」**。チャンネルは本番なので、これは①に入る。

## 題名は、いちど人が短くしたものを上書きしない

`python/data/shorts.json` に既にある `title` は**そのまま残す**。
最初の58本は、あやとが YouTube の題名から**ハッシュタグと飾りを落として**
書いたもので、島の札に出るのはこちらのほうが読みやすい
（例: 「🇮🇷イランは怖い人だらけなのか…1日目YouTubeで配信切り抜き。 波瀾万丈、
喜怒哀楽すぎた #配信 #イラン …」→「1日目。波瀾万丈、喜怒哀楽すぎた」）。

新しく入るものは YouTube の題名をそのまま置く。ただし**末尾に続くハッシュタグの列**
だけは落とす（札は2行で切れるので、そこがハッシュタグで埋まると何の動画か読めない）。
手で短くしたくなったら JSON の `title` を書き換える。**次に取り直しても戻らない。**

## 章の割り当ては、日付だけで決める

**題名の街名から推測しない。** ロンドンは2回ある（2024年9月と2025年1月〜3月）ので、
題名では決められない。`site/content/chapters.ts` の章の期間と公開日を突き合わせる。

決め方は3つだけ。

  1. 章の期間に**前後7日の幅**を付けて、入る章を集める。
     幅が要るのは、旅の**予告**が始まる前に、**まとめ**が終わったあとに出るから
     （イランまで歩くの予告は 04-28、章は 04-29 から。まとめは 05-12、章は 05-08 まで）
  2. 入る章が2つ以上あるときは、**期間の短いほう**を採る。
     枝の章（`branchOf`）は親の期間の中にすっぽり入っているので、これで枝が勝つ
     （イランまで歩く 10日 < コーカサス周遊 440日）
  3. どの章にも入らず、かつ**いちばん古い章より前**なら `before-stream`。
     章ではなく「配信を始める前の6週間」で、`/map` の段に出る

**このどれにも当たらないものは、島に建てない。** 推測で章に入れると島が嘘をつく。
焼かずに `::warning::` で本数と id を出すので、人が見て決める。

この決め方は、**手で振ってあった58本の割り当てを1本も動かさない**ことを確かめてある
（2026-09-17 の実測。iran-walk 12 / europe 31 / before-stream 15 がそのまま出る）。

## 取れなかったときは、焼かない

手元にある id が一覧から1本でも消えていたら、**そこで止まる**（`--fetch` が 1 で終わる）。
YouTube 側で非公開・削除になったのか、こちらの取りかたが壊れたのかは
機械には区別できない。**黙って棚から減らすほうがずっと悪い。**
本当に消えたと分かったら、その id を JSON の `_gone` に理由を添えて書く。
書いてあるものは、一覧に無くても止まらない（棚にも出ない）。
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import time
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = Path(__file__).resolve().parent / "data"
SRC = DATA / "shorts.json"
OUT_TS = ROOT / "site" / "content" / "shorts.ts"
CHAPTERS_TS = ROOT / "site" / "content" / "chapters.ts"

CHANNEL = "UCCwutAH6ieHNvdyJAfSld7w"
SHORTS_URL = f"https://www.youtube.com/channel/{CHANNEL}/shorts"

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120 Safari/537.36"
)

# 視聴ページを開ける間隔（秒）。連打すると reCAPTCHA が返る
WATCH_GAP = 5.0

# 章の期間に付ける幅（日）。予告とまとめのぶん
EDGE_DAYS = 7

# 「配信を始める前」の置き場。章ではない
BEFORE = "before-stream"


# ---------------------------------------------------------------- 取りに行く


def curl(args: list[str], data: str | None = None) -> str:
    r = subprocess.run(
        ["curl", "-sSL", "--max-time", "60", "-A", UA, "-H", "Accept-Language: ja", *args],
        input=data, capture_output=True, text=True, timeout=120,
    )
    return r.stdout


def walk(o, key: str, out: list | None = None) -> list:
    """入れ子の中から、その鍵の値を全部拾う。YouTube の返しは形が変わるので、
    道を決め打ちせずに鍵で拾う（決め打ちは版が上がるたび黙って0件になる）"""
    out = [] if out is None else out
    if isinstance(o, dict):
        for k, v in o.items():
            if k == key:
                out.append(v)
            walk(v, key, out)
    elif isinstance(o, list):
        for v in o:
            walk(v, key, out)
    return out


def lockups(node) -> list[tuple[str, str]]:
    """一覧の1枚から (id, 題名) を取る"""
    got = []
    for lk in walk(node, "shortsLockupViewModel"):
        m = re.match(r"shorts-shelf-item-(.+)$", lk.get("entityId", "") or "")
        vid = m.group(1) if m else None
        if not vid:
            ep = (lk.get("onTap", {}).get("innertubeCommand", {}) or {}).get("reelWatchEndpoint", {})
            vid = (ep or {}).get("videoId")
        if not vid:
            continue
        a = lk.get("accessibilityText", "") or ""
        # 「〜, 1,234回視聴 - ショート動画を再生」の後ろを落とす
        title = re.sub(r",\s*[\d,.]+万?回視聴\s*-\s*ショート動画を再生$", "", a).strip()
        got.append((vid, title))
    return got


def next_token(node) -> str | None:
    for it in walk(node, "continuationItemRenderer"):
        t = ((it.get("continuationEndpoint", {}) or {}).get("continuationCommand", {}) or {}).get("token")
        if t:
            return t
    return None


def fetch_list() -> list[tuple[str, str]]:
    """チャンネルのショートのタブを、続きまで追って全部取る"""
    html = curl([SHORTS_URL])
    m = re.search(r"var ytInitialData = (\{.*?\});</script>", html, re.S)
    if not m:
        raise SystemExit("::error::ショートのタブから ytInitialData を取れませんでした")
    data = json.loads(m.group(1))
    key = re.search(r'"INNERTUBE_API_KEY":"([^"]+)"', html)
    ver = re.search(r'"INNERTUBE_CLIENT_VERSION":"([^"]+)"', html)
    vis = re.search(r'"visitorData":"([^"]+)"', html)
    if not (key and ver):
        raise SystemExit("::error::ショートのタブから鍵と版を取れませんでした")
    key, ver = key.group(1), ver.group(1)

    tabs = data["contents"]["twoColumnBrowseResultsRenderer"]["tabs"]
    sel = [t for t in tabs if (t.get("tabRenderer") or {}).get("selected")]
    if not sel:
        raise SystemExit("::error::ショートのタブが選ばれていません")
    grid = sel[0]["tabRenderer"]["content"]["richGridRenderer"]["contents"]

    out: list[tuple[str, str]] = []
    seen: set[str] = set()

    def add(node) -> int:
        n = 0
        for vid, title in lockups(node):
            if vid in seen:
                continue
            seen.add(vid)
            out.append((vid, title))
            n += 1
        return n

    add(grid)
    tok = next_token(grid)
    print(f"1ページ目 {len(out)}本", flush=True)

    client = {"clientName": "WEB", "clientVersion": ver, "hl": "ja", "gl": "JP"}
    if vis:
        client["visitorData"] = vis.group(1)

    page = 1
    # 20ページで打ち止め（1ページ35〜48本なので700本ぶん。輪になったときの保険）
    while tok and page < 20:
        page += 1
        time.sleep(1.5)
        body = json.dumps({"context": {"client": client}, "continuation": tok})
        txt = curl(
            ["-H", "Content-Type: application/json",
             "-H", "X-Youtube-Client-Name: 1", "-H", f"X-Youtube-Client-Version: {ver}",
             "-H", "Origin: https://www.youtube.com", "-H", f"Referer: {SHORTS_URL}",
             "-X", "POST", "--data-binary", "@-",
             f"https://www.youtube.com/youtubei/v1/browse?key={key}&prettyPrint=false"],
            data=body,
        )
        try:
            j = json.loads(txt)
        except Exception:
            print(f"::warning::{page}ページ目が JSON で返りませんでした。ここまでで止めます", flush=True)
            break
        acts = j.get("onResponseReceivedActions") or []
        n = add(acts)
        tok = next_token(acts)
        print(f"{page}ページ目 +{n}本 → {len(out)}本", flush=True)
        if n == 0:
            break
    return out


def fetch_date(vid: str) -> str | None:
    """視聴ページから公開日（YYYY-MM-DD）を拾う。取れなければ None。

    **取れない回がある。** 連打すると reCAPTCHA の頁（3.8KB）が返るし、
    同じ URL でも日付の入っていない HTML が返る回がある。
    """
    html = curl([f"https://www.youtube.com/watch?v={vid}"])
    m = re.search(r'"publishDate":\{"simpleText":"(\d{4})/(\d{2})/(\d{2})"', html)
    if m:
        return "-".join(m.groups())
    m = re.search(r'"publishDate":"(\d{4})-(\d{2})-(\d{2})', html)
    return "-".join(m.groups()) if m else None


# ---------------------------------------------------------------- 手元の表


def load() -> dict:
    return json.loads(SRC.read_text(encoding="utf-8"))


def save(src: dict) -> None:
    src["shorts"] = sorted(src["shorts"], key=lambda v: (v.get("date") or "9999", v["id"]))
    SRC.write_text(json.dumps(src, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


def trim_tags(title: str) -> str:
    """末尾に続くハッシュタグの列を落とす。**途中のものは残す**（文の一部なので）"""
    t = re.sub(r"(\s*#[^\s#]+)+\s*$", "", title).strip()
    return re.sub(r"\s{2,}", " ", t) or title.strip()


# ---------------------------------------------------------------- 章の割り当て

DAY = timedelta(days=1)
FAR = date(9999, 12, 31)


def read_chapters() -> list[dict]:
    """`site/content/chapters.ts` から章を読む。

    **読み落としたら落とす。** 正規表現で TS を読むので、書き方が変わると
    黙って章が減る。減ったぶんのショートは「どの章にも入らない」に落ちて
    棚から消えるので、**例外にして気づけるようにする**
    （`python/stays.py` の `read_countries()` と同じ考え）。
    """
    text = CHAPTERS_TS.read_text(encoding="utf-8")
    body = text.split("export const CHAPTERS", 1)
    if len(body) != 2:
        raise SystemExit("::error::chapters.ts に CHAPTERS がありません")
    body = body[1].split("\n];", 1)[0]

    want = len(re.findall(r"^\s*slug: \"", body, re.M))
    out = []
    for blk in re.split(r"^\s*\{\s*$", body, flags=re.M):
        m = re.search(r'slug: "([a-z-]+)"', blk)
        if not m:
            continue
        def pick(k: str) -> str:
            mm = re.search(rf'{k}: "([^"]*)"', blk)
            return mm.group(1) if mm else ""
        days = re.search(r"plannedDays: (\d+)", blk)
        out.append({
            "slug": m.group(1),
            "from": pick("from"),
            "to": pick("to"),
            "opensAt": pick("opensAt"),
            "branchOf": pick("branchOf"),
            "plannedDays": int(days.group(1)) if days else 0,
        })
    if len(out) != want or not out:
        raise SystemExit(f"::error::chapters.ts の章を読み落としました（{len(out)}/{want}）")
    return out


def spans(chs: list[dict]) -> dict[str, tuple[date, date]]:
    """章ごとの (始まり, 終わり)。`chapters.ts` の `began` / `ended` と同じ決めかた。

    まだ始まっていない章は `opensAt`、終わりの無い章は
    **見立ての日数**か**次の本線の章が始まる日**の早いほう。
    """
    def began(c: dict) -> date:
        if c["from"]:
            return date.fromisoformat(c["from"])
        if c["opensAt"]:
            return date.fromisoformat(c["opensAt"][:10])
        return FAR

    out = {}
    for c in chs:
        b = began(c)
        if b == FAR:
            continue  # 日どりの決まっていない章（アルバニア）。まだ何も入らない
        if c["to"]:
            e = date.fromisoformat(c["to"])
        else:
            nxt = [began(x) for x in chs
                   if not x["branchOf"] and x is not c and began(x) > b]
            e = min([b + c["plannedDays"] * DAY] if c["plannedDays"] else [] , default=FAR)
            e = min(e, min(nxt, default=FAR))
        out[c["slug"]] = (b, e)
    return out


def chapter_of(d: str, sp: dict[str, tuple[date, date]]) -> str | None:
    """公開日から置き場を決める。**題名は見ない。**"""
    day = date.fromisoformat(d)
    hit = [(e - b, slug) for slug, (b, e) in sp.items()
           if b - EDGE_DAYS * DAY <= day <= e + EDGE_DAYS * DAY]
    if hit:
        # 期間の短いほう＝より細かい章（枝は親の中に入っているので、枝が勝つ）
        hit.sort(key=lambda x: (x[0], x[1]))
        return hit[0][1]
    if sp and day < min(b for b, _ in sp.values()):
        return BEFORE
    return None


# ---------------------------------------------------------------- それぞれの仕事


def fetch(gap: float = WATCH_GAP) -> int:
    src = load()
    known = {v["id"]: v for v in src["shorts"]}
    gone = {g["id"] for g in src.get("_gone", [])}

    got = fetch_list()
    ids = [i for i, _ in got]
    print(f"YouTube から {len(ids)}本 / 手元に {len(known)}本", flush=True)

    # **対照。** 手元にあるものが一覧に全部入っているか
    missing = [i for i in known if i not in ids and i not in gone]
    if missing:
        print("::error::手元にあるショートが、YouTube の一覧に見当たりません。焼き込みは書き換えません")
        for i in missing:
            print(f"::error::  {i} {known[i].get('date')} {known[i].get('title','')[:40]}")
        print("::error::非公開・削除だと分かったら、python/data/shorts.json の _gone に理由を添えて足してください")
        return 1

    add = [(i, t) for i, t in got if i not in known]
    for i, t in add:
        src["shorts"].append({"id": i, "title": trim_tags(t)})
        print(f"足した {i} {trim_tags(t)[:50]}", flush=True)
    if not add:
        print("増えたショートはありません")

    save(src)
    left = dates(gap)
    print(f"棚 {len(src['shorts'])}本（増えたぶん {len(add)}本 / 日付の取れていないもの {left}本）")
    return 0


def dates(gap: float = WATCH_GAP) -> int:
    """`date` の無いものだけ、公開日を埋める。**1本ずつ、間を空けて開く。**"""
    src = load()
    todo = [v for v in src["shorts"] if not v.get("date")]
    if not todo:
        return 0
    print(f"公開日を取りにいきます: {len(todo)}本（1本 {gap:.0f}秒あけます）", flush=True)
    left = 0
    for v in todo:
        got = fetch_date(v["id"])
        if got:
            v["date"] = got
        else:
            left += 1
        print(f"  {v['id']} {got or '取れず'}", flush=True)
        save(src)
        time.sleep(gap)
    if left:
        print(f"::warning::公開日の取れなかったもの: {left}本（次に回すと取れることがあります。それまで棚には出ません）")
    return left


def build() -> int:
    src = load()
    sp = spans(read_chapters())
    rows = sorted(
        [v for v in src["shorts"] if v.get("date")],
        key=lambda v: (v["date"], v["id"]),
    )
    undated = [v["id"] for v in src["shorts"] if not v.get("date")]

    groups: dict[str, list[dict]] = {}
    orphan: list[dict] = []
    for v in rows:
        slug = chapter_of(v["date"], sp)
        if not slug:
            orphan.append(v)
            continue
        groups.setdefault(slug, []).append(v)

    # 置き場の並びは、いちばん古いショートの日付順。**辞書の順に頼らない**
    order = sorted(groups, key=lambda g: (groups[g][0]["date"], g))

    body, n = [], 0
    for g in order:
        body.append(f"  {ts(g)}: [")
        for v in groups[g]:
            fields = [f"id: {ts(v['id'])}", f"date: {ts(v['date'])}", f"title: {ts(v['title'])}"]
            for k in ("city", "country"):
                if v.get(k):
                    fields.append(f"{k}: {ts(v[k])}")
            body.append("    { " + ", ".join(fields) + " },")
            n += 1
        body.append("  ],")
    OUT_TS.write_text(HEADER + "\n".join(body) + "\n" + FOOTER, encoding="utf-8")

    print(f"{OUT_TS} … {n}本 / {len(order)}か所")
    for g in order:
        d = [v["date"] for v in groups[g]]
        print(f"  {g:<14} {len(groups[g]):>3}本  {d[0]} 〜 {d[-1]}")
    if undated:
        print(f"::warning::公開日が取れていないので棚に出していないもの: {len(undated)}本 {' '.join(undated)}")
    if orphan:
        print(f"::warning::どの章にも入らないので棚に出していないもの: {len(orphan)}本")
        for v in orphan:
            print(f"::warning::  {v['id']} {v['date']} {v['title'][:40]}")
    return 0


def ts(x) -> str:
    return json.dumps(x, ensure_ascii=False)


HEADER = '''/**
 * ショート動画。**手で直さない。**
 * `python/build_shorts.py` が、チャンネルのショートのタブから取り直して焼く
 * （控えは `python/data/shorts.json`）。
 *
 * BigQuery の `videos` 表には配信しか入っていないが、**出どころは BigQuery だけではない。**
 * 公開のチャンネルそのものが本番の値で、鍵なしで読める。
 *
 * 鍵は `content/chapters.ts` の章の slug。**公開日だけで決めている**（題名の街名は見ない。
 * ロンドンは2回あるので題名では決まらない）。ただし `before-stream` だけは章ではなく、
 * **配信を始める前の6週間**。島に建てず、`/map` の
 * 「その前に、配信していない6週間がある」の段に出る。
 *
 * `date` は撮った日ではなく**出した日**。時差で1日ずれることがある。
 */

export type Short = {
  id: string;
  /** 公開日（YYYY-MM-DD） */
  date: string;
  /** YouTube の題名。末尾のハッシュタグだけ落としてある */
  title: string;
  /** 撮った街。全部に付いているわけではない（振り返りや告知には無い） */
  city?: string;
  /** 国。`before-stream` の15本にだけ付いている（`COUNTRIES` に無い国が混ざるので） */
  country?: string;
};

export const SHORTS: Record<string, Short[]> = {
'''

FOOTER = """};

/** その章のショート。無い章のほうが多い */
export const shortsOf = (slug: string): Short[] => SHORTS[slug] ?? [];

/** サムネイル。YouTube が配っている 480×360 の1枚 */
export const shortThumb = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

export const shortHref = (id: string) => `https://www.youtube.com/shorts/${id}`;
"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--fetch", action="store_true", help="YouTube から取り直して JSON を更新する")
    ap.add_argument("--build", action="store_true", help="site/content/shorts.ts を焼く")
    ap.add_argument("--dates", action="store_true", help="公開日の取れていないものを、もう一度取りにいく")
    ap.add_argument("--gap", type=float, default=WATCH_GAP, help="視聴ページを開ける間隔（秒）")
    a = ap.parse_args()

    # 引数なしは「取り直して焼く」。毎晩ぶん（rebake.yml）はこの形で呼ぶ
    if not (a.fetch or a.build or a.dates):
        a.fetch = a.build = True

    if a.fetch and fetch(a.gap):
        return 1
    if a.dates and not a.fetch:
        dates(a.gap)
    if a.build:
        return build()
    return 0


if __name__ == "__main__":
    sys.exit(main())
