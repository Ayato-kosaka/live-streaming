"""
YouTube 動画 Discovery モジュール

uploads playlist を使用して completed（アーカイブ）動画を検索・取得する。
低クオータ・高再現性を実現。
"""

from datetime import datetime, timedelta
from typing import List, Optional, Set
import logging

from youtube_api.client import get_youtube_client, execute_api_request
from models.types import DiscoveredVideo
from config import YOUTUBE_CHANNEL_ID, DISCOVERY_LOOKBACK_DAYS
from bq.repository import get_existing_video_ids


# ============================================================================
# Discovery メイン処理
# ============================================================================

def discover_completed_videos(
    lookback_days: int = DISCOVERY_LOOKBACK_DAYS,
    logger: Optional[logging.Logger] = None
) -> List[DiscoveredVideo]:
    """
    YouTube チャンネルから completed（アーカイブ）動画を検索・取得
    
    処理フロー:
    1. channels.list で uploads playlist ID を取得
    2. BigQuery から既存の video_id を取得（打ち切り判定用）
    3. playlistItems.list で動画IDを新しい順に列挙（ページング対応）
       - lookback 日数による打ち切り
       - 既知 video_id 連続出現による打ち切り
    4. videos.list で詳細情報（title, actualStartTime）を取得
       - liveStreamingDetails があるもののみを抽出（アーカイブ判定）
    5. DiscoveredVideo オブジェクトのリストとして返す
    
    Args:
        lookback_days: 何日前までの動画を検索するか
        logger: ロガー（オプション）
        
    Returns:
        発見した動画のリスト（actual_start_time 昇順）
        
    Raises:
        ValueError: チャンネルIDが未設定
        HttpError: YouTube API エラー
    """
    if not YOUTUBE_CHANNEL_ID:
        raise ValueError("環境変数 YOUTUBE_CHANNEL_ID が設定されていません")
    
    if logger:
        logger.info(f"Discovery 開始: チャンネル {YOUTUBE_CHANNEL_ID}, lookback {lookback_days} 日")
    
    # Step 1: uploads playlist ID を取得
    uploads_playlist_id = _get_uploads_playlist_id(logger)
    
    if not uploads_playlist_id:
        if logger:
            logger.error("uploads playlist ID の取得に失敗しました")
        return []
    
    if logger:
        logger.info(f"uploads playlist ID: {uploads_playlist_id}")
    
    # Step 2: 既存の video_id を取得（打ち切り判定用）
    existing_video_ids = get_existing_video_ids()
    
    # Step 3: playlistItems.list で video_id を収集（打ち切り条件付き）
    video_ids = _fetch_playlist_items(
        uploads_playlist_id,
        lookback_days,
        existing_video_ids,
        logger
    )
    
    if not video_ids:
        if logger:
            logger.info("新しい動画が見つかりませんでした")
        return []
    
    if logger:
        logger.info(f"playlistItems.list で {len(video_ids)} 件の動画を発見")
    
    # Step 4: videos.list で詳細情報を取得（live アーカイブのみ）
    discovered_videos = _fetch_video_details(video_ids, logger)
    
    # Step 5: actual_start_time でソート（昇順、無いものは末尾）
    discovered_videos.sort(
        key=lambda v: (v.actual_start_time is None, v.actual_start_time or datetime.max)
    )
    
    if logger:
        logger.info(f"videos.list で {len(discovered_videos)} 件のライブアーカイブを取得")
    
    return discovered_videos


# ============================================================================
# Step 1: uploads playlist ID 取得
# ============================================================================

def _get_uploads_playlist_id(
    logger: Optional[logging.Logger] = None
) -> Optional[str]:
    """
    channels.list API で uploads playlist ID を取得
    
    Args:
        logger: ロガー（オプション）
        
    Returns:
        uploads playlist ID（取得失敗時は None）
    """
    youtube = get_youtube_client()
    
    try:
        request = youtube.channels().list(
            part="contentDetails",
            id=YOUTUBE_CHANNEL_ID
        )
        
        response = execute_api_request(request, logger=logger)
        
        items = response.get("items", [])
        if not items:
            if logger:
                logger.error(f"チャンネル {YOUTUBE_CHANNEL_ID} が見つかりません")
            return None
        
        uploads_id = (
            items[0]
            .get("contentDetails", {})
            .get("relatedPlaylists", {})
            .get("uploads")
        )
        
        return uploads_id
        
    except Exception as e:
        if logger:
            logger.error(f"uploads playlist ID の取得に失敗: {e}")
        return None


# ============================================================================
# Step 2: playlistItems.list で video_id 収集（打ち切り条件付き）
# ============================================================================

def _fetch_playlist_items(
    playlist_id: str,
    lookback_days: int,
    existing_video_ids: Set[str],
    logger: Optional[logging.Logger] = None
) -> List[str]:
    """
    playlistItems.list API で uploads playlist から video_id を収集
    
    打ち切り条件:
    1. lookback 日数: cutoff 日時より古い動画のみのページに到達したら打ち切り
    2. 既知 video_id: 連続して既知の video_id のみになったら打ち切り
    
    Args:
        playlist_id: uploads playlist ID
        lookback_days: 何日前までの動画を検索するか
        existing_video_ids: 既存の video_id の集合
        logger: ロガー（オプション）
        
    Returns:
        video_id のリスト
    """
    youtube = get_youtube_client()
    
    # publishedAfter: 現在時刻 - lookback_days
    cutoff = datetime.utcnow() - timedelta(days=lookback_days)
    
    video_ids = []
    page_token = None
    page_count = 0
    consecutive_known_count = 0  # 連続既知カウンター
    CONSECUTIVE_KNOWN_THRESHOLD = 50  # 連続50件が既知なら打ち切り
    
    while True:
        page_count += 1
        
        # playlistItems.list リクエスト
        request = youtube.playlistItems().list(
            part="contentDetails",
            playlistId=playlist_id,
            maxResults=50,
            pageToken=page_token
        )
        
        response = execute_api_request(request, logger=logger)
        items = response.get("items", [])
        
        if logger:
            logger.info(
                f"playlistItems.list page={page_count} "
                f"items={len(items)} "
                f"nextPageToken={response.get('nextPageToken')}"
            )
        
        if not items:
            # ページが空なら終了
            break
        
        # 打ち切り判定フラグ
        should_break = False
        page_has_new_video = False
        
        for item in items:
            content_details = item.get("contentDetails", {})
            video_id = content_details.get("videoId")
            published_at_str = content_details.get("videoPublishedAt")
            
            if not video_id:
                continue
            
            # publishedAt のパース
            published_at = None
            if published_at_str:
                try:
                    published_at = datetime.fromisoformat(
                        published_at_str.replace("Z", "+00:00")
                    ).replace(tzinfo=None)
                except Exception:
                    pass
            
            # 打ち切り条件1: lookback 日数チェック
            if published_at and published_at < cutoff:
                if logger:
                    logger.info(
                        f"lookback 日数（{lookback_days}日）を超えたため Discovery を打ち切り: "
                        f"{video_id} (published_at: {published_at.isoformat()})"
                    )
                should_break = True
                break
            
            # video_id を追加
            video_ids.append(video_id)
            
            # 打ち切り条件2: 既知 video_id 連続出現チェック
            if video_id in existing_video_ids:
                consecutive_known_count += 1
            else:
                consecutive_known_count = 0
                page_has_new_video = True
            
            # 連続既知が閾値を超えたら打ち切り
            if consecutive_known_count >= CONSECUTIVE_KNOWN_THRESHOLD:
                if logger:
                    logger.info(
                        f"既知の video_id が連続 {CONSECUTIVE_KNOWN_THRESHOLD} 件出現したため "
                        f"Discovery を打ち切り"
                    )
                should_break = True
                break
        
        if should_break:
            break
        
        # 次のページがあるかチェック
        page_token = response.get("nextPageToken")
        if not page_token:
            break
        
        if logger:
            logger.debug(
                f"playlistItems.list ページ {page_count} 完了 "
                f"（累積: {len(video_ids)} 件, 連続既知: {consecutive_known_count}）"
            )
    
    return video_ids


# ============================================================================
# Step 3: videos.list で詳細情報取得（live アーカイブのみ）
# ============================================================================

def _fetch_video_details(
    video_ids: List[str],
    logger: Optional[logging.Logger] = None
) -> List[DiscoveredVideo]:
    """
    videos.list API で動画の詳細情報を取得
    
    liveStreamingDetails があるもののみを抽出（アーカイブ判定）。
    50件ずつ分割してリクエストを実行する。
    
    Args:
        video_ids: video_id のリスト
        logger: ロガー（オプション）
        
    Returns:
        DiscoveredVideo のリスト（live アーカイブのみ）
    """
    youtube = get_youtube_client()
    discovered_videos = []
    
    # 50件ずつ分割（YouTube API の id パラメータは最大50件）
    batch_size = 50
    for i in range(0, len(video_ids), batch_size):
        batch_ids = video_ids[i:i + batch_size]
        
        # videos.list リクエスト
        request = youtube.videos().list(
            part="snippet,liveStreamingDetails",
            id=",".join(batch_ids)
        )
        
        response = execute_api_request(request, logger=logger)
        
        # 詳細情報を抽出（liveStreamingDetails があるもののみ）
        for item in response.get("items", []):
            video_id = item.get("id")
            
            # liveStreamingDetails がない場合はスキップ（通常動画）
            live_details = item.get("liveStreamingDetails")
            if not live_details:
                continue
            
            title = item.get("snippet", {}).get("title", "")
            
            # actualStartTime（RFC 3339 形式）
            actual_start_time_str = live_details.get("actualStartTime")
            actual_start_time = None
            if actual_start_time_str:
                try:
                    # RFC 3339 → datetime（Z を +00:00 に置換してパース）
                    actual_start_time = datetime.fromisoformat(
                        actual_start_time_str.replace("Z", "+00:00")
                    ).replace(tzinfo=None)
                except Exception as e:
                    if logger:
                        logger.warning(
                            f"[{video_id}] actualStartTime のパースに失敗: {actual_start_time_str} - {e}"
                        )
            
            discovered_videos.append(
                DiscoveredVideo(
                    video_id=video_id,
                    title=title,
                    actual_start_time=actual_start_time
                )
            )
        
        if logger:
            logger.debug(f"videos.list バッチ {i // batch_size + 1} 完了")
    
    return discovered_videos
