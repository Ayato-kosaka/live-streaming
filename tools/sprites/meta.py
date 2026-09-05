"""焼いたスプライトを配信用に整えて、島に置くための寸法を書き出す。

やること:
  1. 透明な余白を切り落とす
  2. 出る大きさまで縮める(下の MAX_SIDE / SMALL_SIDE)
  3. WebP で書き出す。PNG のままだと島1枚で3MB近くになってしまう
  4. 接地影が焼き込んであるので「画像の下端＝地面」ではない。
     影を含む見える範囲(w,h)と、物体そのものの範囲(ox,oy,ow,oh)を
     別々に持たせて、site 側で足元をぴったり合わせられるようにする
"""
import json
import os
import re
import sys

from PIL import Image

SRC = sys.argv[1] if len(sys.argv) > 1 else "../../site/public/sprites"
OUT = sys.argv[2] if len(sys.argv) > 2 else "../../site/content/sprites.json"

# 接地影の濃さは 0.2 前後なので、これより濃ければ物体とみなす
SOLID = 140
VISIBLE = 6

# 表示に必要な最大の辺の長さ(px)。高精細画面のぶんも見込んである。
# 島でいちばん大きく出るのは配信やぐら(ワールド128)で、デスクトップでは
# 1ワールド = 約2.4px なので 300px 強。ページの見出しの丸は 96px の2倍で192px。
# その両方を上回る 320 を既定にする。
MAX_SIDE = 320
# 島の地面に置く小物は、いちばん大きいものでもワールド34(岩)。
# デスクトップの2倍画面で 82px、タイルの印でも 88px にしかならない。
# ここに 320px を配るのは、面積で15倍を捨てているのと同じ。
SMALL_SIDE = 192
# 小物の名前。見出しの丸(96px)に使われるのは入口の建物だけなので、
# 草・花・岩・道・柵・畑はこちらに入れてよい
SMALL = re.compile(
    r"^(grass|flower-|mushroom|bush|lily|log|firewood|path-|crop-|fence"
    r"|stump|rock-|stone-|pot-plant|fern|bamboo|moss-hanging|cactus|hedge"
    # 住人は島を歩く大きさ(ワールド30前後)にしか出ない。
    # 2倍画面でも 80px 弱なので、320px を配ると 4枚に 3枚ぶん捨てることになる
    r"|villager-"
    r"|snow-pile|rocks-snow|sled)"
)


def max_side(name):
    """この絵をいちばん大きく出すときの辺の長さ(px)。"""
    return SMALL_SIDE if SMALL.match(name) else MAX_SIDE


# 焼きたての PNG があるものは作り直し、無いものは前に作った webp をそのまま測る。
# 一部だけ焼き直したときに、寸法表から残りが消えないようにするため
names = sorted({f.rsplit(".", 1)[0] for f in os.listdir(SRC) if f.endswith((".png", ".webp"))})
meta = {}
for name in names:
    fresh = os.path.join(SRC, name + ".png")
    if os.path.exists(fresh):
        im = Image.open(fresh).convert("RGBA")
        a = im.getchannel("A")
        seen = a.point(lambda v: 255 if v > VISIBLE else 0).getbbox()
        if seen is None:
            print("空:", name)
            continue
        im = im.crop(seen)
        k = min(1.0, max_side(name) / max(im.size))
        if k < 1:
            im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
        # 品質88・透明は無圧縮(既定)だと、中身の3割が透明の階調に消えていた。
        # 接地影のぼかしと輪郭のなめらかさは、色より粗くても見分けが付かない。
        # 88/既定 と 82/72 を並べて見比べても差が出ず、大きさは約7割になる。
        # ここから下げる(aq50 など)と、影に同心円の縞が出はじめる
        im.save(os.path.join(SRC, name + ".webp"), quality=82, alpha_quality=72, method=6)
        os.remove(fresh)
    else:
        im = Image.open(os.path.join(SRC, name + ".webp")).convert("RGBA")

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
