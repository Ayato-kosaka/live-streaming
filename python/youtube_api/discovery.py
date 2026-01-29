"""
YouTube 動画 Discovery モジュール

YouTube Data API を使用して completed（アーカイブ）動画を検索・取得する。
GAS の処理を Python に移植した実装。
"""

from datetime import datetime, timedelta
from typing import List, Optional
import logging

from youtube_api.client import get_youtube_client, execute_api_request
from models.types import DiscoveredVideo
from config import YOUTUBE_CHANNEL_ID, DISCOVERY_LOOKBACK_DAYS


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
    1. search.list で completed 動画の video_id を収集（ページング対応）
    2. videos.list で詳細情報（title, actualStartTime）を取得
    3. DiscoveredVideo オブジェクトのリストとして返す
    
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
    
    # Step 1: search.list で video_id を収集
    video_ids = _search_completed_videos(lookback_days, logger)
    
    if not video_ids:
        if logger:
            logger.info("completed 動画が見つかりませんでした")
        return []
    
    if logger:
        logger.info(f"search.list で {len(video_ids)} 件の動画を発見")
    
    # Step 2: videos.list で詳細情報を取得
    discovered_videos = _fetch_video_details(video_ids, logger)
    
    # Step 3: actual_start_time でソート（昇順、無いものは末尾）
    discovered_videos.sort(
        key=lambda v: (v.actual_start_time is None, v.actual_start_time or datetime.max)
    )
    
    if logger:
        logger.info(f"videos.list で {len(discovered_videos)} 件の詳細情報を取得")
    
    return discovered_videos


# ============================================================================
# Step 1: search.list で video_id 収集
# ============================================================================

def _search_completed_videos(
    lookback_days: int,
    logger: Optional[logging.Logger] = None
) -> List[str]:
    """
    search.list API で completed 動画の video_id を収集
    
    Args:
        lookback_days: 何日前までの動画を検索するか
        logger: ロガー（オプション）
        
    Returns:
        video_id のリスト
    """
    youtube = get_youtube_client()
    
    # publishedAfter: 現在時刻 - lookback_days
    published_after = datetime.utcnow() - timedelta(days=lookback_days)
    published_after_str = published_after.strftime("%Y-%m-%dT%H:%M:%SZ")
    
    video_ids = []
    page_token = None
    page_count = 0
    
    while True:
        page_count += 1
        
        # search.list リクエスト
        request = youtube.search().list(
            part="snippet",
            channelId=YOUTUBE_CHANNEL_ID,
            type="video",
            eventType="completed",
            maxResults=50,
            pageToken=page_token,
            publishedAfter=published_after_str
        )
        
        response = execute_api_request(request, logger=logger)
        
        # video_id を抽出
        for item in response.get("items", []):
            video_id = item.get("id", {}).get("videoId")
            if video_id:
                video_ids.append(video_id)
        
        # 次のページがあるかチェック
        page_token = response.get("nextPageToken")
        if not page_token:
            break
        
        if logger:
            logger.debug(f"search.list ページ {page_count} 完了（{len(video_ids)} 件累積）")
    
    return video_ids


# ============================================================================
# Step 2: videos.list で詳細情報取得
# ============================================================================

def _fetch_video_details(
    video_ids: List[str],
    logger: Optional[logging.Logger] = None
) -> List[DiscoveredVideo]:
    """
    videos.list API で動画の詳細情報を取得
    
    50件ずつ分割してリクエストを実行する。
    
    Args:
        video_ids: video_id のリスト
        logger: ロガー（オプション）
        
    Returns:
        DiscoveredVideo のリスト
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
        
        # 詳細情報を抽出
        for item in response.get("items", []):
            video_id = item.get("id")
            title = item.get("snippet", {}).get("title", "")
            
            # actualStartTime（RFC 3339 形式）
            actual_start_time_str = item.get("liveStreamingDetails", {}).get("actualStartTime")
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
