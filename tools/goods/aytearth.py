#!/usr/bin/env python3
"""付箋「誰にでも似合うトレーナー」（2026-10-18）の、胸の「ayt / earth」を刷る絵にする。

    python3 tools/goods/aytearth.py      # → tools/goods/art/out/sweat-aytearth.png

付箋の絵は字だけのトレーナーなので、ChatGPT に描かせずに字を組む（描かせると字の形が揺れる）。
書体は M PLUS Rounded 1c Black（OFL）。使う5字だけに削って `fonts/` に置いてある。

- 付箋の字は書体より**ぽってり**しているので、同じ色の縁で少し太らせる。
  太らせすぎると a と e の穴が潰れる（字の大きさの 3.5% で潰れた。1.2% で止める）
- 字間は詰める。付箋は字どうしが触れそうなくらい近い
- 地は透明、字は生成り。紺にも黒にも灰にも乗る色にする（「誰にでも似合う」）
- 面はスウェット（スタンダード）の 2520 x 2992。SUZURI は縮めずに 1画素=1画素で置くので、
  面と同じ大きさのキャンバスに、胸の高さで置いて渡す（`compose.sh` の頭に同じ話）
"""
import os

from PIL import Image, ImageChops, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
FONT = os.path.join(HERE, "fonts", "MPLUSRounded1c-Black-aytearth.ttf")
OUT = os.path.join(HERE, "art", "out", "sweat-aytearth.png")

CREAM = "#F3EEE2"
SIZE = 600            # 組むときの字の大きさ。最後に面の幅へ合わせて縮める
STROKE = 0.012        # 太らせる縁（字の大きさに対して）
TRACK = -0.025        # 字間
LEAD = 0.80           # 行送り。y の脚が下の行に触れない、ぎりぎり
CANVAS = (2520, 2992)
WIDTH = 2480          # 胸の字の幅。面（32cm）いっぱい。付箋の写真は胸の半分近くを字が占める
TOP = 120             # 面の上端から。付箋の写真は襟のすぐ下から字が始まる

f = ImageFont.truetype(FONT, SIZE)
stroke = round(SIZE * STROKE)
asc, desc = f.getmetrics()


def word(w):
    xs, x = [], 0.0
    for ch in w:
        xs.append(x)
        x += f.getlength(ch) + SIZE * TRACK
    im = Image.new("L", (int(x + 4 * stroke + 40), asc + desc + 4 * stroke), 0)
    d = ImageDraw.Draw(im)
    for ch, xx in zip(w, xs):
        d.text((xx + 2 * stroke, 2 * stroke), ch, font=f, fill=255, stroke_width=stroke, stroke_fill=255)
    return im


a, b = word("ayt"), word("earth")
lead = round(SIZE * LEAD)
W, H = max(a.width, b.width), lead + b.height
top, bottom = Image.new("L", (W, H), 0), Image.new("L", (W, H), 0)
top.paste(a, (0, 0))
bottom.paste(b, (0, lead))
mask = ImageChops.lighter(top, bottom)
mask = mask.crop(mask.getbbox())
mask = mask.resize((WIDTH, round(mask.height * WIDTH / mask.width)), Image.LANCZOS)

art = Image.new("RGBA", mask.size, CREAM)
art.putalpha(mask)
canvas = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
canvas.alpha_composite(art, ((CANVAS[0] - art.width) // 2, TOP))
os.makedirs(os.path.dirname(OUT), exist_ok=True)
canvas.save(OUT, optimize=True)
print(OUT, canvas.size, "字の箱", art.size)
