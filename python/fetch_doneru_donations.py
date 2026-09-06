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

**金額の合計もログに出さない。** 合計は BigQuery に対して SELECT すれば取れる
（`docs/island-db.md` に照合用のクエリがある）。ログに出す理由が無い。

実行:
  BQ_PROJECT_ID=live-streaming-d3cac DONERU_COOKIE=... python python/fetch_doneru_donations.py
  python python/fetch_doneru_donations.py --probe          # 形だけ見る（BigQuery を触らない）
  python python/fetch_doneru_donations.py --since          # 2024年から今年まで（過去ぶんの取り込み）
  python python/fetch_doneru_donations.py --since 2023     # 遡り先を指定する
  python python/fetch_doneru_donations.py --year 2025      # その年だけ
  python python/fetch_doneru_donations.py --dry-run        # 件数だけ数える
"""

import argparse
import json
import sys
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

sys.path.insert(0, __file__.rsplit("/", 1)[0])

from doneru import DoneruClient, DoneruError, DoneruSessionExpired  # noqa: E402
from doneru.normalizer import describe_mapping, normalize  # noqa: E402

# cookie が切れたときだけこの終了コードで落ちる。
# ワークフローがこれを見て、失敗通知メールから理由が分かるようログに印を出す。
EXIT_SESSION_EXPIRED = 2

# --since を付けなかったときに遡る先。Doneru を使い始めたのが 2024 年なので、
# それより前を取りに行っても空が返るだけ。
DEFAULT_FIRST_YEAR = 2024

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
  status STRING,
  settlement_amount NUMERIC,
  viewer_pk STRING,
  source_year INT64,
  ingest_run_id STRING,
  ingested_at TIMESTAMP,
  raw_json JSON
)
"""

# 既にあるテーブルには CREATE TABLE IF NOT EXISTS が効かない。
# あとから列を足したときのために、ALTER も毎回投げる（どちらもべき等）。
ADD_COLUMNS = """
ALTER TABLE `{table}`
  ADD COLUMN IF NOT EXISTS status STRING,
  ADD COLUMN IF NOT EXISTS settlement_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS viewer_pk STRING
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
    status = S.status,
    settlement_amount = SAFE_CAST(S.settlement_amount AS NUMERIC),
    viewer_pk = S.viewer_pk,
    source_year = S.source_year,
    ingest_run_id = S.ingest_run_id,
    ingested_at = SAFE_CAST(S.ingested_at AS TIMESTAMP),
    raw_json = SAFE.PARSE_JSON(S.raw_json)
WHEN NOT MATCHED THEN
  INSERT (
    donation_id, donated_at, donor_name, amount, amount_text,
    currency, message_text, status, settlement_amount, viewer_pk,
    source_year, ingest_run_id, ingested_at, raw_json
  )
  VALUES (
    S.donation_id,
    SAFE_CAST(S.donated_at AS TIMESTAMP),
    S.donor_name,
    SAFE_CAST(S.amount AS NUMERIC),
    S.amount_text,
    S.currency,
    S.message_text,
    S.status,
    SAFE_CAST(S.settlement_amount AS NUMERIC),
    S.viewer_pk,
    S.source_year,
    S.ingest_run_id,
    SAFE_CAST(S.ingested_at AS TIMESTAMP),
    SAFE.PARSE_JSON(S.raw_json)
  )
"""


RUNS_DDL = """
CREATE TABLE IF NOT EXISTS `{table}` (
  run_id STRING,
  ran_at TIMESTAMP,
  outcome STRING,
  years STRING,
  donations INT64,
  cookie_shape STRING,
  renewed_dt BOOL,
  detail STRING
)
"""

RUNS_INSERT = """
INSERT INTO `{table}`
  (run_id, ran_at, outcome, years, donations, cookie_shape, renewed_dt, detail)
VALUES
  (@run_id, SAFE_CAST(@ran_at AS TIMESTAMP), @outcome, @years, @donations,
   @cookie_shape, @renewed_dt, @detail)
"""


def record_run(
    outcome: str,
    years: List[int],
    donations: int,
    cookie_shape: Optional[str],
    renewed_dt: bool,
    detail: Optional[str],
) -> None:
    """実行の結果を1行残す。

    **セッションが何日持ったかを測るために要る。** 落ちたことは Actions の
    通知メールで分かるが、いつからいつまで生きていたかはどこにも残らない。
    cookie を入れ直す頻度を決めるには寿命が要る。

    残すのは結果と件数だけで、寄付の中身も cookie の値も入れない。

    **ここで失敗しても実行そのものを落とさない。** 記録は本題ではないので、
    記録が取れないことで取り込みの結果を握りつぶしたくない。
    """
    from google.cloud import bigquery

    from bq.client import get_bigquery_client
    from config import BQ_DATASET, BQ_TABLE_DONERU_RUNS
    from logging_util import get_run_id

    table = f"{BQ_DATASET}.{BQ_TABLE_DONERU_RUNS}"
    label = str(years[0]) if len(years) == 1 else f"{years[0]}-{years[-1]}"

    try:
        client = get_bigquery_client()
        client.query(RUNS_DDL.format(table=table)).result()
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("run_id", "STRING", get_run_id()),
                bigquery.ScalarQueryParameter(
                    "ran_at", "STRING", datetime.now(timezone.utc).isoformat()
                ),
                bigquery.ScalarQueryParameter("outcome", "STRING", outcome),
                bigquery.ScalarQueryParameter("years", "STRING", label),
                bigquery.ScalarQueryParameter("donations", "INT64", donations),
                bigquery.ScalarQueryParameter("cookie_shape", "STRING", cookie_shape),
                bigquery.ScalarQueryParameter("renewed_dt", "BOOL", renewed_dt),
                bigquery.ScalarQueryParameter("detail", "STRING", detail),
            ]
        )
        client.query(RUNS_INSERT.format(table=table), job_config=job_config).result()
        print(f"実行の記録を {table} に残しました（{outcome}）")
    except Exception as exc:  # noqa: BLE001  記録の失敗で取り込みを落とさない
        print(f"WARNING: 実行の記録に失敗しました: {exc}", file=sys.stderr)


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
    client.query(ADD_COLUMNS.format(table=table)).result()

    # MERGE は「1つの行に当たる元行は1つまで」を要求する。同じ donation_id が
    # 2つ入っていると Scalar subquery produced more than one element で落ちる
    # （Doneru がページ送りを無視して同じページを返したときに実際に踏んだ）。
    # 取得側でも弾いているが、BigQuery に渡す直前でも保証しておく。
    deduped = {row["donation_id"]: row for row in rows}
    if len(deduped) != len(rows):
        print(f"WARNING: 同じ donation_id が {len(rows) - len(deduped)} 件重複していました", file=sys.stderr)

    struct_params = []
    for row in deduped.values():
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
                ScalarQueryParameter("status", "STRING", row["status"]),
                ScalarQueryParameter(
                    "settlement_amount",
                    "STRING",
                    None if row["settlement_amount"] is None else repr(row["settlement_amount"]),
                ),
                ScalarQueryParameter("viewer_pk", "STRING", row["viewer_pk"]),
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

    return len(deduped)


def resolve_years(year: Optional[int], since: Optional[int], now: datetime) -> List[int]:
    """どの年を取りに行くかを決める。

    **1月は去年ぶんも取る。** Doneru の一覧は年で区切られているので、
    「今年ぶんだけ」にすると 12月31日の寄付を誰も取らない年またぎの穴があく。
    1月1日 5:30 の実行が見るのは新しい年で、大晦日の寄付が入っているのは
    古い年のほう。それを最後に取ったのは 12月31日 5:30 なので、
    その日の夜のぶんが丸ごと落ちる。毎年ひと穴あく。

    MERGE はべき等なので、去年ぶんを1月のあいだ毎日取り直しても増えない。
    """
    if since:
        return list(range(since, now.year + 1))
    if year:
        return [year]
    # 年またぎの穴を埋めるため、1月だけ去年も見る
    return [now.year - 1, now.year] if now.month == 1 else [now.year]


def main() -> int:
    parser = argparse.ArgumentParser(description="Doneru の寄付履歴を BigQuery に入れる")
    parser.add_argument(
        "--year",
        type=int,
        default=None,
        help="取り込む年（既定: 日本時間の今年。1月は去年ぶんも一緒に取る）",
    )
    parser.add_argument(
        "--since",
        type=int,
        nargs="?",
        const=DEFAULT_FIRST_YEAR,
        default=None,
        help=(
            "この年から今年までまとめて取り込む（過去ぶんの取り込み用）。"
            f"年を省くと {DEFAULT_FIRST_YEAR} 年から"
        ),
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

    years = resolve_years(args.year, args.since, datetime.now(JST))

    client: Optional[DoneruClient] = None
    # **初期値は失敗にする。** 成功に倒しておくと、BigQuery 側の失敗のように
    # ここで捕まえていない例外で落ちたときに ok として記録される。
    # 最後まで通ったときだけ ok に書き換える。
    outcome = "error"
    detail: Optional[str] = None
    total = 0

    try:
        client = DoneruClient()

        if args.probe:
            records = client.fetch_donation_page(years[-1], page=1, rows_per_page=10)
            # 値は出さない。キー名と件数だけ（public リポジトリのログに出るため）
            print(json.dumps(describe_mapping(records), ensure_ascii=False, indent=2))
            return 0

        for year in years:
            total += ingest_year(client, year, dry_run=args.dry_run)
        outcome = "ok"
    except DoneruSessionExpired as exc:
        outcome, detail = "session_expired", str(exc)
        print(f"ERROR: Doneru のセッションが切れています: {exc}", file=sys.stderr)
        # 「貼った値が化けている」のか「セッションが死んでいる」のかを分ける手がかり。
        # 形が合っているのに 401 なら、値ではなくセッションのほう。
        print(f"       貼られている値の形: {client.cookie_shape}", file=sys.stderr)
        print(
            "       形が合っているのに 401 なら、その _dt は無効になっています"
            "（ログアウト・再ログインで作り直されます）",
            file=sys.stderr,
        )
        return EXIT_SESSION_EXPIRED
    except DoneruError as exc:
        outcome, detail = "error", str(exc)
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    finally:
        # **落ちたときこそ残す。** 何日持ったかは、成功と失敗の両方が
        # 並んでいて初めて出る。--probe と --dry-run は本番の実行ではないので残さない。
        # （return のあとでも finally は走るので、上の3つの出口すべてを拾う）
        if not args.probe and not args.dry_run:
            record_run(
                outcome=outcome,
                years=years,
                donations=total,
                cookie_shape=client.cookie_shape if client else None,
                renewed_dt=bool(client and client.renewed_dt),
                detail=detail,
            )

    if len(years) > 1:
        print(f"{years[0]}〜{years[-1]} 年で合わせて {total} 件")

    # セッションの寿命を見立てるための手がかり。値は出さない。
    if client.renewed_dt:
        print("Doneru は応答で _dt を配り直しています（触るたびに寿命が延びる可能性）")
    else:
        print("Doneru は _dt を配り直していません（最初に取った寿命のまま）")
    return 0


def ingest_year(client: DoneruClient, year: int, dry_run: bool = False) -> int:
    """1年ぶんを取って MERGE する。返すのは件数。"""
    records = list(client.iter_donations(year))
    print(f"{year} 年の寄付を {len(records)} 件取得しました")

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

    if dry_run:
        print("--dry-run のため BigQuery には書きません")
        return len(rows)

    merged = merge_rows(rows, year)
    print(f"BigQuery に {merged} 件 MERGE しました")
    return merged


if __name__ == "__main__":
    sys.exit(main())
