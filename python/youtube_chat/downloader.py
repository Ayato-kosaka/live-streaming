"""
yt-dlp ダウンローダーモジュール

yt-dlp を使用して YouTube ライブチャットデータをダウンロードする。
"""

import subprocess
import os
from typing import Tuple, Optional

from config import YTDLP_TIMEOUT_SECONDS, YTDLP_OUTPUT_DIR, YTDLP_COOKIES_PATH
from utils.filesystem import get_chat_file_path


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
    output_template = get_chat_file_path(video_id)
    
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
    ]

    if YTDLP_COOKIES_PATH:
        if os.path.exists(YTDLP_COOKIES_PATH):
            cmd += ["--cookies", YTDLP_COOKIES_PATH]
        else:
            # cookies パスが指定されているのに存在しない場合は失敗させた方が原因が分かりやすい
            return (False, f"cookies ファイルが見つかりません: {YTDLP_COOKIES_PATH}")

    cmd += [
        "-o", output_template,
        f"https://www.youtube.com/watch?v={video_id}",
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

        error_msg = f"yt-dlp 終了コード {result.returncode}\n{result.stderr}"
        return (False, error_msg)

    except subprocess.TimeoutExpired:
        return (False, f"yt-dlp がタイムアウトしました（{YTDLP_TIMEOUT_SECONDS}秒）")
    except Exception as e:
        return (False, f"yt-dlp 実行エラー: {type(e).__name__}: {str(e)}")
