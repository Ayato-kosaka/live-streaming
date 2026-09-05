"""
あやと島の数字を毎日更新するスクリプト。

BigQuery(youtube_chat)を集計して Firestore の island/state に書き込む。
サイト側は /island-api/state 経由でこれを読み、焼き込みの初期値を上書きする。

書くのは2つ。
  stats … 配信本数・コメント数など、島じゅうで出している数字
  fund  … 北欧旅の足代のうち、スパチャぶんと出した人数(docs/nordic-fund.md)
          合計は /island-api/fund が Doneru の額とここを足して作る。
          **個人の金額も順位も持たない。合計と人数だけ。**

課金を増やさないよう、BigQuery は3クエリだけ投げる(それぞれ最小課金の10MB程度)。

必要な環境変数:
  BQ_PROJECT_ID  BigQuery / Firestore のプロジェクトID
実行:
  python python/island_daily_stats.py
"""

import logging
import sys
from datetime import datetime, timedelta, timezone
from typing import Any, Dict

from google.cloud import bigquery, firestore

sys.path.insert(0, __file__.rsplit("/", 1)[0])

from config import BQ_DATASET, BQ_PROJECT_ID  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

BOT_NAME = "@あやとグルメアプリ"

VIDEOS_SQL = f"""
WITH v AS (
  SELECT video_id, title, actual_start_time
  FROM `{BQ_PROJECT_ID}.{BQ_DATASET}.videos`
)
SELECT
  (SELECT COUNT(*) FROM v) AS streams,
  (
    SELECT COUNT(DISTINCT DATE(actual_start_time, 'Asia/Tokyo'))
    FROM v WHERE actual_start_time IS NOT NULL
  ) AS stream_days,
  (
    SELECT FORMAT_TIMESTAMP('%Y-%m-%d', MIN(actual_start_time), 'Asia/Tokyo')
    FROM v WHERE actual_start_time IS NOT NULL
  ) AS since,
  ARRAY(
    SELECT AS STRUCT video_id, title,
      FORMAT_TIMESTAMP('%Y-%m-%d', actual_start_time, 'Asia/Tokyo') AS date
    FROM v WHERE actual_start_time IS NOT NULL
    ORDER BY actual_start_time DESC LIMIT 5
  ) AS latest
"""

CHAT_SQL = f"""
WITH m AS (
  SELECT author_channel_id, published_at
  FROM `{BQ_PROJECT_ID}.{BQ_DATASET}.chat_messages`
  WHERE event_type = 'TEXT' AND author_name != @bot
),
recent AS (
  SELECT author_channel_id, COUNT(DISTINCT DATE(published_at, 'Asia/Tokyo')) AS days
  FROM m
  WHERE published_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 90 DAY)
    AND author_channel_id IS NOT NULL
  GROUP BY author_channel_id
)
SELECT
  (SELECT COUNT(*) FROM m) AS comments,
  (SELECT COUNT(DISTINCT author_channel_id) FROM m) AS people,
  (SELECT COUNT(*) FROM recent WHERE days >= 5) AS active_friends,
  (SELECT COUNT(*) FROM recent) AS recent_people
"""


# スパチャ。外貨が数件だけ混ざっているので、円の行だけ拾う。
# 半額にしない。OBS が半額で足しているのは配信の演出上の都合で、
# サイトで半額にすると、出した人が自分の額を見つけられない。
FUND_DAYS = 365
FUND_SQL = f"""
WITH p AS (
  SELECT
    author_channel_id,
    SAFE_CAST(
      REGEXP_REPLACE(purchase_amount_text, r'[^0-9]', '') AS INT64
    ) AS yen
  FROM `{BQ_PROJECT_ID}.{BQ_DATASET}.chat_messages`
  WHERE event_type = 'PAID'
    AND purchase_amount_text LIKE '¥%'
    AND published_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @days DAY)
)
SELECT
  IFNULL(SUM(yen), 0) AS superchat,
  COUNT(DISTINCT author_channel_id) AS people
FROM p
WHERE yen IS NOT NULL
"""


def fetch_fund() -> Dict[str, Any]:
    """スパチャの合計と、出した人の数を取る。

    人数は延べではなく人。名前も個人の額も取らない。

    Returns:
        Firestore に書き込む fund の辞書
    """
    client = bigquery.Client(project=BQ_PROJECT_ID)
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("days", "INT64", FUND_DAYS)
        ]
    )
    row = list(client.query(FUND_SQL, job_config=job_config).result())[0]
    client.close()
    return {
        "superchat": int(row["superchat"]),
        "people": int(row["people"]),
        "days": FUND_DAYS,
        "updatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
    }


def fetch_stats() -> Dict[str, Any]:
    """BigQuery から島の数字を取る。

    Returns:
        Firestore に書き込む stats の辞書
    """
    client = bigquery.Client(project=BQ_PROJECT_ID)

    logger.info("videos を集計中...")
    v = list(client.query(VIDEOS_SQL).result())[0]

    logger.info("chat_messages を集計中...")
    job_config = bigquery.QueryJobConfig(
        query_parameters=[bigquery.ScalarQueryParameter("bot", "STRING", BOT_NAME)]
    )
    c = list(client.query(CHAT_SQL, job_config=job_config).result())[0]

    client.close()

    return {
        "streams": int(v["streams"]),
        "streamDays": int(v["stream_days"]),
        "since": v["since"],
        "latest": [dict(row) for row in v["latest"]],
        "comments": int(c["comments"]),
        "people": int(c["people"]),
        "activeFriends": int(c["active_friends"]),
        "recentPeople": int(c["recent_people"]),
        "updatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
    }


def sweep_here(db: firestore.Client) -> int:
    """置きっぱなしの「いま島にいる人」を片づける。

    islandHere はブラウザが自分で消していく(docs/island-here.md)。
    ただし電池切れや圏外では消えずに残る。読む側は 60秒より古いものを
    無視するので画面には出ないが、ドキュメントは溜まる一方になる。
    1日1回ここでまとめて消す。**中身は居場所と時刻しか無いので、
    消して失うものは何も無い。**
    """
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=10)
    gone = 0
    for doc in db.collection("islandHere").where("seenAt", "<", cutoff).limit(500).stream():
        doc.reference.delete()
        gone += 1
    if gone:
        logger.info("islandHere の置きっぱなしを %s 件消しました", gone)
    return gone


def main() -> int:
    """エントリポイント。"""
    stats = fetch_stats()
    logger.info(
        "配信 %s本 / %s日 / コメント %s件 / のべ %s人 / 島の住人 %s人",
        stats["streams"],
        stats["streamDays"],
        stats["comments"],
        stats["people"],
        stats["activeFriends"],
    )

    fund = fetch_fund()
    logger.info(
        "スパチャ %s円 / %s人(直近%s日)",
        fund["superchat"],
        fund["people"],
        fund["days"],
    )

    db = firestore.Client(project=BQ_PROJECT_ID)
    db.collection("island").document("state").set(
        {"stats": stats, "fund": fund}, merge=True
    )
    logger.info("Firestore island/state の stats と fund を更新しました")

    sweep_here(db)
    return 0


if __name__ == "__main__":
    sys.exit(main())
