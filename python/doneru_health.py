"""Doneru のぶんが、いつまで島に入っているかを1枚写す。

## なぜ要るか（GitHub #294）

Doneru の寄付は cookie（`_dt`）ひとつで取りに行っている。ログインは Google の
OAuth なので、**切れたら自動では戻せない。** そして切れた日から、寄付は
BigQuery に入らなくなる。

島から見ると、こうなる。

- **豚の貯金箱が、その日から Doneru ぶんだけ動かなくなる**（スパチャぶんは伸びる）
- 「みんなで連れていく」で**投げてくれた人のぶんが、島に出ない**
- 落ちていることは Actions を見れば分かるが、**旅先のあやとは見ない**

**額が減るわけではないので、誰も気づかない。** 増えなくなるだけ。
出してくれた人から見れば、自分のぶんが反映されないので、そこがいちばん困る。

## 何をするか

BigQuery の `doneru_ingest_runs`（取り込みを試した記録。1回＝1行）から
**いちばん新しい「入った」実行**を拾って、Firestore に1枚だけ写す。

    islandDoneruHealth/last
      at          この札を書いた時刻（ISO8601 UTC）
      okAt        いちばん新しい「入った」実行の時刻（ISO8601 UTC）
      okDay       同じものを日本時間の日で（"2026-09-12"）。**島が読むのはここ**
      lastAt      いちばん新しい実行の時刻（結果を問わない）
      lastOutcome その結果（ok / session_expired / error）
      runs        見た行数

読むのは `functions/src/islandApi.ts` の `GET /island-api/fund` で、
**止まっているときだけ** `doneruAsOf` を足して返す。何日で「止まっている」と
見なすかは、あちらの `DONERU_STALE_DAYS` に理由つきで書いてある。

## 写す日付は「札を書いた日」ではない

`okDay` は **Doneru のぶんが最後に BigQuery へ入った日**。だから、この道具が
止まっても日付が新しくなることはない。**古いほうへしか倒れない。**
（逆にすると、写す側が生きているかぎり「新しい」と言い続けることになる）

## 読めなかったら、何も書かない

BigQuery が読めなかった晩は**前の札をそのまま残す。** 消したり空にしたりすると、
島から「いつまで入っているか」が見えなくなる。読めないことと、止まっていることは
別のもの（`docs/island-standards.md` 10章）。

実行:
  BQ_PROJECT_ID=live-streaming-d3cac python python/doneru_health.py
  python python/doneru_health.py --dry-run
"""

import argparse
import logging
import sys
from datetime import datetime, timezone

sys.path.insert(0, __file__.rsplit("/", 1)[0])

from config import (  # noqa: E402
    BQ_DATASET,
    BQ_PROJECT_ID,
    BQ_TABLE_DONERU_RUNS,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# 札の置き場。**画面からは読めない**（firestore.rules の受け皿が塞いでいる）。
# 読むのは Functions だけで、そこから合計と一緒に島へ出る。
COLLECTION = "islandDoneruHealth"
DOCUMENT = "last"

# 何日ぶん遡って見るか。表は1回1行なので、1年ぶんでも数百行しかない。
# **狭くしない。** 窓の外まで落ちていると「入った実行が1つも無い」になって、
# 島が黙る側へ倒れる（嘘はつかないが、いちばん出したいときに出なくなる）。
LOOKBACK_DAYS = 400

SQL = """
WITH r AS (
  SELECT ran_at, outcome
  FROM `{p}.{d}.{t}`
  WHERE ran_at IS NOT NULL
    AND ran_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @days DAY)
)
SELECT
  FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%SZ', MAX(IF(outcome = 'ok', ran_at, NULL)))
    AS ok_at,
  FORMAT_DATE('%Y-%m-%d',
    DATE(MAX(IF(outcome = 'ok', ran_at, NULL)), 'Asia/Tokyo')) AS ok_day,
  FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%SZ', MAX(ran_at)) AS last_at,
  ARRAY_AGG(outcome ORDER BY ran_at DESC LIMIT 1)[SAFE_OFFSET(0)] AS last_outcome,
  COUNT(*) AS runs
FROM r
LIMIT 1
"""


def read_runs(project: str, dataset: str, days: int) -> dict:
    """取り込みの記録から、最後に入った実行を1件ぶん引く。

    Args:
        project: BigQuery のプロジェクトID
        dataset: データセット名
        days: 何日ぶん遡るか

    Returns:
        札に書く中身。引けなければ例外を投げる（**そのときは書かない**）
    """
    from google.cloud import bigquery

    client = bigquery.Client(project=project)
    cfg = bigquery.QueryJobConfig(
        query_parameters=[bigquery.ScalarQueryParameter("days", "INT64", days)]
    )
    sql = SQL.format(p=project, d=dataset, t=BQ_TABLE_DONERU_RUNS)
    rows = list(client.query(sql, cfg).result())
    client.close()
    if not rows:
        raise RuntimeError("取り込みの記録が1行も返りませんでした")
    r = rows[0]
    return {
        "okAt": r["ok_at"],
        "okDay": r["ok_day"],
        "lastAt": r["last_at"],
        "lastOutcome": r["last_outcome"],
        "runs": int(r["runs"] or 0),
    }


def main() -> int:
    """エントリポイント。

    Returns:
        0 なら写せた。1 なら読めなかった（**前の札はそのまま残る**）
    """
    p = argparse.ArgumentParser()
    p.add_argument("--days", type=int, default=LOOKBACK_DAYS, help="何日ぶん見るか")
    p.add_argument("--dry-run", action="store_true", help="書かずに出すだけ")
    a = p.parse_args()

    try:
        note = read_runs(BQ_PROJECT_ID, BQ_DATASET, a.days)
    except Exception as e:  # noqa: BLE001  何で落ちても、前の札は消さない
        logger.error("取り込みの記録が読めませんでした: %s: %s", type(e).__name__, e)
        logger.error("**札は書き替えません。** 前に写したものがそのまま残ります")
        return 1

    logger.info(
        "最後に入った: %s（%s）／ 最後の実行: %s %s ／ %d行",
        note["okDay"] or "（1件も無い）",
        note["okAt"] or "-",
        note["lastAt"] or "-",
        note["lastOutcome"] or "-",
        note["runs"],
    )

    if a.dry_run:
        logger.info("DONERU_HEALTH dry-run（書いていません）")
        return 0

    from google.cloud import firestore

    db = firestore.Client(project=BQ_PROJECT_ID)
    db.collection(COLLECTION).document(DOCUMENT).set(
        {"at": datetime.now(timezone.utc).isoformat(), **note}
    )
    logger.info("DONERU_HEALTH ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
