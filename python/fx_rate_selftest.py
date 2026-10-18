"""`python/fx_rate.py` の見張り。**外へは1バイトも出ない**（口は偽物）。

    python3 python/fx_rate_selftest.py

## 何を守っているか

**外貨を円に直すところが、黙って 0円 にならないこと。**

直せなかったとき（対応していない通貨・口が落ちている・返事の形が違う）に
0 を返すと、出してくれた人が**出していない人と同じ絵**になる
（`docs/island-standards.md` 10）。しかも**赤くならない。**

もう1つは、**足す側が1本しか無いこと**（`row_yen`）。図鑑
（`python/build_residents.py`）と月末（`python/admin/monthly_tips_run.py`）が
別々に額を取り出すと、同じ人の額が面によって違う。

もう1つは**レートの日**。ECB は営業日しかレートを出さないので、
土日に投げてくれたぶんは**直前の営業日**の値が返る。
頼んだ日のほうを保存すると、あとで検算したときに合わない。

## 対照（`BREAK=`。`docs/island-standards.md` §15）

  round   … 丸めを切り捨てにする        → [1] が落ちる
  ask     … 頼んだ日のほうを保存する    → [2] が落ちる
  quiet   … 直せないときに 0円 を返す   → [3] [4] が落ちる
  shape   … 返事に JPY が無くても通す   → [5] が落ちる
  cache   … 同じ組を毎回引き直す        → [6] が落ちる
  noua    … 名乗りを送らない            → [8] が落ちる
  rowzero … 直っていない行を 0円 と読む  → [9] が落ちる
  rowraw  … 直っていない行の元の額を足す → [9] が落ちる

終了コード 0=通った / 1=落ちた。
"""

import math
import os
import sys
import urllib.error
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import fx_rate as F  # noqa: E402

BREAK = os.environ.get("BREAK", "")
bad = 0
checks = 0

# **対照：仕込みを先に刺す。**
if BREAK == "round":
    F.to_jpy = (lambda amount, currency, day, get=None: _floor(
        amount, currency, day, get))
if BREAK == "ask":
    _rate_of = F.rate_of
    F.rate_of = lambda cur, day, get=None: (
        lambda r: (r[0], day if r[0] is not None else None, r[2]))(
            _rate_of(cur, day, get=get))
if BREAK == "quiet":
    _to_jpy = F.to_jpy
    F.to_jpy = lambda amount, currency, day, get=None: (
        lambda g: {**g, "yen": 0} if g["yen"] is None else g)(
            _to_jpy(amount, currency, day, get=get))
if BREAK == "shape":
    F.TARGET = "JPY"

    def _loose(cur, day, get=None):
        try:
            got = (get or F._get)(F.API.format(day=day, base=cur))
        except Exception:  # noqa: BLE001
            return (None, None, "unreachable")
        return (float((got.get("rates") or {}).get("JPY") or 0.0),
                got.get("date") or day, "")

    F.rate_of = _loose
if BREAK == "rowzero":
    _row = F.row_yen
    F.row_yen = lambda doc: (
        lambda g: (0, g[1]) if g[0] is None else g)(_row(doc))
if BREAK == "rowraw":
    _row2 = F.row_yen

    def _raw(doc):
        got = _row2(doc)
        if got[0] is None and (doc or {}).get("amount") is not None:
            # 直っていないのに、**元の額をそのまま円として足す**
            return (int((doc or {})["amount"]), got[1])
        return got

    F.row_yen = _raw
if BREAK == "cache":
    _rate_of2 = F.rate_of

    def _nocache(cur, day, get=None):
        F._SEEN.clear()
        return _rate_of2(cur, day, get=get)

    F.rate_of = _nocache


def _floor(amount, currency, day, get):
    """BREAK=round のための、切り捨て版。"""
    rate, back, why = F.rate_of(str(currency).upper(), day, get=get)
    if rate is None:
        return {"yen": None, "rate": None, "date": None, "why": why}
    return {"yen": int(math.floor(amount * rate)), "rate": rate,
            "date": back, "why": ""}


def ok(name, got, want):
    global bad, checks
    checks += 1
    good = got == want
    print(f"  {'○' if good else '✕'} {name}: {got}"
          + ("" if good else f"（欲しかったのは {want}）"))
    if not good:
        bad += 1
        print(f"::error::{name}: 出た={got} / 欲しかったのは={want}")


# --- 偽の口 ---------------------------------------------------------------
# **本物の返事を写してある**（2026-10-18 に `curl` で引いたもの）。
# 10-18 は土曜なので、頼んだ日と返ってきた日が違う
REAL = {
    ("CAD", "2026-01-09"): {"amount": 1.0, "base": "CAD",
                            "date": "2026-01-09", "rates": {"JPY": 113.54}},
    ("ILS", "2026-05-07"): {"amount": 1.0, "base": "ILS",
                            "date": "2026-05-07", "rates": {"JPY": 53.787}},
    # **土曜に頼んだ。返ってきたのは金曜（10-16）**
    ("USD", "2026-10-18"): {"amount": 1.0, "base": "USD",
                            "date": "2026-10-16", "rates": {"JPY": 158.02}},
}

hits = []


def fake(url: str) -> dict:
    """口の代わり。叩かれた回数も数える。"""
    hits.append(url)
    for (cur, day), body in REAL.items():
        if f"/{day}?" in url and f"base={cur}" in url:
            return body
    if "base=TWD" in url:
        # 本物もこれ（404 / {"message":"not found"}）
        raise urllib.error.HTTPError(url, 404, "Not Found", {}, None)
    raise urllib.error.URLError("つながらない（偽物）")


def dead(url: str) -> dict:
    """口が落ちている。**つながらない**"""
    hits.append(url)
    raise urllib.error.URLError("口が落ちている（偽物）")


def weird(url: str) -> dict:
    """返事の形が違う（JPY が無い）。"""
    hits.append(url)
    return {"amount": 1.0, "base": "CAD", "date": "2026-01-09", "rates": {}}


print("[1] 実際の値と同じ円になるか（四捨五入）")
F._SEEN.clear()
ok("CAD 2.79（2026-01-09）", F.to_jpy(2.79, "CAD", "2026-01-09", get=fake)["yen"], 317)
ok("ILS 6.00（2026-05-07）", F.to_jpy(6.0, "ILS", "2026-05-07", get=fake)["yen"], 323)
ok("USD 2.00（2026-10-18）", F.to_jpy(2.0, "USD", "2026-10-18", get=fake)["yen"], 316)

print("[2] 土日は、**返ってきた日**を持つ（頼んだ日ではない）")
F._SEEN.clear()
got = F.to_jpy(2.0, "USD", "2026-10-18", get=fake)
ok("レートの日は、直前の営業日", got["date"], "2026-10-16")
ok("頼んだ日のほうは持たない", got["date"] == "2026-10-18", False)
ok("レートは返ってきた日のもの", got["rate"], 158.02)

print("[3] 持っていない通貨（TWD）は、**0円にしない**")
F._SEEN.clear()
got = F.to_jpy(100.0, "TWD", "2026-10-18", get=fake)
ok("円は None（0 ではない）", got["yen"], None)
ok("理由が残る", got["why"], "unsupported")
ok("理由が訳せる", F.WHY[got["why"]] != "", True)

print("[4] 口が落ちている日も、**0円にしない**")
F._SEEN.clear()
got = F.to_jpy(2.79, "CAD", "2026-01-09", get=dead)
ok("円は None（0 ではない）", got["yen"], None)
ok("理由が残る", got["why"], "unreachable")

print("[5] 返事の形が違う日も、**0円にしない**")
F._SEEN.clear()
got = F.to_jpy(2.79, "CAD", "2026-01-09", get=weird)
ok("円は None（0 ではない）", got["yen"], None)
ok("理由が残る", got["why"], "shape")

print("[6] 同じ（通貨, 日）は、口を1回しか叩かない")
F._SEEN.clear()
hits.clear()
for _ in range(5):
    F.to_jpy(1.0, "CAD", "2026-01-09", get=fake)
ok("5回呼んでも1回", len(hits), 1)

print("[7] 円は口を叩かない")
F._SEEN.clear()
hits.clear()
got = F.to_jpy(1234, "JPY", "2026-10-18", get=fake)
ok("そのままの額", got["yen"], 1234)
ok("1回も叩いていない", hits, [])
ok("額が読めなければ None", F.to_jpy(None, "CAD", "2026-01-09", get=fake)["yen"],
   None)

print("[8] 本物の口の形")
ok("https で引く", F.API.startswith("https://"), True)
ok("鍵を持たない（URL に入れる口ではない）",
   "key=" in F.API or "token=" in F.API, False)
# **名乗りを送らないと 403 で断られる**（2026-10-18 実測）。
# 外すと1件も換算できなくなるので、ここで字として見る
src = (HERE / "fx_rate.py").read_text(encoding="utf-8")
if BREAK == "noua":
    src = src.replace('"User-Agent": UA', '"Accept-Language": "ja"')
ok("名乗りを送っている", '"User-Agent": UA' in src, True)
ok("直せなかった理由は、全部訳が在る",
   sorted(F.WHY),
   ["", "amount", "pending", "shape", "unreachable", "unsupported"])

print("[9] 台帳の1行から、足してよい円を取り出す（**足す側は1本だけ**）")
ok("円の行は、そのままの額", F.row_yen({"amount": 1000, "currency": "JPY"}),
   (1000, ""))
ok("通貨が空でも円として読む", F.row_yen({"amount": 500}), (500, ""))
ok("円に直してある行は、直した額", F.row_yen(
    {"amount": 2.79, "currency": "CAD", "amountJpy": 317,
     "fxRate": 113.54, "fxDate": "2026-01-09"}), (317, ""))
# **ここが本命。** 0 を返すと、出してくれた人が出していない人と同じ数になる
ok("直っていない行は None（0 ではない）", F.row_yen(
    {"amount": 100.0, "currency": "TWD", "amountJpy": None,
     "fxWhy": "unsupported"}), (None, "unsupported"))
ok("**元の額をそのまま足さない**", F.row_yen(
    {"amount": 100.0, "currency": "TWD", "amountJpy": None,
     "fxWhy": "unsupported"})[0] in (100, 100.0), False)
ok("理由の無い古い行は pending", F.row_yen(
    {"amount": 2.79, "currency": "CAD"}), (None, "pending"))
ok("pending にも訳が在る", F.WHY["pending"] != "", True)
ok("額が無ければ amount", F.row_yen({"currency": "CAD"}), (None, "amount"))
ok("空の行でも落ちない", F.row_yen(None), (None, "amount"))
ok("小文字の通貨も円として読む", F.row_yen({"amount": 10, "currency": "jpy"}),
   (10, ""))

print()
print(f"見た項目 {checks}")
print(f"{'✕ ' + str(bad) + '件 落ちた' if bad else '○ ぜんぶ通った'}")
sys.exit(1 if bad else 0)
