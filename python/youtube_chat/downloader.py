"""
yt-dlp ダウンローダーモジュール

yt-dlp を使用して YouTube ライブチャットデータをダウンロードする。
"""

import subprocess
import os
from typing import Tuple, Optional

from config import YTDLP_TIMEOUT_SECONDS, YTDLP_OUTPUT_DIR
from utils.filesystem import get_ytdlp_output_template


# ============================================================================
# yt-dlp チェック
# ============================================================================

def check_ytdlp_installed() -> bool:
    """
    yt-dlp がインストールされているかチェック
    
    Returns:
        True: インストール済み、False: 未インストール
    """
    try:
        result = subprocess.run(
            ["yt-dlp", "--version"],
            capture_output=True,
            text=True,
            timeout=5
        )
        return result.returncode == 0
    except Exception:
        return False


def get_ytdlp_version() -> str:
    """
    yt-dlp のバージョンを取得
    
    Returns:
        バージョン文字列（取得失敗時は "unknown"）
    """
    try:
        result = subprocess.run(
            ["yt-dlp", "--version"],
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode == 0:
            return result.stdout.strip()
        return "unknown"
    except Exception:
        return "unknown"


# ============================================================================
# チャットデータダウンロード
# ============================================================================

def download_chat_data(video_id: str) -> Tuple[bool, Optional[str]]:
    """
    yt-dlp でチャットデータをダウンロード
    
    出力先: {YTDLP_OUTPUT_DIR}/{video_id}.live_chat.json
    
    Args:
        video_id: YouTube 動画 ID
        
    Returns:
        (成功フラグ, エラーメッセージ)
        - (True, None): 成功
        - (False, エラーメッセージ): 失敗
    """
    output_template = get_ytdlp_output_template(video_id)
    
    # yt-dlp コマンド構築
    # --write-subs: 字幕をダウンロード
    # --sub-langs live_chat: ライブチャットを対象
    # --skip-download: 動画本体はダウンロードしない
    # --no-warnings: 警告を抑制
    cmd = [
        "yt-dlp",
        "--write-subs",
        "--sub-langs", "live_chat",
        "--skip-download",
        "--no-warnings",
        "-o", output_template,
        f"https://www.youtube.com/watch?v={video_id}"
    ]
    
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=YTDLP_TIMEOUT_SECONDS
        )
        
        if result.returncode == 0:
            return (True, None)
        else:
            error_msg = f"yt-dlp 終了コード {result.returncode}\n{result.stderr}"
            return (False, error_msg)
            
    except subprocess.TimeoutExpired:
        error_msg = f"yt-dlp がタイムアウトしました（{YTDLP_TIMEOUT_SECONDS}秒）"
        return (False, error_msg)
    except Exception as e:
        error_msg = f"yt-dlp 実行エラー: {type(e).__name__}: {str(e)}"
        return (False, error_msg)
