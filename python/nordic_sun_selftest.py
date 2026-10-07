"""**旅の日の出・日の入りを焼くほう（`tools/nordic_sun.py`）の対照。**

    python3 python/nordic_sun_selftest.py

    BREAK=hardwired python3 python/nordic_sun_selftest.py  # 足を1本抜く

終了コード 0=ぜんぶ通った / 1=外したものがある / **2=数えるものが無い**
（`docs/island-standards.md` §15）。

ネットも鍵も要らない。**この箱で回る**（式は NOAA。突き合わせ相手は
`tools/nordic_sun_golden.json` にリポジトリへ入れてある）。

## なぜ要るか

2026-10-07 まで、焼くほうが**初日・最終日・街を手で持っていた。**
中身は緯度経度と日付から計算で出るのに、**旅程がのびたら人が来るまで
表が止まる**作りだった。見張り（`python/stale_content_watch.py`）は
そこを `COVERS` で見ていたので、**次の旅で旅程がのびた日から、人が手で
回すまで毎晩赤**になる——満たしようのない赤の一歩手前
（`docs/island-standards.md` §15）。

旅程から引くように直した。直したことで、**新しい壊れかたが3つ**できた。

1. 旅程の読み方がずれて、日が落ちる（`python/ts_read.py` の `read_trip`）
2. 旅程に新しい街が入ったのに、座標が無くて**黙って飛ばす**
3. 式そのものがずれる（前からある壊れかた）

ここはその3つを、両側から当てる。

## 「旅程から引いている」を、どうやって当てるか

**旅程を書き換えた写しを食わせて、焼けた表が一緒に動くか**を見る。
これが効かないと、「旅程から引いている」と書いてあるだけで、中では
固定の日付を使っているのと見分けがつかない。

`BREAK=hardwired` を当てると、焼くほうが**旅程を見ずに本番の17日を焼く**
（2026-10-07 までの作り）。そのときに落ちる足を名指しで持っている。

**足は1本ずつ抜く**（§15「対照は、足の数だけ用意する」）。

| `BREAK` | 何を元に戻すか | 落ちる足 |
| --- | --- | --- |
| `hardwired` | 旅程を見ずに、手で書いた17日と8街を焼く（2026-10-07 まで） | 旅程をのばす・知らない街・読み落ち・旅程が無い |
| `quiet-unknown` | 座標の無い街を**黙って飛ばす** | 座標も断りも無い街 |
| `trust-read` | 旅程の**読み落ちを黙って通す** | 1日読み落とす |
| `loose-check` | `--check` が旅程との突き合わせをやめる（式だけ見る） | 表に1日足りない・街が足りない |

## 分母を出す（§15）

- 式と外の値 … **128件**（8街 x 16日）
- 旅程との突き合わせ … **17日 x 8街**
- 当てた壊しかた … 下の `LEGS` の数

「0件」とだけ言う対照にしない。
"""

from __future__ import annotations

import datetime as dt
import importlib.util
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
TOOL = REPO / "tools" / "nordic_sun.py"
CONTENT = REPO / "site" / "content"
TRIP = "nordic.ts"
OUT = "nordicSun.ts"

BREAK = os.environ.get("BREAK", "")
# **足を1本ずつ抜く**（`docs/island-standards.md` §15「対照は、足の数だけ用意する」）
LEGS = ("hardwired", "quiet-unknown", "trust-read", "loose-check")


def _load():
    """焼くほうを、走らせずに読み込む（`__main__` の番が在るので走らない）。"""
    spec = importlib.util.spec_from_file_location("nordic_sun", TOOL)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _hobble(mod) -> None:
    """`BREAK` の足を、本物のモジュールから抜く。抜いていなければ何もしない。"""
    if BREAK == "hardwired":
        # 2026-10-07 までの作り。旅程を見ずに、手で書いた17日と8街を焼く
        first, last = dt.date(2026, 9, 11), dt.date(2026, 9, 27)
        days = [first + dt.timedelta(days=i) for i in range((last - first).days + 1)]
        cities = list(mod.CITY_GEO)
        mod.plan = lambda content=None: (days, cities, [])
    elif BREAK == "quiet-unknown":
        # 座標の無い街を、黙って飛ばす（赤くならない。明るさの欄が消えるだけ）。
        # **断りの表が、どんな名前でも「書いてある」と答える**形にして抜く
        class Anything(dict):
            def __contains__(self, k):   # noqa: D105
                return True

            def __getitem__(self, k):    # noqa: D105
                return "（足を抜いてある）"
        mod.NO_SUN = Anything(mod.NO_SUN)
    elif BREAK == "trust-read":
        # 旅程の読み落ちを、黙って通す（落ちた日の面から明るさが消えるだけ）
        real_read = mod.read_trip
        mod.read_trip = lambda src: __import__("dataclasses").replace(
            real_read(src), declared=len(real_read(src).days))
    elif BREAK == "loose-check":
        # `--check` が、旅程との突き合わせをやめる（式だけ見る。2026-10-07 まで）
        mod.cover_gaps = lambda content=None: ([], 0, 0)


def _stage(td: Path, trip: str | None = None) -> Path:
    """`site/content` の写しを作る。`trip` を渡すとそれを旅程として置く。"""
    d = td / "content"
    d.mkdir(parents=True, exist_ok=True)
    for name in (TRIP, OUT):
        shutil.copy(CONTENT / name, d / name)
    if trip is not None:
        (d / TRIP).write_text(trip, encoding="utf-8")
    return d


def _days_in(src: str) -> list[str]:
    return re.findall(r'^\s+"(\d{4}-\d\d-\d\d)": \{', src, re.M)


def _cities_in(src: str) -> list[str]:
    return re.findall(r'^\s+([^\s:"]+): \{ rise: "', src, re.M)


def _tol_line(bad: int, worst: int, mod) -> str:
    """式の突き合わせの1行。**分母と、いちばん大きい差を必ず出す**（§15）。"""
    if bad:
        return f"{bad}件ちがいます（許す差 {mod.TOL}分）"
    return f"ぜんぶ合いました（いちばん大きい差 {worst}分 / {mod.TOL}分まで）"


def main() -> int:
    if BREAK:
        if BREAK not in LEGS:
            print(f"::error::BREAK={BREAK} は足の名前ではありません。"
                  f"使えるのは {', '.join(LEGS)}")
            return 2
        print(f"** BREAK={BREAK} —— 足を1本抜いてある。ここは落ちるのが正しい **")

    if not TOOL.is_file() or not (CONTENT / TRIP).is_file():
        print(f"::error::焼くほうか旅程が見つかりません（{TOOL} / {CONTENT / TRIP}）")
        return 2

    mod = _load()
    _hobble(mod)

    ok: list[str] = []
    ng: list[str] = []

    def check(label: str, got, want) -> None:
        (ok if got == want else ng).append(f"{label}: 出た={got} ほしい={want}")

    trip_src = (CONTENT / TRIP).read_text(encoding="utf-8")

    # --- 0. 手をつけていない写しが、いま本番に入っている表と1バイトも違わない ---
    # **先にこれを見る**（§15 / `island-misses.md` #99）。写しを作るところで
    # 壊れていても終了コードは同じなので、ここを見ないと対照にならない
    with tempfile.TemporaryDirectory() as t:
        d = _stage(Path(t))
        was = (d / OUT).read_text(encoding="utf-8")
        rc = mod.bake(str(d))
        now = (d / OUT).read_text(encoding="utf-8")
        check("素の写しを焼いたときの終了コード", rc, 0)
        check("素の写しを焼いても、表が1バイトも変わらない", now == was, True)
        base_days, base_cities = _days_in(now), _cities_in(now)
        print(f"  素の写し: {len(base_days)}日 "
              f"（{base_days[0]}〜{base_days[-1]}）x "
              f"{len(set(base_cities))}街 / 明け暮れ {len(base_cities)}件")
        check("素の写しの日が0件ではない（分母）", len(base_days) > 0, True)
        check("素の写しの街が0件ではない（分母）", len(set(base_cities)) > 0, True)

    # --- 1. 式が、外から取った値と合っているか -------------------------------
    # **同じ式で計算した値と比べない。** 式が同じ間違いを持っていれば仲良く通る
    # （`docs/island-misses.md` #63）。相手は open-meteo（`--golden` で取り直す）
    bad, n, worst = mod.golden_gaps()
    print(f"  式と外の値: {n}件を見て、{_tol_line(len(bad), worst, mod)}")
    check("突き合わせ相手が0件ではない（分母）", n > 0, True)
    check("式が外の値と合っている", bad, [])

    # --- 2. 旅程を1日のばすと、表も1日のびる -------------------------------
    # **ここが「旅程から引いている」の本体。** 抜けると、固定の日付を焼いて
    # いるのと見分けがつかない（`BREAK=hardwired` でここが落ちる）
    last = max(dt.date.fromisoformat(d) for d in base_days)
    added = last + dt.timedelta(days=1)
    longer = trip_src.replace(
        '''export const DAYS: Day[] = [
  {''',
        f'''export const DAYS: Day[] = [
  {{
    id: "day-added",
    date: "{added}",
    city: "ストックホルム",
  }},
  {{''', 1)
    check("旅程をのばす仕込みが、本物に当たっている", longer != trip_src, True)
    with tempfile.TemporaryDirectory() as t:
        d = _stage(Path(t), longer)
        rc = mod.bake(str(d))
        got = _days_in((d / OUT).read_text(encoding="utf-8"))
        check("旅程を1日のばして焼いたときの終了コード", rc, 0)
        check("旅程を1日のばすと、表も1日のびる", len(got), len(base_days) + 1)
        check("のばした日が焼かれている", added.isoformat() in got, True)

    # --- 3. 旅程に新しい街が入ったら、黙って飛ばさない ----------------------
    # 座標の無い街を黙って飛ばすと、**その街の日の面から明るさの欄が消えるだけ**で
    # 誰も赤くならない（`BREAK=quiet-unknown` でここが落ちる）
    newtown = trip_src.replace('    stay: "ワルシャワ",',
                               '    stay: "オーボ",', 1)
    check("知らない街を入れる仕込みが、本物に当たっている", newtown != trip_src, True)
    with tempfile.TemporaryDirectory() as t:
        d = _stage(Path(t), newtown)
        was = (d / OUT).read_text(encoding="utf-8")
        rc = mod.bake(str(d))
        check("座標も断りも無い街が在るときの終了コード", rc, 2)
        check("そのとき、表を1バイトも書き換えない",
              (d / OUT).read_text(encoding="utf-8") == was, True)

    # 断り（`NO_SUN`）に理由を添えて足せば、焼ける
    keep = dict(mod.NO_SUN)
    try:
        mod.NO_SUN = {**keep, "オーボ": "寄るかどうかまだ決まっていない（仕込み）"}
        with tempfile.TemporaryDirectory() as t:
            d = _stage(Path(t), newtown)
            rc = mod.bake(str(d))
            got = _cities_in((d / OUT).read_text(encoding="utf-8"))
            check("断りに足した街があるときの終了コード", rc, 0)
            check("断った街は焼かれない", "オーボ" in got, False)
    finally:
        mod.NO_SUN = keep

    # --- 4. 旅程が読めなくなったら、焼かない -------------------------------
    # **読み落としを黙って通さない。** 通すと、落ちた日の面から明るさが消える
    broken = trip_src.replace('    date: "2026-09-15",', '    day: "2026-09-15",', 1)
    check("旅程を読めなくする仕込みが、本物に当たっている", broken != trip_src, True)
    with tempfile.TemporaryDirectory() as t:
        d = _stage(Path(t), broken)
        was = (d / OUT).read_text(encoding="utf-8")
        rc = mod.bake(str(d))
        check("旅程を1日読み落とすときの終了コード", rc, 2)
        check("そのとき、表を1バイトも書き換えない",
              (d / OUT).read_text(encoding="utf-8") == was, True)

    # 旅程そのものが無いときも、書かずに 2
    with tempfile.TemporaryDirectory() as t:
        d = _stage(Path(t))
        (d / TRIP).unlink()
        check("旅程が置き場に無いときの終了コード", mod.bake(str(d)), 2)

    # --- 5. `--check` が、旅程に足りない表を見のがさないか -------------------
    # 式だけ見ていると、**式は正しいまま旅程に1日足りない表**が通る
    # （`BREAK=loose-check` でここが落ちる）
    with tempfile.TemporaryDirectory() as t:
        d = _stage(Path(t))
        check("素の写しを突き合わせたときの終了コード", mod.check(str(d)), 0)

        thin = (d / OUT).read_text(encoding="utf-8")
        cut = re.sub(r'^\s+"%s": \{\n(?:.*\n)*?  \},\n' % re.escape(base_days[-1]),
                     "", thin, count=1, flags=re.M)
        check("表から1日削る仕込みが、本物に当たっている", cut != thin, True)
        (d / OUT).write_text(cut, encoding="utf-8")
        check("表に旅程の1日が足りないときの突き合わせ", mod.check(str(d)), 1)

    with tempfile.TemporaryDirectory() as t:
        d = _stage(Path(t))
        src = (d / OUT).read_text(encoding="utf-8")
        gone = base_cities[0]
        (d / OUT).write_text(
            re.sub(r'^\s+%s: \{ rise: "[^"]*", set: "[^"]*" \},\n' % re.escape(gone),
                   "", src, flags=re.M), encoding="utf-8")
        check("表から街を1つ削ったときの突き合わせ", mod.check(str(d)), 1)

    # --- 6. 終了コードを、口から実測する -----------------------------------
    # **判定だけ見て「2 を返すはず」と書かない。** 本物を子として起こして、
    # 返ってきた数を見る（`BREAK` を抜いた素の本物が走る）
    if not BREAK:
        with tempfile.TemporaryDirectory() as t:
            d = _stage(Path(t))
            for label, argv, want in (
                ("焼く", [], 0),
                ("突き合わせ", ["--check"], 0),
            ):
                r = subprocess.run(
                    [sys.executable, str(TOOL), "--content", str(d), *argv],
                    capture_output=True, text=True, cwd=REPO)
                check(f"口を叩いたときの終了コード（{label}）", r.returncode, want)
            d2 = _stage(Path(t) / "ng", broken)
            r = subprocess.run(
                [sys.executable, str(TOOL), "--content", str(d2)],
                capture_output=True, text=True, cwd=REPO)
            check("口を叩いたときの終了コード（旅程が読めない）", r.returncode, 2)

    print(f"対照 {len(ok) + len(ng)}件中 {len(ok)}件通った")
    for line in ng:
        print(f"::error::{line}")
    if not ok:
        print("::error::対照が0件です。本番の旅程と表が読めていません")
        return 2
    return 1 if ng else 0


if __name__ == "__main__":
    sys.exit(main())
