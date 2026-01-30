"""
バッチ処理ユーティリティモジュール

BigQuery への大量データ投入時に、適切なサイズで分割する。
"""

from typing import List, Iterator, TypeVar

from config import MAX_MERGE_BATCH_SIZE

T = TypeVar('T')


def batch_items(items: List[T], batch_size: int = MAX_MERGE_BATCH_SIZE) -> Iterator[List[T]]:
    """
    リストを指定サイズのバッチに分割
    
    BigQuery のリクエストサイズ制限を回避するため、
    大量のレコードを複数回に分けて MERGE する。
    
    Args:
        items: 分割対象のリスト
        batch_size: バッチサイズ（デフォルトは設定値）
        
    Yields:
        batch_size 個ずつのリスト
        
    Example:
        >>> items = list(range(10))
        >>> for batch in batch_items(items, batch_size=3):
        ...     print(batch)
        [0, 1, 2]
        [3, 4, 5]
        [6, 7, 8]
        [9]
    """
    for i in range(0, len(items), batch_size):
        yield items[i:i + batch_size]


def count_batches(total_items: int, batch_size: int = MAX_MERGE_BATCH_SIZE) -> int:
    """
    必要なバッチ数を計算
    
    Args:
        total_items: 総アイテム数
        batch_size: バッチサイズ
        
    Returns:
        必要なバッチ数
    """
    if total_items == 0:
        return 0
    return (total_items + batch_size - 1) // batch_size
