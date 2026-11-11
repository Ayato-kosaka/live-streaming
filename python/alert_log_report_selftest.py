"""`python/alert_log_report.py` の見張り。**偽の行だけで回す**（BigQuery を引かない）。

    python3 python/alert_log_report_selftest.py

## 何を守っているか

**本物の配信で演出が出なかったら、終了コード 1 で知らせること**（#1160）。
11/8 は「出なかった」がログに1行も残らず、数でも追えなかった。いまは
記録（`fxPlan` ほか）が BigQuery に写っているので、ここが読み違えると
**また黙って通る。** 黙って効かなくなる道を、両側から当てる。

  1. **異常のある日を「異常なし」と読む**（理由の読み違い・`fxPlan` 抜けの見落とし・
     止まった動画の見落とし）→ 終了 0 で、監視が #1160 に何も書かない
  2. **異常の無い日を「異常あり」と読む**（動画の段でない額・試し・もう一度を
     本物の失敗に数える）→ 毎回「異常あり」で、誰も読まなくなる
  3. **試しやもう一度を本物に数える** → 投げ銭の数が狂う
  4. **確かめの回（Actions の Chromium）を本物の配信に混ぜる**
  5. **名前・メッセージ・通知の ID を表に出す**（公開の Actions のログに載る）
  6. **読めなかったときに「異常なし」へ倒す**

## 対照（`docs/island-standards.md` §15）

道具の判断を1本ずつ外した写しで回して、**狙った行が赤くなる**ことを見る。
外しても何も赤くならなければ、その行は最初から何も見ていない。

終了コード 0=通った / 1=落ちた / 2=確かめられなかった
"""

from __future__ import annotations

import contextlib
import importlib.util
import io
import json
import os
import sys
import tempfile
from datetime import datetime, timedelta, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
TOOL = os.path.join(HERE, "alert_log_report.py")

T0 = datetime(2026, 11, 10, 13, 0, tzinfo=timezone.utc)  # 22:00 JST
SECRET = ["にせものの名前", "にせもののひとこと", "LCC.ひみつのID", "doneru-ひみつ"]


def load(tag: str):
    """道具を毎回読み直す（対照で書き換えた写しが、次に残らないように）。"""
    spec = importlib.util.spec_from_file_location(f"alert_log_report_{tag}", TOOL)
    mod = importlib.util.module_from_spec(spec)
    # dataclass は自分のモジュールを sys.modules から引くので、先に置く
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)
    return mod


class Day:
    """1日ぶんの偽の行を組む。"""

    def __init__(self, sid_at: datetime, ua: str = "Mozilla/5.0 (Linux; Android 14; wv) PRISM"):
        self.sid = int(sid_at.timestamp() * 1000)
        self.ua = ua
        self.t = sid_at
        self.rows: list[dict] = []

    def add(self, event: str, data: dict | None = None, dt: float = 1.0):
        self.t += timedelta(seconds=dt)
        self.rows.append({
            "received_at": (self.t + timedelta(milliseconds=150)).isoformat(),
            "logged_at": self.t.isoformat(),
            "session_id": self.sid, "source": "abcdef012345", "event": event,
            "git_commit": "0123456789abcdef", "notification_id": (data or {}).get("id"),
            "data": json.dumps(data or {}, ensure_ascii=False), "ua": self.ua,
        })
        return self

    def tip(self, yen: int, plan: dict | None, *, kind: str = "donation", test: bool = False,
            nid: str | None = "doneru-ひみつ", received: bool = True, after=None):
        n = {"type": kind, "nickname": SECRET[0], "message": SECRET[1], "test": test}
        if nid is not None:
            n["id"] = nid
        if kind == "superchat":
            n.update({"jpy": yen, "amount": yen, "currency": "¥", "id": nid or "LCC.ひみつのID"})
        else:
            n["amount"] = yen
        if received:
            self.add("notificationReceived", n, dt=30)
        self.add("notificationDisplayed", n, dt=0.2)
        if plan is not None:
            self.add("fxPlan", {"id": n.get("id"), "yen": yen, **plan}, dt=0.4)
        for ev, d in (after or []):
            self.add(ev, d, dt=2)
        return self


OK = {"video": True, "why": None, "waitMs": 120, "tier": "t3"}
FAR = {"video": True, "why": None, "waitMs": 900, "tier": "t6"}


def good_day() -> list[dict]:
    """異常の無い日。動画の段でない額・もう一度・通知テストも混ぜる。"""
    d = Day(T0)
    d.add("mount", {"enabledSources": ["doneru", "youtube"]}).add("initSuccess", {"goal": {}})
    d.add("fxHeld", {"got": 33, "failed": 0, "bytes": 1})
    d.tip(2000, OK)
    d.tip(200, {"video": False, "why": "noTier", "waitMs": 3})
    d.tip(1000, FAR, kind="superchat", nid="LCC.ひみつのID")
    # 机の「もう一度出す」（notificationReceived は無い。id が replay-…）
    d.tip(3000, OK, nid="replay-7", test=True, received=False)
    # Doneru の通知テスト（id が無い）
    d.tip(500, OK, nid=None, test=True)
    return d.rows


def bad_day() -> list[dict]:
    """異常のある日。理由つきで外れた・fxPlan 抜け・動画が止まった・遅れて用意。"""
    d = Day(T0 + timedelta(days=1))
    d.add("mount", {}).add("initSuccess", {})
    d.tip(2000, OK)
    d.tip(2000, {"video": False, "why": "timeout", "waitMs": 8000},
          after=[("fxPrepLate", {"id": "doneru-ひみつ", "ok": True, "ms": 9500})])
    d.tip(800, None)  # 出したのに fxPlan が無い
    d.tip(5000, OK, after=[("fxVideoFailed", {"sec": 3, "why": "stall", "tier": "t5"})])
    return d.rows


def new_reason_day() -> list[dict]:
    """知らない理由で外れた日（面に新しい理由が増えた）。**合格へ倒さない。**"""
    d = Day(T0 + timedelta(days=2))
    d.add("mount", {})
    d.tip(2000, {"video": False, "why": "somethingNew", "waitMs": 10})
    return d.rows


def probe_day() -> list[dict]:
    """確かめの回（Actions の Chromium）。既定では数えない。"""
    d = Day(T0 + timedelta(days=3), ua="Mozilla/5.0 HeadlessChrome alert-log-probe")
    d.add("mount", {}).add("initSuccess", {})
    d.tip(2000, {"video": False, "why": "timeout", "waitMs": 8000}, nid=None, test=True)
    return d.rows


def run(mod, rows: list[dict], *args: str) -> tuple[int, str, dict]:
    """道具の main を偽の行で回して、終了コード・出力・要約を返す。"""
    with tempfile.TemporaryDirectory() as tmp:
        src = os.path.join(tmp, "rows.jsonl")
        with open(src, "w", encoding="utf-8") as f:
            for r in rows:
                f.write(json.dumps(r, ensure_ascii=False) + "\n")
        js = os.path.join(tmp, "out.json")
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            rc = mod.main(["--rows", src, "--since", (T0 - timedelta(hours=1)).isoformat(),
                           "--until", (T0 + timedelta(days=5)).isoformat(), "--json", js, *args])
        d = {}
        if os.path.exists(js):
            with open(js, encoding="utf-8") as f:
                d = json.load(f)
        return rc, out.getvalue() + err.getvalue(), d


def suite(mod) -> dict[str, tuple[bool, str]]:
    """判断のところを全部当てる。名前 → (通ったか, 添え書き)。"""
    r: dict[str, tuple[bool, str]] = {}

    rc, text, d = run(mod, good_day())
    r["good_rc"] = (rc == 0 and "異常あり" not in text, f"rc={rc}")
    r["good_counts"] = (
        d.get("received") == 3 and d.get("displayed") == 3 and d.get("fx_ok") == 2
        and d.get("replays") == 1 and d.get("tests") == 1 and d.get("new_money") == 5,
        json.dumps({k: d.get(k) for k in ("received", "displayed", "fx_ok", "replays", "tests", "new_money")}))
    r["good_wait"] = ("120 / 900" in text, "待った ms の中央/最大")

    rc, text, d = run(mod, bad_day())
    r["bad_rc"] = (rc == 1 and "異常あり" in text, f"rc={rc}")
    r["bad_missed"] = (d.get("missed") == 2 and "timeout×1" in text and "videoFailed:stall×1" in text,
                       f"missed={d.get('missed')}")
    r["bad_noplan"] = (d.get("noplan") == 1, f"noplan={d.get('noplan')}")
    r["bad_late"] = (d.get("fx_prep_late") == 1 and d.get("fx_video_failed") == 1,
                     f"late={d.get('fx_prep_late')} failed={d.get('fx_video_failed')}")

    rc, text, d = run(mod, new_reason_day())
    r["new_reason"] = (rc == 1 and "somethingNew×1" in text, f"rc={rc}")

    # 確かめの回は既定で数えない。入れれば数える。--expect で欠けを見る
    rc, text, d = run(mod, probe_day())
    r["probe_hidden"] = (rc == 0 and d.get("opened") == 0 and "無し" in text, f"rc={rc} opened={d.get('opened')}")
    rc, text, d = run(mod, probe_day(), "--include-probe", "--expect", "mount,initSuccess,fxPlan")
    r["probe_shown"] = (d.get("opened") == 1 and d.get("tests") == 1 and d.get("expect_missing") == [],
                        f"opened={d.get('opened')} missing={d.get('expect_missing')}")
    rc2, _, d2 = run(mod, good_day(), "--expect", "mount,unmount")
    r["expect"] = (rc2 == 1 and d2.get("expect_missing") == ["unmount"], f"rc={rc2}")

    # 窓の外は読まない
    rc, text, d = run(mod, good_day() + bad_day(), "--until", (T0 + timedelta(hours=6)).isoformat())
    r["window"] = (rc == 0 and d.get("received") == 3, f"rc={rc} received={d.get('received')}")

    # 何も無い日は 0 で「無し」
    rc, text, d = run(mod, [])
    r["empty"] = (rc == 0 and "新しい投げ銭: 無し" in text and d.get("new_money") == 0, f"rc={rc}")

    # 素性を出さない（表・要約・異常の文のどれにも）
    leaks = []
    for rows in (good_day(), bad_day(), probe_day()):
        for extra in ((), ("--detail",)):
            _, text, d = run(mod, rows, "--include-probe", *extra)
            blob = text + json.dumps(d, ensure_ascii=False)
            leaks += [s for s in SECRET if s in blob]
    r["privacy"] = (not leaks, f"出たもの {sorted(set(leaks))}")

    # 出来事の並び（--detail）に、止まった動画の秒と理由が出る
    _, text, _ = run(mod, bad_day(), "--detail")
    r["detail"] = ('| fxVideoFailed | {"sec":3,"why":"stall","tier":"t5"} |' in text
                   and "missed（videoFailed:stall）" in text, "出来事の並び")

    # 読めなかったら 2（「異常なし」に倒さない）
    def boom(*_a, **_k):
        raise RuntimeError("404 Not found: Table live-streaming-d3cac:youtube_chat.alertbox_logs")

    orig = mod.fetch
    mod.fetch = boom
    out, err = io.StringIO(), io.StringIO()
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        rc = mod.main(["--hours", "1"])
    mod.fetch = orig
    r["unreadable"] = (rc == 2 and "表がまだ無い" in err.getvalue(), f"rc={rc}")
    return r


NAMES = {
    "good_rc": "異常の無い日は 0（動画の段でない額・もう一度・通知テストは異常にしない）",
    "good_counts": "本物・もう一度・通知テストを分けて数える",
    "good_wait": "待った ms の中央値と最大",
    "bad_rc": "異常のある日は 1",
    "bad_missed": "外れた理由（timeout・止まった動画）を数える",
    "bad_noplan": "fxPlan の無いまま出た通知を数える",
    "bad_late": "fxPrepLate と fxVideoFailed を数える",
    "new_reason": "知らない理由で外れたら、出なかったに数える",
    "probe_hidden": "確かめの回は既定で数えない",
    "probe_shown": "--include-probe で数え、--expect が通る",
    "expect": "--expect の欠けは 1",
    "window": "窓の外の行は読まない",
    "empty": "何も無い窓は 0 で「無し」",
    "privacy": "名前・メッセージ・通知の ID を出さない（--detail でも）",
    "detail": "--detail に、止まった動画の秒と理由が出る",
    "unreadable": "読めなかったら 2",
}

#: 対照。名前 → (道具を壊す関数, 赤くなるはずの行)
def _why_ok(m):
    m.NOT_VIDEO_TIER = set(m.NOT_VIDEO_TIER) | {"timeout", "somethingNew"}


def _noplan_ok(m):
    orig = m.Note.outcome
    m.Note.outcome = lambda self: ("novideo", "x") if self.plan is None else orig(self)


def _failed_ignored(m):
    orig = m.Session.anomalies
    m.Session.anomalies = lambda self: [a for a in orig(self) if not a.startswith("fxVideoFailed")]
    m.Note.outcome = (lambda o: lambda self: ("ok", None) if self.plan and self.plan.get("video") else o(self))(
        m.Note.outcome)


def _all_real(m):
    m.kind_of = lambda data: "real"


def _probe_mixed(m):
    m.PROBE_MARK = "\0never"


def _leak(m):
    orig = m.table
    m.table = lambda sessions: orig(sessions) + "\n" + " ".join(
        str((n.nid or "")) for s in sessions for n in s.notes)


def _detail_all(m):
    # 出してよい項目の表を見ずに、中身を丸ごと出す
    m._pick = lambda ev, d: json.dumps(d, ensure_ascii=False)


def _detail_blind(m):
    m.DETAIL_KEYS = {k: v for k, v in m.DETAIL_KEYS.items() if k != "fxVideoFailed"}


def _unreadable_ok(m):
    orig = m.main

    def main(argv=None):
        rc = orig(argv)
        return 0 if rc == 2 else rc

    m.main = main


BREAKS = {
    "why_ok": (_why_ok, "bad_missed"),
    "noplan_ok": (_noplan_ok, "bad_noplan"),
    "failed_ignored": (_failed_ignored, "bad_missed"),
    "all_real": (_all_real, "good_counts"),
    "probe_mixed": (_probe_mixed, "probe_hidden"),
    "leak": (_leak, "privacy"),
    "detail_all": (_detail_all, "privacy"),
    "detail_blind": (_detail_blind, "detail"),
    "unreadable_ok": (_unreadable_ok, "unreadable"),
}


def main() -> int:
    bad = 0
    print("# 1. 判断のところ（いまの道具で）")
    base = suite(load("base"))
    if not base["good_rc"][0] and not base["bad_rc"][0]:
        print("確かめられない: 異常の無い日も有る日も読めていない（偽の行か道具が壊れている）")
        return 2
    for k, (ok, why) in base.items():
        print(f"  {'ok  ' if ok else 'FAIL'} {NAMES[k]}{'' if ok else f'（{why}）'}")
        bad += 0 if ok else 1

    print("\n# 2. 対照（判断を1本ずつ外して、狙った行が赤くなるか）")
    for name, (brk, target) in BREAKS.items():
        m = load(name)
        brk(m)
        got = suite(m)
        red = [k for k, (ok, _) in got.items() if not ok]
        ok = target in red
        print(f"  {'ok  ' if ok else 'FAIL'} {name} を外すと「{NAMES[target]}」が赤くなる"
              f"{'' if ok else f'（赤くなったもの {red}）'}")
        bad += 0 if ok else 1

    print(f"\n{'落ちた ' + str(bad) + '件' if bad else 'ぜんぶ通った'}")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
