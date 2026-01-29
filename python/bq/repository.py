"""
BigQuery リポジトリモジュール

videos の取得・更新、chat_messages の MERGE を実行する。
BigQuery との全てのやり取りはこのモジュールを経由する。
"""

from datetime import datetime
from typing import List, Optional
from google.cloud import bigquery

from bq.client import get_bigquery_client
from bq.queries import (
    QUERY_DISCOVERY_UPSERT_VIDEO,
    QUERY_SELECT_TARGET_VIDEOS,
    QUERY_MERGE_VIDEO,
    QUERY_MERGE_CHAT_MESSAGES,
)
from models.types import Video, ChatMessage, VideoStatus, DiscoveredVideo
from config import MAX_VIDEOS_PER_RUN
from utils.batching import batch_items


# ============================================================================
# Discovery: videos テーブルへの UPSERT
# ============================================================================

def upsert_discovered_video(discovered: DiscoveredVideo) -> None:
    """
    Discovery で取得した動画を videos テーブルに UPSERT
    
    新規レコード:
    - video_id, title, actual_start_time を挿入
    - status='PENDING', first_seen_at=now(), attempt_count=0
    
    既存レコード:
    - title, actual_start_time のみ更新（進捗情報は触らない）
    
    Args:
        discovered: DiscoveredVideo オブジェクト
    """
    client = get_bigquery_client()
    
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("video_id", "STRING", discovered.video_id),
            bigquery.ScalarQueryParameter("title", "STRING", discovered.title),
            bigquery.ScalarQueryParameter(
                "actual_start_time",
                "TIMESTAMP",
                discovered.actual_start_time.isoformat() if discovered.actual_start_time else None
            ),
        ]
    )
    
    query_job = client.query(QUERY_DISCOVERY_UPSERT_VIDEO, job_config=job_config)
    query_job.result()  # 完了を待つ


# ============================================================================
# videos テーブル操作
# ============================================================================

def get_target_videos(max_videos: int = MAX_VIDEOS_PER_RUN) -> List[Video]:
    """
    処理対象の動画を取得
    
    PENDING, WAITING, FAILED の中から、リトライ可能な動画を抽出する。
    
    Args:
        max_videos: 取得する最大動画数
        
    Returns:
        処理対象の Video オブジェクトのリスト
    """
    client = get_bigquery_client()
    
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("max_videos", "INT64", max_videos),
        ]
    )
    
    query_job = client.query(QUERY_SELECT_TARGET_VIDEOS, job_config=job_config)
    results = query_job.result()
    
    videos = []
    for row in results:
        video = Video(
            video_id=row.video_id,
            status=VideoStatus(row.status),
            first_seen_at=row.first_seen_at,
            next_retry_at=row.next_retry_at,
            attempt_count=row.attempt_count,
            last_attempt_at=row.last_attempt_at,
            last_error_code=row.last_error_code,
            last_error_detail=row.last_error_detail,
            succeeded_at=row.succeeded_at,
            yt_dlp_version=row.yt_dlp_version,
            title=row.title if hasattr(row, 'title') else None,
            actual_start_time=row.actual_start_time if hasattr(row, 'actual_start_time') else None,
        )
        videos.append(video)
    
    return videos


def update_video(video: Video) -> None:
    """
    動画レコードを更新（または挿入）
    
    MERGE により、既存レコードは更新、新規レコードは挿入される。
    
    Args:
        video: 更新する Video オブジェクト
    """
    client = get_bigquery_client()
    
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("video_id", "STRING", video.video_id),
            bigquery.ScalarQueryParameter("status", "STRING", video.status.value),
            bigquery.ScalarQueryParameter(
                "first_seen_at",
                "TIMESTAMP",
                video.first_seen_at.isoformat() if video.first_seen_at else None
            ),
            bigquery.ScalarQueryParameter(
                "next_retry_at",
                "TIMESTAMP",
                video.next_retry_at.isoformat() if video.next_retry_at else None
            ),
            bigquery.ScalarQueryParameter("attempt_count", "INT64", video.attempt_count),
            bigquery.ScalarQueryParameter(
                "last_attempt_at",
                "TIMESTAMP",
                video.last_attempt_at.isoformat() if video.last_attempt_at else None
            ),
            bigquery.ScalarQueryParameter("last_error_code", "STRING", video.last_error_code),
            bigquery.ScalarQueryParameter("last_error_detail", "STRING", video.last_error_detail),
            bigquery.ScalarQueryParameter(
                "succeeded_at",
                "TIMESTAMP",
                video.succeeded_at.isoformat() if video.succeeded_at else None
            ),
            bigquery.ScalarQueryParameter("yt_dlp_version", "STRING", video.yt_dlp_version),
            bigquery.ScalarQueryParameter("title", "STRING", video.title),
            bigquery.ScalarQueryParameter(
                "actual_start_time",
                "TIMESTAMP",
                video.actual_start_time.isoformat() if video.actual_start_time else None
            ),
        ]
    )
    
    query_job = client.query(QUERY_MERGE_VIDEO, job_config=job_config)
    query_job.result()  # 完了を待つ


# ============================================================================
# chat_messages テーブル操作
# ============================================================================

def merge_chat_messages(messages: List[ChatMessage]) -> int:
    """
    チャットメッセージを MERGE（idempotent）
    
    大量のメッセージがある場合は自動的にバッチ分割して処理する。
    
    Args:
        messages: MERGE する ChatMessage オブジェクトのリスト
        
    Returns:
        処理したメッセージの総数
    """
    if not messages:
        return 0
    
    import json
    
    client = get_bigquery_client()
    total_merged = 0
    
    # STRUCT型定義を明示的に指定
    # BigQuery の STRUCT<...> 形式で全フィールドを定義
    struct_type = (
        "STRUCT<"
        "video_id STRING, "
        "event_id STRING, "
        "event_type STRING, "
        "timestamp_usec INT64, "
        "published_at TIMESTAMP, "
        "author_name STRING, "
        "author_channel_id STRING, "
        "message_text STRING, "
        "message_runs_json JSON, "
        "purchase_amount_text STRING, "
        "ingest_run_id STRING, "
        "ingested_at TIMESTAMP, "
        "source_file STRING, "
        "source_line_no INT64, "
        "raw_item_json JSON"
        ">"
    )
    
    # バッチに分割して MERGE
    for batch in batch_items(messages):
        # ChatMessage をタプルのリストに変換（STRUCT の順序に従う）
        # JSON型フィールドは文字列化が必要
        batch_tuples = []
        for msg in batch:
            msg_dict = msg.to_dict()
            
            # JSON型フィールドを文字列化
            message_runs_json_str = None
            if msg_dict.get('message_runs_json'):
                message_runs_json_str = json.dumps(msg_dict['message_runs_json'])
            
            raw_item_json_str = json.dumps(msg_dict['raw_item_json'])
            
            # タプルに変換（STRUCT型定義の順序と一致させる）
            batch_tuples.append((
                msg_dict['video_id'],
                msg_dict['event_id'],
                msg_dict['event_type'],
                msg_dict['timestamp_usec'],
                msg_dict['published_at'],
                msg_dict['author_name'],
                msg_dict['author_channel_id'],
                msg_dict['message_text'],
                message_runs_json_str,
                msg_dict['purchase_amount_text'],
                msg_dict['ingest_run_id'],
                msg_dict['ingested_at'],
                msg_dict['source_file'],
                msg_dict['source_line_no'],
                raw_item_json_str,
            ))
        
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ArrayQueryParameter("messages", struct_type, batch_tuples),
            ]
        )
        
        query_job = client.query(QUERY_MERGE_CHAT_MESSAGES, job_config=job_config)
        query_job.result()  # 完了を待つ
        
        total_merged += len(batch)
    
    return total_merged


# ============================================================================
# ヘルパー関数: videos の状態遷移
# ============================================================================

def mark_video_processing_started(
    video: Video,
    yt_dlp_version: Optional[str] = None
) -> Video:
    """
    動画の処理開始をマーク
    
    attempt_count を増やし、last_attempt_at を現在時刻に設定する。
    first_seen_at が None の場合は現在時刻を設定。
    
    Args:
        video: 対象の Video オブジェクト
        yt_dlp_version: 使用する yt-dlp のバージョン
        
    Returns:
        更新された Video オブジェクト
    """
    now = datetime.utcnow()
    
    video.attempt_count += 1
    video.last_attempt_at = now
    
    if video.first_seen_at is None:
        video.first_seen_at = now
    
    if yt_dlp_version:
        video.yt_dlp_version = yt_dlp_version
    
    return video


def mark_video_succeeded(video: Video) -> Video:
    """
    動画の処理成功をマーク
    
    Args:
        video: 対象の Video オブジェクト
        
    Returns:
        更新された Video オブジェクト
    """
    video.status = VideoStatus.SUCCEEDED
    video.succeeded_at = datetime.utcnow()
    video.next_retry_at = None
    video.last_error_code = None
    video.last_error_detail = None
    
    return video


def mark_video_failed(
    video: Video,
    error_code: str,
    error_detail: str,
    next_retry_at: Optional[datetime] = None
) -> Video:
    """
    動画の処理失敗をマーク
    
    Args:
        video: 対象の Video オブジェクト
        error_code: エラーコード
        error_detail: エラー詳細
        next_retry_at: 次回リトライ時刻（Noneの場合はリトライしない）
        
    Returns:
        更新された Video オブジェクト
    """
    video.status = VideoStatus.FAILED
    video.last_error_code = error_code
    video.last_error_detail = error_detail
    video.next_retry_at = next_retry_at
    
    return video


def mark_video_waiting(
    video: Video,
    next_retry_at: datetime
) -> Video:
    """
    動画をリトライ待機状態にマーク
    
    Args:
        video: 対象の Video オブジェクト
        next_retry_at: 次回リトライ時刻
        
    Returns:
        更新された Video オブジェクト
    """
    video.status = VideoStatus.WAITING
    video.next_retry_at = next_retry_at
    video.last_error_code = None
    video.last_error_detail = None
    
    return video


def mark_video_skipped(
    video: Video,
    error_code: str,
    error_detail: str
) -> Video:
    """
    動画をスキップ状態にマーク
    
    Args:
        video: 対象の Video オブジェクト
        error_code: エラーコード
        error_detail: エラー詳細
        
    Returns:
        更新された Video オブジェクト
    """
    video.status = VideoStatus.SKIPPED
    video.last_error_code = error_code
    video.last_error_detail = error_detail
    video.next_retry_at = None
    
    return video
