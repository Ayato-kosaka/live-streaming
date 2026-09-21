"""**混んでいる（429）で落ちた晩に、同じ回の中で待って撃ち直すか**を、実際に動かして見る。

    python3 python/ytdlp_retry_selftest.py

終了コード 0=通った / 1=落ちた / **2=数えるものが無い**
（`docs/island-standards.md` §15）。

**ネットにも BigQuery にも yt-dlp にも出ない。** yt-dlp を叩く口と、
待つ口（`utils.throttle.sleep`）と、時計（`utils.throttle.clock`）を
差し替えて、本物の `fetch_chat_data.process_video` を最後まで回す。
**待ちは実際に眠らせない。何秒待つつもりだったかを数えるだけ。**

## なぜ要るか（2026-09-20 の本番）

到着日の配信が、毎晩こう落ちていた（run 35540598628）。

    22:06:54  試行回数: 1 → yt-dlp でチャットデータをダウンロード中...
    22:06:59  ERROR: ... HTTP Error 429: Too Many Requests
    22:06:59  処理失敗のため FAILED

**1回叩いて、5.4秒で諦めていた。** FAILED にすると次に拾われるのは翌晩なので、
1晩に1発しか撃てない。**7晩落ちると SKIPPED に落ちて二度と拾われない**ので、
1晩1発は「7発で打ち止め」ということでもある。

粘る道を足したが、粘りかたは**黙って壊れる**——429 を見分ける字が広がれば
消えた動画まで叩き続けるし、上限が効かなければ後ろのジョブが何十分も止まるし、
**晩の回数（`attempt_count`）に足してしまえば、粘った晩ほど早く打ち止めになる。**
どれも赤くならない。だから字で突き合わせるのではなく、動かして数える。

## 見るもの（足は5本）

| | 足 | 見るもの |
| --- | --- | --- |
| 1 | `撃ち直し` | 429 のときだけ、決めた回数ぶん・決めた秒数で撃ち直す。途中で通れば止まる |
| 2 | `見境`     | 429 以外（消えた動画）では**1回で諦める** |
| 3 | `上限`     | 1本の上限・回ぜんたいの上限に当たったら、それ以上粘らずに FAILED |
| 4 | `晩の回数` | **`attempt_count` が晩の中で増えない**（7日の勘定を狂わせない） |
| 5 | `ログ`     | 何回目を何秒待って撃ったかが**1行で**出る。撃たない晩は1行も増えない |

## 対照（本物の判定を1つも出す前に、毎回）

**足を1本ずつ抜いて、そのたび対応する足が落ちること**まで見る
（`docs/island-standards.md` §15「対照は、足の数だけ用意する」）。

| 抜くもの | 何を再現しているか |
| --- | --- |
| `見分け`   | 429 の字を見分けない（＝直す前の姿。1回で諦める） |
| `見境`     | 何で落ちても撃ち直す（消えた動画を4回叩く） |
| `上限なし` | 財布を見ずに撃ち直す（混んだ晩に後ろが詰まる） |
| `晩に足す` | 晩の中の撃ち直しを `attempt_count` に足す（粘った晩ほど早く SKIPPED） |
| `無言`     | 粘ったことをログに出さない（外から粘ったか分からない） |

対照が1つでも外れたら、本物の判定を1つも出さずに **2** で落ちる。
"""

from __future__ import annotations

import os
import sys
import types
from datetime import datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

# `config.py` は読み込みの時点でこれが無いと投げる。BigQuery の口は下で
# 偽物に差し替わるので、**この値はどこにも届かない**。手元の値は上書きしない
os.environ.setdefault("BQ_PROJECT_ID", "ytdlp-retry-selftest")

# `bq.repository` は読み込みで `from google.cloud import bigquery` する。
# `google-cloud-bigquery` はこの箱に入っていないので、**読み込む前に偽物を置く**
# （本体は import 文を持ったままでよい）。この道具は BigQuery に1バイトも出さない
import google.cloud  # noqa: E402

_fake_bq = types.ModuleType("google.cloud.bigquery")
_fake_bq.Client = lambda **kw: None
_fake_bq.QueryJobConfig = lambda **kw: None
for _name in ("ScalarQueryParameter", "StructQueryParameter", "ArrayQueryParameter",
              "SchemaField", "QueryJob"):
    setattr(_fake_bq, _name, type(_name, (), {}))
sys.modules["google.cloud.bigquery"] = _fake_bq
google.cloud.bigquery = _fake_bq

import fetch_chat_data as fcd  # noqa: E402
from models.types import Video, VideoStatus  # noqa: E402
from utils import throttle  # noqa: E402


# ============================================================================
# 仕込み
# ============================================================================

# 本番で 429 が返ってくるまでの実測（2026-09-20。5.45秒）。
# **粘りの上限は待ちだけでは決まらない**ので、撃ち直しにかかる時間も足して測る
DOWNLOAD_SECONDS = 5.4

# 本番のログに出ていた字。**これを見分けられるかがこの道具の中心**
ERR_429 = (
    "yt-dlp 終了コード 1\n"
    "ERROR: Unable to download video subtitles for 'live_chat': "
    "HTTP Error 429: Too Many Requests"
)

# 429 ではない失敗。何度叩いても通らないもの
ERR_GONE = "yt-dlp 終了コード 1\nERROR: [youtube] ...: Video unavailable"

LEGS = ("撃ち直し", "見境", "上限", "晩の回数", "ログ")

FAILED: list[str] = []
CHECKS = 0


def say(name: str, ok: bool, saw) -> None:
    global CHECKS
    CHECKS += 1
    print(f"  {'OK  ' if ok else 'NG  '} {name}（{saw}）")
    if not ok:
        FAILED.append(name)


def die(why: str) -> None:
    """**数えるものが無い。** 判定を1つも出さずに 2。"""
    print(f"✕ 数えるものがありません: {why}")
    raise SystemExit(2)


class Rec:
    """1本ぶんの測り。"""

    def __init__(self) -> None:
        self.downloads = 0          # yt-dlp を叩いた回数
        self.waits: list[float] = []  # 何秒待つつもりだったか（実際には眠らない）
        self.written: list[int] = []  # `update_video` に渡ったときの attempt_count
        self.lines: list[str] = []    # ログの行
        self.video: Video | None = None
        self.status = None


class _Stats:
    """`parse_chat_file` が返す形だけ真似る。"""

    parsed_messages = 1
    skipped_lines = 0
    event_type_counts: dict = {}


def measure(replies, videos: int = 1, per_video=None, per_run=None, brk: str = ""):
    """偽の yt-dlp と偽の時計で、本物の `process_video` を回す。

    Args:
        replies: yt-dlp が返す `(成功, メッセージ)` の並び。足りなければ最後を繰り返す
        videos: 同じ財布で何本まわすか（回ぜんたいの上限を見るときに2本使う）
        brk: 足を1本抜く（対照）
    """
    kw = {}
    if per_video is not None:
        kw["per_video"] = per_video
    if per_run is not None:
        kw["per_run"] = per_run
    budget = throttle.RetryBudget(**kw)

    if brk == "上限なし":
        # 財布を見ずに、回数だけで撃ち直す
        budget.next_wait = lambda no, spent: (
            (throttle.RETRY_WAITS_SECONDS[no - 1], "")
            if no <= len(throttle.RETRY_WAITS_SECONDS) else (None, "回数")
        )

    markers = throttle.RATE_LIMIT_MARKERS
    real_rl = throttle.is_rate_limited
    if brk == "見分け":
        throttle.RATE_LIMIT_MARKERS = ()          # 429 の字を1つも知らない
    if brk == "見境":
        throttle.is_rate_limited = lambda msg: True  # 何で落ちても混雑だと言う

    saved = {n: getattr(fcd, n) for n in (
        "download_chat_data", "update_video", "chat_file_exists",
        "find_chat_file_path", "parse_chat_file", "merge_chat_messages",
        "cleanup_chat_file", "VideoLogger")}
    saved_sleep, saved_clock = throttle.sleep, throttle.clock

    recs: list[Rec] = []
    now = [0.0]

    try:
        for i in range(videos):
            rec = Rec()
            recs.append(rec)

            def fake_download(video_id, rec=rec):
                rec.downloads += 1
                now[0] += DOWNLOAD_SECONDS
                if brk == "晩に足す" and rec.downloads > 1:
                    # 晩の中の撃ち直しを、晩の回数に足してしまう実装（対照）
                    rec.video.attempt_count += 1
                idx = min(rec.downloads - 1, len(replies) - 1)
                return replies[idx]

            def fake_sleep(seconds, rec=rec):
                rec.waits.append(seconds)
                now[0] += seconds

            class FakeLogger:
                def __init__(self, video_id, _rec=rec):
                    self._rec = _rec

                def _put(self, message):
                    if brk != "無言":
                        self._rec.lines.append(message)

                debug = info = warning = error = _put

            fcd.download_chat_data = fake_download
            fcd.update_video = lambda v, rec=rec: rec.written.append(v.attempt_count)
            fcd.chat_file_exists = lambda vid: True
            fcd.find_chat_file_path = lambda vid: "/tmp/selftest.live_chat.json"
            fcd.parse_chat_file = lambda *a, **k: (["（仕込みの1件）"], _Stats())
            fcd.merge_chat_messages = lambda msgs: len(msgs)
            fcd.cleanup_chat_file = lambda vid: None
            fcd.VideoLogger = FakeLogger
            throttle.sleep = fake_sleep
            throttle.clock = lambda: now[0]

            # 7日の窓の内側（2晩目）。窓の外だと SKIPPED に落ちる別の道に入る
            rec.video = Video(
                video_id=f"selftest{i:02d}",
                status=VideoStatus.WAITING,
                first_seen_at=datetime.now(timezone.utc) - timedelta(hours=46),
                attempt_count=0,
            )
            result = fcd.process_video(rec.video, "selftest", "run-selftest", budget)
            rec.status = result.status
    finally:
        for n, v in saved.items():
            setattr(fcd, n, v)
        throttle.sleep, throttle.clock = saved_sleep, saved_clock
        throttle.RATE_LIMIT_MARKERS = markers
        throttle.is_rate_limited = real_rl

    return recs, budget


# ============================================================================
# 足（本物の判定も、対照も、ここを通る）
# ============================================================================

def leg_retry(brk: str = "") -> list[tuple[str, bool, str]]:
    """1. 429 のときだけ、決めた回数ぶん・決めた秒数で撃ち直す。"""
    waits = list(throttle.RETRY_WAITS_SECONDS)

    (r,), _ = measure([(False, ERR_429)], brk=brk)
    (ok,), _ = measure([(False, ERR_429), (True, None)], brk=brk)

    return [
        ("撃ち直しの回数", r.downloads == 1 + len(waits),
         f"yt-dlp を {r.downloads} 回叩いた（1 + {len(waits)}）"),
        ("待ち時間", r.waits == waits, f"{r.waits} 秒（決め: {waits}）"),
        ("待ちは増えていく", r.waits == sorted(set(r.waits)) and len(set(r.waits)) == len(r.waits),
         f"{r.waits}"),
        ("駄目なら FAILED で翌晩へ", r.status is VideoStatus.FAILED
         and r.video.next_retry_at is None, f"{r.status} / 次回 {r.video.next_retry_at}"),
        ("途中で通れば止まる", ok.downloads == 2 and ok.waits == waits[:1]
         and ok.status is VideoStatus.SUCCEEDED,
         f"{ok.downloads} 回叩いて {ok.waits} 秒待ち → {ok.status}"),
    ]


def leg_only_429(brk: str = "") -> list[tuple[str, bool, str]]:
    """2. 429 以外では1回で諦める。"""
    (r,), _ = measure([(False, ERR_GONE)], brk=brk)
    return [
        ("消えた動画は1回で諦める", r.downloads == 1 and r.waits == [],
         f"{r.downloads} 回叩いて {r.waits}"),
        ("その晩は FAILED", r.status is VideoStatus.FAILED, f"{r.status}"),
    ]


def leg_budget(brk: str = "") -> list[tuple[str, bool, str]]:
    """3. 上限に当たったら、それ以上粘らずに FAILED。"""
    waits = list(throttle.RETRY_WAITS_SECONDS)

    # 1本の上限。30秒なら1回目（20秒）しか入らない
    (one,), _ = measure([(False, ERR_429)], per_video=30, brk=brk)

    # 回ぜんたいの上限。1本目で使い切ると、2本目はもう粘れない
    (a, b), budget = measure([(False, ERR_429)], videos=2, per_run=30, brk=brk)

    return [
        ("1本の上限で止まる", one.waits == waits[:1] and one.downloads == 2,
         f"{one.waits} 秒 / {one.downloads} 回"),
        ("止めても FAILED（翌晩に回る）", one.status is VideoStatus.FAILED
         and one.video.next_retry_at is None, f"{one.status}"),
        ("回ぜんたいの上限で、2本目は粘らない", b.waits == [] and b.downloads == 1,
         f"1本目 {a.waits} / 2本目 {b.waits}"),
        ("財布は使ったぶん減る", budget.run_left < 30, f"残り {budget.run_left:.1f}秒"),
    ]


def leg_attempt(brk: str = "") -> list[tuple[str, bool, str]]:
    """4. **`attempt_count` が晩の中で増えない。**

    7日ルールはこの数ではなく `first_seen_at` で数えているが、
    晩の回数が狂うと「何晩ぶん撃ったか」が読めなくなる。
    ここは BigQuery に書かれる値なので、**書きに行ったときの値も見る。**
    """
    (r,), _ = measure([(False, ERR_429)], brk=brk)          # 3回撃ち直して駄目
    (ok,), _ = measure([(False, ERR_429), (True, None)], brk=brk)  # 撃ち直して成功

    return [
        ("粘っても晩の回数は1", r.video.attempt_count == 1,
         f"{r.downloads} 回叩いて attempt_count={r.video.attempt_count}"),
        ("書きに行った値も1のまま", set(r.written) == {1},
         f"update_video に渡った値 {r.written}"),
        ("成功した晩も1", ok.video.attempt_count == 1
         and set(ok.written) == {1},
         f"attempt_count={ok.video.attempt_count} / 書いた値 {ok.written}"),
    ]


def leg_log(brk: str = "") -> list[tuple[str, bool, str]]:
    """5. 何回目を何秒待って撃ったかが、**1行で**出る。"""
    (r,), _ = measure([(False, ERR_429)], brk=brk)
    (quiet,), _ = measure([(False, ERR_GONE)], brk=brk)

    hit = [ln for ln in r.lines if "撃ち直" in ln or "混雑" in ln]
    body = hit[0] if hit else ""
    want = [f"{n}回目は{w}秒" for n, w in
            zip(range(2, 2 + len(throttle.RETRY_WAITS_SECONDS)), throttle.RETRY_WAITS_SECONDS)]

    return [
        ("粘った晩は1行だけ出る", len(hit) == 1, f"{len(hit)} 行"),
        ("何回目を何秒待ったかが出る", all(w in body for w in want),
         body[:70] if body else "（1行も出ていない）"),
        ("撃ち直さない晩は1行も増えない",
         not [ln for ln in quiet.lines if "撃ち直" in ln or "混雑" in ln],
         f"{len(quiet.lines)} 行のうち混雑の行は 0"),
    ]


ALL_LEGS = {
    "撃ち直し": leg_retry,
    "見境": leg_only_429,
    "上限": leg_budget,
    "晩の回数": leg_attempt,
    "ログ": leg_log,
}

# 抜く足 → それで落ちてほしい足
DRILLS = {
    "見分け": "撃ち直し",
    "見境": "見境",
    "上限なし": "上限",
    "晩に足す": "晩の回数",
    "無言": "ログ",
}


# ============================================================================
# 対照 → 本物
# ============================================================================

def drill() -> bool:
    """**本物の判定を1つも出す前に**、足を1本ずつ抜いて対照が落ちることを見る。"""
    print("■ 対照（足を1本ずつ抜く）")
    ok = True

    # まず、**壊していない写しが通ること**（`island-misses.md` #99）
    for name, fn in ALL_LEGS.items():
        if not all(o for _, o, _ in fn("")):
            print(f"  ✕ 壊していないのに「{name}」が落ちる")
            ok = False

    for brk, leg in DRILLS.items():
        fell = [n for n, o, _ in ALL_LEGS[leg](brk) if not o]
        if fell:
            print(f"  ○ 「{brk}」を抜くと「{leg}」が落ちる（{len(fell)}件）")
        else:
            print(f"  ✕ 「{brk}」を抜いても「{leg}」が落ちない")
            ok = False
    return ok


def main() -> int:
    if set(ALL_LEGS) != set(LEGS) or set(DRILLS.values()) != set(LEGS):
        die("足の表と対照の表が食い違っている")
    if not throttle.RETRY_WAITS_SECONDS:
        die("待ち時間が1つも決まっていない")

    if not drill():
        print("\n✕ 対照が外れた。**本物の判定は1つも出していない**")
        return 2

    print(f"\n■ 本物（足 {len(LEGS)}本）")
    for name, fn in ALL_LEGS.items():
        print(f"□ {name}")
        for label, ok, saw in fn(""):
            say(label, ok, saw)

    print()
    print(f"見た {CHECKS}件 / 足 {len(LEGS)}本 / 落ちた {len(FAILED)}件")
    print(f"決め: 撃ち直し {len(throttle.RETRY_WAITS_SECONDS)}回 "
          f"{list(throttle.RETRY_WAITS_SECONDS)}秒 / "
          f"1本 {throttle.PER_VIDEO_BUDGET_SECONDS}秒 / "
          f"回ぜんたい {throttle.PER_RUN_BUDGET_SECONDS}秒")
    if FAILED:
        for n in FAILED:
            print(f"  ✕ {n}")
        return 1
    print("○ 通った")
    return 0


if __name__ == "__main__":
    sys.exit(main())
