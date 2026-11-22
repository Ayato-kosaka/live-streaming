"""**Instagram のリールを上げる・予約する手（`ig_post.py`）の見張り。EC2 にも Instagram にも触らない。**

    python3 tools/shorts/post/ig_post_selftest.py
    BREAK=lead python3 tools/shorts/post/ig_post_selftest.py   # 守りを1つ外した版で回す（対照の子）

終了コード 0=通った / 1=落ちた / **2=数えるものが無い・外す字が見つからない**
（`docs/island-standards.md` §15）。

回し役（`python/selftest_runner.py`）が `tools/shorts/` を降りて拾う。要るのは Python だけ。

## 何を見るか

2026-11-22 に Instagram の口を足した（#1353）。web の投稿の窓の最後の段に「Schedule content」があり、
オンにすると日付の箱（「Sun, Nov 22, 2026」。押すと暦）と、時刻の欄（Hours / Minutes / AM PM の spinbutton）が出る。
暦のますは `[role=gridcell]` で、押せない日は `aria-disabled="true"`。**尻に次の月の日が並ぶ**（11月の暦は 30 のあとに 12/1〜5）。
月の頭が日曜でない月は頭に前の月の日も並ぶはずなので、字だけで探さない。

`ig_post.py` の `cdp`（EC2 にしか無い）を偽物に差し替えて読み込み、**本物の関数**を回す。
11月の暦は、2026-11-22 09:05 UTC に Instagram の投稿の窓で開いて写した並び（`NOV_2026`）をそのまま使う。
`set_schedule` の配線は、日付の箱・暦・時刻の欄を真似る偽のタブ（`FakeTab`）で回す。
`post` の門（押す前の確かめ）は、窓を作る手を差し替えて、押したか・捨てたかを数える。
カバーは「Select from computer」に絵を渡しても替わらなかったので、コマの枠を引いて選ぶ。その手は枠を真似る偽のタブ（`CoverTab`）で回す。

| 足 | 確かめること |
| --- | --- |
| `pick_tomorrow` | 写した11月の暦で、11/23 を押す位置が 22（字は「23」・押せる） |
| `pick_lead` | 頭に前の月の日（11/29・11/30）が並ぶ12月の暦で、12/1 は 2番・12/30 は 31番（字だけで探さない） |
| `past_refused` | 押せない日（11/21）は押さずに `date_not_selectable` |
| `grid_guard` | 並びが写したときと違う（日が抜けている・月末で切れていない）なら押さずに `calendar_grid_unexpected` |
| `month_steps` | 日付の箱の字から、同じ月は0・次の月は1・年をまたいで1・前の月は-1。読めない字は None |
| `labels` | 日付の箱の字（「Sun, Nov 22, 2026」「Tue, Dec 1, 2026」）と、時刻の欄の字（12:30 は 12 / 30 / PM、0:30 は 12 / 30 / AM、9:05 は 9 / 05 / AM） |
| `parse_at` | `--at` の読み。分が5の倍数でない・あり得ない日付・24時は None |
| `wired_tomorrow` | `set_schedule` が暦を開いて 11/23 を押し、時刻を打って、読み直しが Mon, Nov 23, 2026 / 12 30 PM |
| `wired_next_month` | 11/22 の箱から 12/1 は「Next month」を1回押してから日を押す |
| `wired_mismatch` | 時刻の欄が打った字を受け付けない（読み直しが違う）なら ok にしない |
| `gate_dry` | `--dry` では、確かめが全部通っても押さずに捨てる |
| `gate_schedule` | 予約のときに押すのは「Schedule」。押したあと、できたリールの media の pk を応答（configure_to_clips）から1つ拾って ok |
| `gate_facebook` | 「Facebook にもシェア」が外せない（オンのまま）なら押さない |
| `gate_too_soon` | いまから15分を切る予約は窓を開く前に止める（近すぎると今すぐ出る・断られる） |
| `cover_small` | カバーのコマを 0.5秒（55秒の動画で枠を 2px）にできる。数 px だけ引くと押しただけになって動かないので、いったん越えてから戻す |
| `cover_far` | 2.2秒（44秒の動画）のコマを、引いた結果から 1px あたりの秒を測り直して選べる。動画より後ろの秒は止める |

## 守りを1つずつ外す（§15「対照は、足の数だけ用意する」）

下の `CUTS` が `ig_post.py` の**本物の字**を1か所だけ書き換えた写しを作り、それで足を全部回す。
**外した守りの足だけが落ちる**ことを確かめる。外す字が本物に見つからなければ 2 で落ちる。
"""

from __future__ import annotations

import datetime
import importlib.util
import json
import os
import re
import subprocess
import sys
import tempfile
import traceback
import types
from pathlib import Path

HERE = Path(__file__).resolve().parent
BREAK = os.environ.get("BREAK", "")

# 外す守り: 名前 → (本物の字, 書き換えた字, 落ちるはずの足, 何を外すか)
CUTS: dict[str, tuple[str, str, set[str], str]] = {
    "lead": ('    i0 = texts.index("1")\n', "    i0 = 0\n", {"pick_lead", "wired_next_month"}, "「1」の位置から数えない（並びの頭から数える）"),
    "valid": ('    if cells[k][1] != "false":\n', "    if False:\n", {"past_refused"}, "押せない日（aria-disabled）を見ない"),
    "grid": ('    if month != [str(d) for d in range(1, ndays + 1)] or (len(texts) > i0 + ndays and texts[i0 + ndays] != "1"):\n', "    if False:\n",
             {"grid_guard"}, "並びが 1〜月末で切れているかを見ない"),
    "ampm": ('"AM" if want.hour < 12 else "PM"', '"PM" if want.hour < 12 else "AM"', {"labels", "wired_tomorrow", "wired_next_month"},
             "午前と午後を取り違える"),
    "readback": ("    ok = bool(box) and box[0] == want_label and got_time == (hh, mm, ap) and not still_open\n",
                 "    ok = bool(box)\n", {"wired_mismatch"}, "時刻の欄を読み直さずに ok にする"),
    "dry": ("    if not ok or dry or probe:\n", "    if not ok or probe:\n", {"gate_dry"}, "--dry でも押す"),
    "fb": ("    ok = cap_ok and ai is False and fb is False and bool(btn)", "    ok = cap_ok and ai is False and bool(btn)",
           {"gate_facebook"}, "Facebook にもシェアがオンのままでも押す"),
    "button": ('    label = "Schedule" if want else "Share"\n', '    label = "Share"\n', {"gate_schedule", "gate_dry"},
               "予約なのに Share（今すぐ出る）を探して押す"),
    "soon": ("        if lead < 15:\n", "        if lead < -10 ** 9:\n", {"gate_too_soon"}, "近すぎる予約を止めない"),
    "away": ("        if abs(dx) < 6:\n", "        if False:\n", {"cover_small"}, "数 px だけ引く（押しただけになって枠が動かない）"),
    "cover_read": ("        if abs(s[\"t\"] - sec) <= COVER_TOL:\n            return {\"ok\": True", "        if True:\n            return {\"ok\": True",
                   {"cover_small", "cover_far"}, "枠の秒を読み直さずに ok にする"),
}

# 2026-11-22 09:05 UTC に Instagram の投稿の窓で日付の箱を押して写した11月の暦（[字, aria-disabled, aria-selected]）。
# 11/1 は日曜で頭に前の月の日は無い。21日までは押せない、22日（今日）が選ばれている、尻の 12/1〜5 は押せない
NOV_2026 = ([[str(d), "true", "false"] for d in range(1, 22)] + [["22", "false", "true"]]
            + [[str(d), "false", "false"] for d in range(23, 31)] + [[str(d), "true", "false"] for d in range(1, 6)])


def month_grid(y: int, m: int, today: datetime.date):
    """偽の暦の1か月ぶん（日曜はじまり）。頭に前の月の日、尻に次の月の日を週の終わりまで。
    押せるのは今日から先の今月の日だけ（前後の月の日は押せない。写した11月と同じ）"""
    first = datetime.date(y, m, 1)
    nxt = (first.replace(day=28) + datetime.timedelta(days=4)).replace(day=1)
    last = nxt - datetime.timedelta(days=1)
    lead = (first.weekday() + 1) % 7
    cells = []
    for i in range(lead, 0, -1):
        cells.append([str((first - datetime.timedelta(days=i)).day), "true", "false"])
    for d in range(1, last.day + 1):
        day = datetime.date(y, m, d)
        cells.append([str(d), "false" if day >= today else "true", "true" if day == today else "false"])
    tail = (7 - len(cells) % 7) % 7
    cells += [[str(d), "true", "false"] for d in range(1, tail + 1)]
    return cells


def load_tools(src: Path):
    """src の ig_post.py を、cdp を偽物に差し替えて読み込む。shot・log・sleep は何もしない"""
    fake = types.ModuleType("cdp")
    fake.Tab = object
    fake.up = fake.pages = fake.where = fake._port = lambda *a, **k: None
    sys.modules["cdp"] = fake
    name = f"ig_post_under_test_{abs(hash(str(src)))}"
    spec = importlib.util.spec_from_file_location(name, src / "ig_post.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    mod.shot = lambda t, n: None
    mod.log = lambda *a: None
    mod.time = types.SimpleNamespace(sleep=lambda s: None, time=__import__("time").time,
                                     strftime=__import__("time").strftime)
    return mod


class FakeTab:
    """日付の箱・暦・時刻の欄を真似る。押す座標で何を押したかを決める"""

    BOX = (900, 676)
    NEXT = (600, 300)
    SWITCH = (1043, 611)

    def __init__(self, m, now: datetime.date, shown: datetime.date, accept_time=True):
        self.m, self.today, self.shown = m, now, shown
        self.view = (shown.year, shown.month)
        self.cal = False
        self.focus = None
        self.spin = {"Hours": "10", "Minutes": "15", "AM PM": "AM"}
        self.typed = ""
        self.accept_time = accept_time
        self.clicks = []

    def cells(self):
        return month_grid(*self.view, self.today)

    def js(self, expr, await_promise=False):
        m = self.m
        if expr == m.DATE_BOX:
            return [m.date_label(self.shown), *self.BOX]
        if expr == m.CELLS:
            return self.cells() if self.cal else []
        if expr == m.SPIN:
            return [[k, v, "", ""] for k, v in self.spin.items()]
        if "Next month" in expr:
            return list(self.NEXT) if self.cal else None
        return None

    def center(self, expr):
        g = re.search(r"\[role=gridcell\]'\)\]\.filter\(.*\)\[(\d+)\]$", expr)
        if g:
            return [100, 1000 + int(g.group(1))]
        s = re.search(r'aria-label="(Hours|Minutes|AM PM)"', expr)
        if s:
            return [50, {"Hours": 1, "Minutes": 2, "AM PM": 3}[s.group(1)]]
        return None

    def click_at(self, x, y):
        self.clicks.append((x, y))
        if (x, y) == self.BOX:
            self.cal = not self.cal
        elif (x, y) == self.NEXT and self.cal:
            y_, m_ = self.view
            self.view = (y_ + (m_ == 12), m_ % 12 + 1)
        elif x == 100 and self.cal:
            c = self.cells()[y - 1000]
            if c[1] == "false":
                idx = y - 1000
                lead = next(i for i, cc in enumerate(self.cells()) if cc[0] == "1")
                self.shown = datetime.date(*self.view, idx - lead + 1)
                self.cal = False
        elif x == 50:
            self.focus = {1: "Hours", 2: "Minutes", 3: "AM PM"}[y]
            self.typed = ""

    def key(self, key, code=None, vk=None):
        if key == "Escape":
            self.cal = False

    def call(self, method, **p):
        if method == "Input.dispatchKeyEvent" and p.get("type") == "keyDown" and self.focus and self.accept_time:
            self.typed += p["text"]
            if self.focus == "AM PM":
                self.spin["AM PM"] = "PM" if self.typed[-1].upper() == "P" else "AM"
            elif self.focus == "Hours":
                self.spin["Hours"] = str(int(self.typed[-2:]))
            else:
                self.spin["Minutes"] = self.typed[-2:].zfill(2)
        return {}


def _safe(fn, *a, **k):
    try:
        return fn(*a, **k)
    except Exception as e:  # 落ちた足は「通らなかった」として数える（見張りごと落とさない）
        return ("raised", f"{type(e).__name__}: {e}", traceback.format_exc(limit=2))


D = datetime.datetime


def leg_pick_tomorrow(m):
    got = _safe(m.pick_day, NOV_2026, D(2026, 11, 23, 12, 30))
    return [("11/23 は 22番（字は 23・押せる）", got == (22, None) and NOV_2026[22][0] == "23")]


def leg_pick_lead(m):
    dec = month_grid(2026, 12, datetime.date(2026, 11, 22))
    return [("12月の暦は頭に 29・30 が並ぶ（写しの作りの確かめ）", [c[0] for c in dec[:3]] == ["29", "30", "1"]),
            ("12/1 は 2番", _safe(m.pick_day, dec, D(2026, 12, 1, 12, 30)) == (2, None)),
            ("12/30 は 31番（頭の 30 ではない）", _safe(m.pick_day, dec, D(2026, 12, 30, 12, 30)) == (31, None))]


def leg_past_refused(m):
    return [("11/21（押せない）は押さない", _safe(m.pick_day, NOV_2026, D(2026, 11, 21, 12, 30)) == (None, "date_not_selectable"))]


def leg_grid_guard(m):
    holed = NOV_2026[:10] + NOV_2026[11:]  # 11日が抜けた並び
    run_on = NOV_2026[:30] + [["31", "false", "false"]] + NOV_2026[30:]  # 11月に 31日がある並び
    return [("日が抜けていれば押さない", _safe(m.pick_day, holed, D(2026, 11, 23, 12, 30)) == (None, "calendar_grid_unexpected")),
            ("月末で切れていなければ押さない", _safe(m.pick_day, run_on, D(2026, 11, 23, 12, 30)) == (None, "calendar_grid_unexpected")),
            ("「1」が無ければ押さない", _safe(m.pick_day, [["x", "false", "false"]], D(2026, 11, 23, 12, 30)) == (None, "calendar_grid_unexpected"))]


def leg_month_steps(m):
    s = "Sun, Nov 22, 2026"
    return [("同じ月は0", _safe(m.month_steps, s, D(2026, 11, 26)) == 0),
            ("次の月は1", _safe(m.month_steps, s, D(2026, 12, 1)) == 1),
            ("年をまたいで1", _safe(m.month_steps, "Thu, Dec 31, 2026", D(2027, 1, 2)) == 1),
            ("前の月は-1", _safe(m.month_steps, s, D(2026, 10, 30)) == -1),
            ("読めない字は None", _safe(m.month_steps, "November 2026", D(2026, 11, 26)) is None)]


def leg_labels(m):
    return [("11/22 は「Sun, Nov 22, 2026」", _safe(m.date_label, D(2026, 11, 22)) == "Sun, Nov 22, 2026"),
            ("12/1 は「Tue, Dec 1, 2026」（日に0を付けない）", _safe(m.date_label, D(2026, 12, 1)) == "Tue, Dec 1, 2026"),
            ("12:30 は 12 / 30 / PM", _safe(m.want_time, D(2026, 11, 22, 12, 30)) == ("12", "30", "PM")),
            ("0:30 は 12 / 30 / AM", _safe(m.want_time, D(2026, 11, 25, 0, 30)) == ("12", "30", "AM")),
            ("9:05 は 9 / 05 / AM", _safe(m.want_time, D(2026, 11, 25, 9, 5)) == ("9", "05", "AM"))]


def leg_parse_at(m):
    return [("2026-11-22T12:30:00Z を読む", _safe(m.parse_at, "2026-11-22T12:30:00Z") == D(2026, 11, 22, 12, 30)),
            ("2026-11-25T00:30 を読む", _safe(m.parse_at, "2026-11-25T00:30") == D(2026, 11, 25, 0, 30)),
            ("分が5の倍数でなければ None", _safe(m.parse_at, "2026-11-22T12:31:00Z") is None),
            ("あり得ない日付は None", _safe(m.parse_at, "2026-11-31T12:30:00Z") is None),
            ("24時は None", _safe(m.parse_at, "2026-11-22T24:00:00Z") is None)]


SW_OFF = [["Add AI label", "false", [1043, 516], True], ["Schedule content", "false", list(FakeTab.SWITCH), True],
          ["小坂 彩人 Facebook · Public", "false", [1043, 856], True]]


def _wired(m, now, shown, want, accept=True):
    t = FakeTab(m, now, shown, accept_time=accept)
    r = _safe(m.set_schedule, t, want, SW_OFF)
    return t, r


def leg_wired_tomorrow(m):
    t, r = _wired(m, datetime.date(2026, 11, 22), datetime.date(2026, 11, 22), D(2026, 11, 23, 12, 30))
    ok = isinstance(r, dict) and r.get("ok") and r.get("date") == "Mon, Nov 23, 2026" and r.get("time") == ("12", "30", "PM")
    return [("11/23 12:30 PM と読み直して ok", bool(ok)),
            ("予約のスイッチを押した", tuple(FakeTab.SWITCH) in t.clicks)]


def leg_wired_next_month(m):
    t, r = _wired(m, datetime.date(2026, 11, 22), datetime.date(2026, 11, 22), D(2026, 12, 1, 0, 30))
    ok = isinstance(r, dict) and r.get("ok") and r.get("date") == "Tue, Dec 1, 2026" and r.get("time") == ("12", "30", "AM")
    return [("12/1 0:30 は次の月へ1回送って ok", bool(ok)),
            ("Next month を1回だけ押した", t.clicks.count(FakeTab.NEXT) == 1)]


def leg_wired_mismatch(m):
    t, r = _wired(m, datetime.date(2026, 11, 22), datetime.date(2026, 11, 22), D(2026, 11, 23, 12, 30), accept=False)
    return [("時刻の欄が受け付けなければ ok にしない", isinstance(r, dict) and r.get("ok") is False
             and r.get("error") == "schedule_readback_mismatch")]


class CoverTab:
    """「Cover photo」の枠を真似る。帯は 771〜1062px、枠の幅 70px、放した所が押した所から 5px 未満なら押しただけ（動かない）"""

    def __init__(self, m, dur):
        self.m, self.dur, self.t = m, dur, 0.01
        self.left, self.right, self.w = 771, 1062, 70
        self.press_x = None

    def span(self):
        return self.right - self.left - self.w

    def js(self, expr, await_promise=False):
        if expr == self.m.COVER_SEL:
            x = self.left + self.t / self.dur * self.span()
            return {"x": x, "y": 186, "w": self.w, "h": 102, "t": self.t, "dur": self.dur, "left": self.left, "right": self.right}
        return None

    def call(self, method, **p):
        if method == "Input.dispatchMouseEvent":
            if p["type"] == "mousePressed":
                self.press_x = p["x"]
            elif p["type"] == "mouseReleased" and self.press_x is not None:
                dx = p["x"] - self.press_x
                if abs(dx) >= 5:
                    self.t = round(min(max(self.t + dx / self.span() * self.dur, 0.0), self.dur) * 30) / 30
                self.press_x = None
        return {}


def leg_cover_small(m):
    t = CoverTab(m, 55.0)
    r = _safe(m.set_cover_frame, t, 0.5)
    return [("55秒の動画で 0.5秒（2px 先）のコマを選べる", isinstance(r, dict) and r.get("ok") is True and abs(t.t - 0.5) <= 0.25)]


def leg_cover_far(m):
    t = CoverTab(m, 44.0)
    r = _safe(m.set_cover_frame, t, 2.2)
    return [("44秒の動画で 2.2秒のコマを選べる", isinstance(r, dict) and r.get("ok") is True and abs(t.t - 2.2) <= 0.25),
            ("枠を動かせない所（動画より後ろ）は止める", _safe(m.set_cover_frame, CoverTab(m, 44.0), 50.0).get("error") == "cover_after_end")]


class GateTab:
    """post() の門だけを見る偽のタブ。押した座標と、Network の応答（符号）を持つ"""

    def __init__(self, code="DQabc123XYZ"):
        self.clicks = []
        self.events = [{"method": "Network.responseReceived",
                        "params": {"requestId": "1", "response": {"url": "https://www.instagram.com/api/v1/media/configure_to_clips/"}}}]
        self.body = json.dumps({"media": {"pk": "4036016121881966641"}, "status": "ok"})
        self.done_said = False

    def js(self, expr, await_promise=False):
        if "getTimezoneOffset" in expr:
            return 0
        return None

    def call(self, method, **p):
        if method == "Network.getResponseBody":
            return {"body": self.body}
        return {}

    def click_at(self, x, y):
        self.clicks.append((x, y))


def _gate(m, *, at="2026-11-23T12:30", dry=False, fb_stuck=False, now=D(2026, 11, 22, 9, 0)):
    """窓を作る手・字を貼る手・スイッチ・予約の手を差し替えて post() を回し、(押したか, 捨てたか, RESULT) を返す"""
    t = GateTab()
    out, discarded = [], []
    m.compose = lambda tab, mp4, cover: None
    m.paste_caption = lambda tab, cap: cap
    sw = [list(r) for r in SW_OFF]
    if fb_stuck:
        sw[2][1] = "true"
    sched_on = [False]

    def switches(tab):
        return [list(r[:1]) + ["true" if (r[0].startswith("Schedule") and sched_on[0]) else r[1]] + r[2:] for r in sw]

    def set_schedule(tab, want, s):
        sched_on[0] = True
        return {"ok": True, "date": m.date_label(want), "time": m.want_time(want)}
    m.switches = switches
    m.set_schedule = set_schedule
    btns = {"Schedule": (1048, 109)} if at else {"Share": (1058, 109)}
    m.find_btn = lambda tab, rx, scope="document": next((list(v) for k, v in btns.items() if re.search(rx.strip("/"), k)), None)
    m.discard = lambda tab: discarded.append(1) or True
    said = iter([[], ["Reel scheduled Your reel has been scheduled."]] + [["Reel scheduled"]] * 50)
    m.dialogs = lambda tab: next(said)
    m.press = lambda *a, **k: False
    m.result = lambda d: out.append(d)

    class Clock(datetime.datetime):
        @classmethod
        def now(cls, tz=None):
            return now.replace(tzinfo=tz) if tz else now
    m.datetime = types.SimpleNamespace(datetime=Clock, timezone=datetime.timezone, timedelta=datetime.timedelta)
    with tempfile.NamedTemporaryFile(suffix=".mp4") as f:
        m.post(t, f.name, "字", cover_at=None, at=at, dry=dry)
    pressed = [c for c in t.clicks if c in btns.values()]
    return bool(pressed), bool(discarded), (out[-1] if out else {})


def _gate3(m, **k):
    r = _safe(_gate, m, **k)
    return r if isinstance(r, tuple) and len(r) == 3 and isinstance(r[2], dict) else (None, None, {})


def leg_gate_dry(m):
    pressed, discarded, r = _gate3(m, dry=True)
    return [("--dry は押さない", pressed is False), ("--dry は捨てる", discarded is True), ("--dry は ok（確かめは通る）", r.get("ok") is True)]


def leg_gate_schedule(m):
    pressed, discarded, r = _gate3(m)
    return [("予約は Schedule を押す", pressed is True), ("media の pk を1つ拾って ok", r.get("ok") is True and r.get("media_id") == "4036016121881966641")]


def leg_gate_facebook(m):
    pressed, discarded, r = _gate3(m, fb_stuck=True)
    return [("Facebook にもシェアがオンのままなら押さない", pressed is False and r.get("ok") is False)]


def leg_gate_too_soon(m):
    pressed, discarded, r = _gate3(m, at="2026-11-22T09:10", now=D(2026, 11, 22, 9, 0))
    return [("10分後の予約は止める", pressed is False and r.get("error") == "too_soon")]


LEGS = {"pick_tomorrow": leg_pick_tomorrow, "pick_lead": leg_pick_lead, "past_refused": leg_past_refused,
        "grid_guard": leg_grid_guard, "month_steps": leg_month_steps, "labels": leg_labels, "parse_at": leg_parse_at,
        "wired_tomorrow": leg_wired_tomorrow, "wired_next_month": leg_wired_next_month, "wired_mismatch": leg_wired_mismatch,
        "gate_dry": leg_gate_dry, "gate_schedule": leg_gate_schedule, "gate_facebook": leg_gate_facebook,
        "gate_too_soon": leg_gate_too_soon, "cover_small": leg_cover_small, "cover_far": leg_cover_far}
# 門の足は関数を差し替えるので、足ごとに読み込み直す（差し替えがほかの足に漏れない）
FRESH = {"gate_dry", "gate_schedule", "gate_facebook", "gate_too_soon"}


def run_legs(src: Path, quiet: bool) -> tuple[list[str], int]:
    m = load_tools(src)
    failed: list[str] = []
    checked = 0
    for name, fn in LEGS.items():
        res = fn(load_tools(src) if name in FRESH else m)
        checked += len(res)
        if any(not ok for _, ok in res):
            failed.append(name)
        if not quiet:
            print(f"[{name}]")
            for what, ok in res:
                print(f"  {'○' if ok else '✕'} {what}")
    return failed, checked


def cut_copy(name: str, dst: Path) -> None:
    """本物の ig_post.py を写して、守りを1つだけ外す。外す字が無ければ 2 で落ちる"""
    old, new, _, _ = CUTS[name]
    text = (HERE / "ig_post.py").read_text(encoding="utf-8")
    if text.count(old) != 1:
        print(f"✕ BREAK={name}: 外す字が ig_post.py に {text.count(old)} か所（1か所のはず）。字を直したら CUTS も直す")
        sys.exit(2)
    (dst / "ig_post.py").write_text(text.replace(old, new), encoding="utf-8")


def child(name: str) -> int:
    if name not in CUTS:
        print(f"✕ BREAK={name} という守りは無い（{' / '.join(CUTS)}）")
        return 2
    with tempfile.TemporaryDirectory() as td:
        cut_copy(name, Path(td))
        failed, checked = run_legs(Path(td), quiet=False)
    print("LEGS_FAILED " + json.dumps(sorted(failed)))
    if checked == 0:
        return 2
    return 1 if failed else 0


def drill() -> list[str]:
    print("[対照] 守りを1つずつ外すと、その足だけが落ちるか")
    bad = []
    for name, (_, _, want, why) in CUTS.items():
        env = dict(os.environ, BREAK=name)
        r = subprocess.run([sys.executable, str(Path(__file__).resolve())], capture_output=True,
                           text=True, env=env, timeout=120, check=False)
        line = [ln for ln in r.stdout.splitlines() if ln.startswith("LEGS_FAILED ")]
        got = set(json.loads(line[-1][len("LEGS_FAILED "):])) if line else None
        hit = got == want and r.returncode == 1
        print(f"  {'○' if hit else '✕'} BREAK={name}（{why}）→ 落ちた足 "
              f"{sorted(got) if got is not None else '（読めない: ' + (r.stdout + r.stderr).strip()[-200:] + '）'}"
              f"（欲しいのは {sorted(want)}）")
        if not hit:
            bad.append(name)
    return bad


def main() -> int:
    if BREAK:
        return child(BREAK)
    failed, checked = run_legs(HERE, quiet=False)
    print()
    bad = drill()
    print()
    if checked == 0:
        print("✕ 1つも数えなかった。**「通りました」とは言わない**")
        return 2
    if failed or bad:
        if failed:
            print(f"✕ 落ちた足: {' / '.join(failed)}")
        if bad:
            print(f"✕ 対照が外れた: {' / '.join(bad)}（外しても、その足だけが落ちる形になっていない）")
        return 1
    print(f"○ {len(LEGS)}本の足（{checked}件）が通り、守り {len(CUTS)}個を1つずつ外すと、その足だけが落ちた")
    return 0


if __name__ == "__main__":
    sys.exit(main())
