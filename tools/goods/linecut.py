"""届いたスタンプの絵から、**地の白を抜いて透明にする。**

    python3 tools/goods/linecut.py <元の絵> <出す先> [--all]

## なぜ要るか

スタンプの元絵は、届くときに**白地のまま**のことがある（2026-10-09 の9枚がそれ）。
焼くほう（`stampbake.py`）は透明なところを紙の色（`PENDING_BG`）で埋めるので、
**透明を持たない絵だけ白い四角で出て、ほかと並ばない。**

だから焼く前にここで抜く。**`stampbake.py` は触らない**——あちらは
「透明な元絵を受け取る」ことにしてあって、14枚ぶんそれで通っている。

## ふちから繋がっている白だけを抜く（既定）

絵の中の白は**残す。** コック帽・紙・目の光は、地ではなく絵の一部。
いちめんに白を抜くと、それが全部消える。

## `--all` は、閉じた白も抜く

「ネクストレベル」の階段がそれ。線で囲われた白なので、ふちから繋がっていない。
残すと**足元に白い塊が出る**（撮って確かめた）。
**絵ごとに目で見て決める。** 既定にしない——帽子と紙を失う絵のほうが多い。
"""

from __future__ import annotations

import sys
from collections import deque
from pathlib import Path

from PIL import Image

#: これ以上明るい画素を「地の白」とみなす。にじみを少し含める
TOL = 14
#: `--all` のときのしきい。閉じた白は塗りむらがあるので、少し厳しく
TOL_ALL = 14


def edge_cut(im: Image.Image, tol: int = TOL) -> Image.Image:
    """**ふちから繋がっている白だけ**を透明にする。"""
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    seen = bytearray(w * h)
    q: deque[tuple[int, int]] = deque()

    def white(x: int, y: int) -> bool:
        r, g, b, _ = px[x, y]
        return r >= 255 - tol and g >= 255 - tol and b >= 255 - tol

    for x in range(w):
        for y in (0, h - 1):
            if not seen[y * w + x] and white(x, y):
                seen[y * w + x] = 1
                q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if not seen[y * w + x] and white(x, y):
                seen[y * w + x] = 1
                q.append((x, y))
    while q:
        x, y = q.popleft()
        px[x, y] = (255, 255, 255, 0)
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx] and white(nx, ny):
                seen[ny * w + nx] = 1
                q.append((nx, ny))
    return im


def all_cut(im: Image.Image, tol: int = TOL_ALL) -> Image.Image:
    """**いちめんの白**を透明にする。閉じた白も抜ける（帽子や紙も消える）。"""
    im = im.convert("RGBA")
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, _ = px[x, y]
            if r >= 255 - tol and g >= 255 - tol and b >= 255 - tol:
                px[x, y] = (255, 255, 255, 0)
    return im


def drill() -> bool:
    """対照。**本物を1枚も抜く前に回す。**

    見るのは2つ。**ふちの白が抜けること**と、**閉じた白が残ること。**
    2つ目が外れていると、既定でも帽子と紙を失う。
    """
    ok = True
    # 白地の真ん中に、黒い輪っか（中は白）
    probe = Image.new("RGBA", (40, 40), (255, 255, 255, 255))
    p = probe.load()
    for y in range(12, 28):
        for x in range(12, 28):
            on_ring = x in (12, 27) or y in (12, 27)
            p[x, y] = (0, 0, 0, 255) if on_ring else (255, 255, 255, 255)

    got = edge_cut(probe.copy())
    if got.getpixel((0, 0))[3] != 0:
        print("対照1 外れ: ふちの白が抜けていない")
        ok = False
    if got.getpixel((20, 20))[3] != 255:
        print("対照2 外れ: 閉じた白まで抜けた（帽子と紙を失う）")
        ok = False
    got2 = all_cut(probe.copy())
    if got2.getpixel((20, 20))[3] != 0:
        print("対照3 外れ: --all なのに閉じた白が残った")
        ok = False
    if got2.getpixel((20, 12))[3] != 255:
        print("対照4 外れ: --all が黒い線まで抜いた")
        ok = False
    return ok


def main(argv: list[str]) -> int:
    if not drill():
        print("対照が外れた。本物は抜かない")
        return 2
    args = [a for a in argv if not a.startswith("--")]
    if len(args) != 2:
        print(__doc__)
        return 2
    src, dst = Path(args[0]), Path(args[1])
    im = Image.open(src)
    out = all_cut(im) if "--all" in argv else edge_cut(im)
    bb = out.getchannel("A").getbbox()
    if bb is None:
        print("中身が1画素も残らなかった。しきいが強すぎる")
        return 2
    dst.parent.mkdir(parents=True, exist_ok=True)
    out.save(dst)
    print(f"抜いた: {dst}  中身 {bb[2]-bb[0]}x{bb[3]-bb[1]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
