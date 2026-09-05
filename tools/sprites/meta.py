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
# 島でいちばん大きく出るのはやぐら(ワールド128)で、デスクトップでは
# 1ワールド = 約2.4px なので 300px 強。ページの見出しの丸は 96px の2倍で192px。
# その両方を上回る 320 を既定にする。
MAX_SIDE = 320
# 図鑑の主役だけ、もう1枚この大きさで焼いてある(`hero/`)。
# `/kitchen/[品]` の絵は画面で高さ 300px まで出るので、2倍の画面では
# 600px 要る。320px の1枚を引き伸ばすと、そこだけぼける。
# 一覧のマスは今までの1枚のままなので、増えるのは詳細を開いた人の1枚だけ
HERO_DIR = "hero"
HERO_SIDE = 640
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
    r"|snow-pile|rocks-snow|sled"
    # ナツメヤシは島の連なり（`/atlas`・`/island/<章>`）にしか出ない。
    # いちばん大きく出る中東の島で高さ 49px、2倍の画面でも 98px なので、
    # 320px を配ると4枚に3枚ぶん捨てることになる（22KB → 9KB）。
    # **いまの島に大きく置くことになったら、ここから外すこと。**
    r"|tree-date)"
)


def max_side(name):
    """この絵をいちばん大きく出すときの辺の長さ(px)。"""
    return SMALL_SIDE if SMALL.match(name) else MAX_SIDE


# 同じ物の別コマ(住人の立ち・歩き・座り)は、1つの枠でまとめて切る。
#
# 1枚ずつ余白を切ると、コマごとに絵の大きさも位置も変わる。site の Sprite は
# 「物体の高さ = 指定した大きさ」になるよう拡大するので、背の低いコマだけ
# 引き伸ばされて、差し替えた瞬間に人が伸び縮みする。
# 焼くほうも同じ画角に固定してある(manifest.mjs の VILLAGER)。
GROUP = re.compile(r"^(villager-(?:male|female)-[a-z])(?:-|$)")


def group_of(name):
    """まとめて切る仲間の名前。まとめないものは None。"""
    m = GROUP.match(name)
    return m.group(1) if m else None


# 焼きたての PNG があるものは作り直し、無いものは前に作った webp をそのまま測る。
# 一部だけ焼き直したときに、寸法表から残りが消えないようにするため
names = sorted({f.rsplit(".", 1)[0] for f in os.listdir(SRC) if f.endswith((".png", ".webp"))})

# 仲間ごとの共通の枠。仲間の全員に焼きたての PNG があるときだけ作れる
frames = {}
for name in names:
    g = group_of(name)
    if not g:
        continue
    png = os.path.join(SRC, name + ".png")
    if not os.path.exists(png):
        # 1人でも焼き直していない人がいると枠がそろわない。今回はまとめない
        frames[g] = None
        continue
    if frames.get(g, "init") is None:
        continue
    a = Image.open(png).convert("RGBA").getchannel("A")
    seen = a.point(lambda v: 255 if v > VISIBLE else 0).getbbox()
    if seen is None:
        continue
    old = frames.get(g)
    frames[g] = seen if not old else (
        min(old[0], seen[0]), min(old[1], seen[1]), max(old[2], seen[2]), max(old[3], seen[3]))
for g, box in frames.items():
    if box is None:
        print(f"{g}: 焼いていないコマがあるので、まとめて切るのはやめる")

meta = {}
for name in names:
    fresh = os.path.join(SRC, name + ".png")
    if os.path.exists(fresh):
        im = Image.open(fresh).convert("RGBA")
        a = im.getchannel("A")
        seen = frames.get(group_of(name)) or a.point(lambda v: 255 if v > VISIBLE else 0).getbbox()
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

# 仲間の「物体の範囲」は、代表のコマ(立ち)のものを全員で使う。
#
# site の Sprite は、この範囲を見て「物体の高さ = 指定した大きさ」に拡大し、
# 範囲の下端中央を足元として置く。コマごとに測ると、しゃがんだコマだけ
# 引き伸ばされ、足元の基準もずれて、差し替えた瞬間に人が跳ねる。
# 立ちの範囲を配れば、指定する大きさが「立ったときの背丈」の意味になり、
# 座ったコマはそのぶん枠の中で小さく・下に寄って出る。
for g, box in frames.items():
    if box is None or g not in meta:
        continue
    base = {k: meta[g][k] for k in ("ox", "oy", "ow", "oh")}
    for n in meta:
        if group_of(n) == g:
            meta[n].update(base)

with open(OUT, "w") as fp:
    json.dump(meta, fp, indent=0, sort_keys=True)
    fp.write("\n")
print(f"{len(meta)} 点 → {OUT}")

# 主役の大きい絵。寸法表には入れない。
#
# 島に置くスプライトは sprites.json の ox/oy/ow/oh を見て足元を合わせるが、
# こちらは詳細ページの <img> が srcset で選ぶだけなので、寸法は要らない。
# 入れると「同じ物が2つある」ことになり、島に置ける名前が二重になる。
hero_dir = os.path.join(SRC, HERO_DIR)
if os.path.isdir(hero_dir):
    n = 0
    for f in sorted(os.listdir(hero_dir)):
        if not f.endswith(".png"):
            continue
        src = os.path.join(hero_dir, f)
        im = Image.open(src).convert("RGBA")
        seen = im.getchannel("A").point(lambda v: 255 if v > VISIBLE else 0).getbbox()
        if seen is None:
            print("空:", f)
            continue
        im = im.crop(seen)
        k = min(1.0, HERO_SIDE / max(im.size))
        if k < 1:
            im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
        im.save(os.path.join(hero_dir, f[:-4] + ".webp"), quality=82, alpha_quality=72, method=6)
        os.remove(src)
        n += 1
    if n:
        print(f"主役の大きい絵 {n} 点 → {hero_dir}")
