"""「投げ銭してくれたのに、まだキャラクターが無い人」（`characters_gap.py`）に、
**島で投げた人が入る**ことを、偽の台帳と偽の受け取りで確かめる（#1405）。

    python3 python/admin/characters_gap_selftest.py

**BigQuery にも Firestore にも1バイトも触らない。** BigQuery の2本・どねIDの表・
配信中のチャットは差し替え、Firestore は偽物を渡す。名前・チャンネルは全部偽物。

## 確かめるもの

0. 洗い出しの並び（`collect()`）に、島で投げた人が入る
1. 台帳（`islandTips` の `source: island`）で投げた人が入る。同じチャンネルは1行。
   額かチャンネルが読めない島の行は、人にせず件数で返る
2. 今日の受け取り（`islandSiteTips`）から、**台帳にまだ居ない人だけ**入る
3. テストの支払い・返金・期間の外・台帳のほかの出どころは入らない
4. 図鑑に `channelId` が在る人は「あり」、無い人は「まだ無い」に数える

## 対照（`BREAK=`。`docs/island-standards.md` §15）

  wire   … `collect()` の島の行を足す1行（`+ island`）を外す → [0] の1本だけが落ちる
  island … 台帳の島の行を読む1行を外す                      → [1] の1本だけが落ちる
  today  … 今日の受け取りを読まない                          → [2] の1本だけが落ちる

親は対照を子で回して、**落ちた確かめの名前が狙った1本ちょうど**であることまで見る。
"""

import os
import subprocess
import sys
import types
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent          # python/admin
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))
os.environ.setdefault("BQ_PROJECT_ID", "characters-gap-selftest-reads-no-bigquery")

BREAK = os.environ.get("BREAK", "")

#: 対照で外す字 → 置き換える字
CUTS = {
    "wire": ("rows = list(sc.values()) + list(by_pk.values()) + island",
             "rows = list(sc.values()) + list(by_pk.values())"),
    "island": ("rows, stuck = island_rows(read_ledger(client, jst_day(edge), jst_day(now_ms)))",
               "rows, stuck = [], 0"),
    "today": ("for d in client.collection(fb.C_ISLAND).where(\"paidAt\", \">=\", edge).stream():",
              "for d in []:"),
}

if BREAK in CUTS:
    _src = (HERE / "characters_gap.py").read_text(encoding="utf-8")
    _from, _to = CUTS[BREAK]
    if _src.count(_from) != 1:
        print(f"✕ 対照を当てられない: characters_gap.py に `{_from}` が {_src.count(_from)} か所")
        sys.exit(2)
    _mod = types.ModuleType("characters_gap")
    _mod.__file__ = str(HERE / "characters_gap.py")
    exec(compile(_src.replace(_from, _to), _mod.__file__, "exec"), _mod.__dict__)
    sys.modules["characters_gap"] = _mod

import characters_gap as G  # noqa: E402

FAILED: list = []
SEEN: list = []


def ck(name: str, good: bool, got: str = "") -> None:
    """1件の確かめ。"""
    SEEN.append(name)
    print(f"  {'○' if good else '✕'} {name}" + (f" … {got}" if got and not good else ""))
    if not good:
        FAILED.append(name)


# ---------------------------------------------------------------- 偽の Firestore


class Doc:
    def __init__(self, i, v):
        self.id, self._v = i, v

    def to_dict(self):
        return dict(self._v)


class Query:
    """`where(...).stream()` だけ。**欄を持たない書類は範囲から落ちる**（本物と同じ）。"""

    OPS = {">=": lambda a, b: a >= b, "<=": lambda a, b: a <= b,
           "==": lambda a, b: a == b, "<": lambda a, b: a < b, ">": lambda a, b: a > b}

    def __init__(self, docs, conds=()):
        self.docs, self.conds = docs, conds

    def where(self, f, op, v):
        return Query(self.docs, (*self.conds, (f, op, v)))

    def stream(self):
        for i, v in self.docs.items():
            if all(f in v and v[f] is not None and Query.OPS[op](v[f], x)
                   for f, op, x in self.conds):
                yield Doc(i, v)


class Client:
    def __init__(self, store):
        self.store = store

    def collection(self, name):
        return Query(self.store.get(name, {}))


#: いま（偽）。2026-11-23 23:00 JST
NOW = int(datetime(2026, 11, 23, 14, 0, tzinfo=timezone.utc).timestamp() * 1000)
HOUR = 3600 * 1000

STORE = {
    # 図鑑。島で投げた「あおい」だけ、もうキャラクターが居る（channelId で当たる）
    "islandCharacter": {
        "fake-char-aoi": {"channelId": "UC-fake-aoi", "emoji": "x",
                          "images": {"plain": {"url": "x"}, "scene": {"url": "x"}}},
    },
    # 台帳。島の行が4件（あおい2回・すぎ1回・チャンネルの無い1件）と、
    # 期間の外の島の行、島ではない行
    "islandTips": {
        "a1": {"source": "island", "day": "2026-11-03", "channelId": "UC-fake-aoi",
               "displayNameSnapshot": "あおい", "amount": 500, "currency": "JPY"},
        "a2": {"source": "island", "day": "2026-11-20", "channelId": "UC-fake-aoi",
               "displayNameSnapshot": "あおい", "amount": 300, "currency": "JPY"},
        "s1": {"source": "island", "day": "2026-11-21", "channelId": "UC-fake-sugi",
               "displayNameSnapshot": "すぎ", "amount": 1000, "currency": "JPY"},
        "n1": {"source": "island", "day": "2026-11-21", "channelId": None,
               "displayNameSnapshot": "だれか", "amount": 1000, "currency": "JPY"},
        "old": {"source": "island", "day": "2026-09-01", "channelId": "UC-fake-old",
                "displayNameSnapshot": "むかし", "amount": 1000, "currency": "JPY"},
        "yt": {"source": "youtube", "day": "2026-11-21", "channelId": "UC-fake-yt",
               "amount": 1000, "currency": "JPY"},
    },
    # 受け取り（今日のぶん）。台帳にまだ居ない「かえで」と、台帳に居る「すぎ」の今日の1件、
    # 入れてはいけない2件（テストの支払い・返金）、期間の外の1件
    "islandSiteTips": {
        "cs_live_k": {"livemode": True, "status": "paid", "amount": 700, "currency": "JPY",
                      "channelId": "UC-fake-kaede", "displayNameSnapshot": "かえで",
                      "paidAt": NOW - 2 * HOUR},
        "cs_live_s": {"livemode": True, "status": "paid", "amount": 200, "currency": "JPY",
                      "channelId": "UC-fake-sugi", "displayNameSnapshot": "すぎ",
                      "paidAt": NOW - 1 * HOUR},
        "cs_test_t": {"livemode": False, "status": "paid", "amount": 999, "currency": "JPY",
                      "channelId": "UC-fake-test", "displayNameSnapshot": "テストの人",
                      "paidAt": NOW - 1 * HOUR},
        "cs_live_r": {"livemode": True, "status": "refunded", "amount": 500, "currency": "JPY",
                      "channelId": "UC-fake-back", "displayNameSnapshot": "かえしたひと",
                      "paidAt": NOW - 3 * HOUR},
        "cs_live_o": {"livemode": True, "status": "paid", "amount": 500, "currency": "JPY",
                      "channelId": "UC-fake-old2", "displayNameSnapshot": "むかし2",
                      "paidAt": NOW - 40 * 24 * HOUR},
    },
}

# BigQuery の2本・どねIDの表・配信中のチャットは、**島の行だけを見る**ために空にする
G.from_bigquery = lambda days: ({}, [])
G.donors = lambda client, pks: {}
G.from_firestore = lambda client, days: []


def main() -> int:
    print("=== 島で投げた人が、キャラクターの洗い出しに入るか ===")
    client = Client(STORE)
    island, stuck = G.from_island(client, 30, NOW)
    by = {r["cid"]: r for r in island}

    print("\n[0] 洗い出しの並びに、島で投げた人が入る")
    got = sorted(r["cid"] for r in G.collect(client, 30, NOW) if "島の投げ銭" in r["src"])
    ck("collect() の並びに、島で投げた人が全員入る", bool(got) and got == sorted(by),
       f"{got} / {sorted(by)}")

    print("\n[1] 台帳の島の行で投げた人が入る")
    aoi, sugi = by.get("UC-fake-aoi"), by.get("UC-fake-sugi")
    ck("台帳で投げた人が入り、同じチャンネルは1行（あおい 2回）。読めない島の行は件数（1件）",
       bool(aoi) and aoi["n"] == 2 and aoi["src"] == "島の投げ銭"
       and aoi["names"] == ["あおい"] and aoi["last"] == "2026-11-20" and stuck == 1,
       f"{aoi} / 読めない {stuck}")

    print("\n[2] 今日の受け取りから、台帳にまだ居ない人だけ入る")
    kaede = by.get("UC-fake-kaede")
    ck("今日はじめて島で投げた人（かえで）が入る",
       bool(kaede) and kaede["src"] == "当日（島の投げ銭）" and kaede["n"] == 1
       and kaede["names"] == ["かえで"],
       str(kaede))
    ck("台帳に居る人の今日の1件は、2行にしない（すぎは1行）",
       sum(1 for r in island if r["cid"] == "UC-fake-sugi") == 1 and bool(sugi),
       str([r for r in island if r["cid"] == "UC-fake-sugi"]))

    print("\n[3] 入れてはいけないものは入らない")
    for cid, why in (("UC-fake-test", "テストの支払い"), ("UC-fake-back", "返金したもの"),
                     ("UC-fake-old", "期間の外（台帳）"), ("UC-fake-old2", "期間の外（受け取り）"),
                     ("UC-fake-yt", "台帳のほかの出どころ")):
        ck(f"{why}は入らない", cid not in by, str(by.get(cid)))

    print("\n[4] 図鑑と突き合わせる（channelId が先）")
    # 島の行と同じ形（名前はアラートに出した名前、鍵は channelId）を、手で組んで当てる
    rows = [{"src": "島の投げ銭", "names": ["あおい"], "cid": "UC-fake-aoi", "n": 1, "last": ""},
            {"src": "当日（島の投げ銭）", "names": ["かえで"], "cid": "UC-fake-kaede",
             "n": 1, "last": 0}]
    missing, by_id, by_name = G.judge(rows, G.catalog(client))
    ck("図鑑に居るあおいは channelId で「あり」、かえでは「まだ無い」",
       by_id == 1 and by_name == 0 and [r["cid"] for r in missing] == ["UC-fake-kaede"],
       f"{by_id} / {by_name} / {[r['cid'] for r in missing]}")
    ck("日付だけ出す（台帳の日はそのまま）", G.day("2026-11-20") == "2026-11-20",
       G.day("2026-11-20"))

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
    "wire": ["collect() の並びに、島で投げた人が全員入る"],
    "island": ["台帳で投げた人が入り、同じチャンネルは1行（あおい 2回）。読めない島の行は件数（1件）"],
    "today": ["今日はじめて島で投げた人（かえで）が入る"],
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
