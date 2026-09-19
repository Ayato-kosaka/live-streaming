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

import argparse
import json
import logging
import re
import sys
from datetime import date
from pathlib import Path

from google.cloud import bigquery

sys.path.insert(0, str(Path(__file__).parent))

# 守りは2つとも `build_dead_streams` が持つ（`sql_not_in` が取り置き、
# `sql_public` が非公開）。**差す側が同じ顔で並べられる**ように置き場所をそろえてある
from build_dead_streams import blocked, check_written, sql_public  # noqa: E402
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
    chars = fetch_characters(look())
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


def fetch(
    client: bigquery.Client, chapters: list[dict], per_chapter: dict[str, list]
) -> dict[str, dict]:
    """章ごとの人数・配信の本数・住人。

    **本数（`streams`）は、一覧（`per_chapter`）をそのまま数える。**
    自分で SQL を書かない——書くと条件が2つになり、**同じ表から焼いた数と一覧が
    食い違う**（`docs/island-misses.md` #160 の決めごと1 / #166）。
    """
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

    stats = {
        # **本数は一覧の長さ。数える口を2つ持たない**（この関数の docstring）
        c["slug"]: {"people": 0, "streams": len(per_chapter.get(c["slug"], [])),
                    "residents": []}
        for c in chapters
    }
    for row in client.query(people_sql).result():
        stats[row["slug"]]["people"] = int(row["people"])
    for row in client.query(residents_sql).result():
        stats[row["slug"]]["residents"].append(
            {"icon": icon_of[row["channel"]], "days": int(row["days"])}
        )
    return stats


def streams_sql(ch: str, project: str = BQ_PROJECT_ID, dataset: str = BQ_DATASET) -> str:
    """章ごとの配信の明細を取る SQL。**`fetch_streams` の外に出してある。**

    見張り（`python/viewable_streams_selftest.py`）が、**本物の字**を読めるように
    するため。中に隠すと、守りが差さっているかを目でしか確かめられない。

    ## 「取り込めたか」で「見られるか」を代わりに数えない（2026-09-18）

    ここは長いこと `WHERE status = 'SUCCEEDED'` だった。`status` が言っているのは
    **チャットを取り込めたか**であって、**いま見られるか**ではない。
    2026-09-18 の本番で、取り込めていない44本は**動画のほうは公開されていて**、
    そのうち34本は同じ表から焼いている `cityStreams.ts`（街の地図）に並んでいた。
    **地図から辿れる配信が、章の一覧には無い。**（`docs/island-misses.md` #160 #166）

    だから条件は `build_city_streams.sql_of()` と**同じ2つ**にそろえる。

      * `actual_start_time IS NOT NULL` … 実際に始まった回だけ
      * `sql_public()` … 非公開に戻された回を外す

    `actual_start_time` を要るものにしてあるのは、**始まっていない行が混ざる**ため。
    本番の3本（`LsJbN8n28l0` ほか）は題名が「あやとアプリ×海外旅 がライブ配信中！」の
    ままで、押しても見られない（404 / 録画なし。2026-09-18 に1本ずつ当てた）。
    **街の地図と同じ条件にすれば、2つの焼き込みを id で突き合わせられる**——
    食い違いがそのまま不具合の印になる（#160 の決めごと1）。

    **数（`chapterStats.ts` の `streams`）はここを通さない。** あちらは
    `fetch()` の `streams_sql` が `status = 'SUCCEEDED'` のまま数えている。
    """
    return f"""
    WITH ch AS ({ch}),
    v AS (
      SELECT video_id, title,
             DATE(actual_start_time, 'Asia/Tokyo') AS d
      FROM `{project}.{dataset}.videos`
      WHERE actual_start_time IS NOT NULL
        {sql_public("video_id", project, dataset)}
    ),
    n AS (
      SELECT video_id, COUNT(DISTINCT author_channel_id) AS people
      FROM `{project}.{dataset}.chat_messages` GROUP BY 1
    )
    SELECT ch.slug, v.d, v.video_id,
           -- タイトルに改行が入っている配信がある（イラン歩きの回）。1行に畳む
           REGEXP_REPLACE(v.title, r'\s+', ' ') AS title,
           IFNULL(n.people, 0) AS people
    FROM ch JOIN v ON v.d BETWEEN ch.f AND ch.t
    LEFT JOIN n USING (video_id)
    ORDER BY ch.slug, v.d DESC, v.video_id
    """


def fetch_streams(client: bigquery.Client, chapters: list[dict]) -> dict[str, list]:
    """**章ごとの配信。数と一覧の、たった1つの出どころ。**

    **閉じた章だけではなく、章ぜんぶを引く。** 面に出すのは閉じた章だけ
    （`/island/<章>/streams`。`docs/island-atlas.md` 7章）だが、**本数は
    いまの島にも要る**ので、ここで全部そろえて `fetch()` に渡す。
    前は本数だけ別の SQL で数えていて、条件が2つに分かれていた（#166）。

    **押しても見られない配信は載せない。** 一面ぜんぶ押せる並びなので、
    1行でも行き止まりを混ぜると、押した人が「この島の配信は見られない」と読む。
    落ちるのは隣に生きた行のある1行なので、章も日付も残る。
    落とす仕事は `rows_to_streams` の1か所（`--rows` から来た行も同じ道を通る）。
    """
    if not chapters:
        return {}
    rows = [dict(r) for r in client.query(streams_sql(union_all(chapters))).result()]
    return rows_to_streams(rows, chapters)


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


def past_of(chapters: list[dict]) -> list[dict]:
    """明細を焼く章（＝もう閉じた章）だけ。`fetch_streams` と同じ選び方。"""
    return [c for c in chapters if c["to"] != OPEN_END]


def bake_streams(streams: dict[str, list], chapters: list[dict]) -> None:
    """明細を書く。**面に出すのは閉じた章だけ**なので、ここで絞る。

    絞るのを `fetch_streams` ではなくここでやるのは、**本数（`chapterStats.ts`）が
    いまの島のぶんも要る**から。数と一覧は同じ行から出す（#166）。
    出口でもう一度、取り置きの id が残っていないかを見る。
    """
    past = {c["slug"] for c in past_of(chapters)}
    streams = {k: v for k, v in streams.items() if k in past}
    out = render_streams(streams, chapters)
    check_written(out, OUT_STREAMS_TS.name)
    OUT_STREAMS_TS.write_text(out, encoding="utf-8")
    logger.info("書き出した: %s（%d本）", OUT_STREAMS_TS, sum(len(v) for v in streams.values()))


def rows_to_streams(rows: list[dict], chapters: list[dict]) -> dict[str, list]:
    """`--rows` で渡した行を、`fetch_streams` と**同じ落とし方**で明細に直す。

    落とすところを2つ持たないために、行を並べる仕事はここに置いて、
    `fetch_streams` からも呼ぶ。**BigQuery から来ても JSON から来ても同じ道を通る。**
    """
    gone = blocked()
    out: dict[str, list] = {c["slug"]: [] for c in chapters}
    dropped = 0
    for row in rows:
        if row["video_id"] in gone:
            dropped += 1
            continue
        d = row["d"]
        out[row["slug"]].append(
            [d if isinstance(d, str) else d.isoformat(),
             row["video_id"], row["title"], int(row["people"])]
        )
    if dropped:
        logger.info("押しても見られない配信 %d 本を明細から外した（本数は変えない）", dropped)
    return out


def restat_from_streams(per_chapter: dict[str, list], chapters: list[dict]) -> list[str]:
    """**口のそろっていない箱で、本数だけを焼き直す。** 変えた行を返す。

    `chapterStats.ts` は人数（BigQuery）と住人（Firestore の名簿）も持っている。
    `--rows` で回す箱にはどちらの口も無いので、**そこは前の焼き込みから持ち越して、
    本数（`streams`）だけを一覧の長さに入れ替える。**

    **毎晩の焼き直しはこの道を通らない**（`main()` は口がそろっているので
    `render()` でまるごと書き直す）。ここは「本数の条件を変えた回に、
    数と一覧を同じコミットで合わせる」ためだけにある——**片方だけ入った
    master は、1クリックで隣り合う面に違う数が出る状態**（#166）。

    持ち越しが効いているかは、書く前に**行ごとに突き合わせて**確かめる。
    `streams:` 以外の行が1行でも動いたら、**書かずに落ちる。**
    人数も住人も見出しの「数えた日」も、ここでは1文字も動かない。
    """
    if not OUT_TS.exists():
        raise SystemExit(f"{OUT_TS} がありません。本数だけを直す道は使えません")
    before = OUT_TS.read_text(encoding="utf-8").splitlines(keepends=True)
    want = {c["slug"]: len(per_chapter.get(c["slug"], [])) for c in chapters}
    after: list[str] = []
    slug = None
    seen: set[str] = set()
    for line in before:
        m = re.match(r'^  "([a-z0-9-]+)": \{$', line.rstrip("\n"))
        if m:
            slug = m.group(1)
        elif slug is not None and line.startswith("    streams: "):
            after.append(f"    streams: {want[slug]},\n")
            seen.add(slug)
            continue
        after.append(line)
    missing = sorted(set(want) - seen)
    if missing:
        raise SystemExit(f"{OUT_TS.name} に本数の行が見つからない章があります: {missing}")

    moved = [b for b, a in zip(before, after) if b != a]
    bad = [ln for ln in moved if not ln.startswith("    streams: ")]
    if bad or len(before) != len(after):
        raise SystemExit(
            f"{OUT_TS.name} の本数以外が動きました（この道では動かしてはいけない）: {bad[:3]}"
        )
    OUT_TS.write_text("".join(after), encoding="utf-8")
    return [f"{k}: {want[k]}本" for k in sorted(want)]


def main() -> None:
    ap = argparse.ArgumentParser()
    # **明細だけは BigQuery の無い箱でも焼き直せるようにしてある**
    # （`build_stream_peaks.py` の `--rows` と同じ形。`.claude/skills/island-fresh` 4章）。
    # 数のほう（chapterStats.ts）は Firestore の名簿も要るので、こちらでは焼かない
    ap.add_argument("--sql", action="store_true", help="明細の SQL を出すだけ")
    ap.add_argument("--rows", help="BigQuery の代わりに読む JSON（--sql の結果の行）")
    a = ap.parse_args()
    chapters = read_chapters()
    if a.sql:
        print(streams_sql(union_all(chapters)))
        return
    if a.rows:
        rows = json.loads(Path(a.rows).read_text(encoding="utf-8"))
        per_chapter = rows_to_streams(rows, chapters)
        bake_streams(per_chapter, chapters)
        # **数と一覧は同じコミットで動かす。** 片方だけ入れない（`restat_from_streams`）
        logger.info("本数を一覧にそろえた: %s", " / ".join(restat_from_streams(per_chapter, chapters)))
        return
    logger.info("章 %d 個: %s", len(chapters), ", ".join(c["slug"] for c in chapters))
    client = bigquery.Client(project=BQ_PROJECT_ID)
    # **先に一覧を作る。** 本数はこれを数えるので、順番が逆だと数えるものが無い
    per_chapter = fetch_streams(client, chapters)
    stats = fetch(client, chapters, per_chapter)
    OUT_TS.write_text(render(chapters, stats), encoding="utf-8")
    logger.info("書き出した: %s", OUT_TS)
    bake_streams(per_chapter, chapters)


if __name__ == "__main__":
    main()
