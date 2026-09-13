#!/usr/bin/env python3
"""`mesweep.mjs` が4つの状態で撮った絵を、道具ごとに**横に並べて1枚**にする。

`docs/island-standards.md` 10章の決めごと——「読めていないことを、値0と
同じ絵にしない」——は、**1枚ずつ見ても判定できない。** 0件の絵と落ちた絵を
並べて、見分けがつくかどうかを目で見るためにある。だから並べる。

    SPORT=4600 MEMODE=ok    node tools/sprites/mesweep.mjs
    SPORT=4600 MEMODE=empty node tools/sprites/mesweep.mjs
    SPORT=4600 MEMODE=down  node tools/sprites/mesweep.mjs
    SPORT=4600 MEMODE=wait  node tools/sprites/mesweep.mjs
    python3 tools/sprites/mestates.py

出るもの: /tmp/mesweep/states/<場面>.png
  左から うまくいった日 / 0件の日 / 待っている / 読めなかった日。
  高さは4枚のうちいちばん高いものにそろえて、上から同じところを切る。
"""
import os

from PIL import Image, ImageDraw

SRC = "/tmp/mesweep"
OUT = f"{SRC}/states"
MODES = [("ok", "うまくいった日"), ("empty", "0件の日"), ("wait", "待っている"), ("down", "読めなかった日")]
# 1枚あたりの幅と、上から切り取る高さ。道具の中身は札のすぐ下から始まる
COL = 390
CUT = 1500


def main() -> None:
    """エントリポイント。"""
    os.makedirs(OUT, exist_ok=True)
    names = sorted(
        f[:-8] for f in os.listdir(f"{SRC}/{MODES[0][0]}") if f.endswith("-390.png")
    )
    for name in names:
        cols = []
        for mode, _ in MODES:
            p = f"{SRC}/{mode}/{name}-390.png"
            if not os.path.exists(p):
                cols.append(None)
                continue
            im = Image.open(p)
            # dpr 2 で撮ってあるので、まず 390 幅に戻す
            k = COL / im.width
            im = im.resize((COL, int(im.height * k)))
            cols.append(im.crop((0, 0, COL, min(CUT, im.height))))
        w = COL * len(MODES)
        h = max((c.height for c in cols if c), default=CUT) + 26
        sheet = Image.new("RGB", (w, h), (255, 255, 255))
        d = ImageDraw.Draw(sheet)
        for i, (c, (_, label)) in enumerate(zip(cols, MODES)):
            x = COL * i
            d.text((x + 8, 6), label, fill=(20, 20, 20))
            if c:
                sheet.paste(c, (x, 26))
            d.line([(x, 0), (x, h)], fill=(180, 180, 180), width=2)
        sheet.save(f"{OUT}/{name}.png")
        print(f"{OUT}/{name}.png  {sheet.size}")


if __name__ == "__main__":
    main()
