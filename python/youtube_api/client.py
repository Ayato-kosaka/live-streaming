"""
YouTube Data API クライアントモジュール

YouTube Data API v3 を呼び出すためのクライアントを提供する。
リトライ処理・エラーハンドリングを実装。
"""

import time
from typing import Dict, Any, Optional
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
import logging

from config import YOUTUBE_API_KEY


# ============================================================================
# YouTube API クライアント
# ============================================================================

_youtube_client: Optional[Any] = None


def get_youtube_client() -> Any:
    """
    YouTube Data API クライアントを取得（シングルトン）
    
    Returns:
        YouTube API クライアント
        
    Raises:
        ValueError: API キーが未設定の場合
    """
    global _youtube_client
    
    if _youtube_client is None:
        if not YOUTUBE_API_KEY:
            raise ValueError("環境変数 YOUTUBE_API_KEY が設定されていません")
        
        _youtube_client = build('youtube', 'v3', developerKey=YOUTUBE_API_KEY)
    
    return _youtube_client


# ============================================================================
# API 呼び出しヘルパー
# ============================================================================

def execute_api_request(
    request: Any,
    max_retries: int = 3,
    logger: Optional[logging.Logger] = None
) -> Dict[str, Any]:
    """
    YouTube API リクエストを実行（リトライ付き）
    
    一時的なエラー（HTTP 503 等）は指数バックオフでリトライする。
    
    Args:
        request: YouTube API リクエストオブジェクト
        max_retries: 最大リトライ回数
        logger: ロガー（オプション）
        
    Returns:
        API レスポンス（dict）
        
    Raises:
        HttpError: API エラー（リトライ不可またはリトライ上限）
        Exception: その他の予期しないエラー
    """
    for attempt in range(max_retries):
        try:
            return request.execute()
        except HttpError as e:
            # リトライ可能なエラーコード
            if e.resp.status in [429, 500, 503]:
                if attempt < max_retries - 1:
                    wait_time = 2 ** attempt  # 指数バックオフ
                    if logger:
                        logger.warning(
                            f"YouTube API エラー（HTTP {e.resp.status}）。"
                            f"{wait_time}秒後にリトライします... (試行 {attempt + 1}/{max_retries})"
                        )
                    time.sleep(wait_time)
                    continue
            
            # リトライ不可またはリトライ上限
            if logger:
                logger.error(f"YouTube API エラー: {e}")
            raise
        except Exception as e:
            if logger:
                logger.error(f"予期しないエラー: {e}")
            raise
    
    # ここには到達しないはずだが、念のため
    raise Exception("YouTube API リクエストが失敗しました")
