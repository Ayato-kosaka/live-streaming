"""yt-dlp が「混んでいる」で落ちたときに、**同じ回の中で待って撃ち直す**ための決めごと。

## なぜ要るか（2026-09-20 の本番ログ）

到着日の配信が、毎晩こう落ちていた（run 35540598628 / 実測）。

    22:06:54.05  [GBYHxJQGlCY] 試行回数: 1
    22:06:54.05  yt-dlp でチャットデータをダウンロード中...
    22:06:59.50  ERROR: Unable to download video subtitles for 'live_chat':
                 HTTP Error 429: Too Many Requests
    22:06:59.50  処理失敗のため FAILED

**1回叩いて、5.4秒で諦めていた。** そのあと FAILED になると次に拾われるのは
翌晩なので（`utils.time.calculate_next_retry_at`）、**1晩に1発しか撃てない。**
429 は「混んでいるから少し待て」なので、少し待って撃ち直せば通る見込みがある。
なのに、その道がどこにも無かった。

**7晩続けて落ちると `SKIPPED` に落ちて二度と拾われない**（7日ルール）。
1晩に1発しか撃てないということは、**7発で打ち止め**ということでもある。

## 晩の回数（`attempt_count`）には足さない

`attempt_count` は BigQuery の `videos` が持っている**晩ごとの回数**で、
7日ルールの勘定に使われる。晩の中の撃ち直しをここに足すと、
**粘った晩ほど早く打ち止めになる。** だからこのモジュールは
`attempt_count` に一切触らない（増やすのは
`bq.repository.mark_video_processing_started` だけで、それは1晩に1回）。
"""

from __future__ import annotations

import time
from typing import Final, Optional, Tuple


# ============================================================================
# 「混んでいる」の見分け
# ============================================================================

# **終了コードでは分けられない。** yt-dlp は、動画が消えていても・チャットが
# 無くても・Cookie が切れていても、ぜんぶ終了コード 1 で返す。
# 見分けるものはメッセージしかないので、字で当てる（小文字にしてから）。
#
# **ここに広い字を入れない。** 「混んでいる」以外を撃ち直しても通らないうえ、
# 叩くほど嫌われる。"error" や "failed" のような字は、消えた動画や切れた
# Cookie まで拾ってしまうので入れていない。
RATE_LIMIT_MARKERS: Final[Tuple[str, ...]] = (
    "http error 429",     # 実際に本番で出た字（yt-dlp の字幕ダウンロード）
    "error 429",          # 別の経路（`HTTPError 429` / `got error 429` など）
    "429: too many requests",
    "too many requests",  # 429 の本文だけが出ることがある
    "rate limit",
    "rate-limit",
    "ratelimit",
    "rate exceeded",
)


def is_rate_limited(error_msg: Optional[str]) -> bool:
    """その失敗が「混んでいる」かどうか。

    **ここが広がると、通らない失敗を何度も叩くことになる。**
    迷ったら False（＝1回で諦めて翌晩へ回す）に倒す。翌晩に回しても
    7日の窓は残るが、嫌われたぶんは戻ってこない。
    """
    if not error_msg:
        return False
    low = error_msg.lower()
    return any(marker in low for marker in RATE_LIMIT_MARKERS)


# ============================================================================
# 待ち時間と上限
# ============================================================================

# **撃ち直しまでの待ち（秒）。等間隔にしない。**
#
# 等間隔だと、混み具合が続いているあいだ同じ頻度で叩き続けることになる。
# 相手が「少し待て」と言っているのだから、こちらの間隔も延ばす。
#
#   20秒 … 1回目。落ちるのに 5.4秒しかかかっていないので、20秒足しても
#          その晩の仕事は 13秒 → 40秒程度にしかならない（2026-09-20 実測）。
#          瞬間的な混みなら、たいていここで抜ける
#   60秒 … 2回目。1分の山（同じ分に別のジョブが叩いている類）を跨ぐ長さ
#  150秒 … 3回目。ここまでで待ちの合計が 230秒。これを超えて粘るのは、
#          「混んでいる」ではなく「しばらく駄目」なので、翌晩に回すほうが通る
RETRY_WAITS_SECONDS: Final[Tuple[int, ...]] = (20, 60, 150)

# **1本で粘ってよい合計（秒）。**
#
# 待ちの合計 230秒 ＋ 速く落ちる撃ち直し3回ぶん（5.4秒 × 3 ≒ 16秒）が
# ちょうど入る大きさ。撃ち直しのほうが長引いた晩は、ここに当たって
# 最後の待ちに入らず FAILED で翌晩へ回る（**24時間ルールは壊さない**）。
PER_VIDEO_BUDGET_SECONDS: Final[int] = 300

# **1回のジョブ全体で粘ってよい合計（秒）。**
#
# 1本ぶんの上限だけでは足りない。429 は1本にだけ出るものではないので、
# 取りこぼしを拾う晩（`LATE_LANE_MAX_VIDEOS` は 20本）に全部が 429 だと
# 20 × 5分 = 100分 になり、後ろの `island_stats` が1時間以上止まる。
#
# 平常の取り込みは**まるごと 13秒**（2026-09-20 実測）なので、
# 15分は「混んだ晩だけ、そこまでなら足してよい」という上限として置いた。
PER_RUN_BUDGET_SECONDS: Final[int] = 900


class RetryBudget:
    """同じ回の中で粘ってよい時間の財布。

    1本ぶん（`per_video`）と、回ぜんたい（`run_left`）の両方を見る。
    **回ぜんたいのぶんは動画をまたいで減る**ので、ジョブの頭で1つ作って
    最後まで持ち回る。
    """

    def __init__(
        self,
        per_video: float = PER_VIDEO_BUDGET_SECONDS,
        per_run: float = PER_RUN_BUDGET_SECONDS,
        waits: Tuple[int, ...] = RETRY_WAITS_SECONDS,
    ) -> None:
        self.per_video = float(per_video)
        self.run_left = float(per_run)
        self.waits = waits

    def next_wait(self, retry_no: int, video_spent: float) -> Tuple[Optional[int], str]:
        """`retry_no` 回目（1 始まり）の撃ち直しまで、何秒待つか。

        Args:
            retry_no: これから何回目の撃ち直しか
            video_spent: この動画で、すでに粘りに使った秒数

        Returns:
            (待つ秒数, 理由)。もう粘らないときは (None, 打ち切りの理由)。
            **理由を返すのは、ログに「なぜ止めたか」を出すため。**
            「回数で止めた」と「時間で止めた」は、次にどこを直すかが違う。
        """
        if retry_no > len(self.waits):
            return None, f"撃ち直しは {len(self.waits)} 回まで"

        wait = self.waits[retry_no - 1]

        if video_spent + wait > self.per_video:
            return None, f"1本の上限 {int(self.per_video)}秒"

        if wait > self.run_left:
            return None, f"回ぜんたいの上限（残り {int(self.run_left)}秒）"

        return wait, ""

    def spend(self, seconds: float) -> None:
        """粘りに使った秒数を、回ぜんたいの財布から引く。"""
        self.run_left = max(0.0, self.run_left - max(0.0, seconds))


# ============================================================================
# 差し替え口
# ============================================================================
#
# **見張り（`python/ytdlp_retry_selftest.py`）はこの2つを差し替える。**
# 眠らせずに「何秒待つつもりだったか」だけを数えたいので、待つ側と
# 時計を関数にして外から置き換えられるようにしてある。
# `fetch_chat_data` は `throttle.sleep(...)` と属性で呼ぶ（`from ... import`
# で取り込むと、差し替えが届かない）。


def sleep(seconds: float) -> None:
    """待つ。"""
    time.sleep(seconds)


def clock() -> float:
    """経過を測る時計。**壁の時計ではなく単調な時計**（時刻合わせで巻き戻らない）。"""
    return time.monotonic()
