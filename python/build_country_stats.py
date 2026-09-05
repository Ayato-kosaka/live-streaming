"""国の1枚に出す、その国での数を焼く（`site/content/countryStats.ts`）。

## なぜ足したか

`/map/[国]` は「ここからの配信」を `content/cityStreams.ts` から数えていた。
あれは**街ごとの代表を焼いたもの**なので、ジョージアは 6本と出ていた。
実際には 378本ある。**いちばん長くいた国を、6日いた国と同じ大きさに見せていた。**

数えれば分かることなので、滞在の期間（`content/countries.ts` の `stays`）で
チャットを切って、そのまま焼く。

  lives  その国から出した配信の本数
  people その国にいたあいだに来ていた人（のべではない。同じ人を1回だけ）
  msgs   その国で飛んだコメント
  days   配信のあった日
  top    その国でいちばん人が集まった配信

**個人別のコメント数は出さない**（`.claude/skills/monthly-review/SKILL.md` 3章）。
出すのは全体の数と、いちばん集まった日だけ。

## この箱から BigQuery に繋げない

`build_voices.py` と同じ。SQL（`SQL`）は別の口から流して、返ってきた行を
`python/data/country_stats.json` に置いてある。

    python python/build_country_stats.py --build
"""

import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = Path(__file__).resolve().parent / "data"
OUT_TS = ROOT / "site" / "content" / "countryStats.ts"

SQL = """
-- {cases} は countries.ts の stays を CASE に並べたもの。
-- 期間が重なる国（イラン国境まで歩いた10日はアルメニアの中にある）は
-- CASE では両方に入れられないので、そこだけ別に1回引く。
WITH b AS (
  SELECT video_id, author_channel_id, published_at, CASE {cases} END AS g
  FROM `live-streaming-d3cac.youtube_chat.chat_messages`
  WHERE event_type='TEXT' AND author_name != '@あやとグルメアプリ'
)
SELECT g, COUNT(DISTINCT video_id) lives, COUNT(DISTINCT author_channel_id) people,
  COUNT(*) msgs, COUNT(DISTINCT FORMAT_TIMESTAMP('%Y-%m-%d', published_at, 'UTC')) days
FROM b WHERE g IS NOT NULL GROUP BY g
"""


def ts(x) -> str:
    return json.dumps(x, ensure_ascii=False)


def build() -> None:
    src = json.loads((DATA / "country_stats.json").read_text(encoding="utf-8"))
    body = []
    for slug in sorted(src):
        x = src[slug]
        d, v, title, people = x["top"]
        # 題名は YouTube のもの。改行は「＠」で置いてあるので1行に畳む（書き換えない）
        title = " ".join(t for t in title.split("＠") if t).strip()
        body.append(
            "  %s: { lives: %d, people: %d, msgs: %d, days: %d, top: [%s, %s, %s, %d] },"
            % (ts(slug), x["lives"], x["people"], x["msgs"], x["days"], ts(d), ts(v), ts(title), people)
        )
    OUT_TS.write_text(HEADER + "\n".join(body) + FOOTER, encoding="utf-8")
    print(f"{OUT_TS} … {len(body)}カ国")


HEADER = '''/**
 * 国ごとの、その国での数。**手で直さない。**
 * `python/build_country_stats.py` が BigQuery から焼く。
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
"""


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--build", action="store_true")
    ap.add_argument("--sql", action="store_true")
    a = ap.parse_args()
    print(SQL) if a.sql else build()
