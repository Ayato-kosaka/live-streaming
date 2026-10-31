"""ffmpeg の `select` に渡す「このコマたちだけ」の式を組む。

    from selectexpr import select_expr
    vf = f"select={select_expr([5, 6, 7, 55])}"   # → (between(n\\,5\\,7)+eq(n\\,55))

使うのは、コマ番号を名指しして抜き出す道具ぜんぶ（`verify.py`・`proof.py`・`contact_sheet.py`・
`../qa/common.py` の `iter_frames`）。**式を自分で `"+".join(...)` しない。** ここを通す。

## なぜ括弧で組むか（2026-10-23、PR #1015 の CI の赤）

FFmpeg の式は `+` を左から積む（`a+b+c` は `((a+b)+c)`）ので、項が k 個なら木の深さが k になる。
FFmpeg は式の木の深さに上限を入れた（`libavutil/eval.c` の `MAX_DEPTH 100`。超えると `make_eval_expr` が
NULL を返し、`Error while parsing expression` → `Cannot allocate memory` で止まる）。
この箱で版ごとに当てた（`eq(n\\,i)` を `+` で横につないだ式）:

| 版 | 横に100項 | 横に101項 | 括弧で組んだ1,000項 |
| --- | --- | --- | --- |
| 6.1.1（apt、Ubuntu 24.04） | 通る | 通る | 通る |
| n8.1.3（BtbN のリリースの枝、2026-10-22） | 通る | **0コマ** | 通る |
| n9.0.2（同） | 通る | **0コマ** | 通る |
| N-127941（BtbN の master の夜間版） | 通る | **0コマ** | 通る |

括弧で二分に組めば深さは log2(k) + 1 で、1,000項でも 11。**取れるコマと順番は変わらない**
（`select` は式が 0 か 0 でないかしか見ず、出てくるのは元の動画の順のまま）。8.1 の枝にも入っているので、
いずれ Ubuntu の ffmpeg も上限を持つ。版を止めるだけでなく、組み方をこちらで変えた。
見張り: `selectexpr_selftest.py`（上限を持つ偽の ffmpeg と、本物の ffmpeg の両方で当てる）。
"""
from __future__ import annotations

from typing import Iterable


def spans(frames: Iterable[int]) -> list[tuple[int, int]]:
    """コマ番号を、続いた番号ごとの [始め, 終わり]（両端を含む）にまとめる。並べ替え・重複の除きもここ。"""
    out: list[tuple[int, int]] = []
    for f in sorted(set(int(f) for f in frames)):
        if out and f == out[-1][1] + 1:
            out[-1] = (out[-1][0], f)
        else:
            out.append((f, f))
    return out


def _leaf(a: int, b: int) -> str:
    # `,` は -vf の中ではフィルタの区切りなので `\,` に逃がす（ffmpeg に渡る字は `eq(n\,5)`）
    return f"eq(n\\,{a})" if a == b else f"between(n\\,{a}\\,{b})"


def _tree(leaves: list[str]) -> str:
    if len(leaves) == 1:
        return leaves[0]
    m = len(leaves) // 2
    return f"({_tree(leaves[:m])}+{_tree(leaves[m:])})"


def select_expr(frames: Iterable[int]) -> str:
    """欲しいコマ番号の並びを、`select=` の後ろに置く式にする。

    続いた番号は `between` に畳み、項どうしは括弧で二分に組む（深さを log2 に抑える）。
    空の並びは組まない（何も選ばない式を渡すと、ffmpeg は黙って0コマを返す）。
    """
    leaves = [_leaf(a, b) for a, b in spans(frames)]
    if not leaves:
        raise ValueError("選ぶコマが1つも無い")
    return _tree(leaves)
