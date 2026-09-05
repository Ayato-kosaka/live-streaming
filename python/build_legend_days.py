"""伝説の企画の1枚に出す「その期間ぜんぶ」を焼く（`site/content/legendDays.ts`）。

## なぜ足したか

`content/legends.ts` の `streams` は**見どころの抜き書き**で、その期間の
配信ぜんぶではない。「イランまで歩く」は12日間で15本あるのに、面に出ていたのは
6本だった。しかも面の見出しは「その時の配信 6本」で、**6本しか無かったように
読める。** 伝説だと言っている企画なのに、実物より小さく見せていた。

抜き書きは抜き書きのまま残して、その下に**期間の配信をぜんぶ**並べる。
1日ずつ何キロ歩いたかがタイトルに入っているので、並べるとそれが日誌になる。

## 題名から、毎日おなじ行を落とす

イランの15本は、題名が3行ある。

    【8日目】
    怖いイメージを変えたいので
    一緒にご飯食べにイランまで歩く。
    8日目 Tatev 29キロ

真ん中の2行は15本ぜんぶに入っている。そのまま並べると、
同じ2行が15回出て、**違うところ（何日目・何キロ）が埋もれる。**
なので**半分より多くの題名に出てくる行を落とす**。
手で書き換えない（引用なので）。落とすだけにする。

## この箱から BigQuery に繋げない

`build_voices.py` と同じ。SQL は別の口から流して、返ってきた行を
`python/data/legend_streams.json` と `python/data/legend_totals.json` に置いてある。

    python python/build_legend_days.py --build
"""

import argparse
import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = Path(__file__).resolve().parent / "data"
LEGENDS_TS = ROOT / "site" / "content" / "legends.ts"
OUT_TS = ROOT / "site" / "content" / "legendDays.ts"

SQL_STREAMS = """
-- 期間の配信ぜんぶ。{ranges} は legends.ts の range を OR で並べたもの
WITH m AS (
  SELECT video_id,
    FORMAT_TIMESTAMP('%Y-%m-%d', MIN(published_at), 'UTC') AS d,
    COUNTIF(event_type='TEXT') AS msgs,
    COUNT(DISTINCT IF(event_type='TEXT', author_channel_id, NULL)) AS people,
    TIMESTAMP_DIFF(MAX(published_at), MIN(published_at), MINUTE) AS mins
  FROM `live-streaming-d3cac.youtube_chat.chat_messages`
  WHERE author_name != '@あやとグルメアプリ' AND ({ranges})
  GROUP BY video_id
)
SELECT m.d, m.video_id, v.title, m.msgs, m.people, m.mins
FROM m LEFT JOIN `live-streaming-d3cac.youtube_chat.videos` v USING (video_id)
ORDER BY m.d, m.video_id
"""

SQL_TOTALS = """
-- 企画ごとの、のべではない「何人が居合わせたか」。
-- 配信ごとの人数を足すと、毎日来ていた人を毎日数えることになる。1回で数える
SELECT g, COUNT(DISTINCT author_channel_id) AS people, COUNT(*) AS msgs
FROM (SELECT author_channel_id, CASE {cases} END AS g
      FROM `live-streaming-d3cac.youtube_chat.chat_messages`
      WHERE event_type='TEXT' AND author_name != '@あやとグルメアプリ')
WHERE g IS NOT NULL GROUP BY g
"""


def legends() -> list[dict]:
    """legends.ts から slug・期間・抜き書きの videoId を読む。TS を1つの正にする。"""
    src = LEGENDS_TS.read_text(encoding="utf-8")
    out = []
    for block in src.split('\n    slug: "')[1:]:
        slug = block[: block.index('"')]
        rng = re.search(r'range: \["([\d-]+)", "([\d-]+)"\]', block)
        picked = re.findall(r'videoId: "([^"]+)"', block)
        out.append(
            {
                "slug": slug,
                "range": (rng.group(1), rng.group(2)) if rng else None,
                "picked": picked,
            }
        )
    return out


def _common_tail(xs: list[str]) -> str:
    """並びぜんぶの、うしろから見て一致している部分。"""
    if len(xs) < 2:
        return ""
    tail = xs[0]
    for x in xs[1:]:
        n = 0
        while n < len(tail) and n < len(x) and tail[-1 - n] == x[-1 - n]:
            n += 1
        tail = tail[len(tail) - n :]
        if not tail:
            break
    return tail


def trim_titles(titles: list[str]) -> list[str]:
    """毎日おなじところを落として、違うところだけを残す。

    2段でやる。
    1. 半分より多くの題名に出てくる**行**を落とす
    2. 何行もある題名だけを見て、**1行目のうしろに共通してくっついている尻尾**も落とす
       （「【8日目】怖いイメージを変えたいので」の後ろ半分。行が分かれていないので
       1 では落ちない）
    """
    lines = [[x.strip() for x in t.split("\n") if x.strip()] for t in titles]
    common = {
        line
        for line, n in Counter(x for ls in lines for x in set(ls)).items()
        if n * 2 > len(titles) and len(titles) > 2
    }
    multi = [ls[0] for ls in lines if len(ls) > 1]
    tail = _common_tail(multi)
    # 括弧の閉じまで一致することがある（「】怖いイメージを…」）。閉じは残す
    while tail[:1] in ("】", "]", "）", ")"):
        tail = tail[1:]
    # 短い尻尾（「。」だけ、など）まで落とすと、題名が読めなくなる
    if len(tail) < 5 or any(x == tail for x in multi):
        tail = ""
    out = []
    for ls in lines:
        kept = [x for x in ls if x not in common] or ls  # 全部消えたら元のまま
        if tail and len(ls) > 1 and kept and kept[0].endswith(tail):
            kept[0] = kept[0][: -len(tail)].strip()
        out.append(" ".join(x for x in kept if x))
    return out


def ts_str(s: str) -> str:
    return json.dumps(s, ensure_ascii=False)


def build() -> None:
    rows = json.loads((DATA / "legend_streams.json").read_text(encoding="utf-8"))
    totals = json.loads((DATA / "legend_totals.json").read_text(encoding="utf-8"))

    body = []
    for lg in legends():
        if not lg["range"]:
            continue
        a, b = lg["range"]
        mine = sorted([r for r in rows if a <= r["d"] <= b], key=lambda r: (r["d"], r["v"]))
        if not mine:
            continue
        titles = trim_titles([r["t"] for r in mine])
        tot = totals.get(lg["slug"], {})
        days = len({r["d"] for r in mine})
        # いちばん人が集まった日。「盛り上がったところ」は数えれば分かる事実
        top = max(mine, key=lambda r: r["people"])
        items = ", ".join(
            "[%s, %s, %s, %d, %d]" % (ts_str(r["d"]), ts_str(r["v"]), ts_str(t), r["people"], r["msgs"])
            for r, t in zip(mine, titles)
        )
        body.append(
            '  %s: { people: %d, msgs: %d, days: %d, top: %s, streams: [%s] },'
            % (ts_str(lg["slug"]), tot.get("people", 0), tot.get("msgs", 0), days, ts_str(top["v"]), items)
        )

    OUT_TS.write_text(HEADER + "\n".join(body) + FOOTER, encoding="utf-8")
    print(f"{OUT_TS} … {len(body)}企画")


HEADER = '''/**
 * 伝説の企画の、その期間の配信ぜんぶ。**手で直さない。**
 * `python/build_legend_days.py` が BigQuery から焼く。
 *
 * `content/legends.ts` の `streams` は**見どころの抜き書き**で、
 * その期間の配信ぜんぶではない（イランの12日間は抜き書き6本／実物15本）。
 * 面に「6本」と出ていると、伝説が実物より小さく見える。こちらが実物のほう。
 *
 * 題名は YouTube のもの。**引用なので書き換えない**が、
 * 半分より多くの題名に出てくる行だけは落としてある（毎日おなじ2行が
 * 15回並ぶと、違うところ（何日目・何キロ）が埋もれるため）。
 */

/** [配信日(UTC), videoId, 題名, その配信で書いた人の数, コメントの数] */
export type LegendStream = [string, string, string, number, number];

export type LegendDays = {
  /** その期間に、のべではなく何人が来ていたか（同じ人を何度も数えない） */
  people: number;
  /** その期間のコメントの数 */
  msgs: number;
  /** 配信のあった日の数 */
  days: number;
  /** いちばん人が集まった配信の videoId */
  top: string;
  /** その期間の配信ぜんぶ。古い順 */
  streams: LegendStream[];
};

const LEGEND_DAYS: Record<string, LegendDays> = {
'''

FOOTER = """};

export const legendDays = (slug: string): LegendDays | undefined => LEGEND_DAYS[slug];
"""


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--build", action="store_true")
    ap.add_argument("--sql", action="store_true", help="取り直す SQL を出す")
    a = ap.parse_args()
    if a.sql:
        print(SQL_STREAMS, SQL_TOTALS)
    else:
        build()
