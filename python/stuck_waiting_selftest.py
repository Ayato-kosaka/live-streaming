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
| 6 | 見張り（`ingest_watch.judge`）が赤くなる／ならない | 鳴らない、または鳴りっぱなし |

**2 は対照。** 1 だけだと「何でも選ぶクエリ」でも通ってしまう。
直す前が落ち、直したあとが通るところまで出す。

**6 も対になっている。** 片方だけだと、何にでも赤を出す見張りで通る。

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


def row(video_id, status, seen_days_ago, attempt=1, retry_days_ago=None):
    """本番と同じ形の1行。`retry_days_ago` が負なら「次回はまだ先」。"""
    return {
        "video_id": video_id,
        "status": status,
        "first_seen_at": t(seen_days_ago),
        "next_retry_at": None if retry_days_ago is None else t(retry_days_ago),
        "attempt_count": attempt,
        "last_attempt_at": t(seen_days_ago),
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


def check_watch() -> None:
    print("\n■ 見張りが、鳴るべきときに鳴るか")

    # 本番で実際に起きていた形（窓の外に26本）
    stuck = [_wrow(f"old{i:02d}", "WAITING", 110) for i in range(26)]
    v = ingest_watch.judge(stuck, now=NOW)
    say(not v.ok, "窓の外に何ヶ月も残っていたら赤くなる")
    say(len(v.stuck) == 26, f"止まっている本数を数える（{len(v.stuck)}）")

    # 直した直後。**吐き出している最中は赤くしない**（毎晩狼少年になる）
    draining = [_wrow(f"old{i:02d}", "WAITING", 8) for i in range(6)]
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


def main() -> int:
    print(f"窓は {MAX_RETRY_PERIOD_SECONDS // 86400} 日 / 窓の外の枠は1晩 {LATE_LANE_MAX_VIDEOS} 本")
    check_query()
    check_cap()
    check_terminates()
    check_watch()

    if checks == 0:
        print("\n数えるものがありませんでした", file=sys.stderr)
        return 2
    print(f"\n{checks} 件みて、落ちたのは {len(fails)} 件")
    for f in fails:
        print(f"  NG  {f}")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
