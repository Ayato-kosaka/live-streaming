#!/usr/bin/env python3
"""投げ銭アラート（`app/alertbox/`）の季節の絵を、ChatGPT から持ち帰ったシートから作る道具。

季節ごとに同じ形で回すので、ハロウィンだけの決めごとはここに入れない。

    python3 tools/alert-theme/alert_theme.py frames <シート.png> <出力の頭> --grid 2x2 --width 1200
        シートを格子で切り、4コマを同じ台紙・同じ位置合わせに揃える → <頭>-0.png …
    python3 tools/alert-theme/alert_theme.py base <fill.png> <base.png>
        「満タン」の絵から「空」の絵を作る。透明度は1画素も変えない（溜まる表現が重ねで成り立つように）
    python3 tools/alert-theme/alert_theme.py item <絵.png> <出力.png> --long 320 [--pick largest|all]
        小物1つ。余白を詰めて、長い辺をそろえる
    python3 tools/alert-theme/alert_theme.py split <シート.png> <出力の頭> [--grid 3x2 | --min 2000]
        小物のシートを格子のマスごとに（--grid）、または、つながった塊ごとに切り出す（左上から順）
    python3 tools/alert-theme/alert_theme.py manifest <置き場>
        各ファイルの寸法と、bank-* の「中身の外接矩形」を manifest.json に書く
    python3 tools/alert-theme/alert_theme.py preview <置き場> <出力の置き場>
        紺 #1b2340 と緑 #3a7d44 の地に重ねた確認画像と、bank の4コマの GIF（0.15 秒刻み）
    python3 tools/alert-theme/alert_theme.py assemble|jointcheck|compare|swapcheck …
        切り絵の部品（rig.json）の道具。中身と rig.json の読み方は rig.py の頭

なぜ手元で揃えるか: ChatGPT はコマごとに数 px ずれて描く。そのまま重ねて切り替えると
外形がガタガタ跳ねるので、コマ0の透明度に、ほかのコマの透明度がいちばん重なる位置へ寄せる。
"""
import argparse
import json
import os
import sys

import numpy as np
from PIL import Image

NAVY = (0x1B, 0x23, 0x40)
GREEN = (0x3A, 0x7D, 0x44)


def rgba(p):
    return np.array(Image.open(p).convert("RGBA"))


def clean_alpha(a, lo=10, hi=246):
    """ほとんど透明な粉（ChatGPT の地に残る 1〜9）は 0 に、ほとんど不透明（中身が 254 で来る）は 255 に。
    粉を残すと、外接矩形が絵より大きく測られ、減色したときに地がうっすら濁る。"""
    a = a.copy()
    al = a[..., 3]
    al[al < lo] = 0
    al[al > hi] = 255
    a[al == 0, :3] = 0
    return a


def drop_specks(a, min_px=400):
    """本体から離れた小さな粒（シートの隣のコマのはみ出し・描き損じ）を消す。"""
    from scipy import ndimage

    m = a[..., 3] > 0
    lab, n = ndimage.label(m)
    if n <= 1:
        return a
    sizes = ndimage.sum(m, lab, range(1, n + 1))
    keep = np.zeros(n + 1, bool)
    keep[1:] = sizes >= min_px
    a = a.copy()
    a[~keep[lab]] = 0
    return a


def bbox(a):
    ys, xs = np.nonzero(a[..., 3] > 0)
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def best_shift(ref, mov, r=24):
    """mov を (dx, dy) ずらしたとき、ref の透明度といちばん重なる位置。縮めて粗く探してから原寸で詰める。"""
    def score(A, B, dx, dy):
        Bs = np.roll(np.roll(B, dy, 0), dx, 1)
        return np.abs(A - Bs).sum()

    A = (ref[..., 3] > 127).astype(np.int32)
    B = (mov[..., 3] > 127).astype(np.int32)
    best = min(((score(A[::4, ::4], B[::4, ::4], dx, dy), dx, dy)
                for dx in range(-r // 4, r // 4 + 1) for dy in range(-r // 4, r // 4 + 1)))
    _, cx, cy = best
    best = min(((score(A, B, dx, dy), dx, dy)
                for dx in range(cx * 4 - 4, cx * 4 + 5) for dy in range(cy * 4 - 4, cy * 4 + 5)))
    return best[1], best[2]


def quantize(img, colors=256):
    """減色して軽くする。imagequant（pip）があればそれ、無ければ Pillow。透明度の 0 / 非0 は変えない。"""
    a = np.array(img)
    try:
        import imagequant

        q = imagequant.quantize_pil_image(img, dithering_level=0.6, max_colors=colors)
    except ImportError:
        q = img.quantize(colors=colors, method=Image.Quantize.FASTOCTREE)
    b = np.array(q.convert("RGBA"))
    want, got = a[..., 3] > 0, b[..., 3] > 0
    if np.array_equal(want, got):
        return q
    # 減色で縁のごく薄い画素が 0 に落ちる（または地が浮く）。外形を変えないよう、
    # 食い違った画素だけ「透明 / 不透明の側が合っている、いちばん近い色」に付け替える
    idx = np.array(q)
    pal = _pal_rgba(q).astype(np.int32)
    vis = np.nonzero(pal[:, 3] > 0)[0]
    clear = np.nonzero(pal[:, 3] == 0)[0]
    lost = want & ~got
    if lost.any():
        px = a[lost].astype(np.int32)
        d = ((px[:, None, :] - pal[vis][None, :, :]) ** 2).sum(-1)
        idx[lost] = vis[d.argmin(1)]
    extra = ~want & got
    if extra.any():
        if not len(clear):
            return img
        idx[extra] = clear[0]
    out = Image.fromarray(idx.astype(np.uint8), "P")
    if q.palette.mode == "RGBA":
        out.putpalette(q.getpalette("RGBA"), "RGBA")
    else:
        out.putpalette(q.getpalette())
        if "transparency" in q.info:
            out.info["transparency"] = q.info["transparency"]
    if not np.array_equal(np.array(out.convert("RGBA"))[..., 3] > 0, want):
        return img
    return out


def _pal_rgba(q):
    """P 画像のパレットを (N, 4) の RGBA で。imagequant はパレットに透明度を持つ。Pillow の減色は tRNS 側に持つ。"""
    if q.palette.mode == "RGBA":
        return np.array(q.getpalette("RGBA")).reshape(-1, 4)
    rgb = np.array(q.getpalette()[: 256 * 3]).reshape(-1, 3)
    t = q.info.get("transparency", b"")
    al = np.full(len(rgb), 255)
    if isinstance(t, (bytes, bytearray)):
        al[: len(t)] = list(t)
    elif isinstance(t, int):
        al[t] = 0
    return np.concatenate([rgb, al[:, None]], 1)


def save(img, path, quant=True):
    (quantize(img) if quant else img).save(path, optimize=True)
    return os.path.getsize(path)


def cmd_frames(o):
    s = rgba(o.sheet)
    cols, rows = (int(x) for x in o.grid.lower().split("x"))
    H, W = s.shape[:2]
    cells = []
    for r in range(rows):
        for c in range(cols):
            cell = s[r * H // rows:(r + 1) * H // rows, c * W // cols:(c + 1) * W // cols]
            cells.append(drop_specks(clean_alpha(cell)))
    # 同じ大きさの台紙に、外接矩形の下辺中央で一度置いてから、コマ0に重なる位置へ寄せる
    boxes = [bbox(c) for c in cells]
    bw = max(b[2] - b[0] for b in boxes)
    bh = max(b[3] - b[1] for b in boxes)
    pad = 32
    CW, CH = bw + 2 * pad, bh + 2 * pad
    canv = []
    for c, (x0, y0, x1, y1) in zip(cells, boxes):
        t = np.zeros((CH, CW, 4), np.uint8)
        ox = (CW - (x1 - x0)) // 2
        oy = CH - pad - (y1 - y0)
        t[oy:oy + y1 - y0, ox:ox + x1 - x0] = c[y0:y1, x0:x1]
        canv.append(t)
    for i in range(1, len(canv)):
        dx, dy = best_shift(canv[0], canv[i])
        canv[i] = np.roll(np.roll(canv[i], dy, 0), dx, 1)
        print(f"コマ{i}: ずらし ({dx}, {dy})")
    # 4コマの外接矩形の和で詰める（全部同じ切り取り＝同じ位置合わせのまま）
    u = [bbox(c) for c in canv]
    x0 = min(b[0] for b in u) - o.pad
    y0 = min(b[1] for b in u) - o.pad
    x1 = max(b[2] for b in u) + o.pad
    y1 = max(b[3] for b in u) + o.pad
    x0, y0 = max(x0, 0), max(y0, 0)
    out = []
    for i, c in enumerate(canv):
        im = Image.fromarray(c[y0:y1, x0:x1])
        if o.width:
            h = round(im.height * o.width / im.width)
            im = im.resize((o.width, h), Image.LANCZOS)
            im = Image.fromarray(clean_alpha(np.array(im)))
        out.append(im)
    # 外形のずれ: コマ0との不一致の割合（中身の画素に対して）
    m0 = np.array(out[0])[..., 3] > 127
    for i, im in enumerate(out):
        mi = np.array(im)[..., 3] > 127
        diff = (m0 ^ mi).sum() / max(m0.sum(), 1)
        p = f"{o.prefix}-{i}.png"
        n = save(im, p, quant=not o.no_quant)
        print(f"{p} {im.width}×{im.height} {n // 1024}KB 外形のずれ(コマ0比) {diff * 100:.2f}%")


def cmd_base(o):
    """彩度をほぼ抜いて、少し暗く沈める。灯り（明るい黄）も同じ式で沈むので「空っぽ」に見える。"""
    a = rgba(o.fill).astype(np.float32)
    rgb = a[..., :3] / 255
    lum = (rgb * [0.299, 0.587, 0.114]).sum(-1, keepdims=True)
    gray = lum + (rgb - lum) * o.sat          # 彩度を残す割合
    gray = 0.12 + gray * o.gain               # 白飛びも黒つぶれもさせず、まとめて灰に寄せる
    gray = gray * np.array(o.tint)            # ほんの少しの色味（冷たい灰）
    out = a.copy()
    out[..., :3] = np.clip(gray * 255, 0, 255)
    out = out.astype(np.uint8)
    out[..., 3] = a[..., 3].astype(np.uint8)  # 透明度は1画素も変えない
    im = Image.fromarray(out)
    n = save(im, o.out, quant=not o.no_quant)
    b = rgba(o.out)
    same = np.array_equal(b[..., 3] > 0, a[..., 3] > 0)
    print(f"{o.out} {im.width}×{im.height} {n // 1024}KB 透明でない範囲が fill と一致: {same}")
    if not same:
        sys.exit(1)


def cmd_item(o):
    a = drop_specks(clean_alpha(rgba(o.src)), o.min)
    im = Image.fromarray(a)
    im = im.crop(im.getbbox())
    k = o.long / max(im.size)
    im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
    im = Image.fromarray(clean_alpha(np.array(im)))
    c = Image.new("RGBA", (im.width + 2 * o.pad, im.height + 2 * o.pad))
    c.paste(im, (o.pad, o.pad))
    n = save(c, o.out, quant=not o.no_quant)
    print(f"{o.out} {c.width}×{c.height} {n // 1024}KB")


def cmd_split(o):
    from scipy import ndimage

    a = clean_alpha(rgba(o.sheet))
    if o.grid:
        # 格子で頼んだシートは格子で切る。土の粒のような離れた小さな塊を、塊で切ると落としてしまう
        cols, rows = (int(x) for x in o.grid.lower().split("x"))
        H, W = a.shape[:2]
        k = 0
        for r in range(rows):
            for c in range(cols):
                cell = a[r * H // rows:(r + 1) * H // rows, c * W // cols:(c + 1) * W // cols]
                if not (cell[..., 3] > 0).any():
                    continue
                Image.fromarray(cell).save(f"{o.prefix}-{k}.png")
                print(f"{o.prefix}-{k}.png {cell.shape[1]}×{cell.shape[0]}")
                k += 1
        return
    m = a[..., 3] > 0
    # 細い線（蜘蛛の糸・つる）で切れないよう、少し太らせてから塊を数える
    lab, n = ndimage.label(ndimage.binary_dilation(m, iterations=o.join))
    objs = ndimage.find_objects(lab)
    found = []
    for i, sl in enumerate(objs, 1):
        part = a.copy()
        part[lab != i] = 0
        if (part[..., 3] > 0).sum() < o.min:
            continue
        found.append((sl[0].start, sl[1].start, part[sl]))
    # 行ごとに上から、行の中は左から
    found.sort(key=lambda t: (t[0] // o.row, t[1]))
    for k, (_, _, p) in enumerate(found):
        Image.fromarray(p).save(f"{o.prefix}-{k}.png")
        print(f"{o.prefix}-{k}.png {p.shape[1]}×{p.shape[0]}")


def cmd_manifest(o):
    files = {}
    for f in sorted(os.listdir(o.dir)):
        if not f.endswith(".png"):
            continue
        a = rgba(os.path.join(o.dir, f))
        e = {"width": a.shape[1], "height": a.shape[0]}
        if f.startswith("bank-"):
            x0, y0, x1, y1 = bbox(a)
            e["content"] = {"x": x0, "y": y0, "width": x1 - x0, "height": y1 - y0}
        files[f] = e
    banks = [v["content"] for k, v in files.items() if k.startswith("bank-")]
    m = {"files": files}
    if banks:
        x0 = min(b["x"] for b in banks)
        y0 = min(b["y"] for b in banks)
        x1 = max(b["x"] + b["width"] for b in banks)
        y1 = max(b["y"] + b["height"] for b in banks)
        m["bankContent"] = {"x": x0, "y": y0, "width": x1 - x0, "height": y1 - y0}
        m["bankFrames"] = len([k for k in files if k.startswith("bank-fill-")])
    with open(os.path.join(o.dir, "manifest.json"), "w") as fp:
        json.dump(m, fp, ensure_ascii=False, indent=2)
        fp.write("\n")
    total = sum(os.path.getsize(os.path.join(o.dir, f)) for f in os.listdir(o.dir))
    print(f"manifest.json {len(files)}件 / 置き場の合計 {total / 1024:.0f}KB")


def on(im, col):
    bg = Image.new("RGBA", im.size, col + (255,))
    bg.alpha_composite(im)
    return bg.convert("RGB")


def cmd_preview(o):
    os.makedirs(o.out, exist_ok=True)
    names = sorted(f for f in os.listdir(o.dir) if f.endswith(".png"))
    for col, tag in ((NAVY, "navy"), (GREEN, "green")):
        ims = [Image.open(os.path.join(o.dir, f)).convert("RGBA") for f in names]
        W = 1600
        x = y = rowh = 0
        place = []
        for im in ims:
            k = min(1, 380 / max(im.size)) if not im.width > 1000 else 760 / im.width
            t = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
            if x + t.width > W:
                x, y, rowh = 0, y + rowh + 16, 0
            place.append((t, x, y))
            x += t.width + 16
            rowh = max(rowh, t.height)
        sheet = Image.new("RGBA", (W, y + rowh), col + (255,))
        for t, px, py in place:
            sheet.alpha_composite(t, (px, py))
        sheet.convert("RGB").save(os.path.join(o.out, f"all-{tag}.png"))
        # 境目の拡大（4倍）: 各 bank-fill の左上の輪郭あたり
    for kind in ("fill", "base"):
        fr = [Image.open(os.path.join(o.dir, f"bank-{kind}-{i}.png")).convert("RGBA") for i in range(4)
              if os.path.exists(os.path.join(o.dir, f"bank-{kind}-{i}.png"))]
        if not fr:
            continue
        g = [on(f, NAVY).resize((f.width // 2, f.height // 2), Image.LANCZOS) for f in fr]
        g[0].save(os.path.join(o.out, f"bank-{kind}.gif"), save_all=True, append_images=g[1:], duration=150, loop=0)
        strip = Image.new("RGB", (g[0].width, g[0].height * len(g)))
        for i, t in enumerate(g):
            strip.paste(t, (0, i * t.height))
        strip.save(os.path.join(o.out, f"bank-{kind}-strip.png"))
    # 溜まり具合 30% / 60% の見本（下から fill、上は base）
    if os.path.exists(os.path.join(o.dir, "bank-base-0.png")):
        b = Image.open(os.path.join(o.dir, "bank-base-0.png")).convert("RGBA")
        f = Image.open(os.path.join(o.dir, "bank-fill-0.png")).convert("RGBA")
        rows = []
        for lv in (0.0, 0.35, 0.7, 1.0):
            c = b.copy()
            cut = round(f.height * (1 - lv))
            c.alpha_composite(f.crop((0, cut, f.width, f.height)), (0, cut))
            rows.append(on(c, GREEN).resize((c.width // 2, c.height // 2), Image.LANCZOS))
        s = Image.new("RGB", (rows[0].width, rows[0].height * 4))
        for i, r in enumerate(rows):
            s.paste(r, (0, i * r.height))
        s.save(os.path.join(o.out, "bank-levels.png"))
    # 輪郭の 4 倍拡大（白いフチを見る）
    for f in ("bank-fill-0.png", "bank-base-0.png"):
        p = os.path.join(o.dir, f)
        if os.path.exists(p):
            im = Image.open(p).convert("RGBA")
            x0, y0, x1, y1 = bbox(np.array(im))
            crop = im.crop((x0 - 8, (y0 + y1) // 2 - 60, x0 + 112, (y0 + y1) // 2 + 60))
            on(crop, NAVY).resize((480, 480), Image.NEAREST).save(os.path.join(o.out, f"edge-{f}"))
    print("preview →", o.out)


def main():
    ap = argparse.ArgumentParser()
    sp = ap.add_subparsers(dest="cmd", required=True)
    p = sp.add_parser("frames"); p.add_argument("sheet"); p.add_argument("prefix")
    p.add_argument("--grid", default="4x1"); p.add_argument("--width", type=int, default=1200)
    p.add_argument("--pad", type=int, default=8); p.add_argument("--no-quant", action="store_true")
    p = sp.add_parser("base"); p.add_argument("fill"); p.add_argument("out")
    p.add_argument("--sat", type=float, default=0.12); p.add_argument("--gain", type=float, default=0.62)
    p.add_argument("--tint", type=float, nargs=3, default=(0.97, 0.98, 1.04)); p.add_argument("--no-quant", action="store_true")
    p = sp.add_parser("item"); p.add_argument("src"); p.add_argument("out")
    p.add_argument("--long", type=int, default=320); p.add_argument("--pad", type=int, default=6)
    p.add_argument("--min", type=int, default=200); p.add_argument("--no-quant", action="store_true")
    p = sp.add_parser("split"); p.add_argument("sheet"); p.add_argument("prefix")
    p.add_argument("--min", type=int, default=2000); p.add_argument("--join", type=int, default=6)
    p.add_argument("--row", type=int, default=300); p.add_argument("--grid")
    p = sp.add_parser("manifest"); p.add_argument("dir")
    p = sp.add_parser("preview"); p.add_argument("dir"); p.add_argument("out")
    # 切り絵の部品（rig.json）の道具は rig.py に置いてある。同じ口でも呼べるようにする
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import rig

    rig.add(sp)
    o = ap.parse_args()
    if hasattr(rig, "cmd_" + o.cmd):
        getattr(rig, "cmd_" + o.cmd)(o)
    else:
        globals()["cmd_" + o.cmd](o)


if __name__ == "__main__":
    main()
