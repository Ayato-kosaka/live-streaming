"""
yt-dlp ダウンローダーモジュール

yt-dlp を使用して YouTube ライブチャットデータをダウンロードする。
"""

import subprocess
import os
from typing import Tuple, Optional

from config import YTDLP_TIMEOUT_SECONDS, YTDLP_OUTPUT_DIR
from utils.filesystem import get_chat_file_path
from logging import getLogger

logger = getLogger(__name__)

# ============================================================================
# デバッグ用ログ出力
# ============================================================================

def log_output_files(output_dir: str, video_id: str) -> None:
    """
    yt-dlp 実行後の出力ファイル一覧をログ出力する（デバッグ用）

    Args:
        output_dir: yt-dlp の出力ディレクトリ
        video_id: 対象 video_id（絞り込み用）
    """
    try:
        if not os.path.exists(output_dir):
            logger.warning(f"出力ディレクトリが存在しません: {output_dir}")
            return

        files = sorted(
            f for f in os.listdir(output_dir)
            if video_id in f
        )

        if not files:
            logger.warning(
                f"[{video_id}] 出力ディレクトリに該当ファイルが見つかりません"
            )
            return

        logger.info(f"[{video_id}] yt-dlp 出力ファイル一覧:")
        for f in files:
            logger.info(f"  - {f}")

    except Exception as e:
        logger.warning(f"[{video_id}] 出力ファイル一覧の取得に失敗: {e}")

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
            log_output_files(YTDLP_OUTPUT_DIR, video_id)
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
