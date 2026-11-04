#!/usr/bin/env python3
"""投げ銭の段の演出（`fx_stage.py`）に使う、層の絵を整える道具（#1095）。

ChatGPT に「層に分けて」描いてもらった絵（奥の景色・建物・地面・手前・あやと・猫たち）を、
板にできる形にして `tools/alert-theme/fx_art/t<段>/` に置く。描いた会話は叩き台と同じ
（あやと島案内鳥のプロジェクト「2026-11-03 新しく描く：11月の投げ銭演出の鍵の絵」）。

    python3 tools/alert-theme/fx_art.py fit <絵> <書き出し.webp> [--max 1400] [--q 90] [--crop x0,y0,x1,y1]
        大きさを落として WebP にする（透明はそのまま。地の色は変えない）
    python3 tools/alert-theme/fx_art.py cut <白い地の絵> <置き場> --names a,b,c [--rows 1] [--max 900] [--min-island 1500] [--solo leaf]
        白い地に並べて描かせた部品を、手元で抜いて（chatgpt-image の cutout.py）1つずつに切り分ける。
        大きな塊を「段ごとに左から」の順に names へ当て、小さな塊（舞う花びら・火の粉）は近いほうへ付ける
    python3 tools/alert-theme/fx_art.py bits <白い地の絵> <置き場> --prefix leaf [--min 400] [--max-n 12]
        小さな部品（紅葉・花びら）だけを、大きい順に切り出す
    python3 tools/alert-theme/fx_art.py sheet <書き出し.jpg> <絵…>
        紺の地に並べた一覧（目で見る）

なぜ手元で抜くか: `chatgpt-image` の決まり（#780 D1）。ChatGPT は描き直すので、透過の頼み直しで絵が変わる。
「透過で」と頼んで透過で返った絵（建物・茂み）は、そのまま `fit` する。
"""
import argparse
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", ".claude", "skills", "chatgpt-image"))


def fit(src, out, max_side=1400, q=90, crop=None):
    im = Image.open(src)
    im = im.convert("RGBA") if im.mode in ("RGBA", "LA", "P") else im.convert("RGB")
    if crop:
        im = im.crop(crop)
    if max(im.size) > max_side:
        k = max_side / max(im.size)
        im = im.resize((round(im.size[0] * k), round(im.size[1] * k)), Image.LANCZOS)
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    im.save(out, "WEBP", quality=q, alpha_quality=100, method=6)
    print(f"{out} {im.size} {im.mode} {os.path.getsize(out) / 1024:.0f}KB")


def _cutout(src, min_island=1500, gaps=True):
    import cutout  # noqa: E402  .claude/skills/chatgpt-image/cutout.py
    C = np.asarray(Image.open(src).convert("RGB"), np.float64)
    return cutout.cut(C, min_island=min_island, gaps=gaps)


def cut(src, outdir, names, rows=1, max_side=900, min_island=1500, small=30, solo=()):
    rgba = _cutout(src, min_island)
    a = rgba[..., 3] > 20
    lab, n = ndi.label(a, structure=np.ones((3, 3)))
    sizes = ndi.sum(a, lab, range(1, n + 1))
    order = np.argsort(-sizes)[:len(names)] + 1
    boxes = ndi.find_objects(lab)
    cy = [(boxes[i - 1][0].start + boxes[i - 1][0].stop) / 2 for i in order]
    cx = [(boxes[i - 1][1].start + boxes[i - 1][1].stop) / 2 for i in order]
    # 段に分けて（上から）、段の中は左から
    hgt = rgba.shape[0]
    row = [min(rows - 1, int(y / hgt * rows)) for y in cy]
    big = [i for _, _, i in sorted(zip(row, cx, order))]
    owner = {i: k for k, i in enumerate(big)}
    com = ndi.center_of_mass(a, lab, range(1, n + 1))
    for j in range(1, n + 1):
        if j in owner or sizes[j - 1] < small:
            continue
        y, x = com[j - 1]
        # いちばん近い大きな塊の外接矩形へ
        def dist(k):
            b = boxes[big[k] - 1]
            dy = max(b[0].start - y, 0, y - b[0].stop)
            dx = max(b[1].start - x, 0, x - b[1].stop)
            return dx * dx + dy * dy
        owner[j] = min(range(len(big)), key=dist)
    os.makedirs(outdir, exist_ok=True)
    for k, nm in enumerate(names):
        # solo の頭の名前（舞う紅葉など）は、いちばん大きい塊だけ（まわりの白い縁の欠片を付けない）
        own = [big[k]] if any(nm.startswith(p) for p in solo) else [j for j, o in owner.items() if o == k]
        m = np.isin(lab, own)
        ys, xs = np.nonzero(m)
        y0, y1, x0, x1 = max(0, ys.min() - 6), ys.max() + 7, max(0, xs.min() - 6), xs.max() + 7
        out = rgba.copy()
        out[..., 3] = np.where(m, out[..., 3], 0)
        out = Image.fromarray(out[y0:y1, x0:x1])
        if max(out.size) > max_side:
            s = max_side / max(out.size)
            out = out.resize((round(out.size[0] * s), round(out.size[1] * s)), Image.LANCZOS)
        p = os.path.join(outdir, f"{nm}.webp")
        out.save(p, "WEBP", quality=92, alpha_quality=100, method=6)
        print(f"{p} {out.size} {os.path.getsize(p) / 1024:.0f}KB")


def bits(src, outdir, prefix, min_px=400, max_n=12, max_side=256, box=None):
    rgba = _cutout(src, min_island=min_px)
    if box:
        x0, y0, x1, y1 = box
        keep = np.zeros(rgba.shape[:2], bool)
        keep[y0:y1, x0:x1] = True
        rgba[..., 3] = np.where(keep, rgba[..., 3], 0)
    a = rgba[..., 3] > 20
    lab, n = ndi.label(a, structure=np.ones((3, 3)))
    sizes = ndi.sum(a, lab, range(1, n + 1))
    boxes = ndi.find_objects(lab)
    os.makedirs(outdir, exist_ok=True)
    k = 0
    for j in np.argsort(-sizes):
        if sizes[j] < min_px or k >= max_n:
            break
        b = boxes[j]
        sub = rgba[b].copy()
        sub[..., 3] = np.where(lab[b] == j + 1, sub[..., 3], 0)
        im = Image.fromarray(sub)
        if max(im.size) > max_side:
            s = max_side / max(im.size)
            im = im.resize((round(im.size[0] * s), round(im.size[1] * s)), Image.LANCZOS)
        p = os.path.join(outdir, f"{prefix}{k}.webp")
        im.save(p, "WEBP", quality=92, alpha_quality=100, method=6)
        k += 1
    print(f"{outdir}/{prefix}0〜{k - 1}.webp（{k}枚）")


def sheet(out, files, h=480):
    tiles = []
    for f in files:
        im = Image.open(f).convert("RGBA")
        w = max(1, round(im.size[0] * h / im.size[1]))
        im = im.resize((w, h), Image.LANCZOS)
        b = Image.new("RGBA", im.size, (40, 40, 64, 255))
        b.alpha_composite(im)
        tiles.append(b.convert("RGB"))
    sh = Image.new("RGB", (sum(t.size[0] for t in tiles) + 8 * (len(tiles) - 1), h), (255, 255, 255))
    x = 0
    for t in tiles:
        sh.paste(t, (x, 0))
        x += t.size[0] + 8
    sh.save(out, quality=86)
    print(out, sh.size)


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    f = sub.add_parser("fit")
    f.add_argument("src")
    f.add_argument("out")
    f.add_argument("--max", type=int, default=1400)
    f.add_argument("--q", type=int, default=90)
    f.add_argument("--crop", default=None)
    c = sub.add_parser("cut")
    c.add_argument("src")
    c.add_argument("outdir")
    c.add_argument("--names", required=True)
    c.add_argument("--rows", type=int, default=1)
    c.add_argument("--max", type=int, default=900)
    c.add_argument("--min-island", type=int, default=1500)
    c.add_argument("--solo", default="", help="この頭の名前の部品は、いちばん大きい塊だけにする（カンマ区切り）")
    b = sub.add_parser("bits")
    b.add_argument("src")
    b.add_argument("outdir")
    b.add_argument("--prefix", required=True)
    b.add_argument("--min", type=int, default=400)
    b.add_argument("--max-n", type=int, default=12)
    b.add_argument("--box", default=None)
    s = sub.add_parser("sheet")
    s.add_argument("out")
    s.add_argument("files", nargs="+")
    o = ap.parse_args()
    if o.cmd == "fit":
        fit(o.src, o.out, o.max, o.q, tuple(int(v) for v in o.crop.split(",")) if o.crop else None)
    elif o.cmd == "cut":
        cut(o.src, o.outdir, o.names.split(","), o.rows, o.max, o.min_island, solo=tuple(x for x in o.solo.split(",") if x))
    elif o.cmd == "bits":
        bits(o.src, o.outdir, o.prefix, o.min, o.max_n, box=tuple(int(v) for v in o.box.split(",")) if o.box else None)
    else:
        sheet(o.out, o.files)


if __name__ == "__main__":
    main()
