"""北欧旅の「その日、配信でスパチャしてくれた人」を Firestore に置く。

`docs/nordic-photos.md` の4章。その日の写真に埋め込めるキャラクターは、
**その日の配信でスパチャしてくれた人**に限る。ここはその名簿を作る。

## 持つのは「その日いた」までにする

**金額を持たない。順位も持たない。回数も持たない。**
持つと、そこから並べたくなる。旅の足代でも同じ判断をしていて
（`docs/nordic-fund.md`）、出す人は60人しかいないので、
上位は常連で固定され、320円が1万円の隣に並ぶ。

## 配信日の切り方

`python/build_residents.py` と同じ。**published_at から9時間引いて UTC の
日付を取る。** 日本時間の朝9時が境目になるので、22時に始まって0時を
またいだ続きが、1日の中に収まる。旅の配信は日本時間の夜なので、
ここを間違えると「その日いた人」が2日に割れる。

## キャラクターとの結びつけはここでやらない

返すのは YouTube のチャンネルIDだけ。どの絵の人かは
`site/content/residents.ts`（あやとの表から焼いたもの）を見て、
画面の側が突き合わせる。ここで絵まで決めると、絵の割り当てが
2か所に散る（`python/build_residents.py` の頭に同じ話がある）。

名前も持たせるが、**画面に出るのは「島に名前を出してよい」と本人が
言った人のぶんだけ**（`functions/src/islandApi.ts` が絞る）。

実行:
  BQ_PROJECT_ID=live-streaming-d3cac python python/nordic_supporters.py
  python python/nordic_supporters.py --days 3        # 直近3日ぶん
  python python/nordic_supporters.py --day 2026-09-12
  python python/nordic_supporters.py --day 2026-09-12 --dry-run
"""

import argparse
import logging
import sys
from datetime import datetime, timedelta, timezone
from typing import Dict, List

from google.cloud import bigquery, firestore

sys.path.insert(0, __file__.rsplit("/", 1)[0])

from config import BQ_DATASET, BQ_PROJECT_ID  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# 集計用の bot。本人の配信通知なので人ではない。
BOT_NAME = "@あやとグルメアプリ"

# 何日ぶんさかのぼるか（--day を指定しないとき）。旅は9日ぐらいの見立て。
DEFAULT_DAYS = 14

SQL = f"""
SELECT
  FORMAT_DATE(
    '%Y-%m-%d',
    DATE(TIMESTAMP_SUB(published_at, INTERVAL 9 HOUR))
  ) AS day,
  author_channel_id AS channel,
  ANY_VALUE(author_name) AS name
FROM `{BQ_PROJECT_ID}.{BQ_DATASET}.chat_messages`
WHERE event_type = 'PAID'
  AND author_channel_id IS NOT NULL
  AND author_name != @bot
  AND DATE(TIMESTAMP_SUB(published_at, INTERVAL 9 HOUR))
      BETWEEN @d0 AND @d1
GROUP BY day, channel
ORDER BY day, name
"""


def fetch(d0: str, d1: str) -> Dict[str, List[dict]]:
    """その期間の、日ごとのスパチャした人を取る。

    Args:
        d0: 始まりの日（YYYY-MM-DD）
        d1: 終わりの日（YYYY-MM-DD、この日を含む）

    Returns:
        日付 -> [{"channelId": ..., "name": ...}, ...]
    """
    client = bigquery.Client(project=BQ_PROJECT_ID)
    job = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("bot", "STRING", BOT_NAME),
            bigquery.ScalarQueryParameter("d0", "DATE", d0),
            bigquery.ScalarQueryParameter("d1", "DATE", d1),
        ]
    )
    out: Dict[str, List[dict]] = {}
    for row in client.query(SQL, job_config=job).result():
        out.setdefault(row["day"], []).append(
            {"channelId": row["channel"], "name": row["name"] or ""}
        )
    client.close()
    return out


def merge(old: List[dict], new: List[dict]) -> List[dict]:
    """手で足したぶんを消さずに、BigQuery のぶんを重ねる。

    Doneru の人は自動で取れないので手で入っている
    （`python/admin/nordic_supporter.py`）。ここで丸ごと置き換えると、
    翌日の集計でその人が消える。**同じチャンネルは1人にまとめる。**

    Args:
        old: いま入っている名簿
        new: BigQuery から取れたぶん

    Returns:
        重ねたあとの名簿
    """
    out: List[dict] = []
    seen = set()
    for p in list(old) + list(new):
        key = p.get("channelId") or f"icon:{p.get('icon')}"
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(p)
    return out


def main() -> int:
    """エントリポイント。"""
    ap = argparse.ArgumentParser()
    ap.add_argument("--day", help="この日だけ（YYYY-MM-DD）")
    ap.add_argument("--days", type=int, default=DEFAULT_DAYS, help="直近この日数ぶん")
    ap.add_argument("--dry-run", action="store_true", help="書かずに出すだけ")
    a = ap.parse_args()

    if a.day:
        d0 = d1 = a.day
    else:
        today = datetime.now(timezone.utc).date()
        d1 = today.isoformat()
        d0 = (today - timedelta(days=max(1, a.days) - 1)).isoformat()

    found = fetch(d0, d1)
    if not found:
        logger.info("%s〜%s にスパチャはありませんでした", d0, d1)
        return 0

    db = None if a.dry_run else firestore.Client(project=BQ_PROJECT_ID)
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M")
    for day, people in sorted(found.items()):
        logger.info("%s: %d人", day, len(people))
        for p in people:
            logger.info("    %s  %s", p["channelId"], p["name"])
        if db is None:
            continue
        ref = db.collection("nordicDays").document(day)
        cur = ref.get()
        old = (cur.to_dict() or {}).get("people", []) if cur.exists else []
        ref.set(
            {"day": day, "people": merge(old, people), "updatedAt": now},
            merge=True,
        )
    if db is None:
        logger.info("--dry-run なので書いていません")
    else:
        logger.info("Firestore nordicDays を更新しました")
    return 0


if __name__ == "__main__":
    sys.exit(main())
