"""
ファイルシステムユーティリティモジュール

作業ディレクトリの管理、ファイル存在確認などを提供する。
"""

import os
import shutil
from pathlib import Path
from typing import Optional

from config import YTDLP_OUTPUT_DIR


def ensure_output_directory(output_dir: Optional[str] = None) -> str:
    """
    出力ディレクトリを作成（既存の場合は何もしない）
    
    Args:
        output_dir: 出力ディレクトリパス（Noneの場合は設定値を使用）
        
    Returns:
        作成/確認したディレクトリの絶対パス
    """
    dir_path = output_dir or YTDLP_OUTPUT_DIR
    Path(dir_path).mkdir(parents=True, exist_ok=True)
    return os.path.abspath(dir_path)


def get_chat_file_path(video_id: str, output_dir: Optional[str] = None) -> str:
    """
    チャットデータファイルのパスを取得
    
    yt-dlp が生成するファイル名規則に従う。
    
    Args:
        video_id: 動画ID
        output_dir: 出力ディレクトリパス（Noneの場合は設定値を使用）
        
    Returns:
        チャットデータファイルの絶対パス
    """
    dir_path = output_dir or YTDLP_OUTPUT_DIR
    return os.path.join(dir_path, f"{video_id}.live_chat.json")


def chat_file_exists(video_id: str, output_dir: Optional[str] = None) -> bool:
    """
    チャットデータファイルが存在するかチェック
    
    Args:
        video_id: 動画ID
        output_dir: 出力ディレクトリパス（Noneの場合は設定値を使用）
        
    Returns:
        True: ファイルが存在する
        False: ファイルが存在しない
    """
    file_path = get_chat_file_path(video_id, output_dir)
    return os.path.exists(file_path) and os.path.isfile(file_path)


def cleanup_chat_file(video_id: str, output_dir: Optional[str] = None) -> bool:
    """
    チャットデータファイルを削除
    
    処理完了後のクリーンアップに使用。
    
    Args:
        video_id: 動画ID
        output_dir: 出力ディレクトリパス（Noneの場合は設定値を使用）
        
    Returns:
        True: 削除成功（または元々存在しない）
        False: 削除失敗
    """
    file_path = get_chat_file_path(video_id, output_dir)
    try:
        if os.path.exists(file_path):
            os.remove(file_path)
        return True
    except Exception:
        return False


def cleanup_output_directory(output_dir: Optional[str] = None) -> bool:
    """
    出力ディレクトリ全体を削除
    
    実行終了時のクリーンアップに使用。
    
    Args:
        output_dir: 出力ディレクトリパス（Noneの場合は設定値を使用）
        
    Returns:
        True: 削除成功（または元々存在しない）
        False: 削除失敗
    """
    dir_path = output_dir or YTDLP_OUTPUT_DIR
    try:
        if os.path.exists(dir_path):
            shutil.rmtree(dir_path)
        return True
    except Exception:
        return False
