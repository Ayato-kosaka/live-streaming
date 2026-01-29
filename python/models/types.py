"""
データモデル・型定義モジュール

BigQuery のテーブル構造と Python オブジェクトの型を定義する。
型安全な実装を実現するための中核的な定義。
"""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional, Any, Dict, List
from enum import Enum


# ============================================================================
# 列挙型
# ============================================================================

class VideoStatus(str, Enum):
    """動画の処理ステータス"""
    PENDING = "PENDING"      # 未処理（初期状態）
    WAITING = "WAITING"      # リトライ待機中
    SUCCEEDED = "SUCCEEDED"  # 処理成功
    FAILED = "FAILED"        # 処理失敗
    SKIPPED = "SKIPPED"      # スキップ（7日超過等）


class EventType(str, Enum):
    """チャットイベントの種別"""
    TEXT = "TEXT"                    # 通常のテキストメッセージ
    PAID = "PAID"                    # スーパーチャット
    MEMBERSHIP = "MEMBERSHIP"        # メンバーシップ関連
    SYSTEM = "SYSTEM"                # システムメッセージ
    UNKNOWN = "UNKNOWN"              # 未知のイベント（raw保持）


# ============================================================================
# videos テーブル対応
# ============================================================================

@dataclass
class Video:
    """
    youtube_chat.videos テーブルのレコードを表現するデータクラス
    
    動画の処理進捗管理、リトライ制御、エラー記録を保持する。
    """
    video_id: str
    status: VideoStatus
    first_seen_at: datetime
    next_retry_at: Optional[datetime] = None
    attempt_count: int = 0
    last_attempt_at: Optional[datetime] = None
    last_error_code: Optional[str] = None
    last_error_detail: Optional[str] = None
    succeeded_at: Optional[datetime] = None
    yt_dlp_version: Optional[str] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """BigQuery への挿入用に辞書に変換"""
        return {
            "video_id": self.video_id,
            "status": self.status.value,
            "first_seen_at": self.first_seen_at.isoformat(),
            "next_retry_at": self.next_retry_at.isoformat() if self.next_retry_at else None,
            "attempt_count": self.attempt_count,
            "last_attempt_at": self.last_attempt_at.isoformat() if self.last_attempt_at else None,
            "last_error_code": self.last_error_code,
            "last_error_detail": self.last_error_detail,
            "succeeded_at": self.succeeded_at.isoformat() if self.succeeded_at else None,
            "yt_dlp_version": self.yt_dlp_version,
        }


# ============================================================================
# chat_messages テーブル対応
# ============================================================================

@dataclass
class ChatMessage:
    """
    youtube_chat.chat_messages テーブルのレコードを表現するデータクラス
    
    チャットイベントの正規化情報と raw データを保持する。
    """
    video_id: str
    event_id: str
    event_type: EventType
    timestamp_usec: int
    published_at: datetime
    raw_item_json: Dict[str, Any]
    author_name: Optional[str] = None
    author_channel_id: Optional[str] = None
    message_text: Optional[str] = None
    message_runs_json: Optional[List[Dict[str, Any]]] = None
    purchase_amount_text: Optional[str] = None
    ingest_run_id: Optional[str] = None
    ingested_at: Optional[datetime] = None
    source_file: Optional[str] = None
    source_line_no: Optional[int] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """BigQuery への挿入用に辞書に変換"""
        return {
            "video_id": self.video_id,
            "event_id": self.event_id,
            "event_type": self.event_type.value,
            "timestamp_usec": self.timestamp_usec,
            "published_at": self.published_at.isoformat(),
            "author_name": self.author_name,
            "author_channel_id": self.author_channel_id,
            "message_text": self.message_text,
            "message_runs_json": self.message_runs_json,
            "purchase_amount_text": self.purchase_amount_text,
            "ingest_run_id": self.ingest_run_id,
            "ingested_at": self.ingested_at.isoformat() if self.ingested_at else None,
            "source_file": self.source_file,
            "source_line_no": self.source_line_no,
            "raw_item_json": self.raw_item_json,
        }


# ============================================================================
# 処理結果
# ============================================================================

@dataclass
class ProcessingResult:
    """
    1動画の処理結果を表現するデータクラス
    
    ログ出力や状態更新に必要な情報を集約する。
    """
    video_id: str
    success: bool
    status: VideoStatus
    error_code: Optional[str] = None
    error_detail: Optional[str] = None
    chat_file_exists: bool = False
    parsed_message_count: int = 0
    merged_message_count: int = 0
    skipped_line_count: int = 0
    event_type_counts: Dict[str, int] = field(default_factory=dict)
    yt_dlp_version: Optional[str] = None
