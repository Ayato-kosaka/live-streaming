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
`live-streaming-d3cac` の中にある。外へ出すには GCS のバケットが要って、
それには上と同じ権限の話が出てくるので、issue にしてある（#296）。

**旅の写真の実体は、Storage の口ではなく Firestore の `url` 欄から取っている**
（`python/backup/photos.py`）。IAM を1つも通らない代わりに、**索引に載って
いない実体には届かない。** そこも photos.py の頭に書いてある。
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


# 旅のあいだ、Actions を開けなくても生死が読める札。**Firestore に1書類だけ。**
# `functions/src/chatCapture.ts` の `streamChatHealth` と、
# `python/fund_daily.py` の `islandFundHealth` と同じ手。
#
#     run_admin_script.yml → firestore_read
#       {"collection": "islandBackupHealth", "doc": "last"}
#
# **退避が本番の Firestore に書くのは、ここ1書類だけ。** ほかは全部読むだけ。
# 中身は数だけで、人に結びつく値は1つも入れない。
HEALTH_COLLECTION = "islandBackupHealth"


def run_url() -> str:
    """この実行のログの在りか。

    **`RUN_URL` に頼らない。** あれを渡しているのは backup.yml だけで、
    `run_admin_script.yml` から手で回したときは空になる（実際に空で入った）。
    Actions なら GITHUB_* は必ず立っているので、そちらから組み立てる。
    """
    if os.getenv("RUN_URL"):
        return os.environ["RUN_URL"]
    server = os.getenv("GITHUB_SERVER_URL")
    repo = os.getenv("GITHUB_REPOSITORY")
    rid = os.getenv("GITHUB_RUN_ID")
    return f"{server}/{repo}/actions/runs/{rid}" if server and repo and rid else ""


def record_health(ok: bool, took: float, err: str, detail: dict) -> None:
    """札を1枚置く。**置けなくても退避そのものは止めない。**"""
    from google.cloud import firestore

    fs = detail.get("firestore", {})
    bq = detail.get("bigquery", {})
    ph = detail.get("photos", {})
    firestore.Client(project=PROJECT).collection(HEALTH_COLLECTION).document("last").set(
        {
            "at": dt.datetime.now(dt.timezone.utc).isoformat(),
            "ok": ok,
            # 落ちた理由は**型と一行だけ**。値は入れない
            "error": (err or "")[:300],
            "tookSec": round(took, 1),
            "firestoreDocs": fs.get("docs", 0),
            "firestoreBytes": fs.get("bytes", 0),
            "bqRows": sum((v or {}).get("rows") or 0 for v in bq.values()),
            "photosOk": bool(ph.get("ok")),
            "photosAdded": ph.get("n", 0),
            # **「取れた枚数」だけでは、上限で切り上げた回と取り切った回が
            # 同じに見える。** 旅の途中はこの札1枚しか読めないので、
            # 「あと何枚残っているか」と「何枚落ちたか」をここに出す
            "photosLeft": ph.get("left"),
            "photosFailed": ph.get("failed", 0),
            "runUrl": run_url(),
        }
    )


def record_run(c: bigquery.Client, ok: bool, took: float, err: str, detail: dict) -> None:
    """1回ぶんの記録を残す。**旅の途中で「昨日ちゃんと取れたか」を見る札。**"""
    ensure_table(c, "runs", RUNS_SCHEMA, partition_field="at")
    row = {
        "at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "ok": ok,
        "took_sec": round(took, 1),
        "error": (err or "")[:2000] or None,
        "detail_json": json.dumps(detail, ensure_ascii=False, sort_keys=True),
        "run_url": run_url() or None,
    }
    errs = c.insert_rows_json(RUNS_TABLE, [row])
    if errs:
        raise RuntimeError(f"runs に書けませんでした: {errs}")
