"""
チャットデータパーサーモジュール

yt-dlp が出力する JSONL ファイルをパースし、正規化されたメッセージに変換する。
"""

import json
from typing import List, Tuple, Optional
from dataclasses import dataclass, field
from collections import defaultdict

from models.types import ChatMessage
from youtube_chat.normalizer import normalize_chat_item
from logging_util import VideoLogger


# ============================================================================
# パース統計
# ============================================================================

@dataclass
class ParseStats:
    """
    パース処理の統計情報
    """
    parsed_messages: int = 0
    skipped_lines: int = 0
    event_type_counts: defaultdict = field(default_factory=lambda: defaultdict(int))


# ============================================================================
# メインパーサー
# ============================================================================

def parse_chat_file(
    file_path: str,
    video_id: str,
    run_id: str,
    logger: Optional[VideoLogger] = None
) -> Tuple[List[ChatMessage], ParseStats]:
    """
    JSONL 形式のチャットファイルをパースする
    
    ストリーム読み込みで大容量ファイルにも対応。
    パース不可能な行はスキップし、統計に記録する。
    
    Args:
        file_path: JSONL ファイルパス
        video_id: 動画 ID
        run_id: 実行 ID
        logger: ロガー（オプション）
        
    Returns:
        (ChatMessage リスト, ParseStats)
        
    Raises:
        FileNotFoundError: ファイルが存在しない
        Exception: ファイル読み込みエラー
    """
    messages = []
    stats = ParseStats()
    line_no = 0
    
    with open(file_path, 'r', encoding='utf-8') as f:
        for line in f:
            line_no += 1
            
            # 空行スキップ
            if not line.strip():
                stats.skipped_lines += 1
                continue
            
            # JSON パース
            try:
                data = json.loads(line)
            except json.JSONDecodeError as e:
                if logger:
                    logger.warning(f"行 {line_no}: JSON パースエラー: {e}")
                stats.skipped_lines += 1
                continue
            
            # replayChatItemAction のチェック
            replay_action = data.get("replayChatItemAction")
            if not replay_action:
                stats.skipped_lines += 1
                continue
            
            # actions 配列の取得
            actions = replay_action.get("actions", [])
            if not actions:
                stats.skipped_lines += 1
                continue
            
            # 各 action を処理
            for action in actions:
                add_chat_item = action.get("addChatItemAction")
                if not add_chat_item:
                    continue
                
                item = add_chat_item.get("item")
                if not item:
                    continue
                
                # 正規化処理
                try:
                    message = normalize_chat_item(
                        item=item,
                        video_id=video_id,
                        run_id=run_id,
                        source_file=file_path,
                        source_line_no=line_no
                    )
                    
                    if message:
                        messages.append(message)
                        stats.parsed_messages += 1
                        stats.event_type_counts[message.event_type.value] += 1
                    else:
                        # normalize が None を返した場合（未知の renderer 等）
                        stats.skipped_lines += 1
                        
                except Exception as e:
                    if logger:
                        logger.warning(f"行 {line_no}: 正規化エラー: {e}")
                    stats.skipped_lines += 1
    
    return messages, stats
