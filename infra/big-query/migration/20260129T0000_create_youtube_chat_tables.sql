-- ============================================================================
-- BigQuery マイグレーション: YouTube チャット管理テーブル作成
-- ファイル: 20260129T0000_create_youtube_chat_tables.sql
-- 
-- 【目的】
-- YouTube アーカイブチャット取得基盤で使用する2つのテーブルを作成する：
-- 1. videos: 動画の処理進捗管理（リトライ制御、ステータス管理）
-- 2. chat_messages: チャットイベントの正規化保存
--
-- 【実行方法】
-- bq query --project_id='your-project-id' --use_legacy_sql=false < infra/big-query/migration/20260129T0000_create_youtube_chat_tables.sql
--
-- 【特徴】
-- ・冪等性: IF NOT EXISTS を使用し、既存テーブルは保持される
-- ・chat_messages は published_at でパーティション化、video_id/event_type でクラスタ化
-- ・raw_item_json は JSON 型で保持（構造化クエリが可能）
-- ============================================================================

-- ----------------------------------------------------------------------------
-- テーブル 1: youtube_chat.videos
-- 【目的】
-- 処理対象 video_id の進捗管理、リトライ制御、スキップ判定の永続化
--
-- 【運用方針】
-- ・video_id をプライマリキー相当として扱う（BigQuery では MERGE で保証）
-- ・status: PENDING → WAITING → SUCCEEDED/FAILED/SKIPPED のライフサイクル
-- ・リトライ戦略:
--   - 直近: 翌日リトライ（next_retry_at を+1日に設定）
--   - 1週間超: SKIPPED に移行（アプリ側で判定）
-- ・yt_dlp_version: 成功/失敗問わず、最後に使用したバージョンを記録
--
-- 【列の説明】
-- video_id: YouTube 動画 ID（一意識別子）
-- status: 処理ステータス（PENDING, WAITING, SUCCEEDED, FAILED, SKIPPED）
-- first_seen_at: 初めて処理対象になった時刻（スキップ判定の基準）
-- next_retry_at: 次回リトライ予定時刻（WAITING 状態での制御に使用）
-- attempt_count: 試行回数（リトライ回数の追跡）
-- last_attempt_at: 最後に処理を試行した時刻
-- last_error_code: エラー種別（YTDLP_FAILED, NO_CHAT_FILE, PARSE_FAILED, BQ_MERGE_FAILED など）
-- last_error_detail: エラーの詳細情報（例外メッセージやスタックトレース）
-- succeeded_at: 処理が成功した時刻
-- yt_dlp_version: 使用した yt-dlp のバージョン（トラブルシューティング用）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `youtube_chat.videos` (
  video_id STRING NOT NULL OPTIONS(description="YouTube 動画 ID"),
  status STRING NOT NULL OPTIONS(description="処理ステータス: PENDING, WAITING, SUCCEEDED, FAILED, SKIPPED"),
  first_seen_at TIMESTAMP NOT NULL OPTIONS(description="初めて処理対象になった時刻（スキップ判定基準）"),
  next_retry_at TIMESTAMP OPTIONS(description="次回リトライ予定時刻（WAITING 状態での制御用）"),
  attempt_count INT64 NOT NULL DEFAULT 0 OPTIONS(description="試行回数"),
  last_attempt_at TIMESTAMP OPTIONS(description="最後に処理を試行した時刻"),
  last_error_code STRING OPTIONS(description="エラー種別（例: YTDLP_FAILED, NO_CHAT_FILE, PARSE_FAILED）"),
  last_error_detail STRING OPTIONS(description="エラーの詳細情報（例外メッセージ等）"),
  succeeded_at TIMESTAMP OPTIONS(description="処理が成功した時刻"),
  yt_dlp_version STRING OPTIONS(description="使用した yt-dlp のバージョン"),
  title STRING OPTIONS(description="動画タイトル（YouTube API から取得）"),
  actual_start_time TIMESTAMP OPTIONS(description="実際の配信開始時刻（liveStreamingDetails.actualStartTime）")
)
OPTIONS(
  description="YouTube 動画の処理進捗管理テーブル（リトライ制御、ステータス管理）"
);

-- ----------------------------------------------------------------------------
-- テーブル 2: youtube_chat.chat_messages
-- 【目的】
-- YouTube ライブチャットイベントの正規化保存
--
-- 【運用方針】
-- ・主キー相当: (video_id, event_id) で一意性を保証（MERGE で実装）
-- ・再実行時の冪等性: 同じ (video_id, event_id) は上書きされる
-- ・パーティション: published_at の日付でパーティション化（クエリコスト削減）
-- ・クラスタ: video_id, event_type でクラスタ化（頻繁なフィルタ対象）
-- ・raw_item_json: addChatItemAction.item の生データを JSON 型で保持
--   → 将来的な列追加や分析に対応可能
--
-- 【列の説明】
-- video_id: YouTube 動画 ID
-- event_id: チャットイベントの一意識別子（renderer.id）
-- event_type: イベント種別（TEXT, PAID, MEMBERSHIP, SYSTEM など）
-- timestamp_usec: イベントのタイムスタンプ（マイクロ秒、renderer.timestampUsec）
-- published_at: timestamp_usec を TIMESTAMP 型に変換したもの（パーティションキー）
-- author_name: 投稿者の表示名
-- author_channel_id: 投稿者のチャンネル ID
-- message_text: メッセージ本文（runs を文字列化したもの）
-- message_runs_json: メッセージの runs 構造を JSON で保持（絵文字等の詳細情報）
-- purchase_amount_text: スーパーチャット等の金額表示（該当する場合のみ）
-- ingest_run_id: データ取り込み実行単位の UUID（バッチ識別用）
-- ingested_at: データが BigQuery に投入された時刻
-- source_file: 元データのファイル名（ローカルファイル名等、デバッグ用）
-- source_line_no: 元データ内の行番号（デバッグ用）
-- raw_item_json: addChatItemAction.item の生データ（JSON 型）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `youtube_chat.chat_messages` (
  video_id STRING NOT NULL OPTIONS(description="YouTube 動画 ID"),
  event_id STRING NOT NULL OPTIONS(description="チャットイベントの一意識別子（renderer.id）"),
  event_type STRING NOT NULL OPTIONS(description="イベント種別（TEXT, PAID, MEMBERSHIP, SYSTEM など）"),
  timestamp_usec INT64 NOT NULL OPTIONS(description="イベントのタイムスタンプ（マイクロ秒）"),
  published_at TIMESTAMP NOT NULL OPTIONS(description="イベントの発生時刻（timestamp_usec を変換）"),
  author_name STRING OPTIONS(description="投稿者の表示名"),
  author_channel_id STRING OPTIONS(description="投稿者のチャンネル ID"),
  message_text STRING OPTIONS(description="メッセージ本文（runs を文字列化）"),
  message_runs_json JSON OPTIONS(description="メッセージの runs 構造（絵文字等の詳細情報）"),
  purchase_amount_text STRING OPTIONS(description="スーパーチャット等の金額表示"),
  ingest_run_id STRING OPTIONS(description="データ取り込み実行単位の UUID"),
  ingested_at TIMESTAMP OPTIONS(description="データが BigQuery に投入された時刻"),
  source_file STRING OPTIONS(description="元データのファイル名（デバッグ用）"),
  source_line_no INT64 OPTIONS(description="元データ内の行番号（デバッグ用）"),
  raw_item_json JSON NOT NULL OPTIONS(description="addChatItemAction.item の生データ（JSON 型）")
)
PARTITION BY DATE(published_at)
CLUSTER BY video_id, event_type
OPTIONS(
  description="YouTube ライブチャットイベントの正規化保存テーブル（パーティション: published_at, クラスタ: video_id/event_type）"
);

-- ============================================================================
-- マイグレーション完了
-- ============================================================================
-- ============================================================================
-- BigQuery マイグレーション: YouTube チャット管理テーブル作成
-- ファイル: 20260129T0000_create_youtube_chat_tables.sql
-- 
-- 【目的】
-- YouTube アーカイブチャット取得基盤で使用する2つのテーブルを作成する：
-- 1. videos: 動画の処理進捗管理（リトライ制御、ステータス管理）
-- 2. chat_messages: チャットイベントの正規化保存
--
-- 【実行方法】
-- bq query --project_id='your-project-id' --use_legacy_sql=false < infra/big-query/migration/20260129T0000_create_youtube_chat_tables.sql
--
-- 【特徴】
-- ・冪等性: IF NOT EXISTS を使用し、既存テーブルは保持される
-- ・chat_messages は published_at でパーティション化、video_id/event_type でクラスタ化
-- ・raw_item_json は JSON 型で保持（構造化クエリが可能）
-- ============================================================================

-- ----------------------------------------------------------------------------
-- テーブル 1: youtube_chat.videos
-- 【目的】
-- 処理対象 video_id の進捗管理、リトライ制御、スキップ判定の永続化
--
-- 【運用方針】
-- ・video_id をプライマリキー相当として扱う（BigQuery では MERGE で保証）
-- ・status: PENDING → WAITING → SUCCEEDED/FAILED/SKIPPED のライフサイクル
-- ・リトライ戦略:
--   - 直近: 翌日リトライ（next_retry_at を+1日に設定）
--   - 1週間超: SKIPPED に移行（アプリ側で判定）
-- ・yt_dlp_version: 成功/失敗問わず、最後に使用したバージョンを記録
--
-- 【列の説明】
-- video_id: YouTube 動画 ID（一意識別子）
-- status: 処理ステータス（PENDING, WAITING, SUCCEEDED, FAILED, SKIPPED）
-- first_seen_at: 初めて処理対象になった時刻（スキップ判定の基準）
-- next_retry_at: 次回リトライ予定時刻（WAITING 状態での制御に使用）
-- attempt_count: 試行回数（リトライ回数の追跡）
-- last_attempt_at: 最後に処理を試行した時刻
-- last_error_code: エラー種別（YTDLP_FAILED, NO_CHAT_FILE, PARSE_FAILED, BQ_MERGE_FAILED など）
-- last_error_detail: エラーの詳細情報（例外メッセージやスタックトレース）
-- succeeded_at: 処理が成功した時刻
-- yt_dlp_version: 使用した yt-dlp のバージョン（トラブルシューティング用）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `youtube_chat.videos` (
  video_id STRING NOT NULL OPTIONS(description="YouTube 動画 ID"),
  status STRING NOT NULL OPTIONS(description="処理ステータス: PENDING, WAITING, SUCCEEDED, FAILED, SKIPPED"),
  first_seen_at TIMESTAMP NOT NULL OPTIONS(description="初めて処理対象になった時刻（スキップ判定基準）"),
  next_retry_at TIMESTAMP OPTIONS(description="次回リトライ予定時刻（WAITING 状態での制御用）"),
  attempt_count INT64 NOT NULL DEFAULT 0 OPTIONS(description="試行回数"),
  last_attempt_at TIMESTAMP OPTIONS(description="最後に処理を試行した時刻"),
  last_error_code STRING OPTIONS(description="エラー種別（例: YTDLP_FAILED, NO_CHAT_FILE, PARSE_FAILED）"),
  last_error_detail STRING OPTIONS(description="エラーの詳細情報（例外メッセージ等）"),
  succeeded_at TIMESTAMP OPTIONS(description="処理が成功した時刻"),
  yt_dlp_version STRING OPTIONS(description="使用した yt-dlp のバージョン")
)
OPTIONS(
  description="YouTube 動画の処理進捗管理テーブル（リトライ制御、ステータス管理）"
);

ALTER TABLE `youtube_chat.videos`
  ADD COLUMN IF NOT EXISTS title STRING OPTIONS(description="動画タイトル（YouTube API から取得）"),
  ADD COLUMN IF NOT EXISTS actual_start_time TIMESTAMP OPTIONS(description="実際の配信開始時刻（liveStreamingDetails.actualStartTime）");

-- ----------------------------------------------------------------------------
-- テーブル 2: youtube_chat.chat_messages
-- 【目的】
-- YouTube ライブチャットイベントの正規化保存
--
-- 【運用方針】
-- ・主キー相当: (video_id, event_id) で一意性を保証（MERGE で実装）
-- ・再実行時の冪等性: 同じ (video_id, event_id) は上書きされる
-- ・パーティション: published_at の日付でパーティション化（クエリコスト削減）
-- ・クラスタ: video_id, event_type でクラスタ化（頻繁なフィルタ対象）
-- ・raw_item_json: addChatItemAction.item の生データを JSON 型で保持
--   → 将来的な列追加や分析に対応可能
--
-- 【列の説明】
-- video_id: YouTube 動画 ID
-- event_id: チャットイベントの一意識別子（renderer.id）
-- event_type: イベント種別（TEXT, PAID, MEMBERSHIP, SYSTEM など）
-- timestamp_usec: イベントのタイムスタンプ（マイクロ秒、renderer.timestampUsec）
-- published_at: timestamp_usec を TIMESTAMP 型に変換したもの（パーティションキー）
-- author_name: 投稿者の表示名
-- author_channel_id: 投稿者のチャンネル ID
-- message_text: メッセージ本文（runs を文字列化したもの）
-- message_runs_json: メッセージの runs 構造を JSON で保持（絵文字等の詳細情報）
-- purchase_amount_text: スーパーチャット等の金額表示（該当する場合のみ）
-- ingest_run_id: データ取り込み実行単位の UUID（バッチ識別用）
-- ingested_at: データが BigQuery に投入された時刻
-- source_file: 元データのファイル名（ローカルファイル名等、デバッグ用）
-- source_line_no: 元データ内の行番号（デバッグ用）
-- raw_item_json: addChatItemAction.item の生データ（JSON 型）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `youtube_chat.chat_messages` (
  video_id STRING NOT NULL OPTIONS(description="YouTube 動画 ID"),
  event_id STRING NOT NULL OPTIONS(description="チャットイベントの一意識別子（renderer.id）"),
  event_type STRING NOT NULL OPTIONS(description="イベント種別（TEXT, PAID, MEMBERSHIP, SYSTEM など）"),
  timestamp_usec INT64 NOT NULL OPTIONS(description="イベントのタイムスタンプ（マイクロ秒）"),
  published_at TIMESTAMP NOT NULL OPTIONS(description="イベントの発生時刻（timestamp_usec を変換）"),
  author_name STRING OPTIONS(description="投稿者の表示名"),
  author_channel_id STRING OPTIONS(description="投稿者のチャンネル ID"),
  message_text STRING OPTIONS(description="メッセージ本文（runs を文字列化）"),
  message_runs_json JSON OPTIONS(description="メッセージの runs 構造（絵文字等の詳細情報）"),
  purchase_amount_text STRING OPTIONS(description="スーパーチャット等の金額表示"),
  ingest_run_id STRING OPTIONS(description="データ取り込み実行単位の UUID"),
  ingested_at TIMESTAMP OPTIONS(description="データが BigQuery に投入された時刻"),
  source_file STRING OPTIONS(description="元データのファイル名（デバッグ用）"),
  source_line_no INT64 OPTIONS(description="元データ内の行番号（デバッグ用）"),
  raw_item_json JSON NOT NULL OPTIONS(description="addChatItemAction.item の生データ（JSON 型）")
)
PARTITION BY DATE(published_at)
CLUSTER BY video_id, event_type
OPTIONS(
  description="YouTube ライブチャットイベントの正規化保存テーブル（パーティション: published_at, クラスタ: video_id/event_type）"
);

-- ============================================================================
-- マイグレーション完了
-- ============================================================================
