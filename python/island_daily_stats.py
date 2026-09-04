"""
あやと島の数字を毎日更新するスクリプト。

BigQuery(youtube_chat)を集計して Firestore の island/state.stats に書き込む。
サイト側は /island-api/state 経由でこれを読み、焼き込みの初期値を上書きする。

課金を増やさないよう、BigQuery は2クエリだけ投げる(それぞれ最小課金の10MB程度)。

必要な環境変数:
  BQ_PROJECT_ID  BigQuery / Firestore のプロジェクトID
実行:
  python python/island_daily_stats.py
"""

import logging
import sys
from datetime import datetime, timezone
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

    db = firestore.Client(project=BQ_PROJECT_ID)
    db.collection("island").document("state").set({"stats": stats}, merge=True)
    logger.info("Firestore island/state.stats を更新しました")
    return 0


if __name__ == "__main__":
    sys.exit(main())
