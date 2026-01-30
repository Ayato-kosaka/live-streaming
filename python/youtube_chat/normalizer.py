"""
チャットデータ正規化モジュール

yt-dlp の raw データを ChatMessage オブジェクトに変換する。
renderer の種類に応じてイベントタイプを判定し、必要な情報を抽出する。
"""

from datetime import datetime
from typing import Dict, Any, Optional, List
import json

from models.types import ChatMessage, EventType


# ============================================================================
# メイン正規化処理
# ============================================================================

def normalize_chat_item(
    item: Dict[str, Any],
    video_id: str,
    run_id: str,
    source_file: str,
    source_line_no: int
) -> Optional[ChatMessage]:
    """
    addChatItemAction.item を ChatMessage に正規化
    
    サポートする renderer:
    - liveChatTextMessageRenderer: 通常のテキストメッセージ
    - liveChatPaidMessageRenderer: スーパーチャット
    - liveChatMembershipItemRenderer: メンバーシップ
    - その他: UNKNOWN として保持（raw_item_json のみ）
    
    Args:
        item: addChatItemAction.item
        video_id: 動画 ID
        run_id: 実行 ID
        source_file: ソースファイルパス
        source_line_no: ソース行番号
        
    Returns:
        ChatMessage オブジェクト、またはスキップ対象なら None
    """
    # renderer の種類を判定
    renderer_key = None
    renderer = None
    
    for key in item.keys():
        if key.endswith("Renderer"):
            renderer_key = key
            renderer = item[key]
            break
    
    if not renderer:
        # renderer が見つからない場合はスキップ
        return None
    
    # 共通フィールド抽出
    event_id = renderer.get("id")
    timestamp_usec = renderer.get("timestampUsec")
    
    if not event_id or not timestamp_usec:
        # 必須フィールドが欠けている場合はスキップ
        return None
    
    # timestamp_usec を datetime に変換
    published_at = datetime.utcfromtimestamp(int(timestamp_usec) / 1_000_000)
    
    # renderer の種類に応じて処理
    if renderer_key == "liveChatTextMessageRenderer":
        return _normalize_text_message(
            renderer, video_id, event_id, timestamp_usec, published_at, run_id, source_file, source_line_no, item
        )
    elif renderer_key == "liveChatPaidMessageRenderer":
        return _normalize_paid_message(
            renderer, video_id, event_id, timestamp_usec, published_at, run_id, source_file, source_line_no, item
        )
    elif renderer_key == "liveChatMembershipItemRenderer":
        return _normalize_membership_item(
            renderer, video_id, event_id, timestamp_usec, published_at, run_id, source_file, source_line_no, item
        )
    else:
        # 未知の renderer は UNKNOWN として保持
        return _normalize_unknown_item(
            renderer, video_id, event_id, timestamp_usec, published_at, run_id, source_file, source_line_no, item
        )


# ============================================================================
# renderer 種別ごとの正規化
# ============================================================================

def _normalize_text_message(
    renderer: Dict[str, Any],
    video_id: str,
    event_id: str,
    timestamp_usec: int,
    published_at: datetime,
    run_id: str,
    source_file: str,
    source_line_no: int,
    item: Dict[str, Any]
) -> ChatMessage:
    """通常のテキストメッセージを正規化"""
    author_name = renderer.get("authorName", {}).get("simpleText")
    author_channel_id = renderer.get("authorExternalChannelId")
    
    # message runs を抽出
    message_obj = renderer.get("message", {})
    runs = message_obj.get("runs", [])
    message_text = _extract_text_from_runs(runs)
    message_runs_json = runs if runs else None
    
    return ChatMessage(
        video_id=video_id,
        event_id=event_id,
        event_type=EventType.TEXT,
        timestamp_usec=int(timestamp_usec),
        published_at=published_at,
        author_name=author_name,
        author_channel_id=author_channel_id,
        message_text=message_text,
        message_runs_json=message_runs_json,
        ingest_run_id=run_id,
        ingested_at=datetime.utcnow(),
        source_file=source_file,
        source_line_no=source_line_no,
        raw_item_json=item
    )


def _normalize_paid_message(
    renderer: Dict[str, Any],
    video_id: str,
    event_id: str,
    timestamp_usec: int,
    published_at: datetime,
    run_id: str,
    source_file: str,
    source_line_no: int,
    item: Dict[str, Any]
) -> ChatMessage:
    """スーパーチャットを正規化"""
    author_name = renderer.get("authorName", {}).get("simpleText")
    author_channel_id = renderer.get("authorExternalChannelId")
    purchase_amount_text = renderer.get("purchaseAmountText", {}).get("simpleText")
    
    # message runs を抽出
    message_obj = renderer.get("message", {})
    runs = message_obj.get("runs", [])
    message_text = _extract_text_from_runs(runs)
    message_runs_json = runs if runs else None
    
    return ChatMessage(
        video_id=video_id,
        event_id=event_id,
        event_type=EventType.PAID,
        timestamp_usec=int(timestamp_usec),
        published_at=published_at,
        author_name=author_name,
        author_channel_id=author_channel_id,
        message_text=message_text,
        message_runs_json=message_runs_json,
        purchase_amount_text=purchase_amount_text,
        ingest_run_id=run_id,
        ingested_at=datetime.utcnow(),
        source_file=source_file,
        source_line_no=source_line_no,
        raw_item_json=item
    )


def _normalize_membership_item(
    renderer: Dict[str, Any],
    video_id: str,
    event_id: str,
    timestamp_usec: int,
    published_at: datetime,
    run_id: str,
    source_file: str,
    source_line_no: int,
    item: Dict[str, Any]
) -> ChatMessage:
    """メンバーシップアイテムを正規化"""
    author_name = renderer.get("authorName", {}).get("simpleText")
    author_channel_id = renderer.get("authorExternalChannelId")
    
    # headerSubtext から runs を抽出（メンバーシップメッセージ）
    header_subtext = renderer.get("headerSubtext", {})
    runs = header_subtext.get("runs", [])
    message_text = _extract_text_from_runs(runs)
    message_runs_json = runs if runs else None
    
    return ChatMessage(
        video_id=video_id,
        event_id=event_id,
        event_type=EventType.MEMBERSHIP,
        timestamp_usec=int(timestamp_usec),
        published_at=published_at,
        author_name=author_name,
        author_channel_id=author_channel_id,
        message_text=message_text,
        message_runs_json=message_runs_json,
        ingest_run_id=run_id,
        ingested_at=datetime.utcnow(),
        source_file=source_file,
        source_line_no=source_line_no,
        raw_item_json=item
    )


def _normalize_unknown_item(
    renderer: Dict[str, Any],
    video_id: str,
    event_id: str,
    timestamp_usec: int,
    published_at: datetime,
    run_id: str,
    source_file: str,
    source_line_no: int,
    item: Dict[str, Any]
) -> ChatMessage:
    """未知の renderer を UNKNOWN として保持"""
    return ChatMessage(
        video_id=video_id,
        event_id=event_id,
        event_type=EventType.UNKNOWN,
        timestamp_usec=int(timestamp_usec),
        published_at=published_at,
        ingest_run_id=run_id,
        ingested_at=datetime.utcnow(),
        source_file=source_file,
        source_line_no=source_line_no,
        raw_item_json=item
    )


# ============================================================================
# ヘルパー関数
# ============================================================================

def _extract_text_from_runs(runs: List[Dict[str, Any]]) -> str:
    """
    runs 配列からテキストを抽出して結合
    
    Args:
        runs: message.runs 配列
        
    Returns:
        結合されたテキスト
    """
    text_parts = []
    for run in runs:
        if "text" in run:
            text_parts.append(run["text"])
        elif "emoji" in run:
            # 絵文字の場合はショートコードを使用
            emoji = run["emoji"]
            shortcuts = emoji.get("shortcuts", [])
            if shortcuts:
                text_parts.append(shortcuts[0])
    
    return "".join(text_parts)
