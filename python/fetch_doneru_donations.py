"""Doneru の寄付履歴を BigQuery に入れる。

スパチャは `chat_messages.event_type = 'PAID'` に入っているのに、**Doneru 経由の
寄付はどこにも残っていない**。合計額しか取れていなかったので
（`docs/nordic-fund.md` 2.2）、月末のふりかえりも「その日いてくれた人」も
YouTube で投げた人しか見えていない。ここを埋める。

## 出すのは原本まで

`docs/island-db.md` の「原本は BigQuery、Firestore に置くのは集計した答えだけ」に従う。
このスクリプトが触るのは BigQuery だけ。**金額の順位表を作る道具ではない**
（`docs/nordic-fund.md` の「やらないことにした案」に、金額の順位も
誰がいくら出したかも出さないと書いてある）。人数と合計を出すための原本。

## ログに寄付の中身を出さない

このリポジトリは public で、**Actions のログは誰でも読める**。
同じ理由で、取ったものを成果物（artifact）に上げるのもやらない。
出していいのは件数とキー名まで。

実行:
  BQ_PROJECT_ID=live-streaming-d3cac DONERU_COOKIE=... python python/fetch_doneru_donations.py
  python python/fetch_doneru_donations.py --probe          # 形だけ見る（BigQuery を触らない）
  python python/fetch_doneru_donations.py --year 2025      # 過去ぶんの取り込み
  python python/fetch_doneru_donations.py --dry-run        # 件数だけ数える
"""

import argparse
import json
import sys
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List

sys.path.insert(0, __file__.rsplit("/", 1)[0])

from doneru import DoneruClient, DoneruError, DoneruSessionExpired  # noqa: E402
from doneru.normalizer import describe_mapping, normalize  # noqa: E402

# cookie が切れたときだけこの終了コードで落ちる。
# ワークフローはこれを見て issue を立てる（他の失敗では立てない）。
EXIT_SESSION_EXPIRED = 2

JST = timezone(timedelta(hours=9))


def _table_ref() -> str:
    from config import BQ_DATASET, BQ_TABLE_DONERU_DONATIONS

    return f"{BQ_DATASET}.{BQ_TABLE_DONERU_DONATIONS}"


DDL = """
CREATE TABLE IF NOT EXISTS `{table}` (
  donation_id STRING NOT NULL,
  donated_at TIMESTAMP,
  donor_name STRING,
  amount NUMERIC,
  amount_text STRING,
  currency STRING,
  message_text STRING,
  source_year INT64,
  ingest_run_id STRING,
  ingested_at TIMESTAMP,
  raw_json JSON
)
"""

# donation_id で突き合わせる。同じ年を毎日流し直しても増えない。
MERGE = """
MERGE `{table}` T
USING UNNEST(@rows) S
ON T.donation_id = S.donation_id
WHEN MATCHED THEN
  UPDATE SET
    donated_at = SAFE_CAST(S.donated_at AS TIMESTAMP),
    donor_name = S.donor_name,
    amount = SAFE_CAST(S.amount AS NUMERIC),
    amount_text = S.amount_text,
    currency = S.currency,
    message_text = S.message_text,
    source_year = S.source_year,
    ingest_run_id = S.ingest_run_id,
    ingested_at = SAFE_CAST(S.ingested_at AS TIMESTAMP),
    raw_json = SAFE.PARSE_JSON(S.raw_json)
WHEN NOT MATCHED THEN
  INSERT (
    donation_id, donated_at, donor_name, amount, amount_text,
    currency, message_text, source_year, ingest_run_id, ingested_at, raw_json
  )
  VALUES (
    S.donation_id,
    SAFE_CAST(S.donated_at AS TIMESTAMP),
    S.donor_name,
    SAFE_CAST(S.amount AS NUMERIC),
    S.amount_text,
    S.currency,
    S.message_text,
    S.source_year,
    S.ingest_run_id,
    SAFE_CAST(S.ingested_at AS TIMESTAMP),
    SAFE.PARSE_JSON(S.raw_json)
  )
"""


def merge_rows(rows: List[Dict[str, Any]], year: int) -> int:
    """BigQuery に MERGE する。"""
    from google.cloud import bigquery
    from google.cloud.bigquery import ScalarQueryParameter, StructQueryParameter

    from bq.client import get_bigquery_client
    from logging_util import get_run_id

    client = get_bigquery_client()
    table = _table_ref()
    run_id = get_run_id()
    ingested_at = datetime.now(timezone.utc).isoformat()

    client.query(DDL.format(table=table)).result()

    struct_params = []
    for row in rows:
        donated_at = row["donated_at"]
        struct_params.append(
            StructQueryParameter(
                None,
                ScalarQueryParameter("donation_id", "STRING", row["donation_id"]),
                ScalarQueryParameter(
                    "donated_at", "STRING", donated_at.isoformat() if donated_at else None
                ),
                ScalarQueryParameter("donor_name", "STRING", row["donor_name"]),
                # NUMERIC はパラメータで Decimal を要求するので、文字列で渡して SQL 側で
                # SAFE_CAST する。既存の published_at と同じ逃がし方。
                ScalarQueryParameter(
                    "amount", "STRING", None if row["amount"] is None else repr(row["amount"])
                ),
                ScalarQueryParameter("amount_text", "STRING", row["amount_text"]),
                ScalarQueryParameter("currency", "STRING", row["currency"]),
                ScalarQueryParameter("message_text", "STRING", row["message_text"]),
                ScalarQueryParameter("source_year", "INT64", year),
                ScalarQueryParameter("ingest_run_id", "STRING", run_id),
                ScalarQueryParameter("ingested_at", "STRING", ingested_at),
                ScalarQueryParameter(
                    "raw_json", "STRING", json.dumps(row["raw_json"], ensure_ascii=False)
                ),
            )
        )

    job_config = bigquery.QueryJobConfig(
        query_parameters=[bigquery.ArrayQueryParameter("rows", "STRUCT", struct_params)]
    )
    client.query(MERGE.format(table=table), job_config=job_config).result()

    return len(rows)


def main() -> int:
    parser = argparse.ArgumentParser(description="Doneru の寄付履歴を BigQuery に入れる")
    parser.add_argument(
        "--year",
        type=int,
        default=datetime.now(JST).year,
        help="取り込む年（既定: 日本時間の今年）",
    )
    parser.add_argument(
        "--probe",
        action="store_true",
        help="1ページだけ取って、キー名と件数を出す。BigQuery を触らない",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="全ページ取るが BigQuery に書かない",
    )
    args = parser.parse_args()

    try:
        client = DoneruClient()

        if args.probe:
            records = client.fetch_donation_page(args.year, page=1, rows_per_page=10)
            # 値は出さない。キー名と件数だけ（public リポジトリのログに出るため）
            print(json.dumps(describe_mapping(records), ensure_ascii=False, indent=2))
            return 0

        records = list(client.iter_donations(args.year))
    except DoneruSessionExpired as exc:
        print(f"ERROR: Doneru のセッションが切れています: {exc}", file=sys.stderr)
        return EXIT_SESSION_EXPIRED
    except DoneruError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    print(f"{args.year} 年の寄付を {len(records)} 件取得しました")

    if not records:
        return 0

    mapping = describe_mapping(records)
    print(f"列の対応: {json.dumps(mapping['matched'], ensure_ascii=False)}")
    if mapping["unmapped_keys"]:
        # 拾えていないキーがある = 候補名を足せば列に昇格できる。
        # 中身は raw_json に残っているので取りこぼしてはいない。
        print(f"未対応のキー（raw_json には入っています）: {mapping['unmapped_keys']}")

    rows = [normalize(record) for record in records]

    undated = sum(1 for row in rows if row["donated_at"] is None)
    if undated:
        print(f"WARNING: 日時を読めなかったレコードが {undated} 件あります", file=sys.stderr)

    if args.dry_run:
        print("--dry-run のため BigQuery には書きません")
        return 0

    merged = merge_rows(rows, args.year)
    print(f"BigQuery に {merged} 件 MERGE しました")
    return 0


if __name__ == "__main__":
    sys.exit(main())
