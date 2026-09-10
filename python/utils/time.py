"""
時間関連ユーティリティモジュール

first_seen_at を基準としたリトライ判定ロジックを提供する。
7日間ルールと、次回リトライ時刻の置きかた。

## 24時間ルールをやめた（2026-09-10）

もともと `should_retry_within_24h()` があり、`handle_no_chat_file` は
「24h + ぶれ3時間 以内なら WAITING、それを過ぎたら FAILED」で分けていた。

**日に1回しか走らないジョブでは、この窓は1回しか通らない。**
経過時間は 0h → 約22h → 約46h と飛ぶので、2回目の判定はもう 27h の外にいる。
その結果、チャットがまだ YouTube 側に出ていないだけの配信が2晩目で FAILED になり、
docstring が言う「7日間は拾い直す」に**構造上ぜったい到達しなかった**。

チャットのファイルが無い／0件は**エラーではなく「まだ出ていない」**なので、
7日のあいだは WAITING のままにする。本物のエラー（yt-dlp の失敗・パース失敗・
BigQuery の失敗）は `handle_failure` が引き続き FAILED に倒す。
"""

from datetime import datetime, timedelta
from typing import Optional

from config import RETRY_DELAY_SECONDS, MAX_RETRY_PERIOD_SECONDS, CRON_JITTER_SECONDS


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
    
    初回確認時刻 + 24時間から、**定時実行のぶれのぶんだけ手前に置く。**

    きっかり24時間後に置くと、翌晩のジョブが前の晩より少しでも早く走った
    ときに拾われず、まる1日待つことになる（`CRON_JITTER_SECONDS` に実例）。
    選ぶのは「翌日のジョブで拾われること」であって、24時間という数字そのもの
    ではない。日に1回しか走らないので、手前に置いても同じ晩に二度拾わない。

    Args:
        first_seen_at: 初めて処理対象になった時刻
        now: 現在時刻（使用しない、インターフェース統一のため保持）
        
    Returns:
        次回リトライ予定時刻
    """
    return first_seen_at + timedelta(seconds=RETRY_DELAY_SECONDS - CRON_JITTER_SECONDS)


def get_current_utc() -> datetime:
    """
    現在のUTC時刻を取得
    
    テスト容易性のため関数化。
    
    Returns:
        現在のUTC時刻
    """
    return datetime.utcnow()
