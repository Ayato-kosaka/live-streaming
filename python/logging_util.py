"""
ログユーティリティモジュール

実行単位の run_id を付与し、動画単位のプレフィックスで構造化ログを出力する。
"""

import logging
import sys
import uuid
from typing import Optional

from config import LOG_LEVEL

# ============================================================================
# グローバル run_id
# ============================================================================

# 1実行で1つの run_id を発行し、全ログと chat_messages.ingest_run_id に使用
_RUN_ID: str = str(uuid.uuid4())


def get_run_id() -> str:
    """現在の実行の run_id を取得"""
    return _RUN_ID


# ============================================================================
# ロガーセットアップ
# ============================================================================

def setup_logger(name: str = "youtube_chat_fetcher") -> logging.Logger:
    """
    ロガーを初期化する
    
    Args:
        name: ロガー名
        
    Returns:
        設定済みロガー
    """
    logger = logging.getLogger(name)
    logger.setLevel(LOG_LEVEL)
    
    # ハンドラがまだ設定されていない場合のみ追加
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setLevel(LOG_LEVEL)
        
        # フォーマット: [run_id] LEVEL - message
        formatter = logging.Formatter(
            f"[{_RUN_ID[:8]}] %(levelname)s - %(message)s"
        )
        handler.setFormatter(formatter)
        logger.addHandler(handler)
    
    return logger


# ============================================================================
# 動画単位のログプレフィックス付きロガー
# ============================================================================

class VideoLogger:
    """
    動画単位のログ出力をサポートするロガーラッパー
    
    各ログメッセージに video_id プレフィックスを自動付与する。
    """
    
    def __init__(self, video_id: str, logger: Optional[logging.Logger] = None):
        """
        Args:
            video_id: 動画ID
            logger: ベースロガー（Noneの場合はデフォルトロガーを使用）
        """
        self.video_id = video_id
        self.logger = logger or setup_logger()
    
    def _format_message(self, message: str) -> str:
        """メッセージに video_id プレフィックスを付与"""
        return f"[{self.video_id}] {message}"
    
    def debug(self, message: str) -> None:
        self.logger.debug(self._format_message(message))
    
    def info(self, message: str) -> None:
        self.logger.info(self._format_message(message))
    
    def warning(self, message: str) -> None:
        self.logger.warning(self._format_message(message))
    
    def error(self, message: str) -> None:
        self.logger.error(self._format_message(message))
    
    def critical(self, message: str) -> None:
        self.logger.critical(self._format_message(message))
