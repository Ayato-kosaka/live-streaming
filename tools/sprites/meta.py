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
# **横に長い主役だけ、もっと大きく焼く（#150）。**
#
# 主役の箱は、高さで止まるか幅で止まるかのどちらか。
#
#   正方形に近い絵 … 高さ 300px で止まる → 2倍画面で 600px。640 で足りる
#   横に長い絵     … 幅 640px で止まる  → 2倍画面で 1280px。**640 では半分**
#
# `hero/food-egg-cooked`（卵焼き・2.15:1）が実測 2.0倍だった。高さで止まる
# 絵と同じ 640 を配ると、幅で止まる絵だけが引き伸ばされる。
#
# **絵の形で決める。** 名前の表を持つと、料理が1品増えるたびに表を直すことに
# なって、直し忘れたぶんだけ静かにぼける。切り出したあとの縦横比を見れば、
# どちらで止まるかはそのまま分かる。
WIDE_RATIO = 1.4
WIDE_HERO_SIDE = 1280
# **ただし 1280 を全員に配らない。** スマホでは主役の幅が 358px しかなく、
# 2倍画面でも 716px。1280px の絵を配ると、要る量の3倍を回線に乗せる。
# あやとの視聴者さんはスマホが主なので、そちらを重くして PC を直すのは逆。
#
# 大きいほうは `<name>@2x.webp` として別に書き、画面は `srcset` で
# どちらを取るかをブラウザに選ばせる。**スマホは今までどおり 640px。**
WIDE_SUFFIX = "@2x"
# **1280 まで届くとは限らない。** `shrink` は縮めるだけなので、焼いたものが
# それより小さければそのまま出る。焼く枠（`manifest.mjs` の HERO_PX = 1280）は
# 正方形で、その中に絵を余白ごと収めるから、横に長い絵ほど実際の幅は
# 枠より小さくなる（`food-egg-cooked` は切り出したあと 991px）。
#
# それで PC（1440px・2倍画面）の `/kitchen/tamagoyaki` が 1.36倍。**2.0倍
# だったものがここまで来ている。** 1.0 に寄せるには HERO_PX を上げて全部
# 焼き直すことになるが、2倍画面での 1.36倍は見て分からない。上げると
# 焼く時間とバイト数だけが増えるので、ここで止める。
# **主役の絵は、必ずここより大きく焼いてから縮める。**
#
# render.html は SUPER=2 で焼いて、縮めるときに平らにする(アンチエイリアス)
# つもりで作ってある。ところが縮めるのはここなので、**ここで縮まなければ
# 平らにならない。** 画角の中で物が小さく写る絵は、切り出した時点で
# 640px を下回り、k=1.0 で素通りしていた。
#
# 実際にそうなっていたのが噴水で、2560px の画角に 538px しか写っておらず、
# 焼いたときの荒い網目（接地影のグラデーションに出る点々）が、
# 1画素も均されないまま webp になっていた。PC の dpr2 では 538px の絵を
# 1,076px に伸ばして出すので、その点々がそのまま**紙の上の汚れ**に見える。
#
# webp の質を上げても消えない（アルファを無圧縮 100 にしても点は残った。
# 圧縮の粗さではなく、焼いた絵そのものに入っている網目なので）。
# 直すのは焼くほう。`manifest.mjs` の HERO_PX を上げて、ここで必ず
# 縮むようにしてある。**HERO_PX を下げるときは、ここも一緒に見ること。**
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
        wide = im.width >= im.height * WIDE_RATIO

        def shrink(side):
            """長辺が side に収まるまで縮める。すでに小さければそのまま。"""
            k = min(1.0, side / max(im.size))
            if k >= 1:
                return im
            return im.resize(
                (max(1, round(im.width * k)), max(1, round(im.height * k))),
                Image.LANCZOS,
            )

        base = f[:-4]
        # 幅で止まる絵（横に長い）だけ、2倍のぶんも書く（#150）
        if wide:
            shrink(WIDE_HERO_SIDE).save(
                os.path.join(hero_dir, base + WIDE_SUFFIX + ".webp"),
                quality=82, alpha_quality=72, method=6,
            )
            n += 1
        shrink(HERO_SIDE).save(
            os.path.join(hero_dir, base + ".webp"),
            quality=82, alpha_quality=72, method=6,
        )
        os.remove(src)
        n += 1
    if n:
        print(f"主役の大きい絵 {n} 点 → {hero_dir}")

# 2倍のぶんがある主役の名簿。画面が `srcset` を組むのに要る（#150）。
#
# **この回で焼いたぶんから作らない。ディスクにある実物から作る。**
# `bake.mjs` は名前で絞って1枚だけ焼き直せる。そのとき「この回のぶん」で
# 書き出すと、**触っていない絵が名簿から消えて、その面だけ静かに 1x に
# 落ちる。** 落ちても画面は出るので、気づくのは誰かが並べて見たときになる。
#
# 実物を数えれば、焼き直した枚数に関係なく正しくなる。消えた絵も自動で外れる。
WIDE_OUT = os.path.join(os.path.dirname(OUT), "heroWide.json")
if os.path.isdir(hero_dir):
    have = sorted(
        f[: -len(WIDE_SUFFIX + ".webp")]
        for f in os.listdir(hero_dir)
        if f.endswith(WIDE_SUFFIX + ".webp")
    )
    with open(WIDE_OUT, "w") as fp:
        json.dump(have, fp, indent=0)
    print(f"横に長い主役 {len(have)} 点 → {WIDE_OUT}")
