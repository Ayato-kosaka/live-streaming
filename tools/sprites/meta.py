"""焼いたスプライトを配信用に整えて、島に置くための寸法を書き出す。

やること:
  1. 透明な余白を切り落とす
  2. 長辺 320px まで縮める(島では 40〜200px でしか映らないので、これで足りる)
  3. WebP で書き出す。PNG のままだと島1枚で3MB近くになってしまう
  4. 接地影が焼き込んであるので「画像の下端＝地面」ではない。
     影を含む見える範囲(w,h)と、物体そのものの範囲(ox,oy,ow,oh)を
     別々に持たせて、site 側で足元をぴったり合わせられるようにする
"""
import json
import os
import sys

from PIL import Image

SRC = sys.argv[1] if len(sys.argv) > 1 else "../../site/public/sprites"
OUT = sys.argv[2] if len(sys.argv) > 2 else "../../site/content/sprites.json"

# 接地影の濃さは 0.2 前後なので、これより濃ければ物体とみなす
SOLID = 140
VISIBLE = 6
# 表示に必要な最大の辺の長さ(px)。高精細画面のぶんも見込んである
MAX_SIDE = 320

meta = {}
for f in sorted(os.listdir(SRC)):
    if not f.endswith(".png"):
        continue
    name = f[:-4]
    path = os.path.join(SRC, f)
    im = Image.open(path).convert("RGBA")
    a = im.getchannel("A")

    seen = a.point(lambda v: 255 if v > VISIBLE else 0).getbbox()
    if seen is None:
        print("空:", name)
        continue
    im = im.crop(seen)
    k = min(1.0, MAX_SIDE / max(im.size))
    if k < 1:
        im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
    im.save(os.path.join(SRC, name + ".webp"), quality=88, method=6)
    os.remove(path)

    a = im.getchannel("A")
    solid = a.point(lambda v: 255 if v > SOLID else 0).getbbox() or (0, 0, im.width, im.height)
    ox, oy, x1, y1 = solid
    meta[name] = {
        "w": im.width, "h": im.height,
        "ox": ox, "oy": oy, "ow": x1 - ox, "oh": y1 - oy,
    }

with open(OUT, "w") as fp:
    json.dump(meta, fp, indent=0, sort_keys=True)
    fp.write("\n")
print(f"{len(meta)} 点 → {OUT}")
