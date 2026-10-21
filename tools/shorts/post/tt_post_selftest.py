"""**TikTok の予約の日時を入れる手（`tt_post.py` の `set_schedule`）の見張り。EC2 にも TikTok にも触らない。**

    python3 tools/shorts/post/tt_post_selftest.py
    BREAK=lead python3 tools/shorts/post/tt_post_selftest.py   # 守りを1つ外した版で回す（対照の子）

終了コード 0=通った / 1=落ちた / **2=数えるものが無い・外す字が見つからない**
（`docs/island-standards.md` §15）。

回し役（`python/selftest_runner.py`）が `tools/shorts/` を降りて拾う。要るのは Python だけ。

## 何を見るか

2026-10-21 まで、`--at` は**今日の日付にしか**入れられなかった（違う日は `date_picker_not_implemented`
で止まった）。翌日（10/22 19:00 JST）の予約を頼まれて、暦（日付の欄）を送って日を押す手を足した。

暦は**前の月の日が頭に並ぶ**（10月なら頭の「27 28 29 30」は9月）。字だけで探すと、
同じ数字の別の月の日を押す。押す位置は「1日の曜日ぶんずらした位置」で決め、その位置の字が
日と同じで、押せる印（class の `valid`）が付いているときだけ押す。

`tt_post.py` の `cdp`（EC2 にしか無い）を偽物に差し替えて読み込み、**本物の関数**を回す。
暦のますは、2026-10-21 に TikTok Studio で開いて写した並び（`OCT_2026`）をそのまま使う。
`set_schedule` の配線は、暦と時刻の欄を真似る偽のタブ（`FakeTab`）で回す。

| 足 | 確かめること |
| --- | --- |
| `pick_tomorrow` | 写した10月の暦で、翌日（22日）を押す位置が 25（字は「22」・valid） |
| `pick_not_lead` | 頭の前の月の日（9/28）に valid が付いていても、10/28 は 31番を押す（字だけで探さない） |
| `past_refused` | valid の付いていない日（昨日）は押さずに `date_not_selectable` |
| `grid_guard` | 並びが写したときと違う（月曜はじまり）なら押さずに `calendar_grid_unexpected` |
| `month_steps` | 見出し「October / 2026」から、同じ月は0・次の月は1・年をまたいで1・前の月は-1。読めない見出しは None |
| `parse_at` | `--at` の読み。分が5の倍数でない・あり得ない日付・24時は None（近い時刻に化けさせない） |
| `label` | 一覧の行の札（UTC）。10:00 は「Oct 22, 10:00 AM」、13:05 は「1:05 PM」、0:00 は「12:00 AM」 |
| `wired_tomorrow` | `set_schedule` が翌日の暦を押してから時刻を入れ、欄の読み直しが 2026-10-22 / 10:00 |
| `wired_next_month` | 月末（11/28）から 12/1 は、矢印の**次の月**を1回押してから日を押す（12月の暦は頭に11月の 29・30 が並び、どちらも valid） |
| `wired_today` | 今日の予約は暦を開かない（日を押さない）で時刻だけ入れる |
| `picker_toggle` | 時刻の選ぶ欄が Escape で閉じなくても（2026-10-21 の翌日の予約で見た）、欄を押し直して閉じてから ok |
| `picker_stuck_refused` | 何をしても欄が開いたままなら ok にしない（開いたまま「Schedule」を押すと、1回目が欄を閉じるだけになりうる） |

## 守りを1つずつ外す（§15「対照は、足の数だけ用意する」）

下の `CUTS` が `tt_post.py` の**本物の字**を1か所だけ書き換えた写しを作り、それで足を全部回す。
**外した守りの足だけが落ちる**ことを確かめる。外す字が本物に見つからなければ 2 で落ちる。
`python/mutation_drill.py` も、隣の `tt_post.py` の比較を全部ひっくり返して当てる。
"""

from __future__ import annotations

import datetime
import importlib.util
import json
import os
import re
import shutil
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
    "lead": ("    lead = (w.replace(day=1).weekday() + 1) % 7  # 日曜=0\n", "    lead = 0\n",
             {"pick_tomorrow", "pick_not_lead", "past_refused", "wired_tomorrow", "wired_next_month"},
             "1日の曜日でずらさない（字の並びの頭から数える）"),
    "text": ("    if len(cells) <= idx or cells[idx][0] != str(w.day):\n", "    if len(cells) <= idx:\n",
             {"grid_guard"}, "押す位置の字が日と同じかを見ない"),
    "valid": ('    if "valid" not in cells[idx][1].split():\n', "    if False:\n",
              {"past_refused"}, "押せる印（valid）を見ない"),
    "arrow": ("[{0 if steps < 0 else 1}]", "[{1 if steps < 0 else 0}]",
              {"wired_next_month"}, "矢印の向きを取り違える"),
    "wire": ("        date_r = set_date(t, want_date)\n",
             '        date_r = {"ok": False, "error": "date_picker_not_implemented"}\n',
             {"wired_tomorrow", "wired_next_month"}, "暦を押さずに止まる（前の作り。今日の日付だけ）"),
    "step5": ("int(m.group(3)) % 5", "int(m.group(3)) % 1", {"parse_at"}, "5分おきでない分を通す"),
    "close": ("    if t.js(TIME_OPEN):\n", "    if False:\n", {"picker_toggle"}, "Escape で閉じない時刻の欄を、押し直して閉じない"),
    "openok": (" and radio_on and not still_open\n", " and radio_on\n", {"picker_stuck_refused"},
               "時刻の欄が開いたままでも ok にする"),
}

# 2026-10-21 08:38 UTC に TikTok Studio の日付の欄を開いて写した10月の暦（[字, class]、左上から順に）。
# 頭の 27〜30 は9月。21日（今日）が selected、22日から先が valid
_J = "jsx-1793871833 day"
OCT_2026 = ([[str(d), _J] for d in (27, 28, 29, 30)] + [[str(d), _J] for d in range(1, 21)]
            + [["21", _J + " selected valid"]] + [[str(d), _J + " valid"] for d in range(22, 32)])


def load_tools(src: Path):
    """src の tt_post.py を、cdp を偽物に差し替えて読み込む。shot と sleep は何もしない"""
    fake = types.ModuleType("cdp")
    fake.Tab = object
    fake.up = fake.pages = fake.where = fake._port = lambda *a, **k: None
    sys.modules["cdp"] = fake
    name = f"tt_post_under_test_{abs(hash(str(src)))}"
    spec = importlib.util.spec_from_file_location(name, src / "tt_post.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    mod.shot = lambda t, n: None
    mod.log = lambda *a: None
    mod.time = types.SimpleNamespace(sleep=lambda s: None, time=__import__("time").time,
                                     strftime=__import__("time").strftime)
    return mod


def month_grid(y: int, m: int, today: datetime.date, selected: datetime.date, valid_days: int = 10):
    """偽の暦の1か月ぶん。頭に前の月の日、尻に次の月の日を週の終わりまで。
    押せる印は今日から valid_days 日先まで（**前後の月の日にも付ける**。字だけで探す作りを落とすため）"""
    first = datetime.date(y, m, 1)
    lead = (first.weekday() + 1) % 7
    start = first - datetime.timedelta(days=lead)
    nxt = datetime.date(y + (m == 12), m % 12 + 1, 1)
    days = (nxt - start).days
    days += (-days) % 7
    out = []
    for i in range(days):
        d = start + datetime.timedelta(days=i)
        cls = _J + (" selected" if d == selected else "") + (" valid" if today <= d <= today + datetime.timedelta(days=valid_days) else "")
        out.append([str(d.day), cls, d])
    return out


class FakeTab:
    """TikTok Studio の「When to post」の欄だけを真似る偽のタブ。set_schedule が送る JS の字で何の手かを見分ける"""

    def __init__(self, mod, now: datetime.datetime, close: str = "escape"):
        # close: 時刻の欄の閉じかた。escape（Escape で閉じる）/ toggle（Escape では閉じず、欄を押し直すと閉じる。
        # 2026-10-21 の翌日の予約で見た形）/ stuck（何をしても閉じない）
        self.mod, self.today, self.close = mod, now.date(), close
        self.radio = False
        self.date = self.today
        t = now + datetime.timedelta(minutes=20)
        self.hh, self.mm = t.hour, t.minute - t.minute % 5
        self.cal = None  # 開いている暦の (年, 月)
        self.timepicker = False
        self.day_clicks = 0
        self.arrows: list[int] = []

    def fields(self):
        return {"time": f"{self.hh:02d}:{self.mm:02d}", "date": self.date.isoformat()} if self.radio else {"time": None, "date": None}

    def grid(self):
        return month_grid(*self.cal, self.today, self.date)

    def js(self, expr, await_promise=False):
        m = self.mod
        if expr == "new Date().getTimezoneOffset()":
            return 0
        if expr == m.SCHED_INPUTS:
            return self.fields()
        if expr == m.CAL_HEAD:
            return [m.MONTHS[self.cal[1] - 1], str(self.cal[0])] if self.cal else None
        if expr == m.CAL_DAYS:
            return [c[:2] for c in self.grid()] if self.cal else []
        if expr == m.TIME_OPEN:
            return self.timepicker
        if ".arrow" in expr and "length === 2" in expr:
            return bool(self.cal)
        if expr.startswith("!!(") and "tiktok-timepicker-option-item" in expr:
            side, val = self._opt(expr)
            return self.timepicker and (int(val) < 24 if side == "le" else int(val) % 5 == 0 and int(val) < 60)
        if "value=schedule" in expr and "checked" in expr:
            return self.radio
        return None

    @staticmethod
    def _opt(expr):
        g = re.search(r"tiktok-timepicker-(le|ri)'\) && s\.innerText\.trim\(\) === \"(\d{2})\"", expr)
        if not g:
            raise AssertionError(f"時刻の字が読めない: {expr[:160]}")
        return g.group(1), g.group(2)

    def click(self, expr):
        if "value=schedule" in expr:
            self.radio = True
        elif "span.day')][" in expr:
            idx = int(re.search(r"span\.day'\)\]\[(\d+)\]", expr).group(1))
            text, cls, d = self.grid()[idx]
            self.day_clicks += 1
            if "valid" in cls.split():
                self.date, self.cal = d, None  # 押すと暦は閉じる
        elif ".arrow')][" in expr:
            k = int(re.search(r"\.arrow'\)\]\[(\d)\]", expr).group(1))
            self.arrows.append(k)
            y, mo = self.cal
            mo += 1 if k == 1 else -1
            self.cal = (y + (mo > 12) - (mo < 1), (mo - 1) % 12 + 1)
        elif "tiktok-timepicker-" in expr:
            side, val = self._opt(expr)
            if side == "le":
                self.hh = int(val)
            else:
                self.mm = int(val)
        elif r"\d{4}-\d{2}-\d{2}" in expr:
            self.cal = (self.date.year, self.date.month)
        elif r"\d{2}:\d{2}" in expr:
            self.timepicker = (not self.timepicker) if self.close == "toggle" else True
        else:
            raise AssertionError(f"知らない手: {expr[:160]}")
        return [0, 0]

    def call(self, method, **p):
        if method == "Input.dispatchKeyEvent" and p.get("type") == "keyDown" and p.get("key") == "Escape":
            self.cal = None
            if self.close == "escape":
                self.timepicker = False
        return {}


def _safe(fn, *a):
    try:
        return fn(*a)
    except Exception as e:  # 落ちた足は「通らなかった」として数える（見張りごと落とさない）
        return ("raised", f"{type(e).__name__}: {e}", traceback.format_exc(limit=2))


def leg_pick_tomorrow(m):
    got = _safe(m.pick_day, OCT_2026, "2026-10-22")
    return [("10/22 は 25番（字は 22・valid）", got == (25, None) and OCT_2026[25][0] == "22")]


def leg_pick_not_lead(m):
    cells = [[t, c + (" valid" if i < 4 else "")] for i, (t, c) in enumerate(OCT_2026)]
    got = _safe(m.pick_day, cells, "2026-10-28")
    return [("頭の 9/28 に valid が付いていても、10/28 は 31番", got == (31, None))]


def leg_past_refused(m):
    return [("昨日（10/20、valid なし）は押さない", _safe(m.pick_day, OCT_2026, "2026-10-20") == (None, "date_not_selectable"))]


def leg_grid_guard(m):
    monday_first = OCT_2026[1:]  # 頭が1つ少ない並び（月曜はじまり）
    return [("並びが違えば押さない", _safe(m.pick_day, monday_first, "2026-10-22") == (None, "calendar_grid_unexpected")),
            ("ますが足りなければ押さない", _safe(m.pick_day, OCT_2026[:20], "2026-10-22") == (None, "calendar_grid_unexpected"))]


def leg_month_steps(m):
    f = m.month_steps
    return [("同じ月は 0", _safe(f, "October", "2026", "2026-10-22") == 0),
            ("次の月は 1", _safe(f, "October", "2026", "2026-11-02") == 1),
            ("年をまたいで 1", _safe(f, "December", "2026", "2027-01-03") == 1),
            ("前の月は -1", _safe(f, "October", "2026", "2026-09-30") == -1),
            ("読めない見出しは None", _safe(f, "Okt", "2026", "2026-10-22") is None and _safe(f, "October", "", "2026-10-22") is None)]


def leg_parse_at(m):
    f = m.parse_at
    return [("Z 付きの ISO", _safe(f, "2026-10-22T10:00:00Z") == ("2026-10-22", "10", "00")),
            ("秒なし", _safe(f, "2026-10-22T10:05") == ("2026-10-22", "10", "05")),
            ("5分おきでない分は None", _safe(f, "2026-10-22T10:03Z") is None),
            ("あり得ない日付は None", _safe(f, "2026-02-30T10:00Z") is None),
            ("24時は None", _safe(f, "2026-10-22T24:00Z") is None)]


def leg_label(m):
    f = m.schedule_label
    return [("10:00 → Oct 22, 10:00 AM", _safe(f, "2026-10-22T10:00:00Z") == "Oct 22, 10:00 AM"),
            ("13:05 → 1:05 PM", _safe(f, "2026-10-22T13:05:00Z") == "Oct 22, 1:05 PM"),
            ("0:00 → 12:00 AM", _safe(f, "2026-10-23T00:00:00Z") == "Oct 23, 12:00 AM")]


def _wired(m, now, at, close="escape"):
    t = FakeTab(m, now, close)
    r = _safe(m.set_schedule, t, at)
    return t, r


def leg_wired_tomorrow(m):
    t, r = _wired(m, datetime.datetime(2026, 10, 21, 8, 38), "2026-10-22T10:00")
    ok = isinstance(r, dict) and r.get("ok") is True
    return [("ok", ok),
            ("欄の読み直しが 2026-10-22 / 10:00", isinstance(r, dict) and r.get("after") == {"time": "10:00", "date": "2026-10-22"}),
            ("日を1回だけ押した・矢印は押していない", t.day_clicks == 1 and t.arrows == [])]


def leg_wired_next_month(m):
    t, r = _wired(m, datetime.datetime(2026, 11, 28, 23, 0), "2026-12-01T09:05")
    return [("ok", isinstance(r, dict) and r.get("ok") is True),
            ("次の月の矢印を1回", t.arrows == [1]),
            ("欄の読み直しが 2026-12-01 / 09:05", isinstance(r, dict) and r.get("after") == {"time": "09:05", "date": "2026-12-01"})]


def leg_wired_today(m):
    t, r = _wired(m, datetime.datetime(2026, 10, 21, 2, 0), "2026-10-21T10:00")
    return [("ok", isinstance(r, dict) and r.get("ok") is True),
            ("暦を押していない", t.day_clicks == 0 and t.arrows == [])]


def leg_picker_toggle(m):
    # 日付の手と切り離すため、今日の予約で時刻の欄だけを見る
    t, r = _wired(m, datetime.datetime(2026, 10, 21, 2, 0), "2026-10-21T10:00", close="toggle")
    return [("Escape で閉じない欄でも ok", isinstance(r, dict) and r.get("ok") is True),
            ("押し直して閉じた", t.timepicker is False and isinstance(r, dict) and r.get("time_picker_open") is False)]


def leg_picker_stuck_refused(m):
    t, r = _wired(m, datetime.datetime(2026, 10, 21, 2, 0), "2026-10-21T10:00", close="stuck")
    return [("時刻の欄が開いたままなら ok にしない", isinstance(r, dict) and r.get("ok") is False and r.get("time_picker_open") is True)]


LEGS = {"pick_tomorrow": leg_pick_tomorrow, "pick_not_lead": leg_pick_not_lead, "past_refused": leg_past_refused,
        "grid_guard": leg_grid_guard, "month_steps": leg_month_steps, "parse_at": leg_parse_at, "label": leg_label,
        "wired_tomorrow": leg_wired_tomorrow, "wired_next_month": leg_wired_next_month, "wired_today": leg_wired_today,
        "picker_toggle": leg_picker_toggle, "picker_stuck_refused": leg_picker_stuck_refused}


def run_legs(src: Path, quiet: bool) -> tuple[list[str], int]:
    m = load_tools(src)
    failed: list[str] = []
    checked = 0
    for name, fn in LEGS.items():
        res = fn(m)
        checked += len(res)
        if any(not ok for _, ok in res):
            failed.append(name)
        if not quiet:
            print(f"[{name}]")
            for what, ok in res:
                print(f"  {'○' if ok else '✕'} {what}")
    return failed, checked


def cut_copy(name: str, dst: Path) -> None:
    """本物の tt_post.py を写して、守りを1つだけ外す。外す字が無ければ 2 で落ちる"""
    old, new, _, _ = CUTS[name]
    text = (HERE / "tt_post.py").read_text(encoding="utf-8")
    if text.count(old) != 1:
        print(f"✕ BREAK={name}: 外す字が tt_post.py に {text.count(old)} か所（1か所のはず）。字を直したら CUTS も直す")
        sys.exit(2)
    (dst / "tt_post.py").write_text(text.replace(old, new), encoding="utf-8")


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
