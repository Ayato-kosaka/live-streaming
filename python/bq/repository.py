"""
BigQuery リポジトリモジュール

videos の取得・更新、chat_messages の MERGE を実行する。
BigQuery との全てのやり取りはこのモジュールを経由する。
"""

from datetime import datetime
from typing import List, Optional
from google.cloud import bigquery
import json
import logging

from bq.client import get_bigquery_client
from bq.queries import (
    QUERY_DISCOVERY_UPSERT_VIDEO,
    QUERY_SELECT_TARGET_VIDEOS,
    QUERY_MERGE_VIDEO,
    QUERY_MERGE_CHAT_MESSAGES,
    QUERY_GET_EXISTING_VIDEO_IDS,
    QUERY_GET_EXISTING_VIDEO_IDS_IN_RANGE,
)
from models.types import Video, ChatMessage, VideoStatus, DiscoveredVideo
from config import MAX_VIDEOS_PER_RUN
from utils.batching import batch_items
from utils.timestamp import to_rfc3339
from logging_util import setup_logger

logger = setup_logger(__name__)


# ============================================================================
# Discovery: videos テーブルへの UPSERT
# ============================================================================

def get_existing_video_ids_in_range(
    cutoff_time: datetime,
    logger: Optional[logging.Logger] = None
) -> set[str]:
    """
    BigQuery から指定期間内の既存 video_id を取得
    
    Discovery 処理で使用。既知の video_id が連続で現れた場合に
    Discovery を打ち切るための判定に使用する。
    
    パフォーマンス最適化:
    - cutoff_time 以降の actual_start_time を持つ動画のみを取得
    - actual_start_time が NULL の動画も取得（未配信動画対策）
    
    Args:
        cutoff_time: カットオフ時刻（この時刻以降の動画を取得）
        logger: ロガー（オプション）
        
    Returns:
        既存の video_id の集合
    """
    client = get_bigquery_client()
    
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter(
                "cutoff_time",
                "TIMESTAMP",
                cutoff_time.isoformat() if cutoff_time else None
            ),
        ]
    )
    
    query_job = client.query(QUERY_GET_EXISTING_VIDEO_IDS_IN_RANGE, job_config=job_config)
    results = query_job.result()
    
    video_ids = {row.video_id for row in results}
    
    if logger:
        logger.info(
            f"既存の video_id を {len(video_ids)} 件取得 "
            f"(cutoff: {cutoff_time.isoformat()})"
        )
    
    return video_ids


def get_existing_video_ids() -> set[str]:
    """
    BigQuery から既存の video_id を全て取得（非推奨）
    
    注意: この関数は大量のレコードを返す可能性があるため、
    代わりに get_existing_video_ids_in_range() の使用を推奨。
    
    Returns:
        既存の video_id の集合
    """
    client = get_bigquery_client()
    
    query_job = client.query(QUERY_GET_EXISTING_VIDEO_IDS)
    results = query_job.result()
    
    video_ids = {row.video_id for row in results}
    
    logger.info(f"既存の video_id を {len(video_ids)} 件取得（全件）")
    
    return video_ids


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
    
    client = get_bigquery_client()
    total_merged = 0
    
    # STRUCT型定義を明示的に指定
    # BigQuery の STRUCT<...> 形式で全フィールドを定義
    # 
    # 重要な設計方針（Primitive-only pattern）:
    # - ArrayQueryParameter + STRUCT では複合型（JSON/TIMESTAMP）を直接渡せない
    # - すべて STRING/INT64 などプリミティブ型として渡し、SQL側で変換する
    # 
    # 理由:
    # - JSON型: BigQuery Python Client が QueryParameter として扱えない
    # - TIMESTAMP型: STRUCT内の datetime が json.dumps() で失敗する
    # 
    # → すべて STRING として渡し、SQL側で SAFE_CAST / SAFE.PARSE_JSON で変換
    # 
    # ArrayQueryParameter の型定義:
    # google-cloud-bigquery 3.11.0+ では型オブジェクトを使用する必要がある
    # 
    # 設計方針:
    # - すべてのフィールドを STRING または INT64 として定義（プリミティブ型のみ）
    # - TIMESTAMP や JSON は SQL 側で変換（SAFE_CAST / SAFE.PARSE_JSON）
    # - これにより datetime や dict を直接渡すことによるシリアライゼーションエラーを回避
    
    # STRUCT の型を定義（StructQueryParameterType で指定）
    #
    # 重要な設計方針（正規API使用）:
    # - values には StructQueryParameter の配列を渡す（tuple配列ではない）
    # - これが BigQuery Python Client の正式な API
    # 
    # 各 StructQueryParameter は ScalarQueryParameter のリストで構成:
    # - name=None（配列要素なので名前不要）
    # - *fields で各フィールドを ScalarQueryParameter として渡す
    
    from google.cloud.bigquery import ScalarQueryParameter, StructQueryParameter
    
    # フィールド名のリスト（順序固定、これが STRUCT のスキーマ）
    field_names = [
        "video_id", "event_id", "event_type", "timestamp_usec", "published_at",
        "author_name", "author_channel_id", "message_text", "message_runs_json",
        "purchase_amount_text", "ingest_run_id", "ingested_at", "source_file",
        "source_line_no", "raw_item_json"
    ]
    
    # バッチに分割して MERGE
    for batch in batch_items(messages):
        logger.info(f"Processing batch of {len(batch)} messages for MERGE")
        
        # ChatMessage を StructQueryParameter のリストに変換
        # 
        # 重要な設計方針:
        # - すべて STRING/INT64 などプリミティブ型として渡す
        # - TIMESTAMP や JSON は SQL側で変換（SAFE_CAST / SAFE.PARSE_JSON）
        # 
        # 理由:
        # - ArrayQueryParameter + STRUCT 内で datetime を渡すと json.dumps() で失敗
        # - JSON 型もパラメータとして直接渡せない
        
        struct_params = []
        for msg in batch:
            # TIMESTAMP フィールド: RFC3339 文字列に変換（SQL側でSAFE_CASTで変換）
            published_at_str = to_rfc3339(msg.published_at)
            ingested_at_str = to_rfc3339(msg.ingested_at)
            
            # JSON型フィールドを文字列化（SQL側でSAFE.PARSE_JSONで変換）
            message_runs_json_str = None
            if msg.message_runs_json:
                message_runs_json_str = json.dumps(msg.message_runs_json, ensure_ascii=False)
            
            raw_item_json_str = json.dumps(msg.raw_item_json, ensure_ascii=False)
            
            # StructQueryParameter を作成
            # name=None（配列要素なので名前不要）
            # *fields で各フィールドを ScalarQueryParameter として渡す
            # 
            # 注意: field_names の順序と一致させる必要がある
            struct_param = StructQueryParameter(
                None,  # name は None（配列要素）
                ScalarQueryParameter("video_id", "STRING", msg.video_id),
                ScalarQueryParameter("event_id", "STRING", msg.event_id),
                ScalarQueryParameter("event_type", "STRING", msg.event_type.value),
                ScalarQueryParameter("timestamp_usec", "INT64", int(msg.timestamp_usec)),
                ScalarQueryParameter("published_at", "STRING", published_at_str),
                ScalarQueryParameter("author_name", "STRING", msg.author_name),
                ScalarQueryParameter("author_channel_id", "STRING", msg.author_channel_id),
                ScalarQueryParameter("message_text", "STRING", msg.message_text),
                ScalarQueryParameter("message_runs_json", "STRING", message_runs_json_str),
                ScalarQueryParameter("purchase_amount_text", "STRING", msg.purchase_amount_text),
                ScalarQueryParameter("ingest_run_id", "STRING", msg.ingest_run_id),
                ScalarQueryParameter("ingested_at", "STRING", ingested_at_str),
                ScalarQueryParameter("source_file", "STRING", msg.source_file),
                ScalarQueryParameter("source_line_no", "INT64", msg.source_line_no),
                ScalarQueryParameter("raw_item_json", "STRING", raw_item_json_str),
            )
            struct_params.append(struct_param)
        
        # ============================================================================
        # バリデーション: BigQuery に送信する前に値を検証
        # ============================================================================
        # 
        # 目的:
        # - "Invalid value for type: STRUCT<...>" エラーの再発防止
        # - 異常値が混入した場合、どのレコードのどのフィールドが原因かを特定
        # 
        # 検証内容:
        # - StructQueryParameter が正しく構築できているか
        # - to_api_repr() が成功するか（BigQueryが受け入れ可能な形式か）
        # 
        # エラー時の挙動:
        # - BigQuery には送信せず、詳細ログを出力して例外を投げる
        # - video_id, event_id, source_line_no で問題レコードを特定可能
        
        # BigQuery に送信する前に真の検証: to_api_repr() が成功するかテスト
        _validate_struct_params_with_api_repr(struct_params, batch)
        
        # ArrayQueryParameter を構築
        # array_type には "STRUCT" を渡す（StructQueryParameter の配列であることを示す）
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ArrayQueryParameter(
                    "messages",
                    "STRUCT",  # STRUCT 型の配列
                    struct_params  # StructQueryParameter の配列
                ),
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


# ============================================================================
# バリデーション: バッチ送信前の値検証
# ============================================================================

def _validate_struct_params_with_api_repr(
    struct_params: List,
    batch: List[ChatMessage]
) -> None:
    """
    BigQuery に送信する前に真の検証を実施
    
    目的:
    - ArrayQueryParameter が正しく構築でき、to_api_repr() で BigQuery API 形式に変換できるかをテスト
    - StructQueryParameter の配列が正しく構築されているかを確認
    
    検証内容:
    - ArrayQueryParameter を実際に構築
    - to_api_repr() を呼び出して API 形式への変換をテスト
    - 失敗した場合は詳細なエラー情報をログ出力
    
    エラー時の挙動:
    - BigQuery には送信せず、詳細ログを出力して例外を投げる
    - これにより BigQuery エラーが発生する前に問題を検出
    
    Args:
        struct_params: StructQueryParameter のリスト
        batch: 元の ChatMessage オブジェクトのリスト（デバッグ用）
    
    Raises:
        ValueError: ArrayQueryParameter の構築または to_api_repr() が失敗した場合
    """
    try:
        # ArrayQueryParameter を実際に構築してみる
        # array_type には "STRUCT" を渡す（StructQueryParameter の配列であることを示す）
        param = bigquery.ArrayQueryParameter(
            "messages",
            "STRUCT",
            struct_params
        )
        
        # BigQuery が実際に使用する API 形式への変換をテスト
        # これが成功すれば BigQuery クエリも成功する可能性が高い
        _ = param.to_api_repr()
        
        # 成功：ログ出力（通常時は重くならないよう info レベル）
        logger.info(f"✅ Batch validation passed (to_api_repr test): {len(struct_params)} records validated")
        
    except Exception as e:
        # 失敗：詳細ログを出力して例外を投げる
        # 
        # 一般的な原因:
        # - datetime オブジェクトが混入（to_rfc3339() で変換し忘れ）
        # - dict/list が混入（json.dumps() で文字列化し忘れ）
        # - ScalarQueryParameter の構築に失敗
        # - フィールド数が不一致
        
        error_msg = (
            f"❌ BigQuery ArrayQueryParameter 構築失敗\n"
            f"  バッチサイズ: {len(struct_params)}\n"
            f"  エラー: {str(e)}\n"
            f"  型: {type(e).__name__}\n"
            f"\n"
            f"原因の可能性:\n"
            f"  - datetime オブジェクトが to_rfc3339() で変換されていない\n"
            f"  - dict/list が json.dumps() で文字列化されていない\n"
            f"  - ScalarQueryParameter の構築に失敗\n"
            f"  - フィールド数が不一致（15フィールド必要）\n"
        )
        
        # 最初の数レコードの情報をログ出力（デバッグ用）
        if batch:
            error_msg += f"\n最初のレコードの情報:\n"
            first_msg = batch[0]
            error_msg += f"  video_id: {first_msg.video_id}\n"
            error_msg += f"  event_id: {first_msg.event_id}\n"
            error_msg += f"  source_line_no: {first_msg.source_line_no}\n"
        
        logger.error(error_msg)
        
        raise ValueError(
            f"Failed to construct ArrayQueryParameter for BigQuery: {str(e)}. "
            f"Check logs for detailed error information. "
            f"Batch size: {len(struct_params)}"
        ) from e

