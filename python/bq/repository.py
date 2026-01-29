"""
BigQuery リポジトリモジュール

videos の取得・更新、chat_messages の MERGE を実行する。
BigQuery との全てのやり取りはこのモジュールを経由する。
"""

from datetime import datetime
from typing import List, Optional
from google.cloud import bigquery
import json

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
from utils.timestamp import to_rfc3339
from logging_util import setup_logger

logger = setup_logger(__name__)


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
    
    # STRUCT の型を定義（各フィールドの型を ArrayQueryParameterType で指定）
    from google.cloud.bigquery import ScalarQueryParameterType, StructQueryParameterType
    
    struct_param_type = StructQueryParameterType(
        ScalarQueryParameterType("video_id", "STRING"),
        ScalarQueryParameterType("event_id", "STRING"),
        ScalarQueryParameterType("event_type", "STRING"),
        ScalarQueryParameterType("timestamp_usec", "INT64"),
        ScalarQueryParameterType("published_at", "STRING"),  # TIMESTAMP → STRING (SQL側で SAFE_CAST)
        ScalarQueryParameterType("author_name", "STRING"),
        ScalarQueryParameterType("author_channel_id", "STRING"),
        ScalarQueryParameterType("message_text", "STRING"),
        ScalarQueryParameterType("message_runs_json", "STRING"),  # JSON → STRING (SQL側で SAFE.PARSE_JSON)
        ScalarQueryParameterType("purchase_amount_text", "STRING"),
        ScalarQueryParameterType("ingest_run_id", "STRING"),
        ScalarQueryParameterType("ingested_at", "STRING"),  # TIMESTAMP → STRING (SQL側で SAFE_CAST)
        ScalarQueryParameterType("source_file", "STRING"),
        ScalarQueryParameterType("source_line_no", "INT64"),
        ScalarQueryParameterType("raw_item_json", "STRING"),  # JSON → STRING (SQL側で SAFE.PARSE_JSON)
    )
    
    # フィールド名のリスト（バリデーションログ用）
    field_names = [
        "video_id", "event_id", "event_type", "timestamp_usec", "published_at",
        "author_name", "author_channel_id", "message_text", "message_runs_json",
        "purchase_amount_text", "ingest_run_id", "ingested_at", "source_file",
        "source_line_no", "raw_item_json"
    ]
    
    # バッチに分割して MERGE
    for batch in batch_items(messages):
        logger.info(f"Processing batch of {len(batch)} messages for MERGE")
        
        # ChatMessage をタプルのリストに変換（STRUCT の順序に従う）
        # 
        # 重要な設計方針:
        # - すべて STRING/INT64 などプリミティブ型として渡す
        # - TIMESTAMP や JSON は SQL側で変換（SAFE_CAST / SAFE.PARSE_JSON）
        # 
        # 理由:
        # - ArrayQueryParameter + STRUCT 内で datetime を渡すと json.dumps() で失敗
        # - JSON 型もパラメータとして直接渡せない
        
        batch_tuples = []
        for msg in batch:
            # TIMESTAMP フィールド: RFC3339 文字列に変換（SQL側でSAFE_CASTで変換）
            published_at_str = to_rfc3339(msg.published_at)
            ingested_at_str = to_rfc3339(msg.ingested_at)
            
            # JSON型フィールドを文字列化（SQL側でSAFE.PARSE_JSONで変換）
            message_runs_json_str = None
            if msg.message_runs_json:
                message_runs_json_str = json.dumps(msg.message_runs_json, ensure_ascii=False)
            
            raw_item_json_str = json.dumps(msg.raw_item_json, ensure_ascii=False)
            
            # タプルに変換（STRUCT型定義の順序と一致させる）
            # 注意: to_dict() は使わない（型情報が失われるため）
            batch_tuples.append((
                msg.video_id,
                msg.event_id,
                msg.event_type.value,  # Enum の値を取得
                int(msg.timestamp_usec),  # INT64 として明示的に変換
                published_at_str,  # STRING（SQL側でSAFE_CAST）
                msg.author_name,
                msg.author_channel_id,
                msg.message_text,
                message_runs_json_str,  # STRING（SQL側でSAFE.PARSE_JSON）
                msg.purchase_amount_text,
                msg.ingest_run_id,
                ingested_at_str,  # STRING（SQL側でSAFE_CAST）
                msg.source_file,
                msg.source_line_no,
                raw_item_json_str,  # STRING（SQL側でSAFE.PARSE_JSON）
            ))
        
        # ============================================================================
        # バリデーション: BigQuery に送信する前に値を検証
        # ============================================================================
        # 
        # 目的:
        # - "Invalid value for type: STRUCT<...>" エラーの再発防止
        # - 異常値が混入した場合、どのレコードのどのフィールドが原因かを特定
        # 
        # 検証内容:
        # - None または プリミティブ型（str, int）のみ許可
        # - datetime, dict, list などの複合型が混入していないか確認
        # 
        # エラー時の挙動:
        # - BigQuery には送信せず、詳細ログを出力して例外を投げる
        # - video_id, event_id, source_line_no で問題レコードを特定可能
        
        # BigQuery に送信する前に真の検証: to_api_repr() が成功するかテスト
        _validate_batch_tuples_with_api_repr(batch_tuples, field_names, struct_param_type)
        
        # ArrayQueryParameter を構築
        # array_type には StructQueryParameterType オブジェクトを渡す
        from google.cloud.bigquery import ArrayQueryParameterType
        array_param_type = ArrayQueryParameterType(struct_param_type)
        
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ArrayQueryParameter(
                    "messages",
                    array_param_type,  # ArrayQueryParameterType オブジェクト
                    batch_tuples
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

def _validate_batch_tuples_with_api_repr(
    batch_tuples: List[tuple],
    field_names: List[str],
    struct_param_type
) -> None:
    """
    BigQuery に送信する前にバッチを検証（真の検証: to_api_repr() テスト）
    
    目的:
    - "Invalid value for type: STRUCT<...>" エラーの再発防止
    - 単なる型チェックではなく、実際に BigQuery のパラメータとして使えるかテスト
    
    検証内容:
    - ArrayQueryParameter を実際に構築し、to_api_repr() が成功するか確認
    - 失敗した場合、どのレコードのどのフィールドが原因かを特定
    
    エラー時の挙動:
    - BigQuery には送信せず、詳細ログを出力して例外を投げる
    - video_id, event_id, source_line_no で問題レコードを特定可能
    
    Args:
        batch_tuples: 検証するタプルのリスト
        field_names: フィールド名のリスト（ログ出力用）
        struct_param_type: StructQueryParameterType オブジェクト
    
    Raises:
        ValueError: パラメータの構築またはシリアライズに失敗した場合
    """
    try:
        # ArrayQueryParameter を実際に構築してテスト
        from google.cloud.bigquery import ArrayQueryParameterType
        array_param_type = ArrayQueryParameterType(struct_param_type)
        
        param = bigquery.ArrayQueryParameter(
            "messages",
            array_param_type,
            batch_tuples
        )
        
        # to_api_repr() を呼び出して、実際にシリアライズできるかテスト
        # これが成功すれば、BigQuery に送信できる
        _ = param.to_api_repr()
        
        # 成功：ログ出力（通常時は重くならないよう info レベル）
        logger.info(f"✅ Batch validation passed (to_api_repr test): {len(batch_tuples)} records validated")
        
    except Exception as e:
        # 失敗：詳細ログを出力して例外を投げる
        # 
        # 一般的な原因:
        # - datetime オブジェクトが混入（to_rfc3339() で変換し忘れ）
        # - dict/list が混入（json.dumps() で文字列化し忘れ）
        # - 型定義と batch_tuples の順序が不一致
        # - None 以外の値が STRING/INT64 でない
        
        error_msg = (
            f"❌ BigQuery ArrayQueryParameter 構築失敗\n"
            f"  バッチサイズ: {len(batch_tuples)}\n"
            f"  エラー: {str(e)}\n"
            f"  型: {type(e).__name__}\n"
            f"\n"
            f"原因の可能性:\n"
            f"  - datetime オブジェクトが to_rfc3339() で変換されていない\n"
            f"  - dict/list が json.dumps() で文字列化されていない\n"
            f"  - 型定義と batch_tuples の順序が不一致\n"
            f"  - STRUCT フィールド数と tuple の要素数が不一致\n"
            f"\n"
            f"デバッグ情報:\n"
            f"  - 最初のタプルの要素数: {len(batch_tuples[0]) if batch_tuples else 0}\n"
        )
        
        # 最初の数レコードの型情報をログ出力（デバッグ用）
        if batch_tuples:
            error_msg += f"\n最初のレコードの型情報:\n"
            for field_idx, value in enumerate(batch_tuples[0]):
                field_name = field_names[field_idx] if field_idx < len(field_names) else f"field_{field_idx}"
                error_msg += f"  [{field_idx}] {field_name}: {type(value).__name__} = {repr(value)[:50]}\n"
        
        logger.error(error_msg)
        
        raise ValueError(
            f"Failed to construct ArrayQueryParameter for BigQuery: {str(e)}. "
            f"Check logs for detailed error information. "
            f"Batch size: {len(batch_tuples)}"
        ) from e


def _validate_batch_tuples(batch_tuples: List[tuple], field_names: List[str]) -> None:
    """
    BigQuery に送信する前にバッチを検証
    
    目的:
    - "Invalid value for type: STRUCT<...>" エラーの再発防止
    - 異常値が混入した場合、どのレコードのどのフィールドが原因かを特定
    
    検証内容:
    - None または プリミティブ型（str, int）のみ許可
    - datetime, dict, list などの複合型が混入していないか確認
    
    エラー時の挙動:
    - BigQuery には送信せず、詳細ログを出力して例外を投げる
    - video_id, event_id, source_line_no で問題レコードを特定可能
    
    Args:
        batch_tuples: 検証するタプルのリスト
        field_names: フィールド名のリスト（ログ出力用）
    
    Raises:
        ValueError: 不正な値が見つかった場合
    """
    for idx, tpl in enumerate(batch_tuples):
        for field_idx, value in enumerate(tpl):
            # None または str/int のみ許可
            if value is not None and not isinstance(value, (str, int)):
                # 異常値を検出：詳細ログを出力
                field_name = field_names[field_idx] if field_idx < len(field_names) else f"field_{field_idx}"
                
                # レコード識別情報（video_id, event_id, source_line_no）を取得
                video_id = tpl[0] if len(tpl) > 0 else "unknown"
                event_id = tpl[1] if len(tpl) > 1 else "unknown"
                source_line_no = tpl[13] if len(tpl) > 13 else "unknown"  # source_line_no の位置
                
                error_msg = (
                    f"❌ BigQuery MERGE バリデーションエラー\n"
                    f"  レコード番号: {idx}\n"
                    f"  video_id: {video_id}\n"
                    f"  event_id: {event_id}\n"
                    f"  source_line_no: {source_line_no}\n"
                    f"  フィールド: {field_name} (位置: {field_idx})\n"
                    f"  不正な値: {repr(value)}\n"
                    f"  型: {type(value).__name__}\n"
                    f"  期待される型: None, str, または int\n"
                    f"\n"
                    f"原因:\n"
                    f"  - datetime オブジェクトが to_rfc3339() で変換されていない可能性\n"
                    f"  - dict/list が json.dumps() で文字列化されていない可能性\n"
                    f"  - STRUCT 定義の順序と値の順序が不一致の可能性\n"
                )
                logger.error(error_msg)
                
                raise ValueError(
                    f"Invalid value in batch at record {idx}, field '{field_name}' (position {field_idx}): "
                    f"type {type(value).__name__} is not allowed. "
                    f"Only None, str, or int are permitted for BigQuery ArrayQueryParameter + STRUCT. "
                    f"video_id={video_id}, event_id={event_id}, source_line_no={source_line_no}"
                )
    
    # バリデーション成功：ログ出力（通常時は重くならないよう info レベル）
    logger.info(f"✅ Batch validation passed: {len(batch_tuples)} records validated")
