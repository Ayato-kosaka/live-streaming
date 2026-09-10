"""チャットがまだ出ていない配信を、いつまで待つか。

## なぜこのテストが要るか

`handle_no_chat_file` は長いあいだ「24h + ぶれ3時間 を過ぎたら FAILED」で
分けていた。**ジョブは日に1回しか走らないので、この窓は1回しか通らない。**
初回確認からの経過は 0h → 約22h → 約46h と飛び、2晩目にはもう窓の外にいる。
docstring は「7日間は拾い直す」と言っていたのに、7日ルールには
**構造上ぜったい到達しなかった**（本番で SKIPPED が1件も無い）。

境目の 46h が WAITING のままであること——ここが落ちたら、また同じ穴が開く。
"""

from datetime import datetime, timedelta, timezone

import pytest

from config import ERROR_CODE_NO_CHAT_FILE, ERROR_CODE_YTDLP_FAILED
from models.types import ProcessingResult, Video, VideoStatus
from utils.time import calculate_next_retry_at, should_skip_after_7days

import fetch_chat_data


HOUR = timedelta(hours=1)
DAY = timedelta(days=1)

# 毎晩1回のジョブから見た経過時間。**22h と 46h のあいだに 24h の窓がある。**
# 「1晩目」「2晩目」のように飛ぶので、そのあいだの値は現実には起きない。
ELAPSED = {
    "0h": timedelta(0),
    "22h": 22 * HOUR,
    "46h": 46 * HOUR,
    "6日": 6 * DAY,
    "8日": 8 * DAY,
}


class _Logger:
    """VideoLogger の代わり。何も出さずに受け取るだけ。"""

    def info(self, *a, **k):
        pass

    def warning(self, *a, **k):
        pass

    def error(self, *a, **k):
        pass


@pytest.fixture(autouse=True)
def _no_bigquery(monkeypatch):
    """書き込み口を塞ぐ。テストで BigQuery を触らないため。"""
    monkeypatch.setattr(fetch_chat_data, "update_video", lambda video: None)


def _video(elapsed: timedelta) -> Video:
    """初回確認から `elapsed` だけ経った配信。"""
    return Video(
        video_id="l5ODV6hfCLQ",
        status=VideoStatus.WAITING,
        first_seen_at=datetime.now(timezone.utc) - elapsed,
        attempt_count=1,
    )


def _no_chat(elapsed: timedelta) -> Video:
    """チャットが無かったときの処理を通して、結果の Video を返す。"""
    video = _video(elapsed)
    result = ProcessingResult(
        video_id=video.video_id, success=False, status=VideoStatus.PENDING
    )
    result.error_code = ERROR_CODE_NO_CHAT_FILE
    result.error_detail = "チャットファイルが見つかりませんでした"
    fetch_chat_data.handle_no_chat_file(video, result, _Logger())
    return video


# ============================================================================
# 境目
# ============================================================================

@pytest.mark.parametrize(
    "label,expected",
    [
        ("0h", VideoStatus.WAITING),
        ("22h", VideoStatus.WAITING),
        # ここが直したところ。**以前はここで FAILED になり、そこで終わっていた**
        ("46h", VideoStatus.WAITING),
        ("6日", VideoStatus.WAITING),
        ("8日", VideoStatus.SKIPPED),
    ],
)
def test_チャットがまだ出ていないときの行き先(label, expected):
    assert _no_chat(ELAPSED[label]).status is expected


def test_46hでもFAILEDにしない():
    """回帰よけ。24h の窓を戻すと、ここが FAILED に変わる。"""
    assert _no_chat(46 * HOUR).status is not VideoStatus.FAILED


def test_WAITINGのあいだは次回の時刻を持つ():
    """`next_retry_at` が無いと、拾い直すクエリの順序（COALESCE）が変わる。"""
    for label in ("0h", "22h", "46h", "6日"):
        video = _no_chat(ELAPSED[label])
        assert video.next_retry_at is not None, label
        assert video.next_retry_at == calculate_next_retry_at(video.first_seen_at)


def test_2晩目からは次回の時刻がもう過ぎている():
    """過ぎたままで正しい。「次に試してよくなる時刻」であって「次に試す時刻」ではない。

    クエリは `next_retry_at IS NULL OR next_retry_at <= CURRENT_TIMESTAMP()` で
    拾うので、過ぎていれば毎晩そのまま対象に入る。
    """
    video = _no_chat(46 * HOUR)
    assert video.next_retry_at < datetime.now(timezone.utc)


def test_SKIPPEDになったら次回は無い():
    video = _no_chat(8 * DAY)
    assert video.next_retry_at is None
    assert video.last_error_code == ERROR_CODE_NO_CHAT_FILE


# ============================================================================
# 7日の判定そのもの
# ============================================================================

@pytest.mark.parametrize(
    "label,expected",
    [("0h", False), ("22h", False), ("46h", False), ("6日", False), ("8日", True)],
)
def test_7日の判定(label, expected):
    now = datetime.now(timezone.utc)
    assert should_skip_after_7days(now - ELAPSED[label], now) is expected


def test_次回の時刻は初回確認から21時間後():
    """定時実行が数十分ぶれても拾われるように、24h より3時間手前に置く（#249）。"""
    first_seen = datetime(2026, 9, 9, 22, 9, 22, tzinfo=timezone.utc)
    assert calculate_next_retry_at(first_seen) == first_seen + 21 * HOUR


# ============================================================================
# 本物のエラーは、これまでどおり FAILED
# ============================================================================

def test_本物のエラーは46hでFAILEDのまま():
    """`handle_failure` は触っていない。yt-dlp の失敗などはエラーとして倒す。"""
    video = _video(46 * HOUR)
    result = ProcessingResult(
        video_id=video.video_id, success=False, status=VideoStatus.PENDING
    )
    result.error_code = ERROR_CODE_YTDLP_FAILED
    result.error_detail = "yt-dlp が異常終了しました"
    fetch_chat_data.handle_failure(video, result, _Logger())
    assert video.status is VideoStatus.FAILED


def test_本物のエラーも8日を過ぎたらSKIPPED():
    video = _video(8 * DAY)
    result = ProcessingResult(
        video_id=video.video_id, success=False, status=VideoStatus.PENDING
    )
    result.error_code = ERROR_CODE_YTDLP_FAILED
    result.error_detail = "yt-dlp が異常終了しました"
    fetch_chat_data.handle_failure(video, result, _Logger())
    assert video.status is VideoStatus.SKIPPED
