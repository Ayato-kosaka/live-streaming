"""国の1枚に出す、その国での数を焼く（`site/content/countryStats.ts`）。

## なぜ足したか

`/map/[国]` は「ここからの配信」を `content/cityStreams.ts` から数えていた。
あれは**街ごとの代表を焼いたもの**なので、ジョージアは 6本と出ていた。
実際には 378本ある。**いちばん長くいた国を、6日いた国と同じ大きさに見せていた。**

数えれば分かることなので、滞在の期間で切って、そのまま焼く。

  lives  その国から出した配信の本数
  people その国にいたあいだに来ていた人（のべではない。同じ人を1回だけ）
  msgs   その国で飛んだコメント
  days   配信のあった日
  top    その国でいちばん人が集まった配信

**個人別のコメント数は出さない**（`.claude/skills/monthly-review/SKILL.md` 3章）。
出すのは全体の数と、いちばん集まった日だけ。

## BigQuery を引くように直した（2026-09-15）

前はここに SQL が**文字列として置いてあるだけ**で、本体は
`python/data/country_stats.json`（別の口で流した結果の取り置き）を
焼き直していた。SQL には `{cases}` という差し込みの跡が残っていて、
**どこからも `.format()` されていなかった。** 頭には
「BigQuery から焼く」と書いてあった。**書いてあることと、やっていることが
違った。**

その結果、取り置きは **2026-05-06 で止まったまま4ヶ月**だれにも気づかれず、
表紙は「17カ国を歩いた」と言い続けた。ポーランドもリトアニアも歩いたあとに。
**回しても数字が動かないものは、回しても止まっていることが分からない。**

いまは滞在の期間（`python/stays.py`）から SQL を組んで、BigQuery を引く。
取り置きの JSON は**引いた結果の写し**として置き直す（BigQuery に繋げない
手元で焼き直すときの入力になる）。

## 期間が重なる国

イラン国境まで歩いた10日はアルメニアの滞在の中にある。`CASE` では両方に
入れられないので、滞在を表にして `JOIN` する。重なっている日は両方に数える
（実際に両方の国にいた日なので）。

実行:
  BQ_PROJECT_ID=... python python/build_country_stats.py

BigQuery に繋げない環境では、あらかじめ吸い出した行を渡せる:
  python python/build_country_stats.py --sql              # 流す SQL を出す
  python python/build_country_stats.py --rows /tmp/cs.json
"""

import argparse
import json
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from stays import read_all  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parent.parent
DATA = Path(__file__).resolve().parent / "data"
OUT_TS = ROOT / "site" / "content" / "countryStats.ts"
CACHE = DATA / "country_stats.json"


def sql_of(project: str = "live-streaming-d3cac", dataset: str = "youtube_chat") -> str:
    """滞在の表を組み込んだ SQL。

    **滞在は `UNNEST` の表にして `JOIN` する。** `CASE` だと1行が1カ国にしか
    入らないので、期間の重なる国（アルメニアとイラン国境）を数えられない。
    """
    rows = []
    for c in read_all():
        for s in c["stays"]:
            hi = s["to"] or "9999-12-31"
            rows.append(f"      STRUCT('{c['slug']}' AS g, DATE '{s['from']}' AS f, DATE '{hi}' AS t)")
    stays = ",\n".join(rows)
    return f"""
WITH stays AS (
  SELECT * FROM UNNEST([
{stays}
  ])
),
m AS (
  SELECT video_id, author_channel_id, DATE(published_at, 'UTC') AS d
  FROM `{project}.{dataset}.chat_messages`
  WHERE event_type = 'TEXT' AND author_name != '@あやとグルメアプリ'
),
b AS (
  SELECT s.g, m.video_id, m.author_channel_id, m.d
  FROM m JOIN stays s ON m.d BETWEEN s.f AND s.t
),
agg AS (
  SELECT g, COUNT(DISTINCT video_id) AS lives, COUNT(DISTINCT author_channel_id) AS people,
         COUNT(*) AS msgs, COUNT(DISTINCT d) AS days
  FROM b GROUP BY g
),
-- その国でいちばん人が集まった配信。**コメント数ではなく人の数で選ぶ**
-- （1人が300回書いた配信を「いちばん集まった日」と呼ばないため）
pv AS (
  SELECT g, video_id, MIN(d) AS d, COUNT(DISTINCT author_channel_id) AS people,
         ROW_NUMBER() OVER (
           PARTITION BY g ORDER BY COUNT(DISTINCT author_channel_id) DESC, MIN(d)
         ) AS rk
  FROM b GROUP BY g, video_id
)
SELECT a.g, a.lives, a.people, a.msgs, a.days,
       p.d AS top_d, p.video_id AS top_v, v.title AS top_t, p.people AS top_people
FROM agg a
JOIN pv p ON p.g = a.g AND p.rk = 1
LEFT JOIN `{project}.{dataset}.videos` v ON v.video_id = p.video_id
ORDER BY a.g
"""


def fetch() -> list:
    from google.cloud import bigquery  # BQ を使うときだけ要る

    from config import BQ_DATASET, BQ_PROJECT_ID

    client = bigquery.Client(project=BQ_PROJECT_ID)
    return [dict(r) for r in client.query(sql_of(BQ_PROJECT_ID, BQ_DATASET)).result()]


def to_cache(rows: list) -> dict:
    """引いてきた行を、取り置きの JSON と同じ形にする。"""
    out = {}
    for r in rows:
        out[r["g"]] = {
            "lives": int(r["lives"]),
            "people": int(r["people"]),
            "msgs": int(r["msgs"]),
            "days": int(r["days"]),
            "top": [str(r["top_d"]), r["top_v"], r["top_t"] or "", int(r["top_people"])],
        }
    return out


def ts(x) -> str:
    return json.dumps(x, ensure_ascii=False)


def build(src: dict) -> None:
    body = []
    for slug in sorted(src):
        x = src[slug]
        d, v, title, people = x["top"]
        # 題名は YouTube のもの。改行は「＠」で置いてあるので1行に畳む（書き換えない）
        title = " ".join(" ".join(t for t in title.split("＠") if t).split())
        body.append(
            "  %s: { lives: %d, people: %d, msgs: %d, days: %d, top: [%s, %s, %s, %d] },"
            % (ts(slug), x["lives"], x["people"], x["msgs"], x["days"], ts(d), ts(v), ts(title), people)
        )
    OUT_TS.write_text(HEADER + "\n".join(body) + FOOTER, encoding="utf-8")
    logger.info("%s … %dカ国", OUT_TS, len(body))


HEADER = '''/**
 * 国ごとの、その国での数。**手で直さない。**
 * `python/build_country_stats.py` が BigQuery から焼く。
 *
 * 期間は `python/stays.py`——歩き終わった国は `content/countries.ts`、
 * いま歩いている旅は `content/nordic.ts` の旅程——から出している。
 * **だから旅の途中で入った国も、その晩から数に入る。**
 *
 * `content/cityStreams.ts` は街ごとの**代表**なので、本数を数える台には使えない
 * （ジョージアが 6本と出ていた。実物は 378本）。数えるならこちら。
 *
 * `top` の題名は YouTube のもの。引用なので書き換えない。
 */

/** [配信日(UTC), videoId, 題名, その配信で書いた人の数] */
export type CountryTop = [string, string, string, number];

export type CountryStat = {
  /** その国から出した配信の本数 */
  lives: number;
  /** その国にいたあいだに来ていた人。のべではない */
  people: number;
  /** その国で飛んだコメント */
  msgs: number;
  /** 配信のあった日 */
  days: number;
  /** その国でいちばん人が集まった配信 */
  top: CountryTop;
};

const COUNTRY_STATS: Record<string, CountryStat> = {
'''

FOOTER = """};

export const countryStat = (slug: string): CountryStat | undefined => COUNTRY_STATS[slug];

/**
 * 数のある国の数＝**歩いた国の数**。
 *
 * **手で書かない。** 表紙の「17カ国を歩いた」は `content/site.ts` に手で
 * 書いてあって、2026-05-06 から4ヶ月動かなかった。ここは毎晩焼き直るので、
 * 歩いた国が増えた翌朝には増えている（`docs/island-standards.md` 8章）。
 */
export const COUNTRIES_WALKED = Object.keys(COUNTRY_STATS).length;
"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sql", action="store_true", help="流す SQL を出すだけ")
    ap.add_argument("--rows", help="BigQuery の代わりに読む JSON（--sql の結果の行）")
    a = ap.parse_args()

    if a.sql:
        print(sql_of())
        return 0

    if a.rows:
        rows = json.loads(Path(a.rows).read_text(encoding="utf-8"))
    else:
        rows = fetch()
    if not rows:
        logger.error("1行も返ってこなかった。焼かずに止める")
        return 1

    src = to_cache(rows)
    # **取り置きは「引いた結果の写し」。** ここを正にすると、また凍る
    CACHE.write_text(json.dumps(src, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    build(src)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
