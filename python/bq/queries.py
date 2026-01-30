"""
BigQuery SQL クエリ定義モジュール

抽出SQL・更新SQLを集約し、SQLの散逸を防ぐ。
すべてのクエリはここで定義・管理する。
"""

from config import BQ_DATASET, BQ_TABLE_VIDEOS, BQ_TABLE_CHAT_MESSAGES

# ============================================================================
# videos テーブル - Discovery 関連
# ============================================================================

# Discovery で使用: 指定期間内の既存 video_id を取得
# 
# 用途:
# - Discovery 時の打ち切り判定に使用
# - 既知の video_id が連続で現れたら Discovery を打ち切る
# - lookback 範囲内の video_id のみを取得してパフォーマンスを最適化
QUERY_GET_EXISTING_VIDEO_IDS_IN_RANGE = f"""
SELECT
  video_id
FROM
  `{BQ_DATASET}.{BQ_TABLE_VIDEOS}`
WHERE
  actual_start_time >= @cutoff_time
  OR actual_start_time IS NULL
"""

# Discovery で使用: 既存の video_id をすべて取得（後方互換性のため保持）
# 
# 注意: この クエリは大量のレコードを返す可能性があるため、
# 代わりに QUERY_GET_EXISTING_VIDEO_IDS_IN_RANGE の使用を推奨
QUERY_GET_EXISTING_VIDEO_IDS = f"""
SELECT
  video_id
FROM
  `{BQ_DATASET}.{BQ_TABLE_VIDEOS}`
"""

# ============================================================================
# videos テーブル - Discovery UPSERT
# ============================================================================

# Discovery で取得した動画を MERGE（新規 or 既存のメタデータ更新のみ）
# 
# 重要: 既存レコードの進捗情報（status, attempt_count 等）は絶対に更新しない
# 更新対象は title と actual_start_time のみ
QUERY_DISCOVERY_UPSERT_VIDEO = f"""
MERGE `{BQ_DATASET}.{BQ_TABLE_VIDEOS}` T
USING UNNEST(@videos) S
ON T.video_id = S.video_id
WHEN MATCHED THEN
  UPDATE SET
    title = S.title,
    actual_start_time = SAFE_CAST(S.actual_start_time AS TIMESTAMP)
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
    SAFE_CAST(S.actual_start_time AS TIMESTAMP)
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
# 重要な設計方針（Primitive-only pattern）:
# - Python側では TIMESTAMP や JSON をすべて STRING として渡す
# - SQL側で SAFE_CAST / SAFE.PARSE_JSON で変換
# 
# 理由:
# - ArrayQueryParameter + STRUCT では datetime や JSON を直接渡せない
# - すべてプリミティブ型（STRING/INT64）として扱う必要がある
# 
# SAFE_CAST vs PARSE_TIMESTAMP:
# - SAFE_CAST(... AS TIMESTAMP): RFC3339 文字列を自動解釈（推奨）
# - PARSE_TIMESTAMP(format, ...): フォーマット文字列が必要（フォーマット事故のリスク）
# 
# SAFE.PARSE_JSON:
# - 不正な JSON → NULL に変換（クエリは失敗しない）
# - 正常な JSON → JSON 型として格納
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
    published_at = SAFE_CAST(S.published_at AS TIMESTAMP),
    author_name = S.author_name,
    author_channel_id = S.author_channel_id,
    message_text = S.message_text,
    message_runs_json = SAFE.PARSE_JSON(S.message_runs_json),
    purchase_amount_text = S.purchase_amount_text,
    ingest_run_id = S.ingest_run_id,
    ingested_at = SAFE_CAST(S.ingested_at AS TIMESTAMP),
    source_file = S.source_file,
    source_line_no = S.source_line_no,
    raw_item_json = SAFE.PARSE_JSON(S.raw_item_json)
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
    SAFE_CAST(S.published_at AS TIMESTAMP),
    S.author_name,
    S.author_channel_id,
    S.message_text,
    SAFE.PARSE_JSON(S.message_runs_json),
    S.purchase_amount_text,
    S.ingest_run_id,
    SAFE_CAST(S.ingested_at AS TIMESTAMP),
    S.source_file,
    S.source_line_no,
    SAFE.PARSE_JSON(S.raw_item_json)
  )
"""
