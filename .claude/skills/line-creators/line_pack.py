#!/usr/bin/env python3
"""絵を LINE スタンプの寸法に落とす（LINE Creators Market に上げる形）。

    python3 line_pack.py sticker <元の絵.png> <出力.png> [--outline PX]
    python3 line_pack.py main    <元の絵.png> <出力.png>            # 240×240
    python3 line_pack.py tab     <元の絵.png> <出力.png> --box x0,y0,x1,y1   # 96×74。顔のまわりを切って使う
    python3 line_pack.py check   <png …>                              # 寸法・透過・容量を数える

## LINE の決まり（制作ガイドライン、2026-10-13 に読んだ）

| | 寸法 | |
| --- | --- | --- |
| スタンプ | 最大 370×320、**縦横とも偶数** | 外枠と中身のあいだに 10px ほど余白 |
| メイン | 240×240 | |
| トークルームタブ | 96×74 | |
| 共通 | PNG・背景透過・RGB・1枚 1MB 以下・72dpi 以上 | |

スタンプは **370×320 の地に、350×300 に収めた中身を真ん中に置く。** 寸法をそろえておくと、
トークで並んだときに大きさがばらつかない。

## 白いフチ（--outline）

住人の絵（ChatGPT で描いたもの）は、はじめから白い太いフチが付いている。あやとの絵は線画だけで
フチが無く、**LINE のダークモードでは黒い服と黒い字が地に沈んで見えなくなる**。
`--outline` は、元の絵の大きさで数えた幅で、絵の外側に白いフチを足す（絵そのものは1画素も変えない）。
"""
import argparse, os, sys
from PIL import Image, ImageFilter, ImageChops

STICKER = (370, 320)
INNER = (350, 300)  # 10px ずつ余白
MAIN = (240, 240)
TAB = (96, 74)


def load(p):
    im = Image.open(p).convert("RGBA")
    # 見えない画素（ほぼ透明）は切り捨てて、外接矩形で切る
    a = im.getchannel("A").point(lambda v: 255 if v > 8 else 0)
    box = a.getbbox()
    if not box:
        sys.exit(f"{p}: 中身が無い")
    return im.crop(box)


def load_img(im):
    return im.crop(im.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox())


def outline(im, px):
    """外側に白いフチを足す。ぼかした形を閾値で切ると、角の丸いフチになる"""
    pad = px * 2
    big = Image.new("RGBA", (im.width + pad * 2, im.height + pad * 2), (0, 0, 0, 0))
    big.paste(im, (pad, pad), im)
    mask = big.getchannel("A").point(lambda v: 255 if v > 24 else 0)
    grown = mask.filter(ImageFilter.GaussianBlur(px / 2)).point(lambda v: 255 if v > 10 else 0)
    grown = grown.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(1.2))
    white = Image.new("RGBA", big.size, (255, 255, 255, 255))
    white.putalpha(grown)
    out = Image.alpha_composite(white, big)
    return out.crop(out.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox())


def fit(im, box):
    im = im.copy()
    s = min(box[0] / im.width, box[1] / im.height)
    return im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)


def place(im, canvas, inner):
    c = Image.new("RGBA", canvas, (0, 0, 0, 0))
    f = fit(im, inner)
    c.paste(f, ((canvas[0] - f.width) // 2, (canvas[1] - f.height) // 2), f)
    return c


def save(im, out):
    os.makedirs(os.path.dirname(os.path.abspath(out)) or ".", exist_ok=True)
    im.save(out, optimize=True)
    check([out])


def check(paths):
    bad = 0
    for p in paths:
        im = Image.open(p)
        w, h = im.size
        size = os.path.getsize(p)
        a = im.convert("RGBA").getchannel("A")
        edge = [a.getpixel((x, 0)) for x in range(w)] + [a.getpixel((x, h - 1)) for x in range(w)]
        msg = []
        if w % 2 or h % 2:
            msg.append("寸法が奇数")
        if size > 1_000_000:
            msg.append("1MB を超える")
        if im.mode != "RGBA":
            msg.append(f"mode={im.mode}")
        if max(edge) > 0 and (w, h) == STICKER:
            msg.append("上下の端に画素が掛かっている（余白が無い）")
        bad += bool(msg)
        print(f"{os.path.basename(p)}  {w}x{h}  {size // 1024}KB  " + ("OK" if not msg else "NG: " + " / ".join(msg)))
    return bad


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("kind", choices=["sticker", "main", "tab", "check"])
    ap.add_argument("paths", nargs="+")
    ap.add_argument("--outline", type=int, default=0)
    ap.add_argument("--box", default="")
    a = ap.parse_args()
    if a.kind == "check":
        sys.exit(1 if check(a.paths) else 0)
    src, out = a.paths[0], a.paths[1]
    im = load(src)
    if a.outline:
        im = outline(im, a.outline)
    if a.kind == "sticker":
        save(place(im, STICKER, INNER), out)
    elif a.kind == "main":
        save(place(im, MAIN, (MAIN[0] - 8, MAIN[1] - 8)), out)
    else:
        if a.box:
            x0, y0, x1, y1 = map(int, a.box.split(","))
            raw = Image.open(src).convert("RGBA").crop((x0, y0, x1, y1))
            im = outline(load_img(raw), a.outline) if a.outline else load_img(raw)
        save(place(im, TAB, (TAB[0] - 4, TAB[1] - 4)), out)
