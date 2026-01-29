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


def get_chat_file_candidates(video_id: str, output_dir: Optional[str] = None) -> list[str]:
    """
    指定された動画IDに対応するチャットデータファイルの候補リストを取得する。

    Args:
        video_id: 動画ID
        output_dir: 出力ディレクトリパス（Noneの場合は設定値を使用）
    Returns:
        チャットデータファイルのパスリスト
    """
    dir_path = output_dir or YTDLP_OUTPUT_DIR

    patterns = [
        os.path.join(dir_path, f"{video_id}*live_chat*.jsonl"),
        os.path.join(dir_path, f"{video_id}*live_chat*.json"),
        os.path.join(dir_path, f"{video_id}*live_chat*.*"),
    ]

    found: list[str] = []
    for p in patterns:
        found.extend(glob.glob(p))

    # 重複排除しつつ安定順序
    uniq = sorted(set(found))
    return uniq


def find_chat_file_path(video_id: str, output_dir: Optional[str] = None) -> Optional[str]:
    """
    見つかったチャットファイルのうち、最も優先度の高い1つを返す。
    """
    candidates = get_chat_file_candidates(video_id, output_dir)
    return candidates[0] if candidates else None


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
    return find_chat_file_path(video_id, output_dir) is not None


def get_ytdlp_output_template(video_id: str, output_dir: Optional[str] = None) -> str:
    """
    yt-dlp に渡す output template を返す。
    拡張子は yt-dlp が決めるため %(ext)s を使う。
    """
    dir_path = output_dir or YTDLP_OUTPUT_DIR
    return os.path.join(dir_path, f"{video_id}.%(ext)s")


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
    dir_path = output_dir or YTDLP_OUTPUT_DIR
    try:
        candidates = get_chat_file_candidates(video_id, dir_path)
        for fp in candidates:
            if os.path.isfile(fp):
                os.remove(fp)
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
