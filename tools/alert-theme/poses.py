#!/usr/bin/env python3
"""あやとの仮装の「ポーズ絵」（1枚まるごと）を、配信に出せる形にそろえて poses.json を書く道具。

    python3 tools/alert-theme/poses.py add <置き場> <名前> <ChatGPT の絵.png> [--face-w 300] [--no-quant]
        絵を整えて <置き場>/<名前>.png に置き、poses.json を書き直す
        （出す前に tools/alert-theme/poses_webp.py で WebP にする。PNG のままだと 1枚 300〜440KB）
    python3 tools/alert-theme/poses.py check <置き場> <out.png>
        置き場のポーズを、紺と緑の地に同じ縮尺で並べた絵（顔の枠と基準点つき）

なぜ顔の幅でそろえるか: 動きの担当はポーズを切り替えて弾ませる。ChatGPT は1枚ごとに人物の大きさが
変わるので、そのまま切り替えると、あやとが急に大きく・小さくなる。顔（いちばん大きい肌色の塊）の幅を
仮装ごとに同じにしておけば、切り替えても顔の大きさは変わらない。

poses.json（置き場ごと）:
    {"faceW": 300, "poses": {"<名前>": {"file", "size": [W, H], "content": [x0, y0, x1, y1],
                                        "face": [x0, y0, x1, y1], "faceCenter": [x, y], "bottom": [x, y]}}}
- content: 透明でない画素の外接矩形。face: 顔の外接矩形。bottom: 中身のいちばん下の行の、中身の中央
- 座標はすべてその絵の左上からの px
"""
import argparse
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import alert_theme as AT  # noqa: E402


def remove_painted_bg(a):
    """「透過で」と頼んでも、ChatGPT は市松模様（灰色と白の格子）を絵として描いて返すことがある（不透明）。
    色味の無い明るい灰色で、外周につながっている画素を地として抜く。人物は太い暗い輪郭線で囲まれているので、
    塗りつぶしは輪郭線で止まる。人物に囲まれた格子のすき間（脚のあいだなど）は、格子の2つの明るさを
    両方含む大きな塊だけを地とみなす（白いフリルや靴の白は、片方の明るさしか持たない）"""
    if (a[..., 3] < 250).mean() > 0.05:
        return a, 0
    rgb = a[..., :3].astype(int)
    lum = 0.299 * rgb[..., 0] + 0.587 * rgb[..., 1] + 0.114 * rgb[..., 2]
    chroma = rgb.max(-1) - rgb.min(-1)
    gray = (chroma < 14) & (lum > 105) & (lum < 250)
    lab, n = ndimage.label(gray)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bg = np.isin(lab, list(border))
    # 格子の2つの明るさ（外周の地から測る）
    tones = np.sort(np.unique((lum[bg] // 16).astype(int), return_counts=True)[1])[-2:] if bg.any() else []
    lo, hi = np.percentile(lum[bg], 20), np.percentile(lum[bg], 80)
    sizes = ndimage.sum(gray, lab, range(1, n + 1))
    for i, s in enumerate(sizes, 1):
        if i in border or s < 1500:
            continue
        m = lab == i
        v = lum[m]
        if (np.abs(v - lo) < 12).mean() > 0.25 and (np.abs(v - hi) < 12).mean() > 0.25:
            bg |= m
    # 輪郭線と地のあいだのにじみ（暗めの灰色）は、地に接している 2px だけ半透明にする
    near = ndimage.binary_dilation(bg, iterations=2) & ~bg & (chroma < 18) & (lum > 60)
    a = a.copy()
    a[bg] = 0
    a[near, 3] = 128
    return a, int(bg.sum())


def face_box(a, skin_kind="normal"):
    """いちばん大きい肌色の塊の外接矩形（あやとの顔）。ゾンビは少し緑がかった肌（g が r とほぼ同じ、b が低い）"""
    r, g, b = (a[..., i].astype(int) for i in range(3))
    if skin_kind == "zombie":
        skin = (a[..., 3] > 200) & (r > 200) & (g > 200) & (np.abs(r - g) < 14) & (b > 150) & (b < 200) & (g - b > 30)
    else:
        skin = (a[..., 3] > 200) & (r > 215) & (g > 160) & (g < 225) & (b > 120) & (b < 200) & (r - b > 40)
    skin = ndimage.binary_opening(skin, iterations=2)
    lab, n = ndimage.label(skin)
    if not n:
        return None
    sizes = ndimage.sum(skin, lab, range(1, n + 1))
    sl = ndimage.find_objects((lab == 1 + int(np.argmax(sizes))).astype(np.int32))[0]
    return [sl[1].start, sl[0].start, sl[1].stop, sl[0].stop]


def bbox(a):
    ys, xs = np.nonzero(a[..., 3] > 0)
    return [int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1]


def describe(a, skin_kind="normal"):
    c = bbox(a)
    f = face_box(a, skin_kind)
    ys, xs = np.nonzero(a[..., 3] > 0)
    bottom_y = int(ys.max())
    e = {"size": [a.shape[1], a.shape[0]], "content": c, "bottom": [round((c[0] + c[2]) / 2, 1), bottom_y]}
    if f:
        e["face"] = [int(v) for v in f]
        e["faceCenter"] = [round((f[0] + f[2]) / 2, 1), round((f[1] + f[3]) / 2, 1)]
    return e


def cmd_add(o):
    os.makedirs(o.dir, exist_ok=True)
    jpath = os.path.join(o.dir, "poses.json")
    J = json.load(open(jpath)) if os.path.exists(jpath) else {"faceW": o.face_w, "poses": {}}
    face_w = J.get("faceW", o.face_w)
    a, nbg = remove_painted_bg(np.array(Image.open(o.src).convert("RGBA")))
    if nbg:
        print(f"描かれた地（市松模様）を抜いた: {nbg}px")
    a = AT.clean_alpha(a)
    a = AT.drop_specks(a, 300)
    f = face_box(a, o.skin)
    if not f:
        raise SystemExit("顔（肌色の塊）が見つからない")
    k = face_w / (f[2] - f[0])
    if k > 1.0:
        # 拡大で埋めない（ChatGPT の絵より細かくはならない）。小さいまま置き、そう書く
        print(f"注意: 顔の幅 {f[2] - f[0]}px を {face_w}px にするには {k:.2f} 倍の拡大になる。拡大せずに置く")
        k = 1.0
    im = Image.fromarray(a)
    if k != 1.0:
        im = im.convert("RGBa").resize((round(im.width * k), round(im.height * k)), Image.LANCZOS).convert("RGBA")
    a = AT.clean_alpha(np.array(im))
    if o.rim:
        # 黒い衣装（死神のローブ）が、暗くした画面や配信者の黒い服に溶けないよう、外形にだけ細い光のふちを敷く
        from rigbuild import add_rim, pad as padimg
        a = add_rim(padimg(a, int(o.rim) + 4), o.rim, tuple(int(o.rim_color[i:i + 2], 16) for i in (0, 2, 4)))
    x0, y0, x1, y1 = bbox(a)
    P = o.pad
    a = a[max(0, y0 - P):y1 + P, max(0, x0 - P):x1 + P]
    out = os.path.join(o.dir, f"{o.name}.png")
    n = AT.save(Image.fromarray(a), out, quant=not o.no_quant)
    e = describe(np.array(Image.open(out).convert("RGBA")), o.skin)
    e["file"] = f"{o.name}.png"
    e["scale"] = round(k, 4)
    J["poses"][o.name] = e
    with open(jpath, "w") as fp:
        json.dump(J, fp, ensure_ascii=False, indent=1)
        fp.write("\n")
    print(f"{out} {e['size'][0]}×{e['size'][1]} {n // 1024}KB 縮尺 {k:.3f} 顔 {e.get('face')}")


def cmd_check(o):
    J = json.load(open(os.path.join(o.dir, "poses.json")))
    tiles = []
    for name, e in J["poses"].items():
        im = Image.open(os.path.join(o.dir, e["file"])).convert("RGBA")
        row = []
        for col in ((27, 35, 64), (58, 125, 68)):
            bg = Image.new("RGBA", im.size, col + (255,))
            bg.alpha_composite(im)
            d = ImageDraw.Draw(bg)
            if "face" in e:
                d.rectangle(e["face"], outline=(255, 220, 0, 255), width=3)
            bx, by = e["bottom"]
            d.ellipse((bx - 8, by - 8, bx + 8, by + 8), fill=(255, 60, 60, 255))
            d.text((10, 10), name, fill=(255, 255, 255, 255))
            row.append(bg.convert("RGB"))
        tiles.append(row)
    k = 0.45
    W = sum(max(r[0].width for r in tiles) for _ in range(1)) * 2
    tiles = [[t.resize((round(t.width * k), round(t.height * k)), Image.LANCZOS) for t in r] for r in tiles]
    W = max(r[0].width + r[1].width for r in tiles) + 10
    H = sum(r[0].height for r in tiles) + 10 * len(tiles)
    s = Image.new("RGB", (W, H), (0, 0, 0))
    y = 0
    for r in tiles:
        s.paste(r[0], (0, y))
        s.paste(r[1], (r[0].width + 10, y))
        y += r[0].height + 10
    s.save(o.out)
    print(o.out)


def main():
    ap = argparse.ArgumentParser()
    sp = ap.add_subparsers(dest="cmd", required=True)
    p = sp.add_parser("add"); p.add_argument("dir"); p.add_argument("name"); p.add_argument("src")
    p.add_argument("--face-w", type=int, default=300); p.add_argument("--pad", type=int, default=8)
    p.add_argument("--no-quant", action="store_true")
    p.add_argument("--rim", type=float, default=0, help="外形に敷く光のふちの太さ px（0 で付けない）")
    p.add_argument("--rim-color", default="b9a0ff")
    p.add_argument("--skin", default="normal", choices=["normal", "zombie"], help="顔を探す肌の色（ゾンビは緑がかった肌）")
    p = sp.add_parser("check"); p.add_argument("dir"); p.add_argument("out")
    o = ap.parse_args()
    globals()["cmd_" + o.cmd](o)


if __name__ == "__main__":
    main()
