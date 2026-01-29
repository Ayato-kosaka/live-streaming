"""
BigQuery SQL クエリ定義モジュール

抽出SQL・更新SQLを集約し、SQLの散逸を防ぐ。
すべてのクエリはここで定義・管理する。
"""

from config import BQ_DATASET, BQ_TABLE_VIDEOS, BQ_TABLE_CHAT_MESSAGES

# ============================================================================
# videos テーブル - Discovery UPSERT
# ============================================================================

# Discovery で取得した動画を MERGE（新規 or 既存のメタデータ更新のみ）
# 
# 重要: 既存レコードの進捗情報（status, attempt_count 等）は絶対に更新しない
# 更新対象は title と actual_start_time のみ
QUERY_DISCOVERY_UPSERT_VIDEO = f"""
MERGE `{BQ_DATASET}.{BQ_TABLE_VIDEOS}` T
USING (
  SELECT
    @video_id AS video_id,
    @title AS title,
    @actual_start_time AS actual_start_time
) S
ON T.video_id = S.video_id
WHEN MATCHED THEN
  UPDATE SET
    title = S.title,
    actual_start_time = S.actual_start_time
WHEN NOT MATCHED THEN
  INSERT (
    video_id,
    status,
    first_seen_at,
    attempt_count,
    title,
    actual_start_time
  )
  VALUES (
    S.video_id,
    'PENDING',
    CURRENT_TIMESTAMP(),
    0,
    S.title,
    S.actual_start_time
  )
"""

# ============================================================================
# videos テーブル - 取得対象抽出
# ============================================================================

# 処理対象の動画を抽出するクエリ
# 
# 抽出条件:
# - status が PENDING, WAITING, FAILED のいずれか
# - next_retry_at が NULL、または現在時刻以前（リトライ可能）
# - first_seen_at が7日以内（7日超は対象外）
# 
# ソート順:
# - next_retry_at または first_seen_at の早い順（古いものから処理）
QUERY_SELECT_TARGET_VIDEOS = f"""
SELECT
  video_id,
  status,
  first_seen_at,
  next_retry_at,
  attempt_count,
  last_attempt_at,
  last_error_code,
  last_error_detail,
  succeeded_at,
  yt_dlp_version,
  title,
  actual_start_time
FROM
  `{BQ_DATASET}.{BQ_TABLE_VIDEOS}`
WHERE
  status IN ('PENDING', 'WAITING', 'FAILED')
  AND (next_retry_at IS NULL OR next_retry_at <= CURRENT_TIMESTAMP())
  AND first_seen_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
ORDER BY
  COALESCE(next_retry_at, first_seen_at) ASC,
  first_seen_at ASC
LIMIT @max_videos
"""

# ============================================================================
# videos テーブル - 更新/挿入
# ============================================================================

# 動画レコードを MERGE（存在すれば更新、なければ挿入）
# 
# 用途:
# - 処理開始時の attempt_count 更新
# - 処理終了時の status/エラー情報更新
QUERY_MERGE_VIDEO = f"""
MERGE `{BQ_DATASET}.{BQ_TABLE_VIDEOS}` T
USING (
  SELECT
    @video_id AS video_id,
    @status AS status,
    @first_seen_at AS first_seen_at,
    @next_retry_at AS next_retry_at,
    @attempt_count AS attempt_count,
    @last_attempt_at AS last_attempt_at,
    @last_error_code AS last_error_code,
    @last_error_detail AS last_error_detail,
    @succeeded_at AS succeeded_at,
    @yt_dlp_version AS yt_dlp_version,
    @title AS title,
    @actual_start_time AS actual_start_time
) S
ON T.video_id = S.video_id
WHEN MATCHED THEN
  UPDATE SET
    status = S.status,
    first_seen_at = S.first_seen_at,
    next_retry_at = S.next_retry_at,
    attempt_count = S.attempt_count,
    last_attempt_at = S.last_attempt_at,
    last_error_code = S.last_error_code,
    last_error_detail = S.last_error_detail,
    succeeded_at = S.succeeded_at,
    yt_dlp_version = S.yt_dlp_version,
    title = S.title,
    actual_start_time = S.actual_start_time
WHEN NOT MATCHED THEN
  INSERT (
    video_id,
    status,
    first_seen_at,
    next_retry_at,
    attempt_count,
    last_attempt_at,
    last_error_code,
    last_error_detail,
    succeeded_at,
    yt_dlp_version,
    title,
    actual_start_time
  )
  VALUES (
    S.video_id,
    S.status,
    S.first_seen_at,
    S.next_retry_at,
    S.attempt_count,
    S.last_attempt_at,
    S.last_error_code,
    S.last_error_detail,
    S.succeeded_at,
    S.yt_dlp_version,
    S.title,
    S.actual_start_time
  )
"""

# ============================================================================
# chat_messages テーブル - MERGE（idempotent）
# ============================================================================

# チャットメッセージを MERGE（主キー: video_id + event_id）
# 
# 特徴:
# - 同一 (video_id, event_id) は上書きされる（冪等性）
# - ingest_run_id / ingested_at は常に最新で更新（最終取得を追跡）
# 
# 注意:
# - バッチサイズに注意（Python側で分割処理）
QUERY_MERGE_CHAT_MESSAGES = f"""
MERGE `{BQ_DATASET}.{BQ_TABLE_CHAT_MESSAGES}` T
USING UNNEST(@messages) S
ON T.video_id = S.video_id AND T.event_id = S.event_id
WHEN MATCHED THEN
  UPDATE SET
    event_type = S.event_type,
    timestamp_usec = S.timestamp_usec,
    published_at = S.published_at,
    author_name = S.author_name,
    author_channel_id = S.author_channel_id,
    message_text = S.message_text,
    message_runs_json = S.message_runs_json,
    purchase_amount_text = S.purchase_amount_text,
    ingest_run_id = S.ingest_run_id,
    ingested_at = S.ingested_at,
    source_file = S.source_file,
    source_line_no = S.source_line_no,
    raw_item_json = S.raw_item_json
WHEN NOT MATCHED THEN
  INSERT (
    video_id,
    event_id,
    event_type,
    timestamp_usec,
    published_at,
    author_name,
    author_channel_id,
    message_text,
    message_runs_json,
    purchase_amount_text,
    ingest_run_id,
    ingested_at,
    source_file,
    source_line_no,
    raw_item_json
  )
  VALUES (
    S.video_id,
    S.event_id,
    S.event_type,
    S.timestamp_usec,
    S.published_at,
    S.author_name,
    S.author_channel_id,
    S.message_text,
    S.message_runs_json,
    S.purchase_amount_text,
    S.ingest_run_id,
    S.ingested_at,
    S.source_file,
    S.source_line_no,
    S.raw_item_json
  )
"""
