"""章（＝島）ごとの人数と配信本数を BigQuery から数えて、
site/content/chapterStats.ts を作る。

島の大きさは滞在日数から出せる（日付だけで足りる）が、
**住人の数と配信の本数は BigQuery にしか無い**（`docs/island-atlas.md` 3章）。
連なりの画面はブラウザから BigQuery を叩けないので、ここで焼いておく。

章の期間は site/content/chapters.ts が唯一の出どころなので、そこから読む。
期間をここに書き写すと、章を足したときに二重に直すことになる。

実行:
  BQ_PROJECT_ID=live-streaming-d3cac python python/build_chapter_stats.py
"""

import logging
import re
import sys
from datetime import date
from pathlib import Path

from google.cloud import bigquery

sys.path.insert(0, str(Path(__file__).parent))

from config import BQ_DATASET, BQ_PROJECT_ID  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parent.parent
CHAPTERS_TS = ROOT / "site" / "content" / "chapters.ts"
OUT_TS = ROOT / "site" / "content" / "chapterStats.ts"

# まだ終わっていない章の「終わり」。今日までを数える意味で、遠い先の日を置く。
OPEN_END = "2100-01-01"


def read_chapters() -> list[dict]:
    """chapters.ts から slug と期間を読み出す。まだ始まっていない章は外す。"""
    src = CHAPTERS_TS.read_text(encoding="utf-8")
    out = []
    for m in re.finditer(
        r'slug: "([a-z-]+)",\n\s*name: "([^"]+)",\n\s*from: "([\d-]*)",\n\s*to: "([\d-]*)",',
        src,
    ):
        slug, name, frm, to = m.groups()
        if not frm:
            continue  # 北欧はまだ始まっていない。数えるものが無い
        out.append({"slug": slug, "name": name, "from": frm, "to": to or OPEN_END})
    if not out:
        raise SystemExit("chapters.ts から章を1つも読めなかった")
    return out


def union_all(chapters: list[dict]) -> str:
    """章の表を SQL の中に作る。JOIN の条件を1回書くだけで済む。"""
    rows = [
        f"SELECT '{c['slug']}' AS slug, DATE '{c['from']}' AS f, DATE '{c['to']}' AS t"
        for c in chapters
    ]
    return " UNION ALL ".join(rows)


def fetch(client: bigquery.Client, chapters: list[dict]) -> dict[str, dict]:
    ch = union_all(chapters)

    # 人数。**日ごとではなく期間まるごとで数える**。連なりの画面に出すのは
    # 「その章のあいだに来てくれた人の数」なので、出席の埋め合わせは要らない。
    people_sql = f"""
    WITH ch AS ({ch})
    SELECT ch.slug, COUNT(DISTINCT m.author_channel_id) AS people
    FROM ch JOIN `{BQ_PROJECT_ID}.{BQ_DATASET}.chat_messages` m
      ON DATE(m.published_at, 'Asia/Tokyo') BETWEEN ch.f AND ch.t
    GROUP BY ch.slug
    """

    # 配信の本数。videos は配信の進捗表なので、取り込めたものだけを数える。
    # 日付は実際の配信開始時刻。取れていないものは初めて見つけた時刻で代える。
    streams_sql = f"""
    WITH ch AS ({ch})
    SELECT ch.slug, COUNT(DISTINCT v.video_id) AS streams
    FROM ch JOIN `{BQ_PROJECT_ID}.{BQ_DATASET}.videos` v
      ON DATE(COALESCE(v.actual_start_time, v.first_seen_at), 'Asia/Tokyo') BETWEEN ch.f AND ch.t
    WHERE v.status = 'SUCCEEDED'
    GROUP BY ch.slug
    """

    stats = {c["slug"]: {"people": 0, "streams": 0} for c in chapters}
    for row in client.query(people_sql).result():
        stats[row["slug"]]["people"] = int(row["people"])
    for row in client.query(streams_sql).result():
        stats[row["slug"]]["streams"] = int(row["streams"])
    return stats


def render(chapters: list[dict], stats: dict[str, dict]) -> str:
    lines = [
        "/**",
        " * 章ごとの人数と配信の本数。**自動生成。手で直さない。**",
        " * 作り直す: `BQ_PROJECT_ID=... python python/build_chapter_stats.py`",
        " *",
        " * 人数は、その章のあいだにチャットを1回でも書いた人の数（重複なし）。",
        " * 本数は、その章のあいだに配信して取り込めたものの数。",
        " *",
        f" * 数えた日: {date.today().isoformat()}",
        " */",
        "export type ChapterStat = {",
        "  /** その章のあいだに来てくれた人の数 */",
        "  people: number;",
        "  /** その章のあいだの配信の本数 */",
        "  streams: number;",
        "};",
        "",
        "export const CHAPTER_STATS: Record<string, ChapterStat> = {",
    ]
    for c in chapters:
        s = stats[c["slug"]]
        lines.append(
            f'  "{c["slug"]}": {{ people: {s["people"]}, streams: {s["streams"]} }}, // {c["name"]}'
        )
    lines += ["};", ""]
    return "\n".join(lines)


def main() -> None:
    chapters = read_chapters()
    logger.info("章 %d 個: %s", len(chapters), ", ".join(c["slug"] for c in chapters))
    client = bigquery.Client(project=BQ_PROJECT_ID)
    stats = fetch(client, chapters)
    OUT_TS.write_text(render(chapters, stats), encoding="utf-8")
    logger.info("書き出した: %s", OUT_TS)


if __name__ == "__main__":
    main()
