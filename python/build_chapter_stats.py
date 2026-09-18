"""章（＝島）ごとの人数・住人・配信を BigQuery から焼く。

作るもの:
  site/content/chapterStats.ts    人数、配信の本数、その章にいた住人
  site/content/chapterStreams.ts  過去の島の配信ぜんぶ（`/island/<章>/streams` 用）

島の大きさは滞在日数から出せる（日付だけで足りる）が、
**人と配信は BigQuery にしか無い**（`docs/island-atlas.md` 3章）。
ブラウザから BigQuery は叩けないので、ここで焼いておく。

住人は、**キャラクターの名簿（Firestore の `islandCharacter`）**で絵に結び直す。
結び方は `build_residents.link()` と同じ1か所を呼ぶ——**2か所で結ぶと、島と
連なりで別の絵が出る。** 前はここが `python/residents_map.json`（手書きの22行）
だったので、名簿が102人に増えたあとも連なりには22人しか出ていなかった。

**同じ人が複数の島に出てよい**ので、島ごとの重複は消さない。

章の期間は site/content/chapters.ts が唯一の出どころなので、そこから読む。
期間をここに書き写すと、章を足したときに二重に直すことになる。

**押しても見られない配信は、明細に並べない**（2026-09-18）。消えた配信（404）と
録画そのものが残らなかった配信へは送らない（`docs/island-misses.md` #139）。
外す相手は `python/data/dead_streams.json`。

**外すのは明細（`chapterStreams.ts`）だけで、本数（`chapterStats.ts` の `streams`）は
そのまま。** 配信が1本見られないことと、その章にそれだけの配信があったことは別のこと。
数えるのをやめたら、章の大きさまで書き換わってしまう。

実行:
  BQ_PROJECT_ID=live-streaming-d3cac python python/build_chapter_stats.py
"""

import json
import logging
import re
import sys
from datetime import date
from pathlib import Path

from google.cloud import bigquery

sys.path.insert(0, str(Path(__file__).parent))

from build_dead_streams import blocked, check_written  # noqa: E402
from build_residents import BOT_NAME, fetch_characters, link, look  # noqa: E402
from config import BQ_DATASET, BQ_PROJECT_ID  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parent.parent
CHAPTERS_TS = ROOT / "site" / "content" / "chapters.ts"
OUT_TS = ROOT / "site" / "content" / "chapterStats.ts"
OUT_STREAMS_TS = ROOT / "site" / "content" / "chapterStreams.ts"

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


def link_icons(client: bigquery.Client, ch: str) -> dict[str, str]:
    """YouTube のチャンネル → キャラクターの絵。**名簿が決める。**

    名簿（`islandCharacter`）が持っているのは「どの名前の人か」なので、
    チャンネルに直すには**そのチャンネルが最後に名乗った名前**が要る。
    章の期間に1度でも書いた人の名乗りを1つずつ取って、
    `build_residents.link()` に渡す。**結び方はあちらの1か所だけが持つ。**

    Args:
        client: BigQuery のクライアント
        ch: 章の表（`union_all()` が作る SQL の断片）

    Returns:
        結べたぶんだけの `{チャンネルID: 絵のID}`
    """
    sql = f"""
    WITH ch AS ({ch})
    SELECT m.author_channel_id AS cid,
           ARRAY_AGG(m.author_name ORDER BY m.published_at DESC LIMIT 1)[OFFSET(0)] AS name
    FROM ch JOIN `{BQ_PROJECT_ID}.{BQ_DATASET}.chat_messages` m
      ON DATE(m.published_at, 'Asia/Tokyo') BETWEEN ch.f AND ch.t
    WHERE m.author_name != '{BOT_NAME}'
    GROUP BY 1
    """
    people = [dict(r) for r in client.query(sql).result()]
    # **名簿は Firestore から読む。** ここの `client` は BigQuery なので渡せない。
    # 口はあちらの `look()` が1つだけ持つ（読み専用。1バイトも書かない）。
    chars = fetch_characters()
    # **名簿が読めなかったら落ちる。** 黙って 0 人で焼くと、連なりの面から
    # 住人が消えたまま「その章には誰もいなかった」という絵になる
    if not chars:
        raise SystemExit("キャラクターの名簿が1人も返らなかった。焼かずに止める")
    rows, how = link(chars, people)
    icon_of = {r["channel"]: r["icon"] for r in rows if r["channel"]}
    if not icon_of:
        raise SystemExit("名簿の誰ひとりチャンネルに結べなかった。焼かずに止める")
    logger.info(
        "名簿 %d 人 / 候補 %d 人 / チャンネルと結べた %d 人（名乗り %d 件から）",
        how["characters"], len(rows), len(icon_of), len(people),
    )
    return icon_of


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

    # その章にいた住人。**絵の分かっている人だけ**を BigQuery 側で絞る。
    # 100人ぶんの IN 句で済むので、全員ぶんを持ってきて Python で捨てるより軽い。
    icon_of = link_icons(client, ch)
    channels = ", ".join(f"'{c}'" for c in sorted(icon_of))
    residents_sql = f"""
    WITH ch AS ({ch})
    SELECT ch.slug, m.author_channel_id AS channel,
           COUNT(DISTINCT DATE(m.published_at, 'Asia/Tokyo')) AS days
    FROM ch JOIN `{BQ_PROJECT_ID}.{BQ_DATASET}.chat_messages` m
      ON DATE(m.published_at, 'Asia/Tokyo') BETWEEN ch.f AND ch.t
    WHERE m.author_channel_id IN ({channels})
    GROUP BY 1, 2 ORDER BY 1, days DESC
    """

    stats = {c["slug"]: {"people": 0, "streams": 0, "residents": []} for c in chapters}
    for row in client.query(people_sql).result():
        stats[row["slug"]]["people"] = int(row["people"])
    for row in client.query(streams_sql).result():
        stats[row["slug"]]["streams"] = int(row["streams"])
    for row in client.query(residents_sql).result():
        stats[row["slug"]]["residents"].append(
            {"icon": icon_of[row["channel"]], "days": int(row["days"])}
        )
    return stats


def fetch_streams(client: bigquery.Client, chapters: list[dict]) -> dict[str, list]:
    """過去の島に出す配信の明細。**いまも続いている章は焼かない。**

    あそこから入るのは `/streams`（全部）で、章に絞った面を持たない
    （`docs/island-atlas.md` 7章）。焼いても誰も読まないぶん、束が太るだけ。
    """
    past = [c for c in chapters if c["to"] != OPEN_END]
    if not past:
        return {}
    ch = union_all(past)
    sql = f"""
    WITH ch AS ({ch}),
    v AS (
      SELECT video_id, title,
             DATE(COALESCE(actual_start_time, first_seen_at), 'Asia/Tokyo') AS d
      FROM `{BQ_PROJECT_ID}.{BQ_DATASET}.videos` WHERE status = 'SUCCEEDED'
    ),
    n AS (
      SELECT video_id, COUNT(DISTINCT author_channel_id) AS people
      FROM `{BQ_PROJECT_ID}.{BQ_DATASET}.chat_messages` GROUP BY 1
    )
    SELECT ch.slug, v.d, v.video_id,
           -- タイトルに改行が入っている配信がある（イラン歩きの回）。1行に畳む
           REGEXP_REPLACE(v.title, r'\s+', ' ') AS title,
           IFNULL(n.people, 0) AS people
    FROM ch JOIN v ON v.d BETWEEN ch.f AND ch.t
    LEFT JOIN n USING (video_id)
    ORDER BY ch.slug, v.d DESC, v.video_id
    """
    # **押しても見られない配信は、明細に載せない。** 一面ぜんぶ押せる並びなので、
    # 1行でも行き止まりを混ぜると、押した人が「この島の配信は見られない」と読む。
    # 落ちるのは隣に生きた行のある1行なので、章も日付も残る
    gone = blocked()
    out: dict[str, list] = {c["slug"]: [] for c in past}
    dropped = 0
    for row in client.query(sql).result():
        if row["video_id"] in gone:
            dropped += 1
            continue
        out[row["slug"]].append(
            [row["d"].isoformat(), row["video_id"], row["title"], int(row["people"])]
        )
    if dropped:
        logger.info("押しても見られない配信 %d 本を明細から外した（本数は変えない）", dropped)
    return out


def render(chapters: list[dict], stats: dict[str, dict]) -> str:
    lines = [
        "/**",
        " * 章ごとの人数・配信の本数と、**その章にいた住人**。",
        " * **自動生成。手で直さない。**",
        " * 作り直す: `BQ_PROJECT_ID=... python python/build_chapter_stats.py`",
        " *",
        " * `people` はその章のあいだにチャットを1回でも書いた人の数（重複なし）。",
        " * `streams` はその章のあいだに配信して取り込めたものの数。",
        " *",
        " * `residents` は、そのうち**キャラクターの絵が分かっている人**だけ。",
        " * 絵とチャンネルの対応は、キャラクターの名簿（Firestore の `islandCharacter`）に",
        " * チャットの名乗りを当てて作る（`python/build_residents.py` の `link()`）。",
        " * だから `residents.length` は `people` よりずっと少ない。"
        "**この2つは別のものを数えている。**",
        " *",
        " * **同じ人が複数の島に出てよい**（`docs/island-atlas.md` 3章）。",
        " * 島ごとに重複を消さない。ずっと来てくれている人は、ずっと島にいる。",
        " *",
        f" * 数えた日: {date.today().isoformat()}",
        " */",
        "export type ChapterResident = {",
        "  /** キャラクターの絵（Google Drive の id）。`content/residents.ts` の icon と同じ */",
        "  icon: string;",
        "  /** その章のあいだ、チャットを書いた日の数。多い順に並んでいる */",
        "  days: number;",
        "};",
        "",
        "export type ChapterStat = {",
        "  /** その章のあいだに来てくれた人の数 */",
        "  people: number;",
        "  /** その章のあいだの配信の本数 */",
        "  streams: number;",
        "  /** そのうち、絵の分かっている住人。多く来た順 */",
        "  residents: ChapterResident[];",
        "};",
        "",
        "export const CHAPTER_STATS: Record<string, ChapterStat> = {",
    ]
    for c in chapters:
        s = stats[c["slug"]]
        rs = ",\n".join(
            f'      {{ icon: "{r["icon"]}", days: {r["days"]} }}' for r in s["residents"]
        )
        lines += [
            f'  // {c["name"]}',
            f'  "{c["slug"]}": {{',
            f'    people: {s["people"]},',
            f'    streams: {s["streams"]},',
            "    residents: [",
            rs + ("," if rs else ""),
            "    ],",
            "  },",
        ]
    lines += ["};", ""]
    return "\n".join(lines)


def render_streams(streams: dict[str, list], chapters: list[dict]) -> str:
    name_of = {c["slug"]: c["name"] for c in chapters}
    lines = [
        "/**",
        " * 過去の島の配信。**自動生成。手で直さない。**",
        " * 作り直す: `BQ_PROJECT_ID=... python python/build_chapter_stats.py`",
        " *",
        " * **過去の島だけ、その章に絞る**（`docs/island-atlas.md` 7章）。",
        " * `/island/<章>/streams` はこの表だけを見る。`/streams`（全部）とは別のもの。",
        " * いまの島（コーカサス）はここに入れない。あそこから入るのは全部の面。",
        " *",
        " * 1本 = [配信日(JST), videoId, タイトル, その配信でチャットを書いた人の数]。",
        " * **配列で持つ。** 240本をオブジェクトで書くと鍵の名前だけで 12KB 増える。",
        " *",
        f" * 数えた日: {date.today().isoformat()}",
        " */",
        "",
        "/** [配信日(JST), videoId, タイトル, チャットを書いた人の数] */",
        "export type ChapterStream = [string, string, string, number];",
        "",
        "export const CHAPTER_STREAMS: Record<string, ChapterStream[]> = {",
    ]
    for slug, rows in streams.items():
        lines.append(f'  // {name_of.get(slug, slug)}（{len(rows)}本）')
        lines.append(f'  "{slug}": [')
        for r in rows:
            lines.append("    " + json.dumps(r, ensure_ascii=False) + ",")
        lines += ["  ],"]
    lines += ["};", ""]
    return "\n".join(lines)


def main() -> None:
    chapters = read_chapters()
    logger.info("章 %d 個: %s", len(chapters), ", ".join(c["slug"] for c in chapters))
    client = bigquery.Client(project=BQ_PROJECT_ID)
    stats = fetch(client, chapters)
    OUT_TS.write_text(render(chapters, stats), encoding="utf-8")
    logger.info("書き出した: %s", OUT_TS)
    streams = fetch_streams(client, chapters)
    out = render_streams(streams, chapters)
    # 出口でもう一度見る。落としが効かなくなっても、ここで止まる
    check_written(out, OUT_STREAMS_TS.name)
    OUT_STREAMS_TS.write_text(out, encoding="utf-8")
    logger.info("書き出した: %s（%d本）", OUT_STREAMS_TS, sum(len(v) for v in streams.values()))


if __name__ == "__main__":
    main()
