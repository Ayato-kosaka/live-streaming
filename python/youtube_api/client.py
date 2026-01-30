"""
YouTube Data API クライアントモジュール

YouTube Data API v3 を呼び出すためのクライアントを提供する。
Bearer Token (OAuth) 認証に対応。リトライ処理・エラーハンドリングを実装。
"""

import time
from typing import Dict, Any, Optional
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from googleapiclient.http import HttpRequest
import google.auth.credentials
import logging

from youtube_api.oauth import DoneruTokenManager, get_doneru_alertbox_key


# ============================================================================
# YouTube API クライアント
# ============================================================================

_youtube_client: Optional[Any] = None
_token_manager: Optional[DoneruTokenManager] = None


class BearerTokenCredentials(google.auth.credentials.Credentials):
    """
    Bearer Token を使用する認証クレデンシャル
    
    OAuth の Bearer Token を使用して YouTube Data API にアクセスする。
    Doneru 経由で取得したトークンを使用。
    """
    
    def __init__(self, token_manager: DoneruTokenManager):
        """
        クレデンシャルを初期化
        
        Args:
            token_manager: Doneru トークンマネージャー
        """
        super().__init__()
        self.token_manager = token_manager
        self.token = None
    
    def refresh(self, request):
        """
        トークンをリフレッシュ
        
        Args:
            request: google.auth.transport.Request オブジェクト（未使用）
        """
        self.token = self.token_manager.get_access_token()
    
    def apply(self, headers, token=None):
        """
        ヘッダーに認証情報を追加
        
        Args:
            headers: HTTP ヘッダーの辞書
            token: トークン（オプション、指定されない場合は self.token を使用）
        """
        auth_token = token or self.token
        headers['authorization'] = f'Bearer {auth_token}'
    
    def before_request(self, request, method, url, headers):
        """
        リクエスト送信前の処理
        
        Args:
            request: HTTP リクエストオブジェクト
            method: HTTP メソッド
            url: リクエスト URL
            headers: HTTP ヘッダー
        """
        self.apply(headers)


def get_youtube_client() -> Any:
    """
    YouTube Data API クライアントを取得（シングルトン）
    
    Bearer Token (OAuth) 認証を使用する。
    Doneru 経由で取得したトークンを使用してクライアントを構築。
    
    Returns:
        YouTube API クライアント
        
    Raises:
        ValueError: DONERU_ALERTBOX_KEY が未設定の場合
        RuntimeError: トークン取得に失敗した場合
    """
    global _youtube_client, _token_manager
    
    if _youtube_client is None:
        # Doneru トークンマネージャーを初期化
        alertbox_key = get_doneru_alertbox_key()
        _token_manager = DoneruTokenManager(alertbox_key)
        
        # 初回トークン取得
        access_token = _token_manager.get_access_token()
        
        # Bearer Token クレデンシャルを作成
        credentials = BearerTokenCredentials(_token_manager)
        credentials.token = access_token
        
        # YouTube API クライアントを構築
        _youtube_client = build('youtube', 'v3', credentials=credentials)
    
    return _youtube_client


def reset_youtube_client() -> None:
    """
    YouTube API クライアントをリセット
    
    トークン更新後など、クライアントを再初期化する必要がある場合に使用。
    """
    global _youtube_client, _token_manager
    _youtube_client = None
    _token_manager = None


def execute_api_request(
    request: Any,
    max_retries: int = 3,
    logger: Optional[logging.Logger] = None,
    token_refresh_callback: Optional[callable] = None
) -> Dict[str, Any]:
    """
    YouTube API リクエストを実行（リトライ付き）
    
    一時的なエラー（HTTP 503 等）は指数バックオフでリトライする。
    401 Unauthorized の場合はトークンをリフレッシュして再試行する。
    
    Args:
        request: YouTube API リクエストオブジェクト
        max_retries: 最大リトライ回数
        logger: ロガー（オプション）
        token_refresh_callback: トークンリフレッシュ時のコールバック（オプション）
        
    Returns:
        API レスポンス（dict）
        
    Raises:
        HttpError: API エラー（リトライ不可またはリトライ上限）
        Exception: その他の予期しないエラー
    """
    global _token_manager
    
    for attempt in range(max_retries):
        try:
            return request.execute()
        except HttpError as e:
            # 401 Unauthorized - トークンリフレッシュが必要
            if e.resp.status == 401:
                if attempt < max_retries - 1 and _token_manager:
                    if logger:
                        logger.warning(
                            f"YouTube API 認証エラー (HTTP 401)。"
                            f"トークンをリフレッシュして再試行します... (試行 {attempt + 1}/{max_retries})"
                        )
                    try:
                        # トークンをリフレッシュ
                        _token_manager.refresh_token()
                        # クライアントをリセット（新しいトークンで再構築）
                        reset_youtube_client()
                        
                        if logger:
                            logger.info("トークンリフレッシュ完了。次の試行で新しいトークンが使用されます。")
                        
                        # コールバックを実行（呼び出し元が新しいクライアントで request を再構築できる）
                        if token_refresh_callback:
                            token_refresh_callback()
                        
                        # NOTE: request オブジェクトは古いクライアントに紐づいているため、
                        # このままでは新しいトークンが使われない。
                        # 呼び出し元でこの例外をキャッチし、新しいクライアントで request を再構築する必要がある。
                        if logger:
                            logger.warning(
                                "401 エラーは解決できません。呼び出し元で新しいクライアントを使って再試行してください。"
                            )
                    except Exception as refresh_error:
                        if logger:
                            logger.error(f"トークンリフレッシュに失敗: {refresh_error}")
                # 401 の場合は常に raise（呼び出し元で再試行が必要）
                raise
            
            # リトライ可能なエラーコード（429: Too Many Requests, 500/503: Server Error）
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
