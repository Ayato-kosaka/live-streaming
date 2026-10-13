"""**遅れを数える道具（`python/cron_lag.py`）の、数えかたを当てる。**

    python3 python/cron_lag_selftest.py

    BREAK=dow      python3 python/cron_lag_selftest.py  # 曜日を見ない足にする
    BREAK=sameday  python3 python/cron_lag_selftest.py  # その日の0時から数える足にする
    BREAK=mean     python3 python/cron_lag_selftest.py  # 中央値を平均にする
    BREAK=p95      python3 python/cron_lag_selftest.py  # 待ち時間を p95 で切る
    BREAK=cron     python3 python/cron_lag_selftest.py  # cron を1本も読めなくする

終了コード 0=通った / 1=落ちた / **2=数えるものが無い**（`docs/island-standards.md` §15）。

**`gh` も GitHub も呼ばない。** 落としてある形の run を手で作って食わせる。
外に出る口（`gh_runs`）はここでは一度も触らない。

## なぜ要るか

この道具は「遅れていません」と言うために回すものなので、
**数えかたが壊れると、壊れたことが「健全」に見える。** いちばん高くつく形。

`CLAUDE.md` から数字を剥がしてこちらに移した以上、
**この道具が嘘をついたら、夜の見回りの判断が丸ごと嘘になる。**

## 足を1本ずつ抜く（§15 の決めごと「対照は、足の数だけ用意する」）

| `BREAK=` | 抜く足 | これで落ちる確かめ |
| --- | --- | --- |
| `dow` | 曜日つき cron（`0 3 * * 1`）の前の発火時刻 | 週1の遅れが7日ぶんずれる |
| `sameday` | 「その日の何時何分か」 | 時刻を見ずに0時から数える |
| `mean` | 中央値 | 外れ値1本で中央値が動く |
| `p95` | 待ち時間の切りかた | いちばん遅いものを取りこぼす |
| `cron` | `.github/workflows` から cron を読むところ | 0本になったら **2** に倒れる |

**4通り当てても、同じ足を折っているなら1通り**（`island-misses.md` #128）。
上の5つは、それぞれ別のところを折っている。
"""

from __future__ import annotations

import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import cron_lag as CL  # noqa: E402

BREAK = os.environ.get("BREAK", "")
FAILED: list[str] = []
CHECKED = 0


def ok(name: str, got, want) -> None:
    global CHECKED
    CHECKED += 1
    if got == want:
        print(f"  ○ {name}: {got}")
        return
    FAILED.append(name)
    print(f"  ✕ {name}: {got}（欲しかったのは {want}）")


# ---- 足を抜く（対照）。本物の関数を差し替える ------------------------

if BREAK == "dow":
    # 曜日を見ない。毎日走る cron だと思い込む
    CL.Cron._day_ok = lambda self, d: d.month in self.month  # type: ignore
if BREAK == "sameday":
    # その日の0時を「前の発火時刻」にする
    CL.Cron.prev_fire = lambda self, t, back_days=400: t.replace(  # type: ignore
        hour=0, minute=0, second=0, microsecond=0)
if BREAK == "mean":
    import statistics as _st
    CL.statistics = type("x", (), {"median": _st.mean})  # type: ignore
if BREAK == "p95":
    CL.patience = lambda lags: (  # type: ignore
        None if not lags else
        ((sorted(lags)[min(len(lags) - 1, int(round(0.95 * (len(lags) - 1))))] * 2)
         // 1 + 1) / 2)
if BREAK == "cron":
    CL.crons_of = lambda text: []  # type: ignore


# ---- 1. cron の欄を読む ----------------------------------------------

print("[1] cron の欄を、当たる数の集合にする")
ok("`*` は全部", CL._field("*", 0, 59) == set(range(60)), True)
ok("`30` は1つ", CL._field("30", 0, 59), {30})
ok("`0,30` は2つ", CL._field("0,30", 0, 59), {0, 30})
ok("`1-3` は3つ", CL._field("1-3", 0, 23), {1, 2, 3})
ok("`*/6` は4つ", CL._field("*/6", 0, 23), {0, 6, 12, 18})


# ---- 2. 前の発火時刻 -------------------------------------------------

print("[2] 前の発火時刻（`prev_fire`）")
T = datetime(2026, 10, 13, 2, 11, 41)          # **火曜** 02:11
ok("毎日 20:00 の前の発火は、前の日の 20:00",
   CL.Cron("0 20 * * *").prev_fire(T), datetime(2026, 10, 12, 20, 0))
ok("毎日 01:00 の前の発火は、その日の 01:00",
   CL.Cron("0 1 * * *").prev_fire(T), datetime(2026, 10, 13, 1, 0))
# **ここが `BREAK=dow` で落ちる足。** 10-13 は火曜なので、前の発火は
# 前の日ではなく**前の月曜（10-12）の 03:00**
ok("週1（月曜 03:00）を火曜に聞くと、前の日の月曜",
   CL.Cron("0 3 * * 1").prev_fire(T), datetime(2026, 10, 12, 3, 0))
# 月曜の 02:11 に聞くと、その日の 03:00 はまだ来ていないので**1週間前**
ok("週1（月曜 03:00）を月曜の朝に聞くと、1週間前の月曜",
   CL.Cron("0 3 * * 1").prev_fire(datetime(2026, 10, 12, 2, 11)),
   datetime(2026, 10, 5, 3, 0))
ok("`17 4 * * *` は分も見る",
   CL.Cron("17 4 * * *").prev_fire(T), datetime(2026, 10, 12, 4, 17))


# ---- 3. 1回ぶんの遅れ ------------------------------------------------

print("[3] 遅れ（`lag_hours`）")
# **`BREAK=sameday` はここで落ちる。** 02:11 を 0時から数えると 2.2 になる
ok("20:00 の予定に 02:11 で来たら 6.2時間",
   round(CL.lag_hours("2026-10-13T02:11:41Z", [CL.Cron("0 20 * * *")]), 1), 6.2)
ok("cron が2本あるなら、近いほうから数える",
   round(CL.lag_hours("2026-10-13T02:11:41Z",
                      [CL.Cron("0 20 * * *"), CL.Cron("0 1 * * *")]), 1), 1.2)


# ---- 4. まとめかた ---------------------------------------------------

print("[4] まとめ（`summarize`）と待ち時間（`patience`）")
# 外れ値を1本混ぜてある。**`BREAK=mean` はここで落ちる**。
# **21本にしてあるのは、p95 の添字が max と別のところに来るようにするため。**
# 10本だと p95 も max も同じ値を指してしまい、`BREAK=p95` が素通りする
# （実際に一度そうなった。§15「対照は、足の数だけ用意する」）
LAGS = [1.0] * 10 + [2.0] * 5 + [3.0] * 4 + [4.0, 20.0]
s = CL.summarize(LAGS)
ok("回数", s["n"], 21)
ok("いちばん早い", s["min"], 1.0)
ok("中央値は、外れ値に引きずられない", s["median"], 2.0)
ok("いちばん遅い", s["max"], 20.0)
ok("4時間超の回数", s["over"], 1)
ok("p95 は、いちばん遅いものを取りこぼす", s["p95"], 4.0)
ok("数えるものが無ければ None", CL.summarize([]), None)
# **`BREAK=p95` はここで落ちる。** p95 は 20.0 を取りこぼして 4.0 になる
ok("待ち時間は、いちばん遅いものを30分単位で切り上げる", CL.patience(LAGS), 20.5)
ok("待ち時間も、数えるものが無ければ None", CL.patience([]), None)

print("[5] 月ごとに切る")
rows = [(datetime(2026, 9, 30, 23, 0), 2.0), (datetime(2026, 10, 1, 1, 0), 5.0),
        (datetime(2026, 10, 2, 1, 0), 6.0)]
g = CL.group_by_month(rows)
ok("月の境目で切れる", sorted(g), ["2026-09", "2026-10"])
ok("10月は2件", len(g["2026-10"]), 2)


# ---- 6. ワークフローから cron を読む（分母） -------------------------

print("[6] `.github/workflows` から cron を読む（分母）")
wfs = CL.scheduled()
# **`BREAK=cron` はここで落ちる。** 0本を「違反なし」と読まない（§15）
if not wfs:
    print("✕ cron を持つワークフローを1本も読めなかった。**数字は1つも出さない**")
    sys.exit(2)
print(f"  ○ cron を持つワークフロー: {len(wfs)}本")
CHECKED += 1
if wfs:
    bad = [w for w in wfs for c in w["crons"] if len(c.split()) != 5]
    ok("読んだ cron は、ぜんぶ5欄", bad, [])
    ok("ぜんぶ `name:` を持っている", [w["file"] for w in wfs if not w["name"]], [])
    # 本物の cron ぜんぶで、前の発火時刻が出せること（曜日つきを含む）
    miss = [c for w in wfs for c in w["crons"]
            if CL.Cron(c).prev_fire(datetime(2026, 10, 13, 12, 0)) is None]
    ok("本物の cron は、ぜんぶ前の発火時刻が出せる", miss, [])


# ---- 7. 落としてある run で、端から端まで回す ------------------------

print("[7] 落としてある run を食わせて、端から端まで")
CANNED = {"x.yml": [
    {"id": 1, "created_at": "2026-10-13T02:11:41Z"},
    {"id": 2, "created_at": "2026-10-12T21:30:00Z"},
    {"id": 2, "created_at": "2026-10-12T21:30:00Z"},   # 同じ id は1回だけ
    {"id": 3, "created_at": "2026-10-11T20:06:00Z"},
]}
cs = [CL.Cron("0 20 * * *")]
lags = []
seen = set()
for r in CANNED["x.yml"]:
    if r["id"] in seen:
        continue
    seen.add(r["id"])
    d = CL.lag_hours(r["created_at"], cs)
    if d is not None and d < 24:
        lags.append(d)
ok("同じ id を二度数えない", len(lags), 3)
ok("いちばん早いのは 0.1時間", round(min(lags), 1), 0.1)


# ---- 8. 対照（この見張りが、落ちるときに落ちるか） -------------------

if not BREAK:
    print("[8] 対照（足を1本ずつ抜くと、ここが赤くなるか）")
    bad = []
    for leg in ("dow", "sameday", "mean", "p95", "cron"):
        env = dict(os.environ, BREAK=leg)
        r = subprocess.run([sys.executable, str(Path(__file__).resolve())],
                           capture_output=True, text=True, env=env,
                           timeout=300, check=False)
        mark = "○" if r.returncode != 0 else "✕"
        if r.returncode == 0:
            bad.append(leg)
        print(f"  {mark} BREAK={leg} → 終了コード {r.returncode}（0 でなければよい）")
    if bad:
        FAILED.append("対照: " + " / ".join(bad) + " を抜いても緑のまま")
    CHECKED += 5


# ---- まとめ ----------------------------------------------------------

print()
if CHECKED == 0:
    print("✕ 1つも数えなかった。**「通りました」とは言わない**")
    sys.exit(2)
if FAILED:
    print(f"✕ {CHECKED}件みて、{len(FAILED)}件 落ちた")
    for n in FAILED:
        print(f"   - {n}")
    sys.exit(1)
print(f"○ {CHECKED}件ぜんぶ通った")
sys.exit(0)
