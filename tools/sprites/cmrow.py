#!/usr/bin/env python3
"""撮った街の地図を、**8街ぶん横に並べて1枚にする。**

    python3 tools/sprites/cmrow.py [撮った先] [出す先]

1枚ずつ見ていると「この街は弱い」に気づけない。**並べると一目で分かる。**
高さをそろえて、下に街の名前を書く。
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

SRC = sys.argv[1] if len(sys.argv) > 1 else "/tmp/cmap"
OUT = sys.argv[2] if len(sys.argv) > 2 else "/tmp/cmap/row.png"
ORDER = ["katowice", "warszawa", "bialystok", "vilnius",
         "riga", "tallinn", "helsinki", "stockholm"]
H, GAP, PAD, CAP = 900, 18, 18, 34


def font(sz):
    for p in ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
              "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf"):
        if os.path.exists(p):
            return ImageFont.truetype(p, sz)
    return ImageFont.load_default()


def main():
    shots = []
    for slug in ORDER:
        for name in (f"{slug}.png", f"{slug}-in.png"):
            p = os.path.join(SRC, name)
            if not os.path.exists(p):
                continue
            im = Image.open(p).convert("RGB")
            im = im.resize((max(1, round(im.width * H / im.height)), H), Image.LANCZOS)
            shots.append((name[:-4], im))
    if not shots:
        print("撮ったものが無い")
        return
    w = PAD * 2 + sum(im.width for _, im in shots) + GAP * (len(shots) - 1)
    out = Image.new("RGB", (w, H + PAD * 2 + CAP), (255, 250, 228))
    d = ImageDraw.Draw(out)
    f = font(22)
    x = PAD
    for name, im in shots:
        out.paste(im, (x, PAD))
        d.text((x + im.width / 2, PAD + H + 8), name, fill=(91, 63, 21), font=f, anchor="ma")
        x += im.width + GAP
    out.save(OUT)
    print(f"{OUT}  {out.width}x{out.height}  {len(shots)}枚")


main()
