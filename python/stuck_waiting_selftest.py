"""**7日の窓からこぼれた配信が、二度と拾われないまま残らないか。**

    python3 python/stuck_waiting_selftest.py

終了コード 0=通った / 1=落ちた / **2=数えるものが無い**（`docs/island-standards.md` §15）。

BigQuery も資格情報も要らない。**この箱で回る。**

## なぜ要るか（`docs/island-misses.md` #123）

2026-09-17 の本番で、`youtube_chat.videos` の `WAITING` 28本のうち26本が
**1回試したきりで止まっていた**（`attempt_count` が全部 1。いちばん古いのは
2026-02-06）。91本ぶんのチャットが1行も入っておらず、出席日数も引用もカードも
そこから下流のものが欠けていた。

理由は2つが噛み合ったこと。

1. 取り込みが**毎晩は走っていなかった**（2026-09-04 より前はひと月おきの
   追いつき処理。実際に走った日は 02-06 / 02-27 / 03-03 / 03-13 / 03-27 /
   04-24 / 05-20 / 05-30 / 06-24 / 06-27 / 07-25 / 07-28 / 08-28）
2. 拾い直すクエリが `first_seen_at >= 現在 - 7日` で窓を切っていた

**次に走るのが10〜31日後なら、どの行も必ず窓の外にいる。** そして
「7日を過ぎたら SKIPPED」の判定は**選ばれた動画にしか走らない**ので、
一度こぼれた行は拾われも落ちもしない。`build_residents.py` の冒頭には
この件が書いてあったが、**書いてあるだけでは直らなかった。**

## 何を見るか

| | 見るもの | 落ちる条件 |
| --- | --- | --- |
| 1 | 本番と同じ形の行に、**本物のクエリ**（`QUERY_SELECT_TARGET_VIDEOS`）を当てる | 110日前の WAITING が選ばれない |
| 2 | **直す前のクエリ**を同じ行に当てる | 直す前が 110日前の WAITING を選んでしまう（＝この見張りが効かない） |
| 3 | 窓の内側・次回待ち・SUCCEEDED の行 | 拾いかたが変わっている |
| 4 | 枠の上限 | 1晩に上限を超えて拾う |
| 5 | 窓の外から拾った行の行き先 | WAITING に戻る（＝また溜まる） |
| 6 | `WAITING` に移っても、なぜ待っているかが残る | 理由が消える（#123 の追記 その2） |
| 7 | 見張り（`ingest_watch.judge`）が、**2026-09-17 の本番の行**で赤くならない | 直っている最中に赤くなる |
| 8 | それでも赤くなるべき4つが、1つずつ赤くなる | 鳴らない |
| 9 | `BREAK=` で足を1本ずつ抜くと、**その足の守っていた形だけ**を見逃す | 4つが同じ足を折っているだけ |

**2 は対照。** 1 だけだと「何でも選ぶクエリ」でも通ってしまう。
直す前が落ち、直したあとが通るところまで出す。

**7 と 8 は対になっている。** 片方だけだと、何にでも赤を出す見張りで通る。
7 の仕込みは本番の行をそのまま写したもの（20本＋6本＋1本。題名は写していない）。

**9 は「4つ当てた」を「4つの足を見た」と読まないため**
（`docs/island-standards.md` §15、`docs/island-misses.md` #128 の決めごと1）。
足は `stale` / `unfinished` / `lane` / `capacity` / `window` の5本。

## クエリをどうやって手元で回すか

本物の SQL は BigQuery 方言なので、**使っている書き方だけを sqlite に直して**
走らせる（`to_sqlite`）。直せない書き方が残っていたらそこで落とす。
**文字列を目で見て「窓が2つある」と言うだけにしない。** それだと、SQL が
どう書き換わっても通ってしまう。
"""

from __future__ import annotations

import os
import re
import sqlite3
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

os.environ.setdefault("BQ_PROJECT_ID", "selftest")

from config import (  # noqa: E402
    ERROR_CODE_NO_CHAT_FILE,
    ERROR_CODE_YTDLP_FAILED,
    LATE_LANE_MAX_VIDEOS,
    MAX_RETRY_PERIOD_SECONDS,
    MAX_VIDEOS_PER_RUN,
)
from bq.queries import QUERY_SELECT_TARGET_VIDEOS  # noqa: E402
from models.types import ProcessingResult, Video, VideoStatus  # noqa: E402
import ingest_watch  # noqa: E402

fails: list[str] = []
checks = 0


def say(ok: bool, line: str) -> None:
    global checks
    checks += 1
    print(("  OK   " if ok else "  NG   ") + line)
    if not ok:
        fails.append(line)


# ============================================================================
# 本物の SQL を、この箱で回す
# ============================================================================

# 直す前のクエリ（2026-09-17 以前）。**対照のためにそのまま置いてある。**
# ここを「いまのクエリ」に書き換えてはいけない。直す前が落ちることを
# 見せるためのものなので、これが通ってしまったら見張りが死んでいる。
QUERY_BEFORE = """
SELECT
  video_id,
  status,
  first_seen_at,
  next_retry_at,
  attempt_count,
  last_attempt_at,
  last_error_code,
  last_error_detail,
  succeeded_at,
  yt_dlp_version,
  title,
  actual_start_time
FROM
  `youtube_chat.videos`
WHERE
  status IN ('PENDING', 'WAITING', 'FAILED')
  AND (next_retry_at IS NULL OR next_retry_at <= CURRENT_TIMESTAMP())
  AND first_seen_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
ORDER BY
  COALESCE(next_retry_at, first_seen_at) ASC,
  first_seen_at ASC
LIMIT @max_videos
"""

# 同値の割り振りを決めていなかったころの、窓の外の枠だけを抜き出したもの。
# **対照のためにそのまま置いてある。**（`QUERY_BEFORE` と同じ扱い）
#
# `first_seen_at` ひとつで並べると、同じ値が並んだところで順番が決まらない。
# sqlite は入れた順に落ち着くので、**入れる順を変えると選ばれる顔ぶれが変わる**
# ——それがそのまま「BigQuery が約束していない」ことの実演になる。
QUERY_LATE_BEFORE_TIEBREAK = """
SELECT
  video_id,
  status,
  first_seen_at,
  next_retry_at,
  attempt_count,
  last_attempt_at,
  last_error_code,
  last_error_detail,
  succeeded_at,
  yt_dlp_version,
  title,
  actual_start_time
FROM
  `youtube_chat.videos`
WHERE
  (next_retry_at IS NULL OR next_retry_at <= CURRENT_TIMESTAMP())
  AND status IN ('PENDING', 'WAITING')
  AND (
    first_seen_at IS NULL
    OR first_seen_at < TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 604800 SECOND)
  )
ORDER BY
  first_seen_at ASC
LIMIT @max_late_videos
"""

COLUMNS = [
    "video_id", "status", "first_seen_at", "next_retry_at", "attempt_count",
    "last_attempt_at", "last_error_code", "last_error_detail", "succeeded_at",
    "yt_dlp_version", "title", "actual_start_time",
]

# BigQuery 方言のうち、このクエリが使っている書き方だけを直す。
# **知らない書き方が残っていたら落とす**（下の `LEFTOVER`）ので、
# SQL を書き換えたときに、この見張りが黙って意味を失うことはない。
RULES: list[tuple[str, str]] = [
    (r"`[^`]*\.?videos`", "videos"),
    (r"TIMESTAMP_SUB\(\s*CURRENT_TIMESTAMP\(\)\s*,\s*INTERVAL\s+(\d+)\s+SECOND\s*\)",
     r"datetime(:now, '-\1 seconds')"),
    (r"TIMESTAMP_SUB\(\s*CURRENT_TIMESTAMP\(\)\s*,\s*INTERVAL\s+(\d+)\s+DAY\s*\)",
     r"datetime(:now, '-\1 days')"),
    (r"CURRENT_TIMESTAMP\(\)", ":now"),
    (r"@(\w+)", r":\1"),
]

# 直しきれずに残っていたら、その SQL はこの箱で回せていない
LEFTOVER = re.compile(r"TIMESTAMP_\w+|INTERVAL|CURRENT_TIMESTAMP|SAFE[._]|`|@")


def to_sqlite(sql: str) -> str:
    """BigQuery の SQL を、この箱の sqlite で回る形に直す。"""
    out = sql
    for pat, rep in RULES:
        out = re.sub(pat, rep, out)
    left = LEFTOVER.search(out)
    if left:
        raise SystemExit(
            f"この見張りが知らない書き方が SQL に入っています: {left.group(0)}\n"
            f"{__file__} の RULES に足してください（足さずに素通りさせない）"
        )
    return out


NOW = datetime(2026, 9, 17, 22, 0, 0, tzinfo=timezone.utc)


def t(days_ago: float) -> str:
    """いまから何日前か。sqlite の `datetime()` と同じ形でしまう。"""
    return (NOW - timedelta(days=days_ago)).strftime("%Y-%m-%d %H:%M:%S")


def row(video_id, status, seen_days_ago, attempt=1, retry_days_ago=None,
        attempt_days_ago="same"):
    """本番と同じ形の1行。`retry_days_ago` が負なら「次回はまだ先」。

    `attempt_days_ago` は最後に試した日。既定は `first_seen_at` と同じで、
    `None` を渡すと**一度も試していない行**になる（同値の割り振りを見るのに要る）。
    """
    if attempt_days_ago == "same":
        last_attempt = t(seen_days_ago)
    elif attempt_days_ago is None:
        last_attempt = None
    else:
        last_attempt = t(attempt_days_ago)
    return {
        "video_id": video_id,
        "status": status,
        "first_seen_at": t(seen_days_ago),
        "next_retry_at": None if retry_days_ago is None else t(retry_days_ago),
        "attempt_count": attempt,
        "last_attempt_at": last_attempt,
        "last_error_code": None,
        "last_error_detail": None,
        "succeeded_at": None,
        "yt_dlp_version": "2026.08.19",
        "title": f"配信 {video_id}",
        "actual_start_time": t(seen_days_ago + 0.2),
    }


def select(sql: str, rows: list[dict], max_videos=500, max_late=LATE_LANE_MAX_VIDEOS) -> list[str]:
    """その SQL が、その行たちから何を選ぶか。返すのは `video_id` の並び。"""
    con = sqlite3.connect(":memory:")
    con.execute("CREATE TABLE videos (" + ", ".join(COLUMNS) + ")")
    con.executemany(
        "INSERT INTO videos VALUES (" + ", ".join("?" * len(COLUMNS)) + ")",
        [tuple(r[c] for c in COLUMNS) for r in rows],
    )
    params = {
        "now": NOW.strftime("%Y-%m-%d %H:%M:%S"),
        "max_videos": max_videos,
        "max_late_videos": max_late,
    }
    # 直す前のクエリには `:max_late_videos` が無い。sqlite は余った名前付き
    # パラメータを嫌うので、その SQL に出てくるものだけを渡す
    sqlite_sql = to_sqlite(sql)
    params = {k: v for k, v in params.items() if f":{k}" in sqlite_sql}
    return [r[0] for r in con.execute(sqlite_sql, params).fetchall()]


# 本番の形をそのまま写した行。**26本が窓の外で止まっていた**のがこれ。
SAMPLE = [
    row("ov0mr-2GCpA", "WAITING", 222, retry_days_ago=221),   # 2026-02-06
    row("5cWmE-KqHLA", "WAITING", 110, retry_days_ago=109),   # 2026-05-30 の15本
    row("m1NPo1F7L7M", "WAITING", 110, retry_days_ago=109),
    row("d8UwWnFhjwY", "WAITING", 50, retry_days_ago=49),     # 2026-07-28
    row("7puIEFev1a4", "WAITING", 1, retry_days_ago=0.1),     # 窓の内側・もう過ぎている
    row("mada-mae", "WAITING", 0.2, retry_days_ago=-0.5),     # 窓の内側・次回はまだ先
    row("sumi-PENDING", "PENDING", 300),                       # 窓の外・一度も試していない
    row("furui-FAILED", "FAILED", 200),                        # 窓の外・判定は出ている
    row("owatta", "SUCCEEDED", 110),
]
STUCK = {"ov0mr-2GCpA", "5cWmE-KqHLA", "m1NPo1F7L7M", "d8UwWnFhjwY"}


def check_query() -> None:
    print("\n■ 窓からこぼれた配信を、もう一度だけ拾えるか")

    got = set(select(QUERY_SELECT_TARGET_VIDEOS, SAMPLE))
    for vid in sorted(STUCK):
        say(vid in got, f"窓の外で止まっている {vid} を拾う")
    say("sumi-PENDING" in got, "一度も試していない古い PENDING も拾う")
    say("7puIEFev1a4" in got, "窓の内側で次回を過ぎているものは、これまで通り拾う")
    say("mada-mae" not in got, "次回がまだ先のものは拾わない")
    say("owatta" not in got, "SUCCEEDED は拾わない")
    say("furui-FAILED" not in got, "窓の外の FAILED は拾わない（判定は既に出ている）")

    ids = select(QUERY_SELECT_TARGET_VIDEOS, SAMPLE)
    say(len(ids) == len(set(ids)), "同じ配信を2回拾わない（枠が2つあっても重ならない）")

    print("\n■ 対照：直す前のクエリなら、ここが落ちる")
    before = set(select(QUERY_BEFORE, SAMPLE))
    say(
        not (STUCK & before),
        f"直す前のクエリは窓の外の{len(STUCK)}本を1本も拾わない（拾えていたら、この見張りは意味が無い）",
    )
    say("7puIEFev1a4" in before, "直す前でも、窓の内側は拾えていた（壊れていたのは窓の外だけ）")


def check_cap() -> None:
    print("\n■ 1晩に拾いすぎないか")
    many = [row(f"old{i:03d}", "WAITING", 100 + i, retry_days_ago=99 + i) for i in range(60)]
    many += [row(f"new{i:03d}", "WAITING", 1, retry_days_ago=0.1) for i in range(5)]

    got = select(QUERY_SELECT_TARGET_VIDEOS, many, max_late=LATE_LANE_MAX_VIDEOS)
    late = [v for v in got if v.startswith("old")]
    fresh = [v for v in got if v.startswith("new")]
    say(len(late) == LATE_LANE_MAX_VIDEOS, f"窓の外から拾うのは1晩 {LATE_LANE_MAX_VIDEOS} 本まで（実際 {len(late)}）")
    say(len(fresh) == 5, "窓の内側は、窓の外の枠に食われない")
    say(late == sorted(late, key=lambda v: -int(v[3:])) or late[0] == "old059",
        "窓の外は古いものから拾う")

    got5 = select(QUERY_SELECT_TARGET_VIDEOS, many, max_videos=3, max_late=5)
    say(len([v for v in got5 if v.startswith("old")]) == 5, "窓の外の上限を渡せば、その本数で止まる")
    say(len([v for v in got5 if v.startswith("new")]) == 3, "窓の内側の上限も、これまで通り効く")


# ============================================================================
# 拾ったあと、どこへ行くか
# ============================================================================

class _Logger:
    def info(self, *a, **k):
        pass

    def warning(self, *a, **k):
        pass

    def error(self, *a, **k):
        pass


def check_terminates() -> None:
    """窓の外から拾った行は、**1回で終わる。** WAITING に戻ったらまた溜まる。"""
    print("\n■ 拾ったあと、1回で決着がつくか")
    import fetch_chat_data

    written: list[Video] = []
    fetch_chat_data.update_video = lambda v: written.append(v)  # BigQuery を叩かせない

    for label, handler, code in (
        ("チャットが出なかったとき", fetch_chat_data.handle_no_chat_file, ERROR_CODE_NO_CHAT_FILE),
        ("本物のエラーが出たとき", fetch_chat_data.handle_failure, ERROR_CODE_YTDLP_FAILED),
    ):
        video = Video(
            video_id="ov0mr-2GCpA",
            status=VideoStatus.WAITING,
            first_seen_at=datetime.now(timezone.utc) - timedelta(days=222),
            attempt_count=2,
        )
        result = ProcessingResult(video_id=video.video_id, success=False, status=VideoStatus.PENDING)
        result.error_code = code
        result.error_detail = "仕込み"
        handler(video, result, _Logger())
        say(video.status is VideoStatus.SKIPPED, f"窓の外で、{label}は SKIPPED に落ちる")
        say(video.next_retry_at is None, f"窓の外で、{label}は次回の時刻を残さない")

    # 窓の内側は、これまで通り WAITING のまま
    video = Video(
        video_id="7puIEFev1a4",
        status=VideoStatus.WAITING,
        first_seen_at=datetime.now(timezone.utc) - timedelta(hours=46),
        attempt_count=2,
    )
    result = ProcessingResult(video_id=video.video_id, success=False, status=VideoStatus.PENDING)
    result.error_code = ERROR_CODE_NO_CHAT_FILE
    result.error_detail = "仕込み"
    fetch_chat_data.handle_no_chat_file(video, result, _Logger())
    say(video.status is VideoStatus.WAITING, "窓の内側は、これまで通り WAITING のまま待つ")

    from utils.time import is_late_lane
    now = datetime.now(timezone.utc)
    say(is_late_lane(now - timedelta(days=8), now), "窓の外の判定と SKIPPED の判定が同じ側を向いている")
    say(not is_late_lane(now - timedelta(days=6), now), "窓の内側を、窓の外と数えない")
    say(is_late_lane(None, now), "初回確認の無い行も、窓の外として拾う")


def check_waiting_keeps_reason() -> None:
    """**WAITING に移るとき、なぜ待っているかが残ること**（`island-misses.md` #123）。

    2026-09-17 まで `mark_video_waiting` は `last_error_code` に None を
    入れていた。本番の `WAITING` 26本が理由を1行も持っていなかったのはそのため。
    """
    print("\n■ WAITING に移っても、なぜ待っているかが残るか")
    from bq.repository import mark_video_waiting

    later = datetime.now(timezone.utc) + timedelta(days=1)

    # 窓の内側でチャットが出なかった晩。**この晩の理由が残る**
    video = Video(
        video_id="7puIEFev1a4",
        status=VideoStatus.PENDING,
        first_seen_at=datetime.now(timezone.utc) - timedelta(hours=46),
        attempt_count=2,
    )
    mark_video_waiting(video, later, ERROR_CODE_NO_CHAT_FILE, "チャットがまだ出ていない")
    say(video.status is VideoStatus.WAITING, "WAITING になる")
    say(video.last_error_code == ERROR_CODE_NO_CHAT_FILE,
        f"待っている理由が残る（{video.last_error_code}）")
    say(video.last_error_detail == "チャットがまだ出ていない", "理由の詳細も残る")
    say(video.next_retry_at == later, "次回の時刻はこれまで通り入る")

    # 理由を渡さなかったとき。**前に分かっていたぶんを消さない**
    video = Video(
        video_id="7puIEFev1a4",
        status=VideoStatus.PENDING,
        first_seen_at=datetime.now(timezone.utc) - timedelta(hours=46),
        attempt_count=3,
    )
    video.last_error_code = ERROR_CODE_YTDLP_FAILED
    video.last_error_detail = "前の晩に分かっていたこと"
    mark_video_waiting(video, later)
    say(video.last_error_code == ERROR_CODE_YTDLP_FAILED,
        "理由を渡さなくても、前に分かっていたぶんを消さない")
    say(video.last_error_detail == "前の晩に分かっていたこと", "詳細も消さない")

    # 対照：直す前の書き方（None で潰す）なら、ここが落ちる
    print("\n■ 対照：直す前の書き方（None で潰す）なら、ここが落ちる")
    video.last_error_code = None
    video.last_error_detail = None
    say(video.last_error_code is None and video.last_error_detail is None,
        "潰したあとは理由が残らない（＝直す前はこれを毎晩やっていた）")

    # 呼ぶ側が本当に渡しているか。**残せるようにしただけでは残らない**
    src = (Path(__file__).resolve().parent / "fetch_chat_data.py").read_text(encoding="utf-8")
    call = src[src.index("mark_video_waiting("):]
    call = call[:call.index(")") + 1]
    say("result.error_code" in call,
        "呼ぶ側（`fetch_chat_data`）が、その晩の理由を渡している")


# ============================================================================
# 見張り
# ============================================================================

def _wrow(vid, status, seen_days_ago, attempt=1, attempt_days_ago=0.4):
    return {
        "video_id": vid,
        "status": status,
        "title": f"配信 {vid}",
        "first_seen_at": (NOW - timedelta(days=seen_days_ago)).isoformat(),
        "last_attempt_at": (NOW - timedelta(days=attempt_days_ago)).isoformat(),
        "attempt_count": attempt,
    }


def _emit(vid, seen_days_ago, attempt_days_ago=0.6, status="SKIPPED", attempt=2):
    """**窓の外の枠が吐き出した跡**を持つ1行。

    `last_attempt_at - first_seen_at >= 窓` の形。本番の 2026-09-17 は、
    この形の行が20本できて、それが枠の唯一の足跡だった。
    """
    return _wrow(vid, status, seen_days_ago, attempt=attempt,
                 attempt_days_ago=attempt_days_ago)


def check_watch() -> None:
    print("\n■ 見張りが、鳴るべきときに鳴るか")

    # 本番で実際に起きていた形（窓の外に26本。枠がまだ無く、足跡が1つも無い）
    stuck = [_wrow(f"old{i:02d}", "WAITING", 110) for i in range(26)]
    v = ingest_watch.judge(stuck, now=NOW)
    say(not v.ok, "窓の外に何ヶ月も残っていて、枠が吐き出していないなら赤くなる")
    say(len(v.stuck) == 26, f"止まっている本数を数える（{len(v.stuck)}）")

    # 直した直後。**吐き出している最中は赤くしない**（毎晩狼少年になる）。
    # 順番待ちの6本は、初回の試行が窓の内側（見つけた直後）で止まったまま。
    # 枠の足跡は、今夜片づいた20本のほうに残る
    draining = [_wrow(f"old{i:02d}", "WAITING", 8, attempt_days_ago=7.9) for i in range(6)]
    draining += [_emit(f"deta{i:02d}", 110) for i in range(20)]
    v = ingest_watch.judge(draining, now=NOW)
    say(v.ok, "吐き出している最中（窓を出て数日）は赤くしない")
    say(bool(v.notes), "ただし黙ってもいない（何本残っているかを一言出す）")

    # 取り込みそのものが止まった形。**2026-02〜09 の壊れかたがこれ**
    dead = [_wrow("a", "SUCCEEDED", 40, attempt_days_ago=40)]
    v = ingest_watch.judge(dead, now=NOW)
    say(not v.ok, "取り込みが何日も走っていなかったら赤くなる")
    say(any("走っていません" in r for r in v.red), "赤の理由に「走っていない」と書く")

    # 普通の晩
    fine = [_wrow("a", "SUCCEEDED", 3, attempt_days_ago=0.4),
            _wrow("b", "WAITING", 1, attempt_days_ago=0.4)]
    v = ingest_watch.judge(fine, now=NOW)
    say(v.ok, "普通の晩は鳴らない（鳴りっぱなしの見張りは見られなくなる）")
    say(not v.notes, "普通の晩は一言も出さない")

    # 境目。**36時間ちょうどでは鳴らせない**（定時実行のぶれを呑むため）
    edge = [_wrow("a", "SUCCEEDED", 3, attempt_days_ago=35.9 / 24)]
    say(ingest_watch.judge(edge, now=NOW).ok, "35.9時間では鳴らない（ぶれを赤にしない）")
    edge = [_wrow("a", "SUCCEEDED", 3, attempt_days_ago=37.0 / 24)]
    say(not ingest_watch.judge(edge, now=NOW).ok, "37時間なら鳴る")


# ============================================================================
# 猶予を `last_attempt_at`（枠の足跡）から測る（2026-09-18。#123 の追記 3）
# ============================================================================

# 2026-09-17 22:35〜22:38 UTC に、窓の外の枠が初めて回ったときの本番そのもの。
# **値は `youtube_chat.videos` から写した**（題名は写していない。列も引いていない）。
# 枠は1晩 20本が上限なので、26本のうち20本が片づいて **6本が次の晩に回った。**
# その6本で、見張りは 22:52 の `rebake` を failure にしていた。
PROD_NOW = datetime(2026, 9, 17, 22, 52, 0, tzinfo=timezone.utc)


def _prow(vid, status, first_seen, last_attempt, attempt):
    """本番の行をそのまま写す（時刻は本番の値）。"""
    return {
        "video_id": vid,
        "status": status,
        "first_seen_at": first_seen,
        "last_attempt_at": last_attempt,
        "attempt_count": attempt,
    }


# 枠が吐き出した20本（全部その場で SUCCEEDED か SKIPPED になっている）
PROD_EMITTED = [
    _prow("ov0mr-2GCpA", "SUCCEEDED", "2026-02-06 17:44:34", "2026-09-17 22:35:49", 2),
    _prow("RItASEhIuic", "SUCCEEDED", "2026-03-03 20:07:25", "2026-09-17 22:36:03", 2),
    _prow("WvBt6Smzezw", "SKIPPED", "2026-03-03 20:07:25", "2026-09-17 22:36:16", 2),
    _prow("WlqTeMt4_80", "SUCCEEDED", "2026-03-13 20:07:24", "2026-09-17 22:36:24", 2),
    _prow("H9NWRe8ZSPU", "SUCCEEDED", "2026-03-27 19:42:53", "2026-09-17 22:36:37", 2),
    _prow("1blvBceH_SE", "SKIPPED", "2026-05-20 20:42:23", "2026-09-17 22:36:50", 2),
    _prow("JXEHbJX9Szw", "SKIPPED", "2026-05-20 20:42:23", "2026-09-17 22:36:57", 2),
    _prow("Aea0S3WIZLU", "SKIPPED", "2026-05-20 20:42:23", "2026-09-17 22:37:04", 2),
    _prow("gpecGbzVBHU", "SKIPPED", "2026-05-20 20:42:23", "2026-09-17 22:37:09", 2),
    _prow("YFxoJhKOasQ", "SKIPPED", "2026-05-30 10:05:41", "2026-09-17 22:37:14", 2),
    _prow("oGgDJrz4vqU", "SKIPPED", "2026-05-30 10:05:41", "2026-09-17 22:37:22", 2),
    _prow("m1NPo1F7L7M", "SKIPPED", "2026-05-30 10:05:41", "2026-09-17 22:37:30", 2),
    _prow("WaKv25Z-r18", "SKIPPED", "2026-05-30 10:05:41", "2026-09-17 22:37:37", 2),
    _prow("4hSM_LCPTRs", "SKIPPED", "2026-05-30 10:05:41", "2026-09-17 22:37:45", 2),
    _prow("6ZezMEA3emg", "SKIPPED", "2026-05-30 10:05:41", "2026-09-17 22:37:54", 2),
    _prow("TFiFG8lrcpA", "SKIPPED", "2026-05-30 10:05:41", "2026-09-17 22:38:01", 2),
    _prow("5cWmE-KqHLA", "SKIPPED", "2026-05-30 10:05:41", "2026-09-17 22:38:09", 2),
    _prow("_Azl32caALw", "SKIPPED", "2026-05-30 10:05:41", "2026-09-17 22:38:17", 2),
    _prow("gse7fek4Cpk", "SKIPPED", "2026-05-30 10:05:41", "2026-09-17 22:38:24", 2),
    _prow("h2d-assfrh0", "SKIPPED", "2026-05-30 10:05:41", "2026-09-17 22:38:41", 2),
]

# 枠に入りきらず、次の晩に回った6本。**`last_attempt_at` は初回のまま。**
# 「行ごとに最後に試してから何日か」で測ると、この6本は 80〜110日になる
PROD_LEFTOVER = [
    _prow("__Puza5-4q0", "WAITING", "2026-05-30 10:05:41", "2026-05-30 10:12:40", 1),
    _prow("zLIQ9yySAas", "WAITING", "2026-06-27 09:26:26", "2026-06-27 09:30:17", 1),
    _prow("CivhSffnPXE", "WAITING", "2026-06-27 09:26:26", "2026-06-27 09:28:58", 1),
    _prow("wxaQlQHchYQ", "WAITING", "2026-06-27 09:26:26", "2026-06-27 09:29:52", 1),
    _prow("UTjTmiiyq00", "WAITING", "2026-07-28 21:02:20", "2026-07-28 21:04:35", 1),
    _prow("d8UwWnFhjwY", "WAITING", "2026-07-28 21:02:20", "2026-07-28 21:04:10", 1),
]

# その晩の配信。窓の内側なので、この見張りの対象ではない
PROD_TONIGHT = [
    _prow("oBN2tNEj3wA", "WAITING", "2026-09-17 22:35:24", "2026-09-17 22:39:27", 1),
]

PROD = PROD_EMITTED + PROD_LEFTOVER + PROD_TONIGHT


def check_watch_prod() -> None:
    """**本番の値で、直っている最中に赤くならないこと。**"""
    print("\n■ 2026-09-17 の本番そのもの（枠が初めて回った晩）")

    v = ingest_watch.judge(PROD, now=PROD_NOW)
    say(v.ok, f"直っている最中の6本で赤くならない（赤 {len(v.red)} 件）")
    for line in v.red:
        print(f"       赤: {line}")
    say(len(v.draining) == 6, f"6本を「吐き出している最中」と読む（{len(v.draining)}）")
    say(not v.stuck, f"「止まっている」に1本も入れない（{len(v.stuck)}）")
    say(bool(v.notes), "黙りもしない（あと何晩で空になるかを出す)")
    for line in v.notes:
        print(f"       一言: {line}")
    say("oBN2tNEj3wA" not in [d["video_id"] for d in v.draining],
        "その晩の配信（窓の内側）は数に入れない")
    say(v.lane_last_emit is not None
        and v.lane_last_emit.strftime("%Y-%m-%d %H:%M") == "2026-09-17 22:38",
        f"枠の足跡を 22:38 と読む（{v.lane_last_emit}）")

    print("\n■ 対照：直す前の測りかた（`first_seen_at` からの猶予）なら、ここが落ちる")
    before = _judge_by_first_seen(PROD, PROD_NOW)
    say(len(before) == 6,
        f"直す前は同じ6本を「止まっている」と読んで赤にしていた（{len(before)}）"
        "（ここが0なら、この対照は何も見ていない）")


def _judge_by_first_seen(rows, now):
    """**直す前の判定**（2026-09-17 以前）。対照のためにそのまま置いてある。

    ここを「いまの判定」に書き換えてはいけない。直す前が落ちることを
    見せるためのもので、これが通ってしまったら対照が死んでいる。
    """
    window = timedelta(seconds=MAX_RETRY_PERIOD_SECONDS)
    grace = window + timedelta(days=ingest_watch.DRAIN_DAYS)
    out = []
    for r in rows:
        if r.get("status") not in ("PENDING", "WAITING"):
            continue
        seen = ingest_watch._ts(r.get("first_seen_at"))
        age = None if seen is None else (now - seen)
        if age is not None and age < window:
            continue
        if age is None or age >= grace:
            out.append(r["video_id"])
    return out


def check_watch_reds() -> None:
    """**それでも赤くなるべき3つが、1つずつ赤くなること。**"""
    print("\n■ それでも赤くなるべきとき（1つずつ）")

    # (1) 取り込みそのものが何晩も走っていない
    dead = [_prow("a", "SUCCEEDED", "2026-08-01 20:00:00", "2026-09-14 20:00:00", 1)]
    v = ingest_watch.judge(dead, now=PROD_NOW)
    say(not v.ok, "(1) 取り込みが何晩も走っていなければ赤")
    say(any("走っていません" in r for r in v.red), "(1) 理由に「走っていない」と書く")

    # (2) 拾い直しは来ているのに、終わらない（`attempt_count` が伸びていく）
    #     枠は毎晩当てている（足跡は今夜）。それでも WAITING から動かない行
    loop = list(PROD_EMITTED)
    loop.append(_prow("mawaru0001", "WAITING", "2026-03-01 20:00:00",
                      "2026-09-17 22:38:50", 9))
    v = ingest_watch.judge(loop, now=PROD_NOW)
    say(not v.ok, "(2) 枠が当てているのに終わらない行があれば赤")
    say(any("終わっていない" in r for r in v.red), "(2) 理由に「終わっていない」と書く")
    say(any("9 回" in r for r in v.red), "(2) 何回試したかを出す（伸びているのが本体）")
    say(len(v.draining) == 0, "(2) 枠は動いているが、この行は順番待ちではない")

    # (3) `last_attempt_at` が NULL のまま置き去り
    #     **取り込みそのものは毎晩走っている**（窓の内側は進んでいる）。
    #     走っていないのは窓の外の枠だけ、という形にして (1) と分ける
    orphan = [
        _prow("kesa000001", "SUCCEEDED", "2026-09-17 22:30:00", "2026-09-17 22:31:00", 1),
        _prow("okizari001", "PENDING", "2026-02-10 20:00:00", None, 0),
    ]
    v = ingest_watch.judge(orphan, now=PROD_NOW)
    say(not v.ok, "(3) 一度も試されていない古い行が置き去りなら赤")
    say(not any("走っていません" in r for r in v.red),
        "(3) それを「取り込みが走っていない」と言わない（取り込みは走っている）")
    say(any("吐き出していない" in r for r in v.red), "(3) 理由は「枠が吐き出していない」")
    say([s["video_id"] for s in v.stuck] == ["okizari001"], "(3) 置き去りの1本を名指しする")

    # (4) 枠は動いているのに、その行を選んでいない
    #     #123 が半年止まったのはこの形（枠ではなく、選ぶ条件が落としていた）
    thin = PROD_EMITTED[:3] + PROD_LEFTOVER          # その晩に3本しか出していない
    v = ingest_watch.judge(thin, now=PROD_NOW)
    say(not v.ok, "(4) 枠に空きがあるのに残っていたら赤")
    say(any("選ぶ条件" in r for r in v.red), "(4) 直す相手が枠ではなく選ぶ条件だと書く")
    say(len(v.stuck) == 6 and not v.draining, "(4) 6本を「順番待ち」に逃がさない")

    # **上限ちょうど出ていれば、同じ6本でも赤にしない**（本番がこれ）
    say(ingest_watch.judge(PROD, now=PROD_NOW).ok,
        "(4) 上限ちょうど出ているなら、残っていても順番待ち")

    # 窓を出たのが枠の**あと**だった行を巻き込まない。枠は 22:38 に回り、
    # この行が7日になるのは 22:45。見張りが見るのは 22:52 なので、
    # 「窓の外にいるのに拾われていない」の形にはなるが、素通りではない
    edge = PROD_EMITTED[:3] + [
        _prow("kyoudeta1", "WAITING", "2026-09-10 22:45:00", "2026-09-16 20:00:00", 2),
    ]
    v = ingest_watch.judge(edge, now=PROD_NOW)
    say(v.ok, "(4) 窓を出たのが枠のあとだった行を「素通りされた」と数えない")
    say(len(v.draining) == 1, "(4) その行は順番待ちとして数える（黙って落とさない）")

    # 逆に、枠が回った時点でもう窓の外にいたなら、素通り
    over = PROD_EMITTED[:3] + [
        _prow("sudeni0001", "WAITING", "2026-09-10 20:00:00", "2026-09-16 20:00:00", 2),
    ]
    say(not ingest_watch.judge(over, now=PROD_NOW).ok,
        "(4) 枠が回った時点で窓の外だったなら、素通りとして赤")


def check_watch_legs() -> None:
    """**判定の足を1本ずつ抜いて、そのたびに見逃すようになること**
    （`docs/island-standards.md` §15、`docs/island-misses.md` #128 の決めごと1）。

    「赤くなる形を3つ当てた」は、3つが同じ足を折っているなら1つ。
    `BREAK=` で足を1本だけ抜き、**その足が守っていた形だけが素通りする**ことを見る。
    抜いていないときに赤くなることも、同じ行で毎回いっしょに見る。
    """
    print("\n■ 対照：判定の足を1本ずつ抜くと、その足の守っていた形だけ見逃す")

    # 足ごとに（抜く足, その足が守っている形, 見出し）
    cases = [
        ("stale",
         [_prow("a", "SUCCEEDED", "2026-08-01 20:00:00", "2026-09-14 20:00:00", 1)],
         "取り込みが何晩も走っていない"),
        ("unfinished",
         PROD_EMITTED + [_prow("mawaru0001", "WAITING", "2026-03-01 20:00:00",
                               "2026-09-17 22:38:50", 9)],
         "枠は当てているのに終わらない"),
        ("lane",
         [_prow("kesa000001", "SUCCEEDED", "2026-09-17 22:30:00", "2026-09-17 22:31:00", 1),
          _prow("okizari001", "PENDING", "2026-02-10 20:00:00", None, 0)],
         "枠が吐き出さないまま置き去り"),
        ("capacity",
         PROD_EMITTED[:3] + PROD_LEFTOVER,
         "枠に空きがあるのに選ばれていない"),
        ("window",
         PROD_TONIGHT,
         "その晩の配信を、窓の外と数えない"),
    ]

    for leg, rows, what in cases:
        # 抜く前：赤くなる（`window` だけは向きが逆で、抜く前は「赤くしない」が正しい）
        was = os.environ.pop("BREAK", None)
        try:
            base = ingest_watch.judge(rows, now=PROD_NOW)
            if leg == "window":
                say(base.ok, f"[{leg}] 抜く前は「{what}」で赤くしない")
            else:
                say(not base.ok, f"[{leg}] 抜く前は「{what}」で赤くなる")
            os.environ["BREAK"] = leg
            broke = ingest_watch.judge(rows, now=PROD_NOW)
            if leg == "window":
                say(not broke.ok, f"[{leg}] 足を抜くと、窓の内側まで拾って赤になる")
            else:
                say(broke.ok, f"[{leg}] 足を抜くと、その形を見逃す（＝この足が効いている）")
        finally:
            os.environ.pop("BREAK", None)
            if was is not None:
                os.environ["BREAK"] = was

    # 足を全部そろえたときに、本番の6本が通ることも同じところで見る
    say(ingest_watch.judge(PROD, now=PROD_NOW).ok,
        "足がそろっていれば、本番の6本は通る（片側だけは対照ではない）")

    # 知らない足を渡したら黙って通さない（旗の書き間違いで対照が消えないように）
    os.environ["BREAK"] = "shiranai"
    try:
        ingest_watch.judge(PROD, now=PROD_NOW)
        say(False, "知らない足を渡したら落ちる")
    except SystemExit:
        say(True, "知らない足を渡したら落ちる（旗の書き間違いで対照が黙らない）")
    finally:
        os.environ.pop("BREAK", None)


# ============================================================================
# 同値の `first_seen_at` が、枠より多いとき
# ============================================================================

# 窓の外。**この日に見つかったことにする行を、枠より多く並べる。**
TIE_DAY = 110


def tie_rows(n: int = 26) -> list[dict]:
    """`first_seen_at` が**全部同じ**行を n 本。違うのは最後に試した日だけ。

    本番がこの形をしている。Discovery の MERGE は `CURRENT_TIMESTAMP()` を
    1回しか評価しないので、その回に見つけた全部へ同じ値が焼かれる
    （2026-09-18 の本番で 777行中 261行が同値の組。最大の組は37行）。

    `tie000` がいちばん長く試されていない。`tie999` は一度も試していない。
    """
    rows = [
        row(f"tie{i:03d}", "WAITING", TIE_DAY,
            retry_days_ago=TIE_DAY - 1, attempt_days_ago=TIE_DAY - i)
        for i in range(n)
    ]
    rows.append(row("tie999", "WAITING", TIE_DAY,
                    retry_days_ago=TIE_DAY - 1, attempt_days_ago=None))
    return rows


def check_tiebreak() -> None:
    """**同じ日に見つかった行が枠より多いとき、誰が入るかが決まっているか。**

    2026-09-17 の晩に本番で起きた形。窓の外の候補26本のうち12本が
    `2026-05-30 10:05:41.218578` でぴったり同値で、枠の残りは11本。
    **1本（`__Puza5-4q0`）があぶれた。** 順番待ちとしては正しいが、
    誰があぶれるかは `ORDER BY` が決めていなかった。
    """
    print("\n■ 同じ日に見つかった行が、枠より多いとき")

    rows = tie_rows()
    cap = 5

    got = set(select(QUERY_SELECT_TARGET_VIDEOS, rows, max_late=cap))
    flipped = set(select(QUERY_SELECT_TARGET_VIDEOS, list(reversed(rows)), max_late=cap))

    say(len(got) == cap, f"同値ばかりでも、枠のぶんだけ選ぶ（{len(got)}／{cap}）")
    say(got == flipped, "入れる順を逆にしても、選ばれる顔ぶれが変わらない")
    say("tie999" in got, "一度も試していない行が、まっさきに入る")
    want = {"tie999", "tie000", "tie001", "tie002", "tie003"}
    say(got == want,
        f"同値のときは、長く試されていないものから入る（選ばれたのは {sorted(got)}）")

    print("\n■ 対照：同値の割り振りを決めていなかったころ")
    before = set(select(QUERY_LATE_BEFORE_TIEBREAK, rows, max_late=cap))
    before_flipped = set(
        select(QUERY_LATE_BEFORE_TIEBREAK, list(reversed(rows)), max_late=cap))
    say(before != before_flipped,
        "直す前は、入れる順を変えると顔ぶれが変わる（＝並びが決まっていなかった）")
    say(before != want or before_flipped != want,
        "直す前は、長く試されていないものから入るとは限らない")


# ============================================================================
# 枠の上限そのものが、黙って 0 になったら
# ============================================================================

def check_cap_guard() -> None:
    """**枠の上限が 0 や None でも、SQL は成功して 0 行を返す。**

    `LIMIT 0` は正しい SQL で、エラーにならない。つまり枠が閉じたまま
    取り込みは緑で終わり、窓の外の取りこぼしは誰にも触られない
    ——`docs/island-misses.md` #123 が半年かけて起きたのと同じ形が、
    **設定値ひとつで再現できる。** 口を叩く前に断るのが
    `bq.repository._check_lane_caps`。

    ここでは2つとも見る。**断りが効くこと**と、
    **断りを外すと本当に黙って空になること**（＝断りが効いている証拠）。
    """
    print("\n■ 枠の上限が黙って 0 になったら")
    from bq.repository import _check_lane_caps

    for bad, why in (
        (0, "0（枠を閉じる）"),
        (None, "None（渡し忘れ）"),
        (-1, "-1"),
        (True, "True（bool は本数ではない）"),
        ("20", '"20"（文字列）'),
    ):
        try:
            _check_lane_caps(MAX_VIDEOS_PER_RUN, bad)
            say(False, f"窓の外の上限が {why} なら落ちる")
        except ValueError:
            say(True, f"窓の外の上限が {why} なら落ちる")

    try:
        _check_lane_caps(0, LATE_LANE_MAX_VIDEOS)
        say(False, "窓の内側の上限が 0 でも落ちる")
    except ValueError:
        say(True, "窓の内側の上限が 0 でも落ちる")

    try:
        _check_lane_caps(MAX_VIDEOS_PER_RUN, LATE_LANE_MAX_VIDEOS)
        say(True, f"いま配ってある値（{MAX_VIDEOS_PER_RUN} / {LATE_LANE_MAX_VIDEOS}）は通る")
    except ValueError as e:
        say(False, f"いま配ってある値が通らない: {e}")

    print("\n■ 対照：断りを外すと、枠は黙って空になる")
    # 断りを外したことにして、SQL だけを 0 で回す。**落ちない。0行が返る。**
    empty = select(QUERY_SELECT_TARGET_VIDEOS, SAMPLE, max_late=0)
    say(not (STUCK & set(empty)),
        f"上限 0 で流すと、窓の外の{len(STUCK)}本は1本も返らない（しかもエラーにならない）")
    say(set(empty) == {"7puIEFev1a4"},
        "窓の内側だけが返るので、ログの本数を見ても異常に見えない")


def main() -> int:
    print(f"窓は {MAX_RETRY_PERIOD_SECONDS // 86400} 日 / 窓の外の枠は1晩 {LATE_LANE_MAX_VIDEOS} 本")
    check_query()
    check_cap()
    check_tiebreak()
    check_cap_guard()
    check_terminates()
    check_waiting_keeps_reason()
    check_watch()
    check_watch_prod()
    check_watch_reds()
    check_watch_legs()

    if checks == 0:
        print("\n数えるものがありませんでした", file=sys.stderr)
        return 2
    print(f"\n{checks} 件みて、落ちたのは {len(fails)} 件")
    for f in fails:
        print(f"  NG  {f}")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
