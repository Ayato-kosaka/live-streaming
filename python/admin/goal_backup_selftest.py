"""**偽の GAS と偽の本番と偽の Firestore で、毎晩の写しを実際に動かす。**

    python3 python/admin/goal_backup_selftest.py

終了コード 0=通った / 1=落ちた / **2=数えるものが無い**
（`docs/island-standards.md` §15）。

**ネットにも本番にも資格情報にも触らない。** 差し替えるのは外へ出る4つ
（GAS・本番の `/island-api/fund`・Doneru・Firestore）だけで、
**判断の側は本物**——`goal_migrate.main()` をそのまま呼ぶので、
「1円まで一致しないと1行も書かない」止め金が生きていることも、
ここで一緒に実測される。

## 何を見るか（`docs/island-misses.md` #614 の4通り）

| | 晩のかたち | 欲しい結果 |
| --- | --- | --- |
| 1 | 1回目で一致 | **書く・緑**。待たない |
| 2 | 1回目は不一致、数分おいた2回目で一致 | **書く・緑**。待ちが1回だけ入る |
| 3 | 2回とも不一致（1晩目・2晩目） | **書かない・緑**。古い控えは1バイトも動かない |
| 4 | **3晩続けて書けない** | **赤**（終了コード 1）。札に連続3が残る |
| 5 | 続けて落ちたあとに書けた晩 | 書く・緑。**連続が 0 に戻る** |
| 6 | 同じ日に3回走る | **晩は1つしか数えない**（3晩ぶんが1日で溜まらない） |
| 7 | 下見（`{}`） | 控えにも札にも1バイトも書かない。待たない |
| 8 | 表そのものが読めない | **その場で赤**（合わなかったのとは別の落ちかた） |

## 対照（本物の判定を1つも出す前に、毎回）

`BREAK=` で守りを1本ずつ抜いて、**そのたび、その足の場面だけが落ちる**ことを
見る（`docs/island-standards.md` §15「対照は、足の数だけ用意する」）。

| 足 | 抜くと何が起きるか | 落ちる場面 |
| --- | --- | --- |
| `retry` | 数分おいて試し直さない | 2 |
| `green` | 1晩合わないだけで赤にする（毎晩赤い見張り。#521） | 3 |
| `streak` | 何晩続いても赤にしない（古い控えのまま誰も気づかない） | 4 |
| `reset` | 書けた晩に連続を 0 に戻さない | 5 |
| `sameday` | 同じ日に2回走ったぶんも晩として数える | 6 |

**壊していない写しが通ること**も先に見る（`docs/island-misses.md` #99）。

## ログに出さないもの

ここで使う額も鍵も**でたらめな作りもの**だが、形は本物に寄せてある。
出すのは件数と終了コードだけ。
"""

import os
import re
import subprocess
import sys
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

# `config.py` は、この環境変数が無いと読み込みの時点で落ちる。
# 下で作るクライアントは偽物なので**本物の名前は要らない**
os.environ.setdefault("BQ_PROJECT_ID", "goal-backup-selftest")
os.environ.pop("ARGS", None)

import goal_backup as gb  # noqa: E402
import goal_migrate as gm  # noqa: E402

FAILED: list[str] = []
CHECKS = 0
CASE = "0"

# ---------------------------------------------------------------- 作りもの

# GAS の `Goals` に見立てた1行。**鍵は 16 桁の16進**（本物と同じ形）
GAS = {
    "doneruGoalKey": "0123456789abcdef",
    "startAmount": -45000,
    "superChatAmount": 21000,
    "targetAmount": 500000,
}
# Doneru の累計（`goal_migrate` が別に読むほう）
DONERU = 133000
# **9日前の控え。** #614 でいま本番に残っているのがこの形
STALE = {
    "doneruGoalKey": "0123456789abcdef",
    "startAmount": -45000,
    "superChatAmount": 9000,
    "targetAmount": 500000,
}


def prod(superchat: int) -> dict:
    """本番の `/island-api/fund` が返す形。

    Args:
        superchat: 本番が見えているスパチャの積み上がり

    Returns:
        `total` / `given` / `goal`
    """
    given = DONERU + superchat
    return {"total": given + GAS["startAmount"], "given": given,
            "goal": GAS["targetAmount"], "people": 12}


# 一致する晩（本番が GAS に追いついている）
HIT = prod(GAS["superChatAmount"])
# 合わない晩（本番がまだ5分ぶん寝ていて、スパチャが 3,000 円ぶん古い）
MISS = prod(GAS["superChatAmount"] - 3000)


# ---------------------------------------------------------------- 偽 Firestore

class FakeSnap:
    def __init__(self, data):
        self._d = data

    @property
    def exists(self) -> bool:
        return self._d is not None

    def to_dict(self):
        return dict(self._d or {})


class FakeDoc:
    def __init__(self, store, key):
        self.store = store
        self.key = key

    def get(self):
        return FakeSnap(self.store.docs.get(self.key))

    def set(self, data, merge=False):
        self.store.writes.append((self.key, dict(data)))
        cur = dict(self.store.docs.get(self.key) or {}) if merge else {}
        cur.update(data)
        self.store.docs[self.key] = cur


class FakeCol:
    def __init__(self, store, name):
        self.store = store
        self.name = name

    def document(self, doc_id):
        return FakeDoc(self.store, f"{self.name}/{doc_id}")


class FakeClient:
    """入れ物と書類だけの Firestore。**来た書き込みを全部覚える。**"""

    def __init__(self, docs=None):
        self.docs = dict(docs or {})
        self.writes: list[tuple[str, dict]] = []

    def collection(self, name):
        return FakeCol(self, name)

    def goal(self) -> dict:
        return dict(self.docs.get(f"{gm.COLLECTION}/{gm.GOAL_ID}") or {})

    def note(self) -> dict:
        return dict(self.docs.get(f"{gb.COLLECTION}/{gb.DOCUMENT}") or {})

    def goal_writes(self) -> list[dict]:
        return [d for k, d in self.writes
                if k == f"{gm.COLLECTION}/{gm.GOAL_ID}"]


# ---------------------------------------------------------------- 回す

def night(fs: FakeClient, day: str, prods: list[dict], apply: bool = True):
    """1晩ぶん回す。

    Args:
        fs: 偽 Firestore（晩をまたいで持ち回る）
        day: 日本時間の日（"2026-09-23"）
        prods: 本番が返す値を、試行の順に並べたもの
        apply: 書く回か

    Returns:
        （終了コード, 待った回数, 何回試したか）
    """
    seen = {"prod": 0, "sleep": 0}
    # 日本時間のその日の朝3時ごろ（UTC では前の日の 18:00）
    now = datetime.strptime(day, "%Y-%m-%d").replace(
        hour=3, tzinfo=gb.JST).astimezone(timezone.utc)

    def fake_prod() -> dict:
        i = min(seen["prod"], len(prods) - 1)
        seen["prod"] += 1
        return prods[i]

    def fake_sleep(sec: float) -> None:
        seen["sleep"] += 1

    keep = (gm.gas_goal, gm.prod_fund, gm.doneru_now, gm.db)
    gm.gas_goal = lambda: dict(GAS)
    gm.prod_fund = fake_prod
    gm.doneru_now = lambda key: DONERU
    gm.db = lambda: fs
    os.environ["ARGS"] = '{"apply": true}' if apply else "{}"
    try:
        code = gb.main(now=lambda: now, sleep=fake_sleep, client=fs)
    finally:
        gm.gas_goal, gm.prod_fund, gm.doneru_now, gm.db = keep
        os.environ.pop("ARGS", None)
    return code, seen["sleep"], seen["prod"]


def ck(name: str, ok: bool, saw) -> None:
    global CHECKS
    CHECKS += 1
    print(f"  {'OK  ' if ok else 'NG  '} [{CASE}] {name}（{saw}）")
    if not ok:
        FAILED.append(f"[{CASE}] {name}")


def case(n: str) -> None:
    global CASE
    CASE = n


# ---------------------------------------------------------------- 場面

def case1() -> None:
    """1回目で一致 → 書く・緑。"""
    case("1")
    print("\n[1] 1回目で一致する晩")
    fs = FakeClient({f"{gm.COLLECTION}/{gm.GOAL_ID}": dict(STALE)})
    code, slept, tries = night(fs, "2026-09-23", [HIT])
    ck("終了コード 0（緑）", code == 0, code)
    ck("待たない", slept == 0, f"待ち {slept} 回")
    ck("1回で済む", tries == 1, f"{tries} 回")
    ck("控えの4つが GAS と同じになる",
       {f: fs.goal().get(f) for f in gm.FIELDS} == GAS, "同じ")
    ck("札の連続は 0", fs.note().get("missStreak") == 0, fs.note().get("missStreak"))
    ck("札に ok の日が入る", bool(fs.note().get("okDay")), fs.note().get("okDay"))


def case2() -> None:
    """1回目は不一致、2回目で一致 → 書く・緑。**足「retry」の場面。**"""
    case("2")
    print("\n[2] 1回目は本番がまだ寝ていて、数分おいたら追いついた晩")
    fs = FakeClient({f"{gm.COLLECTION}/{gm.GOAL_ID}": dict(STALE)})
    code, slept, tries = night(fs, "2026-09-23", [MISS, HIT])
    ck("終了コード 0（緑）", code == 0, code)
    ck("待ちが1回だけ入る", slept == 1, f"待ち {slept} 回")
    ck("2回試す", tries == 2, f"{tries} 回")
    ck("控えの4つが GAS と同じになる",
       {f: fs.goal().get(f) for f in gm.FIELDS} == GAS, "同じ")
    ck("札の連続は 0", fs.note().get("missStreak") == 0, fs.note().get("missStreak"))


def case3() -> None:
    """2回とも不一致 → **書かない・緑。足「green」の場面。**"""
    case("3")
    print("\n[3] 2回とも合わない晩（1晩目・2晩目）")
    fs = FakeClient({f"{gm.COLLECTION}/{gm.GOAL_ID}": dict(STALE)})

    code, _, _ = night(fs, "2026-09-23", [MISS, MISS])
    ck("1晩目: 終了コード 0（**赤くしない**）", code == 0, code)
    ck("1晩目: 古い控えが1バイトも動かない", fs.goal() == STALE, "動かない")
    ck("1晩目: 控えに書きに行っていない", not fs.goal_writes(),
       f"{len(fs.goal_writes())} 回")
    ck("1晩目: 札の連続が 1", fs.note().get("missStreak") == 1,
       fs.note().get("missStreak"))
    ck("1晩目: 札に mismatch が残る", fs.note().get("lastOutcome") == "mismatch",
       fs.note().get("lastOutcome"))

    code, _, _ = night(fs, "2026-09-24", [MISS, MISS])
    ck("2晩目: 終了コード 0（**まだ赤くしない**）", code == 0, code)
    ck("2晩目: 札の連続が 2", fs.note().get("missStreak") == 2,
       fs.note().get("missStreak"))
    ck("2晩目: 古い控えは動かないまま", fs.goal() == STALE, "動かない")


def case4() -> None:
    """3晩続けて書けない → **赤。足「streak」の場面。**"""
    case("4")
    print("\n[4] 3晩続けて書けない")
    fs = FakeClient({f"{gm.COLLECTION}/{gm.GOAL_ID}": dict(STALE)})
    codes = [night(fs, d, [MISS, MISS])[0]
             for d in ("2026-09-23", "2026-09-24", "2026-09-25")]
    ck("**3晩目で赤**（終了コード 1）", codes[2] == 1, codes)
    ck("札の連続が 3", fs.note().get("missStreak") == gb.MISS_LIMIT,
       fs.note().get("missStreak"))
    ck("いつから続いているかが札に残る",
       fs.note().get("missSince") == "2026-09-23", fs.note().get("missSince"))
    ck("赤くなった晩も、控えは1バイトも動いていない", fs.goal() == STALE, "動かない")


def case5() -> None:
    """落ちたあとに書けた晩 → **連続が 0 に戻る。足「reset」の場面。**"""
    case("5")
    print("\n[5] 2晩落ちたあとに、書けた晩")
    fs = FakeClient({f"{gm.COLLECTION}/{gm.GOAL_ID}": dict(STALE)})
    night(fs, "2026-09-23", [MISS, MISS])
    night(fs, "2026-09-24", [MISS, MISS])
    ck("下ごしらえ: 連続が 2", fs.note().get("missStreak") == 2,
       fs.note().get("missStreak"))
    code, _, _ = night(fs, "2026-09-25", [HIT])
    ck("終了コード 0（緑）", code == 0, code)
    ck("**連続が 0 に戻る**", fs.note().get("missStreak") == 0,
       fs.note().get("missStreak"))
    ck("札が ok になる", fs.note().get("lastOutcome") == "ok",
       fs.note().get("lastOutcome"))
    ck("いつから続いていたかは消える", not fs.note().get("missSince"),
       fs.note().get("missSince"))
    ck("控えが新しくなる", {f: fs.goal().get(f) for f in gm.FIELDS} == GAS, "同じ")


def case6() -> None:
    """同じ日に2回走っても、晩は1つ。**足「sameday」の場面。**

    繋ぎ元が2回発火した晩や、人が手で押した回で3晩ぶんが1日に溜まると、
    **理由のない赤**になる。
    """
    case("6")
    print("\n[6] 同じ日に2回走った晩")
    fs = FakeClient({f"{gm.COLLECTION}/{gm.GOAL_ID}": dict(STALE)})
    night(fs, "2026-09-23", [MISS, MISS])
    first = fs.note().get("missStreak")
    night(fs, "2026-09-23", [MISS, MISS])
    night(fs, "2026-09-23", [MISS, MISS])
    ck("1回目で連続が 1", first == 1, first)
    ck("**3回走っても連続は 1 のまま**（数えるのは晩）",
       fs.note().get("missStreak") == 1, fs.note().get("missStreak"))
    ck("控えは動かないまま", fs.goal() == STALE, "動かない")


def case7() -> None:
    """下見（`{}`）は、控えにも札にも1バイトも書かない。"""
    case("7")
    print("\n[7] 下見（手で押したとき）")
    for label, prods in (("合う", [HIT]), ("合わない", [MISS, MISS])):
        fs = FakeClient({f"{gm.COLLECTION}/{gm.GOAL_ID}": dict(STALE)})
        code, slept, tries = night(fs, "2026-09-23", prods, apply=False)
        ck(f"{label}: 緑", code == 0, code)
        ck(f"{label}: 1バイトも書かない", not fs.writes, f"{len(fs.writes)} 回")
        ck(f"{label}: 札にも触らない", not fs.note(), fs.note())
        ck(f"{label}: 押した人を待たせない", slept == 0, f"待ち {slept} 回")


def case8() -> None:
    """合わなかったのとは違う落ちかたは、その場で赤。"""
    case("8")
    print("\n[8] 表そのものが読めない晩（合わないのとは別）")
    fs = FakeClient({f"{gm.COLLECTION}/{gm.GOAL_ID}": dict(STALE)})
    keep = (gm.gas_goal, gm.db)
    gm.gas_goal = dict          # 行が1つも無い＝ `goal_migrate` は 1 で落ちる
    gm.db = lambda: fs
    os.environ["ARGS"] = '{"apply": true}'
    try:
        code = gb.main(now=lambda: datetime(2026, 9, 23, tzinfo=timezone.utc),
                       sleep=lambda s: None, client=fs)
    finally:
        gm.gas_goal, gm.db = keep
        os.environ.pop("ARGS", None)
    ck("**その場で赤**（数分おいて直るものではない）", code == 1, code)
    ck("札を書き替えない（晩として数えない）", not fs.note(), fs.note())
    ck("控えも動かない", fs.goal() == STALE, "動かない")


CASES = (case1, case2, case3, case4, case5, case6, case7, case8)

# 足を1本抜いたとき、**どの場面だけが落ちるか**
WANT = {"retry": {"2"}, "green": {"3"}, "streak": {"4"},
        "reset": {"5"}, "sameday": {"6"}}


# ---------------------------------------------------------------- 対照

def drill_out(leg: str) -> tuple[int, str]:
    """足を1本抜いて、場面だけを**別のプロセスで**回す。

    同じプロセスで切り替えると、前の足の札や差し替えを引きずっていないかが
    言えない。

    Args:
        leg: 抜く足

    Returns:
        （終了コード, 出たもの）
    """
    p = subprocess.run(
        [sys.executable, os.path.abspath(__file__), "--cases-only"],
        cwd=HERE, env={**os.environ, "BREAK": leg},
        capture_output=True, text=True, timeout=120)
    return p.returncode, p.stdout + p.stderr


def fell(out: str) -> set[str]:
    """出たものから、落ちた場面の番号を拾う。"""
    return {m for m in re.findall(r"NG\s+\[(\d+)\]", out)}


def drill() -> bool:
    """対照。**ぜんぶ当たったら True。**"""
    ok = True
    for leg, want in WANT.items():
        code, out = drill_out(leg)
        got = fell(out)
        hit = got == want
        print(f"  {'OK  ' if hit else 'NG  '} [対照] BREAK={leg} で落ちるのは"
              f"場面 {sorted(want)} だけ（落ちた: {sorted(got) or 'なし'}）")
        if not hit:
            ok = False
    p = subprocess.run(
        [sys.executable, "-c", "import goal_backup as g; g.broken('zzz')"],
        cwd=HERE, env={**os.environ, "BREAK": "zzz"},
        capture_output=True, text=True, timeout=60)
    say = "retry" in (p.stdout + p.stderr)
    print(f"  {'OK  ' if p.returncode and say else 'NG  '} [対照] 知らない足の"
          f"名前は落として、使える名前を言う（終了コード {p.returncode}）")
    if not (p.returncode and say):
        ok = False
    return ok


# ---------------------------------------------------------------- 本体

def run_cases() -> int:
    for c in CASES:
        c()
    print()
    if CHECKS == 0:
        print("✕ 数えるものがありませんでした")
        return 2
    if FAILED:
        print(f"✕ 通らなかった確かめ {len(FAILED)} / {CHECKS} 件")
        return 1
    print(f"○ {CHECKS} 件ぜんぶ通りました")
    return 0


def main() -> int:
    only = "--cases-only" in sys.argv
    if not only:
        if os.getenv("BREAK"):
            print("✕ BREAK を渡したまま本体を回そうとしています"
                  "（対照は --cases-only の側で回ります）")
            return 2
        print("=== 偽の GAS / 本番 / Firestore で、毎晩の写しを動かす"
              "（本番には1行も出ない） ===")
        print("\n対照（**本物の判定を1つも出す前に**、守りを1本ずつ抜く）")
        if not drill():
            print("\n✕ 対照が外れました。**本物の判定を1つも出していません**")
            return 2
    return run_cases()


if __name__ == "__main__":
    sys.exit(main())
