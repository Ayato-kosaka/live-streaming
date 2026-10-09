"""SUZURI の札に並べる「商品の例」の1枚を焼く。

    python3 tools/goods/shopshot.py           # 焼いて site/public/goods/suzuri-goods.webp に置く
    python3 tools/goods/shopshot.py --out /tmp/x.webp   # 置き先を変えて試す

## なぜ自前で焼くのか

前は SUZURI が自分で作っている店の絵（`og.suzuri.jp/users/2272949.webp`）の
右半分を切って貼っていた。**どれが写るかは向こうが決める**ので、
あやとが「バナナにして」と言っても、こちらでは選べなかった。

あやとの言葉（2026-10-09）:

> グッズの例はハリネズミじゃなくてバナナにして。あと右下はSTOPのステッカーで。

なので、商品1つずつの絵を取ってきて、こちらで2×2に組む。
**どれを写すかが、こちらの手に戻る。**

## 字も値段も焼かない

焼くのは**商品の絵だけ**。値段・個数・品ぞろえは向こうが持っていて、
焼くと変わった日から嘘になる（`site/content/goods.ts` の `SUZURI`）。
**よその会社のマークも焼かない**——元の店の絵は左上に SUZURI の印を
持っていたので、それを避けるために右半分を切っていた。1つずつ取れば、
そもそも印の入っていない絵が手に入る。

## 元絵のありか

商品の絵は `lens.suzuri.jp` が出している。URL は商品の面
（`https://suzuri.jp/ayato_arigato/<商品id>/<品目>/<寸法>/<色>`）の HTML に
そのまま書いてある。**API は鍵が要る**ので使わない（持っていない）。

商品 id は店の検索から引いた（`https://suzuri.jp/search?q=ayato_arigato`）。
店の一覧は JS で描かれるので HTML には出てこないが、検索の結果には出る。
バナナ（「カサ・アヤトの住人 🍌」）は **17392036**。

**`h=` は向こうが付けた署名で、こちらでは作れない。** 絵を差し替えたり
品目を足したりするときは、商品の面の HTML から取り直す:

    curl -sL https://suzuri.jp/ayato_arigato/17392036/sticker/m/white \\
      | grep -oE 'https://lens\\.suzuri\\.jp/v3/1024x1024/[^"]+'

## 右下だけは、島の持ち物

右下の「STOP」は `site/public/goods/ayato-sticker.jpg`。あやとが描いた絵で、
島では無料で配っている（`goods.ts` の `STICKERS`）。**元絵は白地の平らな絵**
なので、ほかの3枚（商品の写真）とそのまま並べると1枚だけ別の世界のものに
見える。だから、ここで**ふちを付けてステッカーの形に抜いてから**並べる。
輪と STOP の札は 21px しか離れていないので、太らせれば1枚につながる。

## 大きさと重さ

560x560 / webp q78 で 33KB 前後。画面に出るのは 176 CSS px（390px のスマホ）
なので、dpr3 でちょうど足りる。**ここを大きくしても画面では1画素も変わらない。**
"""

import argparse
import pathlib
import subprocess
import sys

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageOps

ROOT = pathlib.Path(__file__).resolve().parents[2]
DEST = ROOT / "site/public/goods/suzuri-goods.webp"
STOP_ART = ROOT / "site/public/goods/ayato-sticker.jpg"

SIDE = 560
CELL = SIDE // 2

# 商品3つ。**並びは左上→右上→左下**で、右下には STOP が入る。
# `box` は、そのマスの中で絵を何px角に収めるか。品目ごとに形が違うので
# （缶バッジは丸、キーホルダーは輪のぶん縦に長い）、同じ数にすると
# 見た目の重さが揃わない。**揃えるのは箱ではなく、見えかたのほう。**
SHOTS = [
    (
        "badge",
        "https://lens.suzuri.jp/v3/1024x1024/can-badge/75mm/white/front/17392036/"
        "1741912868-1024x1024.png.1.5305+0.0-0.0107.webp"
        "?h=50671b2ce8122df0402a0d43a0d1ca1126ec4b36&printed=true",
        212,
    ),
    (
        "sticker",
        "https://lens.suzuri.jp/v3/1024x1024/sticker/m/white/front/17392036/"
        "1741912868-1024x1024.png.webp"
        "?h=dad684f59fbe000f6ca41bceea77243f953beab7&printed=true",
        226,
    ),
    (
        "key",
        "https://lens.suzuri.jp/v3/1024x1024/acrylic-keychain/50x50mm/clear/front/17392036/"
        "1741912868-1024x1024.png.0.8074+0.0+0.0.webp"
        "?h=ca29f464492ba85e4cb38ada5bace8ad456b5b74&printed=true",
        258,
    ),
]
STOP_BOX = 222


def fetch(url: str, dest: pathlib.Path) -> pathlib.Path:
    """**curl で取る。** この箱のブラウザは外へ出られないが、curl は出られる。

    `-f` を付ける。付けないと 4xx でも 0 で終わって、エラーの HTML を
    絵として掴む（`tools/sprites/prod.mjs` が同じところで1度転んでいる）。
    """
    subprocess.run(
        ["curl", "-fsSL", "--retry", "3", "--max-time", "40", "-o", str(dest), url],
        check=True,
    )
    return dest


def ink(rgb: Image.Image, thr: int) -> Image.Image:
    """絵のあるところだけを白く返す。

    **明るさだけで見ない。** バナナの黄色は明るいので、暗さだけで判定すると
    地と見分けが付かず、絵の上半分を切り落とす。色の付き具合（RGB の幅）も
    合わせて見る。
    """
    dark = rgb.convert("L").point(lambda v: 255 if v < thr else 0)
    r, g, b = rgb.split()
    hi = ImageChops.lighter(ImageChops.lighter(r, g), b)
    lo = ImageChops.darker(ImageChops.darker(r, g), b)
    tint = ImageChops.difference(hi, lo).point(lambda v: 255 if v > 12 else 0)
    return ImageChops.lighter(dark, tint)


def trim(im: Image.Image, thr: int = 246):
    """白地を落として、絵のあるところだけ返す（絵と、その形）。"""
    rgb = im.convert("RGB")
    m = ink(rgb, thr)
    bb = m.getbbox()
    return im.convert("RGBA").crop(bb), m.crop(bb)


def diecut(im: Image.Image, pad: int = 22, thr: int = 238):
    """白地の平らな絵を、ふち付きのステッカーの形に抜く。

    太らせて（離れた形をつなげて）→ 内側の穴を埋めて（輪の中も
    ステッカーの地として白く残す）→ その形で元絵を抜く、の順。
    """
    rgb = im.convert("RGB")
    m = ink(rgb, thr)
    bb = m.getbbox()
    rgb, m = rgb.crop(bb), m.crop(bb)

    w, h = rgb.size
    sheet = Image.new("RGB", (w + pad * 4, h + pad * 4), "white")
    sheet.paste(rgb, (pad * 2, pad * 2))
    shape = Image.new("L", sheet.size, 0)
    shape.paste(m, (pad * 2, pad * 2))

    # MaxFilter は1回で (size-1)/2 px しか太らない。重ねて pad px まで運ぶ。
    grown = shape
    for _ in range(5):
        grown = grown.filter(ImageFilter.MaxFilter(9))
    for _ in range(pad // 2):
        grown = grown.filter(ImageFilter.MaxFilter(5))

    # 穴を埋める。外から塗りつぶして、残ったところが穴。
    inv = ImageOps.invert(grown)
    ImageDraw.floodfill(inv, (0, 0), 0)
    grown = ImageChops.lighter(grown, inv)
    # 太らせた形は角が立つので、ぼかして閾値で戻して丸める
    grown = grown.filter(ImageFilter.GaussianBlur(1.2)).point(lambda v: 255 if v > 110 else 0)

    out = Image.new("RGBA", sheet.size, (0, 0, 0, 0))
    out.paste(sheet.convert("RGBA"), (0, 0), grown)
    bb2 = grown.getbbox()
    return out.crop(bb2), grown.crop(bb2)


def drop(size, mask, dx=6, dy=10, blur=9, alpha=52):
    """落ち影。**ほかの3枚（商品の写真）には影が入っている**ので、
    抜いただけの STOP を並べると、そこだけ地に貼り付いて見える。"""
    lay = Image.new("L", size, 0)
    lay.paste(mask, (dx, dy))
    lay = lay.filter(ImageFilter.GaussianBlur(blur)).point(lambda v: int(v * alpha / 255))
    sh = Image.new("RGBA", size, (70, 60, 50, 0))
    sh.putalpha(lay)
    return sh


def place(canvas, art, mask, cx, cy, box, shadow=False):
    w, h = art.size
    s = min(box / w, box / h)
    nw, nh = max(1, round(w * s)), max(1, round(h * s))
    a = art.resize((nw, nh), Image.LANCZOS)
    m = mask.resize((nw, nh), Image.LANCZOS)
    x, y = round(cx - nw / 2), round(cy - nh / 2)
    if shadow:
        pad = 40
        sh = drop((nw + pad * 2, nh + pad * 2), m.crop((-pad, -pad, nw + pad, nh + pad)))
        canvas.alpha_composite(sh, (x - pad, y - pad))
    canvas.alpha_composite(a, (x, y))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(DEST))
    ap.add_argument("--src", default="/tmp/suzuri-shots", help="落としてきた元絵の置き場")
    args = ap.parse_args()

    src = pathlib.Path(args.src)
    src.mkdir(parents=True, exist_ok=True)

    canvas = Image.new("RGBA", (SIDE, SIDE), (255, 255, 255, 255))
    q = CELL / 2
    spots = [(q, q), (CELL + q, q), (q, CELL + q)]
    for (name, url, box), (cx, cy) in zip(SHOTS, spots):
        f = src / f"{name}.webp"
        if not f.exists():
            fetch(url, f)
        art, mask = trim(Image.open(f))
        place(canvas, art, mask, cx, cy, box)

    art, mask = diecut(Image.open(STOP_ART))
    place(canvas, art, mask, CELL + q, CELL + q, STOP_BOX, shadow=True)

    out = pathlib.Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    canvas.convert("RGB").save(out, "WEBP", quality=78, method=6)
    print(f"{out} {out.stat().st_size} bytes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
