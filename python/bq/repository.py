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
)
from models.types import Video, ChatMessage, VideoStatus, DiscoveredVideo
from config import MAX_VIDEOS_PER_RUN, BQ_DATASET, BQ_TABLE_CHAT_MESSAGES
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

def merge_chat_messages(messages: List[ChatMessage], logger=None) -> int:
    """
    チャットメッセージを MERGE（idempotent）
    
    ステージングテーブルを経由してMERGEを実行する。
    この方式により、QueryParameterの型変換エラーを回避し、
    大量メッセージの取り扱いも堅牢になる。
    
    処理フロー:
    1. 一時ステージングテーブルを作成
    2. メッセージをNDJSONとしてステージングテーブルへロード
    3. ステージングテーブルをソースとしてMERGE実行
    4. ステージングテーブルを削除
    
    Args:
        messages: MERGE する ChatMessage オブジェクトのリスト
        logger: ロガー（デバッグ情報出力用）
        
    Returns:
        処理したメッセージの総数
        
    Raises:
        Exception: BigQuery操作でエラーが発生した場合
    """
    if not messages:
        return 0
    
    import json
    import tempfile
    import uuid
    from datetime import datetime
    
    client = get_bigquery_client()
    
    # デバッグ情報をログ出力
    if logger:
        logger.info(f"MERGE開始: {len(messages)} メッセージ")
        if messages:
            sample_msg = messages[0].to_dict()
            logger.debug(f"サンプルメッセージキー: {list(sample_msg.keys())}")
    
    # ステージングテーブル名（一意にするためUUIDを使用）
    staging_table_id = f"{BQ_DATASET}.staging_chat_messages_{uuid.uuid4().hex[:8]}"
    
    try:
        # 1. ステージングテーブルを作成（chat_messages と同じスキーマ）
        staging_table = bigquery.Table(staging_table_id)
        staging_table.expires = datetime.utcnow().replace(microsecond=0) + \
            __import__('datetime').timedelta(hours=1)  # 1時間後に自動削除
        
        # スキーマ定義（chat_messages と同じ）
        staging_table.schema = [
            bigquery.SchemaField("video_id", "STRING", mode="REQUIRED"),
            bigquery.SchemaField("event_id", "STRING", mode="REQUIRED"),
            bigquery.SchemaField("event_type", "STRING", mode="REQUIRED"),
            bigquery.SchemaField("timestamp_usec", "INT64", mode="REQUIRED"),
            bigquery.SchemaField("published_at", "TIMESTAMP", mode="REQUIRED"),
            bigquery.SchemaField("author_name", "STRING", mode="NULLABLE"),
            bigquery.SchemaField("author_channel_id", "STRING", mode="NULLABLE"),
            bigquery.SchemaField("message_text", "STRING", mode="NULLABLE"),
            bigquery.SchemaField("message_runs_json", "JSON", mode="NULLABLE"),
            bigquery.SchemaField("purchase_amount_text", "STRING", mode="NULLABLE"),
            bigquery.SchemaField("ingest_run_id", "STRING", mode="NULLABLE"),
            bigquery.SchemaField("ingested_at", "TIMESTAMP", mode="NULLABLE"),
            bigquery.SchemaField("source_file", "STRING", mode="NULLABLE"),
            bigquery.SchemaField("source_line_no", "INT64", mode="NULLABLE"),
            bigquery.SchemaField("raw_item_json", "JSON", mode="REQUIRED"),
        ]
        
        client.create_table(staging_table)
        if logger:
            logger.debug(f"ステージングテーブル作成: {staging_table_id}")
        
        # 2. メッセージをNDJSONファイルとして一時ファイルに書き出し
        with tempfile.NamedTemporaryFile(mode='w', suffix='.ndjson', delete=False) as tmp_file:
            tmp_file_path = tmp_file.name
            for msg in messages:
                # JSON型フィールドは文字列化が必要
                msg_dict = msg.to_dict()
                # message_runs_json と raw_item_json を JSON文字列に変換
                if msg_dict.get('message_runs_json'):
                    msg_dict['message_runs_json'] = json.dumps(msg_dict['message_runs_json'])
                if msg_dict.get('raw_item_json'):
                    msg_dict['raw_item_json'] = json.dumps(msg_dict['raw_item_json'])
                tmp_file.write(json.dumps(msg_dict) + '\n')
        
        if logger:
            logger.debug(f"NDJSONファイル作成: {tmp_file_path}")
        
        # 3. ステージングテーブルへロード
        job_config = bigquery.LoadJobConfig(
            source_format=bigquery.SourceFormat.NEWLINE_DELIMITED_JSON,
            schema=staging_table.schema,
        )
        
        with open(tmp_file_path, 'rb') as source_file:
            load_job = client.load_table_from_file(
                source_file,
                staging_table_id,
                job_config=job_config
            )
        load_job.result()  # ロード完了を待つ
        
        if logger:
            logger.debug(f"ステージングテーブルへロード完了: {load_job.output_rows} 行")
        
        # 4. ステージングテーブルからMERGE
        merge_query = f"""
        MERGE `{BQ_DATASET}.{BQ_TABLE_CHAT_MESSAGES}` T
        USING `{staging_table_id}` S
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
        
        merge_job = client.query(merge_query)
        merge_job.result()  # MERGE完了を待つ
        
        if logger:
            logger.info(f"MERGE完了: {len(messages)} メッセージ処理")
        
        # 一時ファイルを削除
        import os
        os.unlink(tmp_file_path)
        
        return len(messages)
        
    except Exception as e:
        # BigQueryエラーの詳細をログ出力
        if logger:
            logger.error(f"BigQuery MERGE失敗: {type(e).__name__}: {str(e)}")
            # job error があれば詳細を出力
            if hasattr(e, 'errors'):
                logger.error(f"BigQuery errors: {e.errors}")
        raise
        
    finally:
        # 5. ステージングテーブルを削除（エラー時も確実に削除）
        try:
            client.delete_table(staging_table_id, not_found_ok=True)
            if logger:
                logger.debug(f"ステージングテーブル削除: {staging_table_id}")
        except Exception as cleanup_error:
            if logger:
                logger.warning(f"ステージングテーブル削除失敗（TTLで自動削除されます）: {cleanup_error}")
            pass  # 削除失敗は無視（TTLで自動削除される）


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
