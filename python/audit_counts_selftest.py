"""**棚おろしの紙（`docs/island-audit.md`）と、数える道具（`python/counts.py`）が繋がっているか。**

    python3 python/audit_counts_selftest.py

ネットにも本番にも出ない。読むのはこのリポジトリの中の2つのファイルだけ。
終了コード 0=繋がっている / 1=切れている / **2=数えるものが無い**。

## なぜ要るか

棚おろしの紙は**「いま何が、どこに、いくつあるか」を見に来るところ**なのに、
2026-09-19 から数が手書きのままで、1か月後に #884 が立った。
「見張りは60本」「口は46本」と書いてあるところが、実際には 145本・76本だった。
**数えかたは正しくて、数だけが古い**——このリポジトリでいちばんよく出る壊れかた。

だから紙から数を消して、**`counts.py` の鍵を名指しする**形にした。

    | 見張り | `counts.py: watches` |

読む人はその場で `python3 python/counts.py` を回す。紙は古くならない。

**ただし、名指しは切れる。** 鍵の名前を変えた日・欄を消した日に、
紙のほうは**赤くならない。字として残るだけ。**（`CLAUDE.md` の
「繋ぎはワークフローの `name:` で解決される。あちらの名前を変えると黙って切れる」
と同じ形。切れても誰も気づかない繋ぎが、いちばん高くつく）

ここは**その繋ぎを両側から当てる。**

## 判定の足（`BREAK=<足>` で1本ずつ抜ける）

| 足 | 何を見るか | 外すとどうなるか |
| --- | --- | --- |
| `unknown` | 紙が名指しした鍵が、`COUNTS` に在るか | 鍵を消した日に、紙が居ない欄を指したまま残る |
| `missing` | 棚おろし向きの欄が、紙から名指しされているか | 欄を足したのに紙に書かない（＝誰も見に来ない数）が通る |
| `baked` | 鍵の**すぐ隣に**、その数を手で書いていないか | 「`counts.py: watches`（145本）」と書けてしまい、**また古くなる** |

`baked` が見るのは**鍵に添えた数だけ。** 行のどこかに数があるだけでは落とさない
（「1本ずつ見る」のようなふつうの日本語まで赤にすると、書けない紙になる）。

`BREAK=` は対照のためだけに在る。当てると、その足が**落ちなくなる**ことを見る。
"""

from __future__ import annotations

import os
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent
sys.path.insert(0, str(HERE))

import counts  # noqa: E402

DOC = REPO / "docs" / "island-audit.md"

# 紙が鍵を名指しする書き方。**1通りだけ**にしてある（揺れると見張りが抜ける）
REF_RE = re.compile(r"`counts\.py: ([a-z_][a-z0-9_]*)`")

# 「この欄は棚おろしの紙が持っている」の印。`COUNTS` の3つ目（どこが名指ししているか）
MINE = "docs/island-audit.md"

LEGS = ("unknown", "missing", "baked")

# **鍵のすぐ隣に書いた「いくつ」。** これだけを落とす。
#
# 行のどこかに数があるだけでは落とさない——「1本ずつ見る」「2 で止まる」のような
# ふつうの日本語にも数は出る。**全部を赤にすると、書けない紙になって誰も直さなくなる。**
# 危ないのは**鍵に添えた数**（「`counts.py: watches`（いまは145本）」）のほうで、
# あれは読む人が道具を回さずに済ませてしまうので、そこだけ取る。
BAKED_RE = re.compile(
    r"`counts\.py: [a-z_][a-z0-9_]*`[^|\n]{0,16}?"
    r"\d[\d,]*\s*(?:本|件|個|行|面|か所|名|人|回|種|枚|KB|MB)"
)


class Broken(Exception):
    """**数えかたのほうが壊れた。** 判定を1つも出さずに 2 で落ちる。"""


def broken_legs() -> frozenset[str]:
    want = {x.strip() for x in os.environ.get("BREAK", "").split(",") if x.strip()}
    odd = want - set(LEGS)
    if odd:
        raise SystemExit(f"BREAK に知らない足があります: {' '.join(sorted(odd))}"
                         f"（{' '.join(LEGS)}）")
    return frozenset(want)


def refs(text: str) -> list[tuple[int, str, str]]:
    """紙が名指ししている鍵。→ [(行, 鍵, その行ぜんぶ)]"""
    out: list[tuple[int, str, str]] = []
    for lineno, line in enumerate(text.splitlines(), 1):
        for m in REF_RE.finditer(line):
            out.append((lineno, m.group(1), line))
    return out


def mine(keys: dict[str, tuple]) -> set[str]:
    """棚おろしの紙が持っている欄（`COUNTS` の「どこが名指ししているか」で選ぶ）。"""
    return {k for k, (_label, _fn, where) in keys.items() if where.startswith(MINE)}


def judge(found: list[tuple[int, str, str]], keys: dict[str, tuple],
          ban: frozenset[str]) -> list[str]:
    """切れているところを並べる。**数そのものは見ない。繋がりだけを見る。**"""
    bad: list[str] = []
    named = {k for _ln, k, _row in found}

    # 1. 紙が、居ない欄を指している
    if "unknown" not in ban:
        for lineno, key, _row in found:
            if key not in keys:
                near = [k for k in keys if k.startswith(key[:4])]
                hint = f"。近いのは「{near[0]}」" if near else ""
                bad.append(f"{DOC.name}:{lineno} が `{key}` を指しているが、"
                           f"counts.py にその欄が無い{hint}")

    # 2. 棚おろし向きの欄が、紙に出てこない
    if "missing" not in ban:
        for key in sorted(mine(keys) - named):
            bad.append(f"counts.py の `{key}` は棚おろし向きの欄なのに、"
                       f"{DOC.name} が1度も名指ししていない（誰も見に来ない数）")

    # 3. 鍵のすぐ隣に、その数を手で書いている
    if "baked" not in ban:
        for lineno, key, row in found:
            m = BAKED_RE.search(row)
            if m and f"counts.py: {key}`" in m.group(0):
                bad.append(f"{DOC.name}:{lineno} は `{key}` を名指ししているのに、"
                           f"その隣に数が書いてある（書いた日から古くなる）: 「{m.group(0).strip()}」")

    return bad


def verdict(found: list, bad: list[str]) -> int:
    if not found:
        return 2
    return 1 if bad else 0


def run(text: str, keys: dict[str, tuple], ban: frozenset[str]) -> tuple[int, list[str]]:
    found = refs(text)
    bad = judge(found, keys, ban)
    return verdict(found, bad), bad


# ------------------------------------------------------------------ 対照
#
# `docs/island-standards.md` §15。**足の数だけ用意する。**
# 1本ずつ抜いて（`BREAK=`）、そのたびに対照が落ちることまで見る。


def drill() -> list[str]:
    """**こしらえた紙と欄**で、落ちるときに落ちるかを見る。→ 外れたものの名前

    **本物の紙と `counts.py` は使わない。** 使うと、本物のほうが切れている日に
    「対照が外れた」に倒れて、**本当の理由（どの鍵が無いか）が出なくなる。**
    実際に鍵を1つ改名して当ててみたら、そうなった（2026-10-15）。
    対照は対照だけで閉じる。
    """
    ng: list[str] = []
    real = "# 試しの紙\n\n| 見張り | `counts.py: alpha` |\n"
    keys: dict[str, tuple] = {
        # 棚おろし向きの欄（紙から名指しされていないと落ちる）
        "alpha": ("あ", lambda: 1, MINE + " 1-1"),
        # よその紙が持っている欄（ここに出てこなくてよい）
        "beta": ("い", lambda: 2, "CLAUDE.md"),
    }
    any_key = "alpha"

    def want(name: str, got: int, need: int) -> None:
        print(f"  {'○' if got == need else '✕'} {name} → 終了コード {got}（欲しいのは {need}）")
        if got != need:
            ng.append(name)

    # [1] 繋がっている紙。**よその紙が持つ欄（`beta`）は、無くても落ちない**
    want("繋がっている紙", run(real, keys, frozenset())[0], 0)

    # [2] 居ない鍵を指す写し
    lost = real + "\n| 試し | `counts.py: no_such_count` |\n"
    want("居ない鍵を指す", run(lost, keys, frozenset())[0], 1)
    want("  BREAK=unknown を当てると通る",
         run(lost, keys, frozenset({"unknown"}))[0], 0)
    want("  BREAK=missing では落ちたまま",
         run(lost, keys, frozenset({"missing"}))[0], 1)

    # [3] 紙に書いていない欄を足した写し
    more = dict(keys)
    more["no_one_reads_me"] = ("試しの欄", lambda: 1, MINE + " 9章")
    want("紙に無い欄がある", run(real, more, frozenset())[0], 1)
    want("  BREAK=missing を当てると通る",
         run(real, more, frozenset({"missing"}))[0], 0)
    want("  BREAK=unknown では落ちたまま",
         run(real, more, frozenset({"unknown"}))[0], 1)

    # [4] 名指しの隣に数を書いた写し
    baked = real.replace(f"`counts.py: {any_key}`",
                         f"`counts.py: {any_key}`（いまは 999本）", 1)
    want("名指しの行に数を書く", run(baked, keys, frozenset())[0], 1)
    want("  BREAK=baked を当てると通る",
         run(baked, keys, frozenset({"baked"}))[0], 0)

    # [5] 名指しを1つも持たない写し。**0件を「通った」にしない**
    want("名指しが1つも無い", run("# 紙\n\nなにも指していない\n", keys, frozenset())[0], 2)

    return ng


def main() -> int:
    try:
        ban = broken_legs()
        if not DOC.is_file():
            raise Broken(f"{DOC} が無い")
        print("[対照] この見張りが、落ちるときに落ちるか")
        ng = drill()
        if ng:
            print("\n✕ 対照が外れた。**本物の紙は見ていない**")
            return 2
        print()

        code, bad = run(DOC.read_text(encoding="utf-8"), counts.COUNTS, ban)
    except Broken as e:
        print(f"!! {e}")
        return 2

    found = refs(DOC.read_text(encoding="utf-8"))
    print(f"[棚おろしの紙] {DOC.relative_to(REPO)}")
    print(f"  名指し {len(found)}か所／棚おろし向きの欄 {len(mine(counts.COUNTS))}個")
    if code == 2:
        print("✕ 鍵の名指しが1か所も無い。**「繋がっている」とは言わない**")
        return 2
    for b in bad:
        print(f"::error::{b}")
    if bad:
        print(f"\n✕ 繋ぎが {len(bad)}か所 切れている")
        return 1
    print("○ 紙が指している鍵は全部在る。棚おろし向きの欄は全部、紙から指されている")
    return 0


if __name__ == "__main__":
    sys.exit(main())
