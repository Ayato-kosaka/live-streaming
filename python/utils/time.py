"""
時間関連ユーティリティモジュール

first_seen_at を基準としたリトライ判定ロジックを提供する。
24時間ルール・7日間ルールの実装。
"""

from datetime import datetime, timedelta
from typing import Optional

from config import RETRY_DELAY_SECONDS, MAX_RETRY_PERIOD_SECONDS


def should_retry_within_24h(first_seen_at: datetime, now: Optional[datetime] = None) -> bool:
    """
    初回確認から24時間以内かどうかを判定
    
    直近のアーカイブでチャットがまだ利用できない可能性がある期間。
    この期間内なら WAITING 状態で翌日リトライを推奨。
    
    Args:
        first_seen_at: 初めて処理対象になった時刻
        now: 現在時刻（テスト用、Noneなら現在時刻を使用）
        
    Returns:
        True: 24時間以内（リトライ推奨）
        False: 24時間経過（失敗とみなすべき）
    """
    if now is None:
        now = datetime.utcnow()
    
    elapsed = now - first_seen_at
    return elapsed < timedelta(seconds=RETRY_DELAY_SECONDS)


def should_skip_after_7days(first_seen_at: datetime, now: Optional[datetime] = None) -> bool:
    """
    初回確認から7日以上経過しているかどうかを判定
    
    7日以上エラーが継続している場合は SKIPPED に移行する。
    チャットが永久に取得できない可能性が高い。
    
    Args:
        first_seen_at: 初めて処理対象になった時刻
        now: 現在時刻（テスト用、Noneなら現在時刻を使用）
        
    Returns:
        True: 7日以上経過（SKIPPED にすべき）
        False: 7日未満（リトライ継続可能）
    """
    if now is None:
        now = datetime.utcnow()
    
    elapsed = now - first_seen_at
    return elapsed >= timedelta(seconds=MAX_RETRY_PERIOD_SECONDS)


def calculate_next_retry_at(
    first_seen_at: datetime,
    now: Optional[datetime] = None
) -> datetime:
    """
    次回リトライ時刻を計算
    
    初回確認時刻 + 24時間を基準とする。
    これにより、翌日の同時刻頃に再実行される。
    
    Args:
        first_seen_at: 初めて処理対象になった時刻
        now: 現在時刻（使用しない、インターフェース統一のため保持）
        
    Returns:
        次回リトライ予定時刻
    """
    return first_seen_at + timedelta(seconds=RETRY_DELAY_SECONDS)


def get_current_utc() -> datetime:
    """
    現在のUTC時刻を取得
    
    テスト容易性のため関数化。
    
    Returns:
        現在のUTC時刻
    """
    return datetime.utcnow()
