"""焼いたスプライトを切り詰めて、島に置くための寸法を書き出す。

接地影が焼き込んであるので「画像の下端＝地面」ではない。
影を含む見える範囲(w,h)と、物体そのものの範囲(ox,oy,ow,oh)を別々に持たせて、
site 側で足元をぴったり合わせられるようにする。
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
    im.save(path, optimize=True)

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
