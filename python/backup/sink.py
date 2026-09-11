"""退避の置き場。**BigQuery の別データセット `island_backup`（東京）。**

## なぜここなのか（GCS ではない理由）

置き場に求めたのは4つ。**本番と同じ場所に置かない・`firestore_delete.py` の
誤操作で消えない・公開されない・旅のあいだ増えても破綻しない。**

素直に考えれば GCS のバケットを1本作るところだが、**それができない。**
`python/admin/backup_preflight.py` を本番に当てた実測（2026-09-11）:

    storage.buckets.create   ✕
    storage.buckets.get      ✕
    storage.objects.create   ✕
    storage.objects.list     ✕
    resourcemanager.projects.get ○

取り込みを動かしているサービスアカウントには、**Storage の権限が1つも無い。**
バケットを作ることも、いまある写真を数えることもできない（#283 が止まって
いるのと同じ形）。**権限を付けるのはあやとの操作**なので、旅立ちまでに
間に合う保証が無い。**間に合わないほうに賭けて、今日できる形で1本通す。**

## `island_backup`（asia-northeast1）が4つをどう満たすか

- **本番と同じ場所に置かない** — 本番の `youtube_chat` は `US`。ここは
  `asia-northeast1`。**データセットも場所も別。** `bq rm -r youtube_chat` を
  やっても、`island_backup` は残る。中身は毎回**走っている機械から積み直す**
  ので、複製ではなく独立した写しになる（同じ表を指すクローンではない）
- **`firestore_delete.py` で消えない** — あれは Firestore しか触らない。
  BigQuery には手が届かない。`collection_drop.py` も同じ
- **公開されない** — BigQuery に「誰でも読める」は無い。IAM だけで、
  `allUsers` を付ける口はこのリポジトリのどこにも無い（#289 は GCS の
  公開バケットの話で、ここには同じ形が作れない）
- **増えても破綻しない** — `firestore_docs` は日付でパーティションを切って
  ある。古い世代は下の `KEEP_DAYS` で落ちる

## ここで足りていないところ（正直に書く）

**プロジェクトごと消える事故には効かない。** 本番も退避も同じ
`live-streaming-d3cac` の中にある。**旅の写真の実体（Storage）も取れていない。**
どちらも Storage の権限が要る話なので、issue にしてある。
"""

import datetime as dt
import json
import os

from google.cloud import bigquery

PROJECT = os.getenv("BQ_PROJECT_ID", "live-streaming-d3cac")
SRC_DATASET = "youtube_chat"
DATASET = "island_backup"
# **本番（US）と別の場所に置く。** 積むのは走っている機械からなので、
# 場所が違っても困らない（表のコピーではなく、行の載せ直し）
LOCATION = "asia-northeast1"

# Firestore の世代を何日ぶん持つか。1晩あたり 1MB 弱なので、
# 90日でも 90MB。**旅（17日）の何倍も持つ**が、無限には積まない
KEEP_DAYS = 90

FS_TABLE = f"{PROJECT}.{DATASET}.firestore_docs"
RUNS_TABLE = f"{PROJECT}.{DATASET}.runs"

FS_SCHEMA = [
    bigquery.SchemaField("taken_at", "TIMESTAMP", mode="REQUIRED"),
    bigquery.SchemaField("collection", "STRING", mode="REQUIRED"),
    bigquery.SchemaField("doc_id", "STRING", mode="REQUIRED"),
    # codec.line() が書いた字そのまま。**並べ替え済みなので、同じ中身なら同じ字**
    bigquery.SchemaField("doc_json", "STRING", mode="REQUIRED"),
    bigquery.SchemaField("digest", "STRING", mode="REQUIRED"),
]

RUNS_SCHEMA = [
    bigquery.SchemaField("at", "TIMESTAMP", mode="REQUIRED"),
    bigquery.SchemaField("ok", "BOOLEAN", mode="REQUIRED"),
    bigquery.SchemaField("took_sec", "FLOAT"),
    bigquery.SchemaField("error", "STRING"),
    # 件数とバイト数。**値は入れない**（このリポジトリは公開）
    bigquery.SchemaField("detail_json", "STRING"),
    bigquery.SchemaField("run_url", "STRING"),
]


def client() -> bigquery.Client:
    return bigquery.Client(project=PROJECT)


def ensure_dataset(c: bigquery.Client) -> None:
    """置き場のデータセットを用意する。**あれば何もしない。**"""
    ref = bigquery.Dataset(f"{PROJECT}.{DATASET}")
    ref.location = LOCATION
    ref.description = (
        "退避（docs/island-backup.md）。本番は youtube_chat / Firestore。"
        "ここは写しなので、**ここを直しても本番は変わらない。**"
    )
    c.create_dataset(ref, exists_ok=True)


def ensure_table(c: bigquery.Client, name: str, schema, partition_field=None, cluster=None):
    t = bigquery.Table(f"{PROJECT}.{DATASET}.{name}", schema=schema)
    if partition_field:
        t.time_partitioning = bigquery.TimePartitioning(field=partition_field)
    if cluster:
        t.clustering_fields = cluster
    return c.create_table(t, exists_ok=True)


def load_ndjson(c: bigquery.Client, table: str, path: str, schema, truncate: bool) -> int:
    """書き出した NDJSON を1本、置き場の表に載せる。返すのは載せた行数。"""
    cfg = bigquery.LoadJobConfig(
        schema=schema,
        source_format=bigquery.SourceFormat.NEWLINE_DELIMITED_JSON,
        write_disposition=(
            bigquery.WriteDisposition.WRITE_TRUNCATE
            if truncate
            else bigquery.WriteDisposition.WRITE_APPEND
        ),
    )
    with open(path, "rb") as f:
        job = c.load_table_from_file(f, table, job_config=cfg, location=LOCATION)
    job.result()
    if job.errors:
        raise RuntimeError(f"{table} に載せられませんでした: {job.errors}")
    return int(job.output_rows or 0)


def last_ingested_at(c: bigquery.Client, table: str) -> dt.datetime | None:
    """`chat_messages` の栞。**置き場に入っているいちばん新しい取り込み時刻。**

    栞を別の場所（状態ファイル）に持たない。**置き場そのものに聞く**ほうが、
    ずれない。状態ファイルだけ進んで中身が入っていない、が起きない。
    """
    full = f"{PROJECT}.{DATASET}.{table}"
    try:
        rows = list(
            c.query(
                f"SELECT MAX(ingested_at) AS m FROM `{full}`", location=LOCATION
            ).result()
        )
    except Exception:  # noqa: BLE001  表がまだ無い＝初回
        return None
    return rows[0]["m"] if rows else None


def sweep(c: bigquery.Client) -> int:
    """古い世代を落とす。**旅のあいだ増え続けても破綻させないため。**"""
    q = f"""
      DELETE FROM `{FS_TABLE}`
      WHERE taken_at < TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL {KEEP_DAYS} DAY)
    """
    job = c.query(q, location=LOCATION)
    job.result()
    return int(job.num_dml_affected_rows or 0)


def record_run(c: bigquery.Client, ok: bool, took: float, err: str, detail: dict) -> None:
    """1回ぶんの記録を残す。**旅の途中で「昨日ちゃんと取れたか」を見る札。**"""
    ensure_table(c, "runs", RUNS_SCHEMA, partition_field="at")
    row = {
        "at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "ok": ok,
        "took_sec": round(took, 1),
        "error": (err or "")[:2000] or None,
        "detail_json": json.dumps(detail, ensure_ascii=False, sort_keys=True),
        "run_url": os.getenv("RUN_URL") or None,
    }
    errs = c.insert_rows_json(RUNS_TABLE, [row])
    if errs:
        raise RuntimeError(f"runs に書けませんでした: {errs}")
