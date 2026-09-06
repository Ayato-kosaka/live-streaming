"""`doneru_donations` の中身を数字だけで点検する。

JSON の一覧（`?year=...`）から CSV に取り方を変えたら、件数が 967 → 975 と
**8件増えた**。増えたぶんが本物なのか、こちらの取り方が生んだ幻なのかを
突き止めるために作った。

## 出すのは数字だけ

**このリポジトリは public で、Actions のログは誰でも読める。**
寄付者の名前もメッセージも金額の内訳も出さない。件数と合計と日付だけ。
`viewer_pk`（どねID）も個人を指すので出さない。**数えるだけにする。**

実行:
  Actions > 管理スクリプトを実行 > script = doneru_audit
  ARGS は要らない（{} のまま）
"""

import os
import sys

from google.cloud import bigquery

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config import BQ_DATASET, BQ_PROJECT_ID, BQ_TABLE_DONERU_DONATIONS  # noqa: E402
from _fs import log  # noqa: E402

TABLE = f"{BQ_PROJECT_ID}.{BQ_DATASET}.{BQ_TABLE_DONERU_DONATIONS}"

# JSON の一覧で取れていた件数（2026-09-06 に記録）。ここと比べる。
OLD_COUNTS = {2024: 1, 2025: 568, 2026: 398}
OLD_TOTAL_ROWS = 967
OLD_TOTAL_PAID = 430220


def run(client: bigquery.Client, label: str, sql: str) -> list:
    rows = [dict(r) for r in client.query(sql.format(table=TABLE)).result()]
    log.info("--- %s ---", label)
    for row in rows:
        log.info("  %s", row)
    return rows


def main() -> None:
    client = bigquery.Client(project=BQ_PROJECT_ID)

    # 1. 全体。NULL が残っていないか、主キーが本当に一意か
    run(client, "全体", """
        SELECT
          COUNT(*)                            AS rows_total,
          COUNT(DISTINCT donation_id)         AS distinct_ids,
          COUNTIF(donated_at IS NULL)         AS null_date,
          COUNTIF(amount IS NULL)             AS null_amount,
          COUNTIF(settlement_amount IS NULL)  AS null_settlement,
          COUNTIF(viewer_pk IS NULL)          AS null_viewer,
          COUNT(DISTINCT viewer_pk)           AS people,
          SUM(amount)                         AS paid,
          SUM(settlement_amount)              AS settlement,
          MIN(DATE(donated_at, 'Asia/Tokyo')) AS first_day,
          MAX(DATE(donated_at, 'Asia/Tokyo')) AS last_day
        FROM `{table}`
    """)

    # 2. **増えた8件の第一容疑者。**
    # CSV には寄付ごとの ID が無いので主キーを中身から作っている。中身が
    # 完全に同じ行には #2, #3 と番号を振って別物として残している。
    # もし CSV が同じ行を重複して吐いているなら、その番号ぶんが水増しになる。
    run(client, "中身が完全に同じで番号を振った行（水増しの疑い）", """
        SELECT
          COUNTIF(REGEXP_CONTAINS(donation_id, r'#[2-9][0-9]*$')) AS numbered_2_or_more,
          COUNTIF(REGEXP_CONTAINS(donation_id, r'#1$'))           AS numbered_1,
          COUNTIF(NOT STARTS_WITH(donation_id, 'sha256:'))        AS had_real_id
        FROM `{table}`
    """)

    # 3. 年ごと。JSON で取れていた数と突き合わせる
    run(client, "年ごと（JSON のときは 2024:1 / 2025:568 / 2026:398 = 967）", """
        SELECT
          EXTRACT(YEAR FROM DATETIME(donated_at, 'Asia/Tokyo')) AS year,
          COUNT(*)                  AS rows_now,
          COUNT(DISTINCT viewer_pk) AS people,
          SUM(amount)               AS paid,
          SUM(settlement_amount)    AS settlement
        FROM `{table}`
        GROUP BY year ORDER BY year
    """)

    # 4. 状態と経路ごと。JSON の一覧が特定の状態を落としていた可能性を見る
    run(client, "精算状態ごと", """
        SELECT status, COUNT(*) AS rows_now, SUM(amount) AS paid
        FROM `{table}` GROUP BY status ORDER BY rows_now DESC
    """)
    run(client, "プラットホームごと", """
        SELECT platform, COUNT(*) AS rows_now, SUM(amount) AS paid
        FROM `{table}` GROUP BY platform ORDER BY rows_now DESC
    """)

    # 5. 「同じ人が同じ時刻に同じ額」の重なり具合。
    # 2 が普通に起きうるのか（連投）、それとも CSV の重複なのかの手がかり
    run(client, "同じ人・同じ時刻・同じ額の重なり", """
        SELECT n AS 同じ組の件数, COUNT(*) AS 組の数
        FROM (
          SELECT COUNT(*) AS n
          FROM `{table}`
          GROUP BY viewer_pk, donated_at, amount
        )
        GROUP BY n ORDER BY n
    """)

    # 6. 取りに行った期間の外にはみ出していないか
    run(client, "取りに行った期間ごとの件数", """
        SELECT fetched_start, fetched_end, COUNT(*) AS rows_now
        FROM `{table}` GROUP BY fetched_start, fetched_end
    """)

    log.info("=== 比較のもと（JSON のとき） 行=%s 合計=%s 年ごと=%s ===",
             OLD_TOTAL_ROWS, OLD_TOTAL_PAID, OLD_COUNTS)


main()
