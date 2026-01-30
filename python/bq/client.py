"""
BigQuery クライアント生成モジュール

BigQuery クライアントの初期化を一元管理する。
"""

from google.cloud import bigquery
from typing import Optional

from config import BQ_PROJECT_ID


_client: Optional[bigquery.Client] = None


def get_bigquery_client() -> bigquery.Client:
    """
    BigQuery クライアントを取得（シングルトン）
    
    複数回呼ばれても同じインスタンスを返す。
    
    Returns:
        BigQuery クライアント
    """
    global _client
    if _client is None:
        _client = bigquery.Client(project=BQ_PROJECT_ID)
    return _client


def close_bigquery_client() -> None:
    """
    BigQuery クライアントをクローズ
    
    実行終了時のクリーンアップに使用。
    """
    global _client
    if _client is not None:
        _client.close()
        _client = None
