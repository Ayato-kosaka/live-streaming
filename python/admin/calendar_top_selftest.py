"""卓上カレンダーの上位7人（`calendar_top.py`）を、偽の台帳と偽の BigQuery で確かめる。

    python3 python/admin/calendar_top_selftest.py

**BigQuery にも Firestore にも1バイトも触らない。** 問い合わせ（`monthly_tips_run.bq`）と
台帳の読み（`read_ledger`）を差し替えて、月末と同じ1本（`monthly_tips_run.standing()`
→ `monthly_tips.standings()`）を通す。名前・チャンネル・額は全部偽物。

## 確かめるもの

1. **島の投げ銭が貢献額に入る**（#1405）。島だけで投げた人が上位に入り、
   スパチャと島の両方で投げた人は1行にまとまって、額が `fund_box.viewer_yen()` と一致する
2. 円以外のスパチャは、台帳の換算で足す（#951。前の SQL には無かった）
3. Doneru は名乗りで図鑑に寄る
4. 7位が同額なら全員入る（`docs/goods-calendar.md` 1章「同額の7位は全員」）
5. 公開のログに額が出ない（順位・呼び名・図鑑のIDだけ）
6. 月の切りかた（暦の月・うるう年・年をまたぐ・形の違う入力を断る）

## 対照（`BREAK=`。`docs/island-standards.md` §15）

  island … `monthly_tips.standings()` の `island=isl` を `island=[]` にした写しを読む
           → [1] の1本だけが落ちる

親は対照を子で回して、**落ちた確かめの名前が狙った1本ちょうど**であることまで見る。
"""

import io
import json
import logging
import os
import subprocess
import sys
import types
from contextlib import redirect_stdout
from pathlib import Path

HERE = Path(__file__).resolve().parent          # python/admin
PY = HERE.parent                                # python
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(PY))
os.environ.setdefault("BQ_PROJECT_ID", "calendar-top-selftest-reads-no-bigquery")

BREAK = os.environ.get("BREAK", "")

#: 島の投げ銭を順位に渡している1行。**対照はこれを外す**
ISLAND_LINE = "rows = rank(merge(list(superchats) + add, doneru, roster, island=isl))"

if BREAK == "island":
    _src = (PY / "monthly_tips.py").read_text(encoding="utf-8")
    if _src.count(ISLAND_LINE) != 1:
        print(f"✕ 対照を当てられない: monthly_tips.py に `{ISLAND_LINE}` が"
              f" {_src.count(ISLAND_LINE)} か所")
        sys.exit(2)
    _mod = types.ModuleType("monthly_tips")
    _mod.__file__ = str(PY / "monthly_tips.py")
    exec(compile(_src.replace(ISLAND_LINE, ISLAND_LINE.replace("island=isl", "island=[]")),
                 _mod.__file__, "exec"), _mod.__dict__)
    sys.modules["monthly_tips"] = _mod

import calendar_top as ct  # noqa: E402
import monthly_tips_run as mtr  # noqa: E402
from fund_box import SOURCE_ISLAND, viewer_yen  # noqa: E402
from monthly_tips import Roster  # noqa: E402

FAILED: list = []
SEEN: list = []


def ck(name: str, good: bool, got: str = "") -> None:
    """1件の確かめ。"""
    SEEN.append(name)
    print(f"  {'○' if good else '✕'} {name}" + (f" … {got}" if got and not good else ""))
    if not good:
        FAILED.append(name)


# ---------------------------------------------------------------- 偽の材料（ぜんぶ偽の字）

#: 図鑑。チャンネルで当たる2人と、名乗りで当たる1人
CHARS = [
    {"id": "fake-char-aoi", "channelId": "UC-fake-aoi", "channelName": "あおい",
     "lookupKeys": []},
    {"id": "fake-char-shima", "channelId": "UC-fake-shima", "channelName": "しまこ",
     "lookupKeys": []},
    {"id": "fake-char-cha", "channelId": "", "channelName": "ちゃ",
     "lookupKeys": ["ちゃ"]},
]

#: 月ごとの BigQuery の答え（`SQL_SC` / `SQL_DN` / `SQL_FX` の形）
BQ = {
    "2026-11": {
        "sc": [{"cid": "UC-fake-aoi", "handle": "あおい", "yen": 3000},
               {"cid": "UC-fake-buna", "handle": "ぶなのき", "yen": 1001}],
        "dn": [{"name": "ちゃ", "yen": 1200}],
        "fx": [{"cid": "UC-fake-buna", "handle": "ぶなのき", "video_id": "vid-fake",
                "event_id": "ev-fake", "day": "2026-11-05", "amt": "CA$2.79"}],
    },
    # 7位が同額になる月（島の投げ銭は無い）。200 / 200 / 150 / 150 / 100 / 100 円に
    # 並ぶよう、スパチャの額（÷2 の前）を置く
    "2026-12": {
        "sc": [{"cid": f"UC-fake-f{i}", "handle": f"ふぃる{i}", "yen": y}
               for i, y in enumerate([4000, 3000, 2000, 1000, 400, 400, 300, 300, 200, 200])],
        "dn": [],
        "fx": [],
    },
}

#: 台帳（`islandTips`）。島の投げ銭2件と、円以外のスパチャの換算1件
LEDGER = [
    {"source": SOURCE_ISLAND, "sourceEventId": "island:cs_fake_1", "day": "2026-11-03",
     "channelId": "UC-fake-shima", "displayNameSnapshot": "しまこ",
     "amount": 2000, "currency": "JPY"},
    {"source": SOURCE_ISLAND, "sourceEventId": "island:cs_fake_2", "day": "2026-11-20",
     "channelId": "UC-fake-aoi", "displayNameSnapshot": "あおい",
     "amount": 300, "currency": "JPY"},
    {"source": "youtube", "sourceEventId": "yt:vid-fake:ev-fake", "day": "2026-11-05",
     "channelId": "UC-fake-buna", "amount": 2.79, "currency": "CAD", "amountJpy": 250},
]


def fake_bq(sql: str, d0: str, d1: str) -> list:
    """問い合わせを、月の偽の答えに差し替える。**どの問い合わせかは字の同一で見る。**"""
    month = BQ.get(d0[:7], {"sc": [], "dn": [], "fx": []})
    if sql is mtr.SQL_SC:
        return [dict(r) for r in month["sc"]]
    if sql is mtr.SQL_DN:
        return [dict(r) for r in month["dn"]]
    if sql is mtr.SQL_FX:
        return [dict(r) for r in month["fx"]]
    raise AssertionError("知らない問い合わせ")


mtr.bq = fake_bq
mtr.read_ledger = lambda _ro, d0, d1: [dict(r) for r in LEDGER
                                       if d0 <= r["day"] <= d1]


def by_char(rows: list) -> dict:
    """図鑑のID（無ければ呼び名）→ 貢献額。"""
    return {(r["char"] or r["display"]): r["yen"] for r in rows}


def main() -> int:
    print("=== 卓上カレンダーの上位7人を、偽の台帳と偽の BigQuery で確かめる ===")
    roster = Roster(CHARS)
    got = ct.count(None, roster, ct.periods_of({"from": "2026-11", "to": "2026-12"}))
    nov, dec = got["2026-11"], got["2026-12"]
    nov_yen = by_char(nov["top"])

    print("\n[1] 島の投げ銭が貢献額に入る（#1405）")
    want = {"fake-char-shima": viewer_yen(0, 0, island_yen=2000),
            "fake-char-aoi": viewer_yen(3000, 0, island_yen=300)}
    aoi_rows = [r for r in nov["top"] if r["char"] == "fake-char-aoi"]
    ck("島だけの人が上位に入り、スパチャと島の両方の人は1行で、額が viewer_yen() と一致",
       {k: nov_yen.get(k) for k in want} == want and len(aoi_rows) == 1,
       f"{ {k: nov_yen.get(k) for k in want} } / あおいの行 {len(aoi_rows)}")

    print("\n[2] 円以外のスパチャは、台帳の換算で足す（#951）")
    ck("ぶなのきは 1001円 + CA$2.79（台帳で 250円）を足してから半分",
       nov_yen.get("ぶなのき") == viewer_yen(1001 + 250, 0, island_yen=0),
       str(nov_yen.get("ぶなのき")))
    ck("足せなかった行は0件", nov["island_stuck"] == 0 and nov["fx_stuck"] == 0,
       f"{nov['island_stuck']} / {nov['fx_stuck']}")

    print("\n[3] Doneru は名乗りで図鑑に寄る")
    ck("ちゃ（名乗り）が図鑑の1人に寄って 1200円",
       nov_yen.get("fake-char-cha") == viewer_yen(0, 1200, island_yen=0),
       str(nov_yen.get("fake-char-cha")))

    print("\n[4] 7位が同額なら全員")
    ranks = [r["rank"] for r in dec["top"]]
    ck("10人のうち、順位7以内の8人（7位が2人）", ranks == [1, 2, 3, 4, 5, 5, 7, 7],
       str(ranks))
    ck("数えた人数は10人（切ったのは上位だけ）", dec["people"] == 10, str(dec["people"]))

    print("\n[5] 公開のログに額が出ない")
    cap = io.StringIO()
    h = logging.StreamHandler(cap)
    logging.getLogger("admin").addHandler(h)
    out = io.StringIO()
    keep = (ct.args, ct.db, ct.readonly, mtr.roster)
    ct.args = lambda: {"from": "2026-11", "to": "2026-11"}
    ct.db = lambda: None
    ct.readonly = lambda c: c
    mtr.roster = lambda _ro: roster
    try:
        with redirect_stdout(out):
            ct.main()
    finally:
        ct.args, ct.db, ct.readonly, mtr.roster = keep
        logging.getLogger("admin").removeHandler(h)
    text = cap.getvalue() + out.getvalue()
    js = next((ln[5:] for ln in out.getvalue().splitlines() if ln.startswith("JSON=")), "")
    rows = json.loads(js).get("2026-11", []) if js else []
    ck("出す形は 順位・呼び名・図鑑のID だけ",
       bool(rows) and all(set(r) == {"rank", "display", "icon"} for r in rows),
       js[:120])
    ck("ログにも注記にも額が1つも出ない（2000・1800・1200・625）",
       not any(str(y) in text for y in (2000, 1800, 1200, 625)), text[:160])
    ck("チャンネルIDも出ない", "UC-fake" not in text, text[:160])

    print("\n[6] 月の切りかた")
    ck("暦の月・うるう年・年をまたぐ",
       ct.months("2027-12", "2028-02") == [
           ("2027-12", "2027-12-01", "2027-12-31"),
           ("2028-01", "2028-01-01", "2028-01-31"),
           ("2028-02", "2028-02-01", "2028-02-29")],
       str(ct.months("2027-12", "2028-02")))
    bad = 0
    for a in ({"from": "2026-13", "to": "2027-01"}, {"from": "2026-12", "to": "2026-01"},
              {}, {"periods": {"x": ["2026-09-25", "2026-08-29"]}},
              {"from": "2020-01", "to": "2026-12"}):
        try:
            ct.periods_of(a)
        except ValueError:
            bad += 1
    ck("形の違う入力・逆さの期間・空・多すぎる月を断る（5とおり）", bad == 5, str(bad))
    ck("期間を直に渡せる（月末配信の期間）",
       ct.periods_of({"periods": {"2026-09c": ["2026-08-29", "2026-09-25"]}})
       == [("2026-09c", "2026-08-29", "2026-09-25")], "")

    print()
    if not SEEN:
        print("✕ 確かめが1つもありませんでした")
        return 2
    if FAILED:
        print(f"✕ 通らなかった確かめ {len(FAILED)} 件: {', '.join(FAILED)}")
        return 1
    print(f"○ {len(SEEN)} 件ぜんぶ通りました")
    return 0


#: 対照 → 落ちてほしい確かめ（**ちょうどこれだけ**）
CONTROLS = {
    "island": ["島だけの人が上位に入り、スパチャと島の両方の人は1行で、額が viewer_yen() と一致"],
}


def controls() -> int:
    """対照を子で回す。落ちた確かめの名前が、狙ったものちょうどかを見る。"""
    print("\n=== 対照（壊した写しで回して、狙った1本だけが赤くなるか） ===")
    bad = 0
    for key, want in CONTROLS.items():
        p = subprocess.run([sys.executable, __file__], capture_output=True, text=True,
                           env={**os.environ, "BREAK": key}, timeout=120)
        red = [ln.strip()[2:].split(" … ")[0] for ln in p.stdout.splitlines()
               if ln.strip().startswith("✕ ") and "通らなかった" not in ln]
        good = p.returncode == 1 and red == want
        print(f"  {'○' if good else '✕'} BREAK={key}: 終了コード {p.returncode} / 赤 {red}")
        bad += 0 if good else 1
    return bad


if __name__ == "__main__":
    rc = main()
    if rc == 0 and not BREAK:
        rc = 1 if controls() else 0
    sys.exit(rc)
