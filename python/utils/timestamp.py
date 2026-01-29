"""
タイムスタンプ変換ユーティリティ

BigQuery との相互運用性を保証するための datetime 変換関数を提供
"""

from datetime import datetime, timezone
from typing import Optional


def to_rfc3339(dt: Optional[datetime]) -> Optional[str]:
    """
    datetime を BigQuery 互換の RFC3339 形式文字列に変換
    
    BigQuery の TIMESTAMP 型は RFC3339 形式を要求する。
    ArrayQueryParameter + STRUCT では datetime オブジェクトを直接渡せないため、
    Python 側で文字列に変換し、SQL側で SAFE_CAST(...AS TIMESTAMP) で変換する。
    
    変換仕様:
    - None → None
    - timezone-aware datetime → RFC3339 (例: "2024-01-29T10:00:00Z")
    - timezone-naive datetime → UTC とみなして RFC3339 に変換
    
    例:
        >>> from datetime import datetime, timezone
        >>> dt = datetime(2024, 1, 29, 10, 0, 0, tzinfo=timezone.utc)
        >>> to_rfc3339(dt)
        '2024-01-29T10:00:00Z'
        
        >>> dt_naive = datetime(2024, 1, 29, 10, 0, 0)
        >>> to_rfc3339(dt_naive)  # UTC とみなす
        '2024-01-29T10:00:00Z'
    
    Args:
        dt: datetime オブジェクト or None
    
    Returns:
        RFC3339 形式の文字列 or None
        
    Notes:
        - BigQuery は UTC 以外のタイムゾーンでも受け付けるが、統一性のため UTC (Z付き) を推奨
        - SAFE_CAST が失敗した場合は NULL になるため、不正な形式でもクエリは落ちない
    """
    if dt is None:
        return None
    
    # naive datetime の場合は UTC を付与
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    
    # isoformat() で RFC3339 形式に変換し、+00:00 を Z に置換
    # 例: "2024-01-29T10:00:00+00:00" → "2024-01-29T10:00:00Z"
    return dt.isoformat().replace("+00:00", "Z")
