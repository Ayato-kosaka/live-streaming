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

# 有効期限のマージン（この秒数以内に切れるトークンは期限切れ扱い）
TOKEN_EXPIRY_MARGIN = 300  # 秒

# リフレッシュの最小間隔（Doneru 側が常に期限切れトークンを返す場合の連打防止）
MIN_REFRESH_INTERVAL = 60  # 秒

# exp をミリ秒とみなす閾値
# UNIX 秒でこの値を超えるのは西暦 5138 年以降なので、
# これを超えていればミリ秒で返ってきたと判断する。
EXPIRY_MILLISECONDS_THRESHOLD = 10 ** 11


def _normalize_expiry(
    raw_exp: Any,
    logger: Optional[logging.Logger] = None
) -> Optional[int]:
    """
    Doneru が返す exp を UNIX 秒に正規化する

    Doneru は exp をミリ秒で返す。秒として扱うと期限が遥か未来になり、
    期限切れのトークンを「まだ有効」と誤判定してリフレッシュしなくなるため、
    ここで秒に揃える。

    Args:
        raw_exp: Doneru API が返した exp（数値または数値文字列）
        logger: ロガー（オプション）

    Returns:
        UNIX 秒の有効期限（解釈できない場合は None）
    """
    try:
        value = int(raw_exp)
    except (TypeError, ValueError):
        if logger:
            logger.warning(
                f"Doneru API の exp を数値として解釈できませんでした: {raw_exp!r}。"
                "期限不明として扱います。"
            )
        return None

    if value > EXPIRY_MILLISECONDS_THRESHOLD:
        # ミリ秒で返ってきているので秒に変換する
        value //= 1000

    return value


class DoneruTokenManager:
    """
    Doneru OAuth トークンを管理するクラス
    
    トークンの取得・キャッシュ・リフレッシュを自動的に処理する。
    
    Doneru は自身のキャッシュしたアクセストークンをそのまま返すため、
    誰も Doneru を利用していない時間帯（深夜のバッチ実行など）は
    既に期限切れのトークンが返ることがある。
    そのまま YouTube API を呼ぶと必ず HTTP 401 になるため、
    取得したトークンの exp を検査し、期限切れならリフレッシュしてから返す。
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
        self._last_refresh_at: Optional[float] = None
    
    def get_access_token(self) -> str:
        """
        YouTube アクセストークンを取得
        
        キャッシュされたトークンがあり、有効期限内であればそれを返す。
        期限切れまたは未取得の場合は Doneru API から新規取得する。
        取得したトークンが既に期限切れだった場合はリフレッシュを要求して取り直す。
        
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
        
        token = self._fetch_token()
        
        # Doneru が期限切れのトークンを返した場合はリフレッシュして取り直す
        if not self._is_token_valid() and self._can_refresh():
            if self.logger:
                self.logger.warning(
                    "Doneru から取得したトークンは既に期限切れです。"
                    "リフレッシュして取り直します。"
                )
            return self.refresh_token()
        
        return token
    
    def refresh_token(self) -> str:
        """
        トークンをリフレッシュ
        
        Doneru にリフレッシュを要求し、新しいトークンを取得し直す。
        
        Returns:
            新しい YouTube アクセストークン
            
        Raises:
            RuntimeError: トークンリフレッシュに失敗
        """
        # 直前にリフレッシュ済みで有効なトークンを保持している場合は再利用する
        # （google-auth 側の 401 リトライと execute_api_request の 401 リトライが
        #   短時間に重なった際に Doneru へリフレッシュを連打しないため）
        if not self._can_refresh() and self._is_token_valid():
            if self.logger:
                self.logger.info("直前にリフレッシュ済みのため、取得済みトークンを再利用します")
            return self._cached_token  # type: ignore
        
        if self.logger:
            self.logger.info("Doneru API でトークンをリフレッシュ中...")
        
        self._last_refresh_at = time.monotonic()
        
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
            
        except requests.exceptions.RequestException as e:
            error_msg = f"トークンリフレッシュに失敗しました: {str(e)}"
            if self.logger:
                self.logger.error(error_msg)
            raise RuntimeError(error_msg) from e
        
        # 新しいトークンを取得（ここでは再リフレッシュしない）
        token = self._fetch_token()
        
        if not self._is_token_valid() and self.logger:
            self.logger.warning(
                "リフレッシュ後も期限切れのトークンが返されました。"
                "Doneru 側の YouTube 連携が切れている可能性があります。"
            )
        
        return token
    
    def get_channel_id(self) -> Optional[str]:
        """
        キャッシュされたチャンネルIDを取得
        
        Returns:
            チャンネルID（未取得の場合は None）
        """
        return self._cached_channel
    
    def _fetch_token(self) -> str:
        """
        Doneru API からトークンを取得してキャッシュする
        
        Returns:
            YouTube アクセストークン（期限切れの可能性あり）
            
        Raises:
            RuntimeError: トークン取得に失敗
        """
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
            self._token_expires_at = _normalize_expiry(
                youtube_data["exp"], self.logger
            )
            
            if self.logger:
                if self._token_expires_at is None:
                    self.logger.info(
                        f"トークン取得成功 (期限: 不明, "
                        f"チャンネル: {self._cached_channel})"
                    )
                else:
                    exp_time = datetime.fromtimestamp(
                        self._token_expires_at, tz=timezone.utc
                    )
                    remaining = self._token_expires_at - int(time.time())
                    self.logger.info(
                        f"トークン取得成功 (期限: {exp_time.isoformat()}, "
                        f"残り {remaining} 秒, チャンネル: {self._cached_channel})"
                    )
            
            return self._cached_token
            
        except requests.exceptions.RequestException as e:
            error_msg = f"Doneru API への接続に失敗しました: {str(e)}"
            if self.logger:
                self.logger.error(error_msg)
            raise RuntimeError(error_msg) from e
        except RuntimeError:
            raise
        except Exception as e:
            error_msg = f"トークン取得中に予期しないエラーが発生しました: {str(e)}"
            if self.logger:
                self.logger.error(error_msg)
            raise RuntimeError(error_msg) from e
    
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
        return current_time < (self._token_expires_at - TOKEN_EXPIRY_MARGIN)
    
    def _can_refresh(self) -> bool:
        """
        リフレッシュを実行してよいかチェック（連打防止）
        
        Returns:
            前回のリフレッシュから MIN_REFRESH_INTERVAL 秒以上経過している場合 True
        """
        if self._last_refresh_at is None:
            return True
        return (time.monotonic() - self._last_refresh_at) >= MIN_REFRESH_INTERVAL
    
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
