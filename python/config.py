"""
YouTube アーカイブチャット取得システムの設定モジュール

環境変数・定数・実行パラメータを一元管理する。
設定値の変更はこのファイルを修正することで全体に反映される。
"""

import os
from typing import Final

# ============================================================================
# 環境変数
# ============================================================================

# BigQuery プロジェクトID（必須）
BQ_PROJECT_ID: str = os.getenv("BQ_PROJECT_ID", "")
if not BQ_PROJECT_ID:
    raise ValueError("環境変数 BQ_PROJECT_ID が設定されていません")

# YouTube API 関連（Discovery で使用）
# OAuth (Doneru) 経由で認証
# DONERU_ALERTBOX_KEY: EXPO_PUBLIC_DONERU_WSS_URL から key パラメータを抽出
DONERU_ALERTBOX_KEY: str = os.getenv("DONERU_ALERTBOX_KEY", "")
YOUTUBE_CHANNEL_ID: str = os.getenv("YOUTUBE_CHANNEL_ID", "")

# ============================================================================
# BigQuery 設定
# ============================================================================

# データセット名（固定）
BQ_DATASET: Final[str] = "youtube_chat"

# テーブル名
BQ_TABLE_VIDEOS: Final[str] = "videos"
BQ_TABLE_CHAT_MESSAGES: Final[str] = "chat_messages"

# MERGE 操作時の最大レコード数（BigQuery リクエストサイズ制限対策）
# 1回の MERGE で処理するメッセージの最大件数
MAX_MERGE_BATCH_SIZE: Final[int] = 5000

# ============================================================================
# 実行パラメータ
# ============================================================================

# 1回の実行で処理する動画の最大数
# 大量の動画がある場合でも実行時間を制限するため
MAX_VIDEOS_PER_RUN: Final[int] = 500

# Discovery の lookback 日数（デフォルト）
# 環境変数 DISCOVERY_LOOKBACK_DAYS で上書き可能
DEFAULT_DISCOVERY_LOOKBACK_DAYS: Final[int] = 10
DISCOVERY_LOOKBACK_DAYS: int = int(os.getenv("DISCOVERY_LOOKBACK_DAYS", str(DEFAULT_DISCOVERY_LOOKBACK_DAYS)))

# Discovery の既知 video_id 連続出現打ち切り閾値
# この数だけ連続して既知の video_id が出現したら Discovery を打ち切る
DISCOVERY_CONSECUTIVE_KNOWN_THRESHOLD: Final[int] = 999999

# ============================================================================
# yt-dlp 設定
# ============================================================================

# yt-dlp のバージョン固定（再現性確保のため）
# 空文字列の場合はシステムにインストールされたバージョンを使用
YTDLP_VERSION: Final[str] = ""  # 例: "2024.12.06" など、固定する場合は指定

# yt-dlp 実行時のタイムアウト（秒）
YTDLP_TIMEOUT_SECONDS: Final[int] = 300

# チャットデータの一時保存ディレクトリ
YTDLP_OUTPUT_DIR: Final[str] = "/tmp/youtube_chat"

# ============================================================================
# リトライ設定
# ============================================================================

# 初回リトライまでの待機時間（秒）
# 直近のアーカイブでチャットがまだ利用できない場合に使用
RETRY_DELAY_SECONDS: Final[int] = 24 * 60 * 60  # 24時間

# チャット取得失敗時の最大リトライ期間（秒）
# この期間を超えたら SKIPPED に移行
MAX_RETRY_PERIOD_SECONDS: Final[int] = 7 * 24 * 60 * 60  # 7日間

# ============================================================================
# ログ設定
# ============================================================================

# ログレベル（DEBUG, INFO, WARNING, ERROR, CRITICAL）
LOG_LEVEL: Final[str] = os.getenv("LOG_LEVEL", "INFO")

# ============================================================================
# エラーコード定義
# ============================================================================

# videos.last_error_code で使用するエラーコード
ERROR_CODE_YTDLP_FAILED: Final[str] = "YTDLP_FAILED"
ERROR_CODE_NO_CHAT_FILE: Final[str] = "NO_CHAT_FILE"
ERROR_CODE_PARSE_FAILED: Final[str] = "PARSE_FAILED"
ERROR_CODE_BQ_MERGE_FAILED: Final[str] = "BQ_MERGE_FAILED"
ERROR_CODE_UNKNOWN: Final[str] = "UNKNOWN"
