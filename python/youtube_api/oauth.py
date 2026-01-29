"""
YouTube OAuth トークン管理モジュール（Doneru 経由）

Doneru Cloud Functions 経由で YouTube OAuth トークンを取得・管理する。
API Key ベースから Bearer Token ベースの認証に移行。
"""

import os
import time
import requests
from typing import Optional, Dict, Any
from datetime import datetime, timezone
import logging

# Doneru Cloud Functions エンドポイント
DONERU_TOKEN_URL = "https://donerutoken-3phus6cpxa-uc.a.run.app/doneruToken"
DONERU_REFRESH_URL = "https://doneruyoutuberefresh-3phus6cpxa-uc.a.run.app/doneruYoutubeRefresh"

# タイムアウト設定
REQUEST_TIMEOUT = 10  # 秒


class DoneruTokenManager:
    """
    Doneru OAuth トークンを管理するクラス
    
    トークンの取得・キャッシュ・リフレッシュを自動的に処理する。
    """
    
    def __init__(self, alertbox_key: str, logger: Optional[logging.Logger] = None):
        """
        トークンマネージャーを初期化
        
        Args:
            alertbox_key: Doneru alertbox key (EXPO_PUBLIC_DONERU_WSS_URL から取得)
            logger: ロガー（オプション）
        """
        self.alertbox_key = alertbox_key
        self.logger = logger
        self._cached_token: Optional[str] = None
        self._cached_channel: Optional[str] = None
        self._token_expires_at: Optional[int] = None
    
    def get_access_token(self) -> str:
        """
        YouTube アクセストークンを取得
        
        キャッシュされたトークンがあり、有効期限内であればそれを返す。
        期限切れまたは未取得の場合は Doneru API から新規取得する。
        
        Returns:
            YouTube アクセストークン (Bearer Token)
            
        Raises:
            ValueError: alertbox_key が未設定
            RuntimeError: トークン取得に失敗
        """
        if not self.alertbox_key:
            raise ValueError("DONERU_ALERTBOX_KEY が設定されていません")
        
        # キャッシュされたトークンが有効かチェック
        if self._is_token_valid():
            if self.logger:
                self.logger.debug("キャッシュされたトークンを使用")
            return self._cached_token  # type: ignore
        
        # 新規にトークンを取得
        if self.logger:
            self.logger.info("Doneru API から新しいトークンを取得中...")
        
        try:
            response = requests.get(
                DONERU_TOKEN_URL,
                params={
                    "type": "alertbox",
                    "key": self.alertbox_key
                },
                timeout=REQUEST_TIMEOUT
            )
            response.raise_for_status()
            
            data = response.json()
            
            # レスポンスの検証
            if "youtube" not in data:
                raise RuntimeError("Doneru API レスポンスに youtube フィールドがありません")
            
            youtube_data = data["youtube"]
            if "at" not in youtube_data or "exp" not in youtube_data:
                raise RuntimeError("Doneru API レスポンスに必要なフィールドがありません")
            
            # トークンをキャッシュ
            self._cached_token = youtube_data["at"]
            self._cached_channel = youtube_data.get("channel")
            self._token_expires_at = youtube_data["exp"]
            
            if self.logger:
                exp_time = datetime.fromtimestamp(self._token_expires_at, tz=timezone.utc)
                self.logger.info(
                    f"トークン取得成功 (期限: {exp_time.isoformat()}, "
                    f"チャンネル: {self._cached_channel})"
                )
            
            return self._cached_token
            
        except requests.exceptions.RequestException as e:
            error_msg = f"Doneru API への接続に失敗しました: {str(e)}"
            if self.logger:
                self.logger.error(error_msg)
            raise RuntimeError(error_msg) from e
        except Exception as e:
            error_msg = f"トークン取得中に予期しないエラーが発生しました: {str(e)}"
            if self.logger:
                self.logger.error(error_msg)
            raise RuntimeError(error_msg) from e
    
    def refresh_token(self) -> str:
        """
        トークンをリフレッシュ
        
        Returns:
            新しい YouTube アクセストークン
            
        Raises:
            RuntimeError: トークンリフレッシュに失敗
        """
        if self.logger:
            self.logger.info("Doneru API でトークンをリフレッシュ中...")
        
        try:
            response = requests.post(
                DONERU_REFRESH_URL,
                params={
                    "key": self.alertbox_key,
                    "type": "alertbox",
                    "version": "1.0.0"
                },
                timeout=REQUEST_TIMEOUT
            )
            response.raise_for_status()
            
            # リフレッシュ後、キャッシュをクリアして新規取得
            self._clear_cache()
            
            if self.logger:
                self.logger.info("トークンリフレッシュ成功")
            
            # 新しいトークンを取得
            return self.get_access_token()
            
        except requests.exceptions.RequestException as e:
            error_msg = f"トークンリフレッシュに失敗しました: {str(e)}"
            if self.logger:
                self.logger.error(error_msg)
            raise RuntimeError(error_msg) from e
    
    def get_channel_id(self) -> Optional[str]:
        """
        キャッシュされたチャンネルIDを取得
        
        Returns:
            チャンネルID（未取得の場合は None）
        """
        return self._cached_channel
    
    def _is_token_valid(self) -> bool:
        """
        キャッシュされたトークンが有効かチェック
        
        Returns:
            トークンが存在し、期限切れでない場合 True
        """
        if not self._cached_token or not self._token_expires_at:
            return False
        
        # 期限の5分前を有効期限とする（マージンを持たせる）
        current_time = int(time.time())
        return current_time < (self._token_expires_at - 300)
    
    def _clear_cache(self) -> None:
        """キャッシュをクリア"""
        self._cached_token = None
        self._cached_channel = None
        self._token_expires_at = None


def get_doneru_alertbox_key() -> str:
    """
    環境変数から Doneru alertbox key を取得
    
    Returns:
        Doneru alertbox key
        
    Raises:
        ValueError: 環境変数が未設定
    """
    key = os.getenv("DONERU_ALERTBOX_KEY", "")
    if not key:
        raise ValueError(
            "環境変数 DONERU_ALERTBOX_KEY が設定されていません。\n"
            "EXPO_PUBLIC_DONERU_WSS_URL から key パラメータを抽出して設定してください。"
        )
    return key
