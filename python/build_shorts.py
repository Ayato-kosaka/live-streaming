"""ショート動画の一覧を `site/content/shorts.ts` に焼く。

## なぜ手書きの表から焼くのか

**BigQuery には無い。** `youtube_chat.videos` に入っているのは配信だけで、
ショートは1本も入っていない。だから出どころは `python/data/shorts.json` ひとつ。
あやとが本人のチャンネルから書き出したものを、そのまま置いてある。

`site/content/*.ts` を手で直さないのが決まり（`CLAUDE.md`）なので、
足すときは JSON のほうに足して、ここから焼き直す。

    python python/build_shorts.py --dates    # 足したぶんの公開日を YouTube から埋める
    python python/build_shorts.py --build    # site/content/shorts.ts を焼く

## 公開日を、なぜ自分で取りにいくのか

もらった一覧には**日付が無かった**。日付が無いと、どの章のショートなのかを
題名の街名から推測することになる。**推測で島に建てると、島が嘘をつく。**

ロンドンがいい例で、イギリスには2回行っている（2024年9月と、2025年1月〜3月）。
題名だけでは、どちらのロンドンなのか決められない。

視聴ページの HTML に公開日が入っているので、そこから拾う（`--dates`）。
API キーが要らず、この箱からも届く。**撮った日ではなく出した日**で、
時差で1日ずれることがある。章の切れ目から1〜2日のところにあるものは、
これだけでは決められない（下の「章の切りかた」）。

## 章の切りかた

| 置き場 | 何 | 公開日（実測） |
| --- | --- | --- |
| `iran-walk` | イランまで歩く | 2026-04-28 〜 05-12 |
| `europe` | ヨーロッパ周遊 | 2024-10-25 〜 12-27 |
| `before-stream` | 配信を始める前の6週間 | 2024-09-17 〜 10-19 |

`before-stream` は章ではない。配信が始まったのは 2024-10-28（`content/chapters.ts`）で、
ロンドン・バルセロナ・ローマ・ナポリの15本は**全部それより前**に出ている。
島に建てると章の外のものを建てることになるので、`/map` の
「その前に、配信していない6週間がある」の段に出す。

パリの2本（10-25・10-26）だけは配信開始より前だが、**パリは章の1つ目の街**で、
6週間のほうの3都市には入っていない。ヨーロッパ周遊に置いてある。
"""

import argparse
import json
import re
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = Path(__file__).resolve().parent / "data"
SRC = DATA / "shorts.json"
OUT_TS = ROOT / "site" / "content" / "shorts.ts"

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120 Safari/537.36"
)


def groups(src: dict) -> list[str]:
    """置き場の名前。`_` で始まる鍵は覚え書きなので飛ばす"""
    return [k for k in src if not k.startswith("_")]


def ts(x) -> str:
    return json.dumps(x, ensure_ascii=False)


def fetch_date(vid: str) -> str | None:
    """視聴ページから公開日（YYYY-MM-DD）を拾う。取れなければ None"""
    try:
        html = subprocess.run(
            ["curl", "-sSL", "--max-time", "60", "-A", UA, "-H", "Accept-Language: ja",
             f"https://www.youtube.com/watch?v={vid}"],
            capture_output=True, text=True, timeout=90,
        ).stdout
    except Exception:
        return None
    m = re.search(r'"publishDate":\{"simpleText":"(\d{4})/(\d{2})/(\d{2})"', html)
    return "-".join(m.groups()) if m else None


def dates() -> int:
    """`date` の無いものだけ、公開日を埋める。

    同じ動画を二度取りにいかない。**返ってこないことがある**（同じ URL でも
    日付の入っていない HTML が返る回がある）ので、何度か回すつもりで書いてある。
    """
    src = json.loads(SRC.read_text(encoding="utf-8"))
    left = 0
    for g in groups(src):
        for v in src[g]:
            if v.get("date"):
                continue
            v["date"] = fetch_date(v["id"])
            print(f"{g} {v['id']} {v['date']}", flush=True)
            if not v["date"]:
                v.pop("date")
                left += 1
            SRC.write_text(json.dumps(src, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
            time.sleep(0.6)
    print(f"日付の取れていないもの: {left}本（もう一度回すと取れることがある）")
    return 0


def build() -> int:
    src = json.loads(SRC.read_text(encoding="utf-8"))
    body, n = [], 0
    for g in groups(src):
        # 古い順。1日目・2日目…と並ぶし、街の移り変わりが旅の順になる
        rows = sorted(src[g], key=lambda v: (v.get("date") or "9999", v["id"]))
        body.append(f"  {ts(g)}: [")
        for v in rows:
            fields = [f"id: {ts(v['id'])}", f"date: {ts(v['date'])}", f"title: {ts(v['title'])}"]
            for k in ("city", "country"):
                if v.get(k):
                    fields.append(f"{k}: {ts(v[k])}")
            body.append("    { " + ", ".join(fields) + " },")
            n += 1
        body.append("  ],")
    OUT_TS.write_text(HEADER + "\n".join(body) + "\n" + FOOTER, encoding="utf-8")
    print(f"{OUT_TS} … {n}本 / {len(groups(src))}か所")
    return 0


HEADER = '''/**
 * ショート動画。**手で直さない。**
 * `python/build_shorts.py --build` が `python/data/shorts.json` から焼く。
 *
 * BigQuery の `videos` 表には配信しか入っていないので、出どころはあの JSON だけ。
 * 増えたら JSON に足して焼き直す。
 *
 * 鍵は `content/chapters.ts` の章の slug。ただし `before-stream` だけは章ではなく、
 * **配信を始める前の6週間**（2024-09-17〜10-19）。島に建てず、`/map` の
 * 「その前に、配信していない6週間がある」の段に出る。
 *
 * `date` は撮った日ではなく**出した日**。時差で1日ずれることがある。
 */

export type Short = {
  id: string;
  /** 公開日（YYYY-MM-DD） */
  date: string;
  /** YouTube の題名。**引用なので書き換えない** */
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
    ap.add_argument("--build", action="store_true", help="site/content/shorts.ts を焼く")
    ap.add_argument("--dates", action="store_true", help="公開日の無いものを YouTube から埋める")
    a = ap.parse_args()
    if a.dates:
        dates()
    if a.build:
        return build()
    if not a.dates:
        ap.print_help()
    return 0


if __name__ == "__main__":
    sys.exit(main())
