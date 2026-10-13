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

    for name in ok:
        print(f"  ○ {name}")
    print(f"対照 {len(ok) + len(ng)}件中 {len(ok)}件通った")
    for name in ng:
        print(f"::error::{name} が外れました")
    return 1 if ng else 0


if __name__ == "__main__":
    sys.exit(main())
