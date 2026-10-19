#!/usr/bin/env python3
"""付箋「すてきなTシャツ」（2026-10-14）の、表「COME des NO RETURN」と背中「TRAVELING WITH NO RETURN DATE」を刷る絵にする。

    python3 tools/goods/noreturn.py      # → tools/goods/art/out/tshirt-noreturn-{front,back}.png

付箋の絵は黒いTシャツに白い字が1行ずつ入っただけなので、`aytearth.py` と同じく書体で組む。
書体は Inter Bold（OFL）。使う字だけに削って `fonts/` に置いてある。

- 字は白、地は透明。付箋の写真は黒いTシャツなので、見本も黒にする（`goods.json`）
- 表は胸の高さに、背中は肩甲骨の高さに、どちらも面いっぱいの幅で1行。
  付箋の写真は字が胸幅の半分ほどある。面の 8割で試作したら、見本では 3分の1 にしか見えなかった。
  表と背中の字の幅はほぼ同じで、背中のほうが字が小さい（字数が多い）
- 面は Tシャツ（スタンダード）の 2520 x 2992。SUZURI は縮めずに 1画素=1画素で置く
  （`compose.sh` の頭に同じ話）
"""
import os

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
FONT = os.path.join(HERE, "fonts", "Inter-Bold-noreturn.otf")
OUT = os.path.join(HERE, "art", "out")
CANVAS = (2520, 2992)
WHITE = (255, 255, 255, 255)

# (置き先, 字, 字の幅, 上端)
LINES = [
    ("tshirt-noreturn-front.png", "COME des NO RETURN", 2480, 600),
    ("tshirt-noreturn-back.png", "TRAVELING WITH NO RETURN DATE", 2480, 640),
]


def line(text, width, top):
    f = ImageFont.truetype(FONT, 400)
    l, t, r, b = f.getbbox(text)
    im = Image.new("RGBA", (r - l + 20, b - t + 20), (0, 0, 0, 0))
    ImageDraw.Draw(im).text((10 - l, 10 - t), text, font=f, fill=WHITE)
    im = im.crop(im.getbbox())
    im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    canvas = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    canvas.alpha_composite(im, ((CANVAS[0] - im.width) // 2, top))
    return canvas


os.makedirs(OUT, exist_ok=True)
for name, text, width, top in LINES:
    path = os.path.join(OUT, name)
    line(text, width, top).save(path, optimize=True)
    print(path)
