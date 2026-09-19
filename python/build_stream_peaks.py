"""配信のうち「コメントがいちばん重なったところ」を焼いて site/content/streamPeaks.ts を作る。

3時間のアーカイブは、入口が無いと誰も再生しない。
665本ぶんのチャットは外の誰も持っていないので、そこからしか出せない
「どこで話が重なったか」を1点だけ出して、そこから再生できるようにする。

## なぜ折れ線を出さないか

`docs/island-play.md` 仕掛け15 は「コメント密度の折れ線を1本」と書いているが、
実際に数えると**線はほとんど平ら**だった。3分の窓で見て、山は平均の 2.8倍しかない。
5分でならすともっと平らになる。平らな線を並べても読む人には何も分からないので、
それは `docs/island-design.md` 4章の「飾りの数字」になる。

かわりに、データを見て**残ったものだけ**を出す。山の位置1点と、そこに付いた数。

## 山が本物かどうかは確かめてある

コメントを1件おきに2組に割って、それぞれの山を別々に出して突き合わせた
（split-half）。250件以上・60分以上の配信 151本で、**118本（78%）の山が
2分以内で一致**した。中央値のずれは0分。山は雑音ではない。

ただし本数の少ない配信では雑音になるので、下の3つを満たすものだけを焼く。

  * コメント 80件以上、45分以上（数える土台があること）
  * 山の3分に 15件以上（絶対数。9件を「重なった」とは言わない）
  * 平均の2.0倍以上（その配信の中で本当に飛び出していること）

**効いているのは下の2つで、総数ではない。** 80〜249件の帯で同じ突き合わせを
やると、下の2つを満たす 120本のうち **100本（83%）が2分以内で一致**した。
上の帯（78%）より高い。総数の下限を150から80へ下げたのはこの結果による。

756本のうち残るのは 251本。**残らなかった配信では、何も出さない。**
無い日に何か出すために基準を下げると、全部が信用されなくなる。

## 山を探す範囲から、はじめと終わりを外している

終わりぎわは「おつかれさま」が重なる。それは話の中身ではなく合図なので、
そこへ飛ばしても見る人の役に立たない（外す前は 306本中29本が終わりぎわだった）。
最初の1分と最後の3分を、山を探す範囲から外してある。

## 押しても見られない配信は、山も焼かない（2026-09-18）

ここは長いこと `WHERE actual_start_time IS NOT NULL` しか書いていなかった。
**守りが1枚も無い。** 消えた配信（404）・録画の残らなかった配信
（`python/data/dead_streams.json`）も、非公開に戻された配信も素通りする。

**この日の時点では実害が無かった**——非公開37本も取り置きの7本も、
`streamPeaks.ts` の267本には1本も入っていない。山を出すには
コメント80件以上・45分以上が要るので、たまたま全部こぼれていた。
だから塞ぐのは**次に1本でも当たった晩のため。** 当たった晩に何が起きるかというと、
`peakOf()` を読む面（「1年前の今日」など）が、**押しても見られない配信の
「ここが盛り上がりました」を出す。**

守りは他の焼くスクリプトと同じ2つを、同じ形で差す
（`build_dead_streams` の `sql_not_in` と `sql_public`）。

実行:
  BQ_PROJECT_ID=... python python/build_stream_peaks.py

BigQuery に繋げない環境では、あらかじめ吸い出した行を渡せる:
  python python/build_stream_peaks.py --rows /tmp/peaks_rows.json
  （[{"v","k","n","r"}, ...] の JSON。SQL は fetch_peaks() のものと同じ）
"""

import argparse
import json
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

# 守りは2つとも `build_dead_streams` が持つ（`sql_not_in` が取り置き、
# `sql_public` が非公開）。**差す側が同じ顔で並べられる**ように置き場所をそろえてある
from build_dead_streams import (  # noqa: E402
    blocked,
    check_written,
    sql_not_in,
    sql_public,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parent.parent
OUT_TS = ROOT / "site" / "content" / "streamPeaks.ts"

# 焼く条件。上の「山が本物かどうか」に書いた3つ。
MIN_TOTAL = 80
MIN_MINUTES = 45
MIN_PEAK = 15
# r は「平均の何倍か」を10倍した整数で持つ（2.0倍 = 20）
MIN_RATIO = 20


def sql_of(project: str = "live-streaming-d3cac", dataset: str = "youtube_chat") -> str:
    """配信ごとに、コメントがいちばん重なった3分を1つだけ取る SQL。

    **`fetch_peaks()` の外に出してある。** 見張り
    （`python/viewable_streams_selftest.py`）が、守りの差さっている**本物の字**を
    読めるようにするため。中に隠すと、目でしか確かめられない。

    いちばん内側の `v` に、他の焼くスクリプトと同じ2つの守りを差す。

      * `sql_not_in()` … 押しても戻らない回（404・録画なし）
      * `sql_public()` … 非公開に戻された回

    **SQL の側で外す。** 山は配信1本につき1つなので、引いてきてから落としても
    同じ結果にはなるが、`msg` が外した配信のコメントまで数えることになる。
    """
    ds = f"{project}.{dataset}"
    return f"""
    WITH v AS (
      SELECT video_id, actual_start_time FROM `{ds}.videos`
      WHERE actual_start_time IS NOT NULL
        {sql_not_in("video_id")}
        {sql_public("video_id", project, dataset)}
    ), msg AS (
      -- 配信開始からの経過分。timestamp_usec はエポック時刻なので使わず、
      -- published_at と actual_start_time の差を取る（docs/island-play.md 仕掛け2の注意）
      SELECT c.video_id AS vid,
             DIV(CAST(TIMESTAMP_DIFF(c.published_at, v.actual_start_time, SECOND) AS INT64), 60) AS mn
      FROM `{ds}.chat_messages` c JOIN v USING (video_id)
      WHERE c.event_type IN ('TEXT','PAID')
        AND TIMESTAMP_DIFF(c.published_at, v.actual_start_time, SECOND) BETWEEN 0 AND 21600
    ), tot AS (SELECT vid, COUNT(*) AS total, MAX(mn)+1 AS mins FROM msg GROUP BY 1),
    big AS (
      SELECT vid, total, mins FROM tot
      WHERE total >= {MIN_TOTAL} AND mins >= {MIN_MINUTES}
    ),
    cnt AS (SELECT vid, mn, COUNT(*) AS n FROM msg GROUP BY 1,2),
    cells AS (
      -- コメントの無い分にも0を置く。置かないと窓の合計が詰まって山がずれる
      SELECT big.vid, gg AS mn, IFNULL(cnt.n,0) AS n, big.mins, big.total
      FROM big CROSS JOIN UNNEST(GENERATE_ARRAY(0,400)) AS gg
      LEFT JOIN cnt ON cnt.vid = big.vid AND cnt.mn = gg
      WHERE gg < big.mins
    ), win AS (
      SELECT vid, mn, mins, total,
             SUM(n) OVER (PARTITION BY vid ORDER BY mn ROWS BETWEEN 1 PRECEDING AND 1 FOLLOWING) AS w
      FROM cells
    ), pk AS (
      -- はじめの1分と終わりの3分は、あいさつが重なるだけなので山から外す
      SELECT vid, mins, total, ARRAY_AGG(STRUCT(mn, w) ORDER BY w DESC, mn LIMIT 1)[OFFSET(0)] AS p
      FROM win WHERE mn >= 1 AND mn <= mins - 4 GROUP BY 1,2,3
    )
    SELECT vid AS v,
           GREATEST(p.mn - 1, 0) * 60 AS k,
           p.w AS n,
           CAST(ROUND(10 * p.w / (3.0 * total / mins)) AS INT64) AS r
    FROM pk ORDER BY vid
    """


def fetch_peaks() -> list:
    """上の SQL を BigQuery に流す。"""
    from google.cloud import bigquery  # BQ を使うときだけ要る

    from config import BQ_DATASET, BQ_PROJECT_ID

    client = bigquery.Client(project=BQ_PROJECT_ID)
    return [dict(r) for r in client.query(sql_of(BQ_PROJECT_ID, BQ_DATASET)).result()]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--rows", help="BigQuery の代わりに読む JSON")
    args = ap.parse_args()

    rows = (
        json.loads(Path(args.rows).read_text(encoding="utf-8"))
        if args.rows
        else fetch_peaks()
    )
    # **押しても戻らない回は、ここでも落とす。** SQL に同じ守りが差さっているが、
    # `--rows` で渡した行はそこを通っていない（取り置きの新しいぶんは、
    # 吸い出したあとに増えることもある）
    gone = blocked()
    left = [r for r in rows if r["v"] not in gone]
    if len(left) != len(rows):
        logger.info("押しても見られない配信 %d 本を外した（取り置き %d 本）",
                    len(rows) - len(left), len(gone))
    keep = {
        r["v"]: {"k": int(r["k"]), "n": int(r["n"])}
        for r in sorted(left, key=lambda x: x["v"])
        if int(r["n"]) >= MIN_PEAK and int(r["r"]) >= MIN_RATIO
    }
    logger.info("候補 %d 本のうち %d 本を焼く", len(rows), len(keep))

    body = json.dumps(keep, ensure_ascii=False, separators=(",", ":"))
    out = (
        "/**\n"
        " * 配信のうち、コメントがいちばん重なったところ。\n"
        " * python/build_stream_peaks.py が BigQuery から作る。**手で編集しない。**\n"
        " *\n"
        " * 3時間のアーカイブは、入口が無いと誰も再生しない。\n"
        " * ここが「そこだけ見にいく」ための入口になる。\n"
        " *\n"
        " * **出せる配信のほうが少ない。** 山が雑音と区別できるものだけ焼いてあるので、\n"
        " * 引けなかったら黙る。無い配信に何か出すために基準を下げると、\n"
        " * 出ているものまで信用されなくなる（基準は焼くスクリプトに書いてある）。\n"
        " *\n"
        " * **サーバー側でだけ使う。** ここをブラウザに配ると、\n"
        f" * 使わない{len(keep)}本ぶんまで一緒に落ちていく。\n"
        " * 「1年前の今日」のぶんは `content/onThisDay.ts` に焼き込んであるし、\n"
        " * 字と URL を作るだけの2つは `lib/peak.ts` に分けてある。\n"
        " */\n\n"
        "export type Peak = {\n"
        "  /** 配信のはじめから何秒のところか。ここから YouTube を開く */\n"
        "  k: number;\n"
        "  /** その3分に付いたコメントの数 */\n"
        "  n: number;\n"
        "};\n\n"
        f"const PEAKS: Record<string, Peak> = {body};\n\n"
        "/** その配信の山。無ければ null。 */\n"
        "export const peakOf = (videoId: string): Peak | null => PEAKS[videoId] ?? null;\n"
    )
    # 出口でもう一度見る。入力の形が変わって落としが効かなくなっても、ここで止まる
    check_written(out, OUT_TS.name)
    OUT_TS.write_text(out, encoding="utf-8")
    logger.info("%s に %d 本を書き出した", OUT_TS, len(keep))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
