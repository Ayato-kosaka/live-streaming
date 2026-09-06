"""北欧へ出発した日に、コーカサスの章を閉じる。

出発の日（2026-09-11 23:30 ジョージア時間 = 日本時間 9/12 04:30）に、
サイトの側で1つだけ手を入れないといけないものがある。

  `site/content/chapters.ts` の `caucasus.to` に日付を入れる

ほかは全部、日付を見て勝手に切り替わる（`chapterNow` `chapterDays`
`planPhase`）。**ここだけは事実の欄なので、誰かが入れないと入らない。**

`to` が空のままでも、次の章が始まっていれば期間の字は正しく出る
（`nextBegan`）。それでも入れるのは、**コーカサスがいつ終わったか**が
どこにも残らないから。旅が進んで北欧も終わったころ、コーカサスの島の札を
見ても「2025年6月〜」しか書いていないことになる。

## `nordic.from` は入れない

**ここでは触らない。** `site/content/countries.ts` に北欧の6カ国が無いので、
北欧の章に `from` を入れると `python/build_chapter_stats.py` が
その章を数えはじめて、国0・配信0の島ができる。
北欧が「いまいる島」になるのは `opensAt`（出発の日時）で決まっていて、
`from` は要らない。**countries.ts に6カ国が入るまで、ここは空のまま。**

実行:
  python python/nordic_depart.py                 # 日本時間の今日で閉じる
  python python/nordic_depart.py --to 2026-09-11 # 日を指定する
  python python/nordic_depart.py --check         # 書かずに、いまの状態だけ見る

`.github/workflows/nordic_depart.yml`（「北欧へ出発した」）から呼ばれる。
"""

import argparse
import logging
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger("depart")

ROOT = Path(__file__).resolve().parent.parent
CHAPTERS_TS = ROOT / "site" / "content" / "chapters.ts"
JST = timezone(timedelta(hours=9))

# 閉じる章と、その次に始まる章
CLOSING = "caucasus"
OPENING = "nordic"

DAY = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def block(src: str, slug: str) -> tuple[int, int]:
    """`chapters.ts` の中で、その章の { … } がどこからどこまでか。"""
    at = src.find(f'slug: "{slug}",')
    if at < 0:
        log.error("chapters.ts に slug: \"%s\" がありません", slug)
        sys.exit(1)
    start = src.rfind("{", 0, at)
    depth = 0
    for i in range(start, len(src)):
        if src[i] == "{":
            depth += 1
        elif src[i] == "}":
            depth -= 1
            if depth == 0:
                return start, i + 1
    log.error("slug: \"%s\" の { } が閉じていません", slug)
    sys.exit(1)


def field(src: str, slug: str, name: str) -> str:
    """その章の項目の、いまの値。"""
    a, b = block(src, slug)
    m = re.search(rf'\n\s*{name}: "([^"]*)",', src[a:b])
    return m.group(1) if m else ""


def main() -> int:
    """エントリポイント。"""
    ap = argparse.ArgumentParser(description="北欧へ出発した日に、前の章を閉じる")
    ap.add_argument(
        "--to",
        default="",
        help="コーカサスが終わった日(YYYY-MM-DD)。省くと日本時間の今日",
    )
    ap.add_argument("--check", action="store_true", help="書かずに、いまの状態だけ見る")
    a = ap.parse_args()

    src = CHAPTERS_TS.read_text(encoding="utf-8")
    now_to = field(src, CLOSING, "to")
    nordic_from = field(src, OPENING, "from")

    log.info("いま: %s.to = %r / %s.from = %r", CLOSING, now_to, OPENING, nordic_from)

    if nordic_from:
        # 入れないと決めてあるものが入っている。気づかず進めない
        log.error(
            "%s.from に %r が入っています。countries.ts に北欧の6カ国が入るまで、"
            "ここは空にしておいてください（このファイルの説明）",
            OPENING,
            nordic_from,
        )
        return 1

    if a.check:
        return 0

    to = a.to or datetime.now(JST).strftime("%Y-%m-%d")
    if not DAY.match(to):
        log.error("--to は YYYY-MM-DD で渡してください: %s", to)
        return 1

    if now_to == to:
        log.info("すでに %s で閉じてあります。何もしません", to)
        return 0
    if now_to:
        log.error(
            "%s.to にはもう %r が入っています。書き換えるなら手で直してください",
            CLOSING,
            now_to,
        )
        return 1

    start, end = block(src, CLOSING)
    body = src[start:end]
    fixed = re.sub(r'\n(\s*)to: "",', f'\\n\\1to: "{to}",', body, count=1)
    if fixed == body:
        log.error("%s の to: \"\" が見つかりませんでした", CLOSING)
        return 1
    CHAPTERS_TS.write_text(src[:start] + fixed + src[end:], encoding="utf-8")
    log.info("%s.to = %s にしました", CLOSING, to)
    log.info("このあと python/build_chapter_stats.py を回して、Hosting を配ります")
    return 0


if __name__ == "__main__":
    sys.exit(main())
