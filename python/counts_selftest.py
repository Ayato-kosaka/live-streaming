"""`python/counts.py` の対照。**0 を答えとして出さないこと**が本体。

    python3 python/counts_selftest.py        # 0=通った / 1=外した

ネットにも本番にも出ない。読むのはこのリポジトリの中だけ。

## なぜこの4本か

数える道具がいちばん悪い壊れかたをするのは、**置き場が動いたときに
「0 でした」と答える**こと（`docs/island-standards.md` §15）。
`counts.py` は 0 を答えにせず 2 で落ちる作りなので、**その足を抜いて
実測する。** 抜いても落ちなければ、この道具は何も守っていない。

**「面」だけは 0 でよい**（まだ書き出していない回がある）。
0 を一律に赤にすると、書き出し前に回した人が毎回赤を見て、
そのうち誰も読まなくなる。
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import counts  # noqa: E402


def _blew_up_without_roots() -> bool:
    """見に行く置き場を1つ消したら、**0 を返さずに投げるか。**"""
    saved = counts.SCAN_ROOTS
    counts.SCAN_ROOTS = saved + ("no/such/place",)
    try:
        counts._scan_files()
        return False
    except ValueError:
        return True
    finally:
        counts.SCAN_ROOTS = saved


def _comment_is_not_counted() -> bool:
    """コメントに書いた字が、残件として数えられないか。

    **`.ts` と `.py` の両方**で見る。落とし方が別なので、片方だけ当てると
    もう片方が丸ごと壊れていても緑のままになる。
    """
    import tempfile

    with tempfile.TemporaryDirectory() as d:
        box = Path(d)
        ts = box / "a.ts"
        ts.write_text('// script.google.com/macros/s/x/exec\nconst u = "ok";\n', encoding="utf-8")
        py = box / "b.py"
        py.write_text('# script.google.com/macros/s/x/exec\nu = "ok"\n', encoding="utf-8")
        left = [counts._no_comment(p, p.read_text(encoding="utf-8")) for p in (ts, py)]
    return not any("script.google.com" in s for s in left)


def _child_failure_is_not_zero() -> bool:
    """子が 0 以外で終わったら、**その数を 0 にせずに投げるか。**"""
    try:
        counts._out(sys.executable, "-c", "import sys; sys.exit(3)")
        return False
    except ValueError:
        return True


def main() -> int:
    ok: list[str] = []
    ng: list[str] = []

    def check(name: str, cond: bool) -> None:
        (ok if cond else ng).append(name)

    got, bad = counts.collect()
    check(f"ふつうに数えられる（{len(got)}欄）", not bad)

    # 置き場が空になったことにして、2 の側へ倒れるか
    saved = counts.COUNTS["recipes"]
    counts.COUNTS["recipes"] = (saved[0], lambda: 0, saved[2])
    _g, bad_zero = counts.collect()
    counts.COUNTS["recipes"] = saved
    check("0 が出たら落ちる（**いちばん危ない形**）", bool(bad_zero))

    # 読み落としを投げたとき、黙って飛ばさないか
    saved = counts.COUNTS["legends"]

    def boom() -> int:
        raise ValueError("読み落とした")

    counts.COUNTS["legends"] = (saved[0], boom, saved[2])
    _g, bad_raise = counts.collect()
    counts.COUNTS["legends"] = saved
    check("読み落としを投げたら落ちる", bool(bad_raise))

    # 面だけは 0 でよい
    saved = counts.COUNTS["pages"]
    counts.COUNTS["pages"] = (saved[0], lambda: 0, saved[2])
    _g, bad_pages = counts.collect()
    counts.COUNTS["pages"] = saved
    check("書き出していない回は、面が 0 でも通る", not bad_pages)

    # ---- 棚おろしの欄（`docs/island-audit.md`）
    #
    # ここは「片づいたら 0 になる」欄があるので、**0 の扱いが2通りある。**
    # 片方を間違えると、片づいた日に赤くなるか、置き場が動いた日に黙るか、
    # どちらかに倒れる。両方を当てる。

    saved = counts.COUNTS["gas_exec"]
    counts.COUNTS["gas_exec"] = (saved[0], lambda: 0, saved[2])
    _g, bad_done = counts.collect()
    counts.COUNTS["gas_exec"] = saved
    check("剥がし終わった残件は、0 でも通る（GAS の口）", not bad_done)

    check("片づいた 0 は「—」ではなく 0 と出す",
          "gas_exec" not in counts.UNMEASURED and "gas_exec" in counts.OPTIONAL)

    # **分母が落ちたら、残件の 0 を「片づいた」と読ませない。**
    # 置き場が動いた日に効く足はここ1本だけなので、名指しで当てる
    saved = counts.COUNTS["code_files"]
    counts.COUNTS["code_files"] = (saved[0], lambda: 0, saved[2])
    _g, bad_denom = counts.collect()
    counts.COUNTS["code_files"] = saved
    check("分母（見に行った字のファイル）が 0 なら落ちる", bool(bad_denom))

    check("置き場が消えたら、数えずに投げる", _blew_up_without_roots())

    # **数える道具と、この対照は、数える先に入れない。**
    # どちらも探す字を自分の中に持っているので、入れると自分を数える
    # （実際に GAS の口が 4 → 6 に見えた）
    scanned = {p.name for p in counts._scan_files()}
    check("数える道具と対照を、自分で数えない",
          "counts.py" not in scanned and "counts_selftest.py" not in scanned)

    # **コメントは数えない**（`docs/island-audit.md` の決まり）。
    # 落とす側が壊れたら、直した記録を残件として数えはじめる
    check("コメントの中は数えない", _comment_is_not_counted())

    # **子（node / selftest_runner）が落ちたら、0 ではなく「数えられません」**
    check("子が落ちたら 0 にしない", _child_failure_is_not_zero())

    for name in ok:
        print(f"  ○ {name}")
    print(f"対照 {len(ok) + len(ng)}件中 {len(ok)}件通った")
    for name in ng:
        print(f"::error::{name} が外れました")
    return 1 if ng else 0


if __name__ == "__main__":
    sys.exit(main())
