#!/usr/bin/env python3
"""切り絵の部品（rig.json）を組み立てて、関節を点検し、設定画と並べる道具。

    python3 tools/alert-theme/rig.py assemble <rig.json> <out.png> [--pose 関節=角度,…] [--swap 部品=名前,…] [--bg navy]
        rig.json から組み上がりの絵を作る（回転は pivot まわり、z 順）
    python3 tools/alert-theme/rig.py jointcheck <rig.json> <outdir> [--deg 30]
        各関節を ±30° 回した絵を並べ、関節のまわりに出た透明の穴（重なりしろ不足）を数える。
        1つでも穴があれば終了コード 1
    python3 tools/alert-theme/rig.py compare <rig.json> <設定画.png> <out.png> [--crop x0,y0,x1,y1] [--flip]
        組み上がりを設定画と並べ、重ねた絵を作る。外形の重なり（IoU）も数で出す
    python3 tools/alert-theme/rig.py swapcheck <rig.json>
        差し替えの絵（swaps）が同じ寸法か・中身の中心がそろっているか
    どれも --costume costume-<名前>.json を付けると、素体に仮装を重ねたものを扱う
    （素体と同じ id の部品は置き換え、新しい id は足す。merge_costume）

rig.json の読み方（`public/alert/themes/<id>/rig/<キャラ>/rig.json`。動きの担当とはこれだけが接点）:

- `size` は組み上がりの台紙。部品はすべて同じ縮尺で、台紙と同じ px
- 部品の置き方は CSS の入れ子と同じ: 部品の絵の左上を「親の絵の左上 + at − pivot」に置き、
  `transform-origin: pivot` で回す。親が回れば子もついて回る。親が null なら at は台紙の座標
- `mirror: true` は絵を左右反転して使う。**pivot は反転したあとの絵の座標**（反転した絵の左上から）
- 角度は CSS の `rotate()` と同じ向き（正で時計回り）
- `z` は全体で比べる描く順（大きいほど手前）。親子の入れ子とは関係ない
- `swaps` を持つ部品は差し替え。最初の名前が既定。どの絵も同じ寸法なので、差し替えても pivot はそのまま

関節の側は丸く余分に描いて（重なりしろ）、隣の部品の下に隠してある。jointcheck は、
pivot を中心にした円（組み上がりで透明の画素に届くまでの半径）が、±30° 回したあとも埋まっているかを見る。
"""
import argparse
import json
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageOps

NAVY = (0x1B, 0x23, 0x40)
GREEN = (0x3A, 0x7D, 0x44)
BGS = {"navy": NAVY, "green": GREEN, "white": (255, 255, 255), "gray": (128, 128, 128)}


# ---------------------------------------------------------------- 読み込み

def merge_costume(rig, costume):
    """仮装（costume-*.json）を素体に重ねる。素体と同じ id の部品はそっくり置き換え（絵・pivot・at・z）、
    新しい id は足す。仮装の parent は素体の id を指してよい"""
    parts = list(rig["parts"])
    idx = {p["id"]: i for i, p in enumerate(parts)}
    for p in costume["parts"]:
        if p["id"] in idx:
            parts[idx[p["id"]]] = p
        else:
            idx[p["id"]] = len(parts)
            parts.append(p)
    out = dict(rig)
    out["parts"] = parts
    return out


def load(path, costume=None):
    rig = json.load(open(path, encoding="utf-8"))
    base = os.path.dirname(os.path.abspath(path))
    if costume:
        cpath = costume if os.path.isabs(costume) or os.path.exists(costume) else os.path.join(base, costume)
        rig = merge_costume(rig, json.load(open(cpath, encoding="utf-8")))
    ids = [p["id"] for p in rig["parts"]]
    if len(set(ids)) != len(ids):
        raise SystemExit("部品の id が重なっている")
    by = {p["id"]: p for p in rig["parts"]}
    for p in rig["parts"]:
        if p.get("parent") and p["parent"] not in by:
            raise SystemExit(f"{p['id']}: 親 {p['parent']} が無い")
        if "file" not in p and "swaps" not in p:
            raise SystemExit(f"{p['id']}: file も swaps も無い")
    return rig, base, by


def part_file(p, swap=None):
    if "file" in p:
        return p["file"]
    names = list(p["swaps"])
    return p["swaps"][swap if swap in p["swaps"] else names[0]]


_cache = {}


def part_image(base, p, swap=None):
    f = os.path.join(base, part_file(p, swap))
    key = (f, bool(p.get("mirror")))
    if key not in _cache:
        im = Image.open(f).convert("RGBA")
        if p.get("mirror"):
            im = ImageOps.mirror(im)
        _cache[key] = im
    return _cache[key]


# ---------------------------------------------------------------- 行列

def T(x, y):
    return np.array([[1, 0, x], [0, 1, y], [0, 0, 1]], float)


def R(deg):
    c, s = math.cos(math.radians(deg)), math.sin(math.radians(deg))
    # y が下向きの座標で、この行列は画面の上で時計回り（CSS の rotate と同じ）
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]], float)


def S(k):
    return np.array([[k, 0, 0], [0, k, 0], [0, 0, 1]], float)


def world(rig, by, pose):
    """部品ごとに「部品の絵の px → 台紙の px」の行列"""
    out = {}

    def m(pid):
        if pid in out:
            return out[pid]
        p = by[pid]
        parent = np.eye(3) if not p.get("parent") else m(p["parent"])
        ax, ay = p["at"]
        px, py = p["pivot"]
        out[pid] = parent @ T(ax, ay) @ R(pose.get(pid, 0.0)) @ T(-px, -py)
        return out[pid]

    for p in rig["parts"]:
        m(p["id"])
    return out


# ---------------------------------------------------------------- 描く

def render(rig, base, by, pose=None, swaps=None, scale=1.0, margin=0, hide=(), only=None):
    """組み上がりを RGBA で返す。margin は台紙の外に足す余白（回したときにはみ出す分）"""
    pose = pose or {}
    swaps = swaps or {}
    W, H = rig["size"]
    CW, CH = round((W + 2 * margin) * scale), round((H + 2 * margin) * scale)
    view = S(scale) @ T(margin, margin)
    mats = world(rig, by, pose)
    canvas = Image.new("RGBA", (CW, CH), (0, 0, 0, 0))
    for p in sorted(rig["parts"], key=lambda p: p.get("z", 0)):
        if p["id"] in hide or (only is not None and p["id"] not in only):
            continue
        im = part_image(base, p, swaps.get(p["id"]))
        M = view @ mats[p["id"]]
        inv = np.linalg.inv(M)
        # 透明の地の色が混ざって縁が黒ずまないよう、乗算済みの透明度で回す
        warped = im.convert("RGBa").transform(
            (CW, CH), Image.AFFINE, tuple(inv[:2].flatten()), resample=Image.BICUBIC).convert("RGBA")
        canvas.alpha_composite(warped)
    return canvas


def on(im, col):
    bg = Image.new("RGBA", im.size, tuple(col) + (255,))
    bg.alpha_composite(im)
    return bg.convert("RGB")


def parse_kv(s, conv=str):
    out = {}
    for kv in (s or "").split(","):
        if "=" in kv:
            k, v = kv.split("=", 1)
            out[k.strip()] = conv(v.strip())
    return out


def color(s):
    if s in BGS:
        return BGS[s]
    s = s.lstrip("#")
    return tuple(int(s[i:i + 2], 16) for i in (0, 2, 4))


# ---------------------------------------------------------------- assemble

def cmd_assemble(o):
    rig, base, by = load(o.rig, o.costume)
    im = render(rig, base, by, parse_kv(o.pose, float), parse_kv(o.swap), o.scale, o.margin)
    if o.bg:
        im = on(im, color(o.bg))
    im.save(o.out)
    a = np.array(im.convert("RGBA"))[..., 3] if not o.bg else None
    msg = f"{o.out} {im.width}×{im.height}"
    if a is not None and (a > 0).any():
        ys, xs = np.nonzero(a > 0)
        msg += f" 中身 {xs.max() - xs.min() + 1}×{ys.max() - ys.min() + 1}"
    print(msg)


# ---------------------------------------------------------------- jointcheck

def joint_radius(alpha, child, cx, cy):
    """点検する円の半径。次の2つの小さいほう:
    - pivot から、組み上がりで透明（半分より薄い）の画素に届くまでの距離（静止で円が全部埋まっているように）
    - 子の部品の、pivot のところでの太さの半分（pivot から子の縁までの距離。8px 以内の最大）。
      子のいちばん太いところ（伯爵の顔）で測ると、円が首を越えて顔まで届き、
      顔が回ってよけただけのところまで「穴」に数えてしまう"""
    from scipy import ndimage

    h, w = alpha.shape
    x, y = int(round(cx)), int(round(cy))
    if not (0 <= x < w and 0 <= y < h):
        return 0.0
    r_all = float(ndimage.distance_transform_edt(alpha >= 128)[y, x])
    dc = ndimage.distance_transform_edt(child >= 128)
    yy, xx = np.ogrid[:h, :w]
    near = (xx - cx) ** 2 + (yy - cy) ** 2 <= 8 ** 2
    r_child = float(dc[near].max()) if near.any() else 0.0
    return min(r_all, r_child)


def cmd_jointcheck(o):
    rig, base, by = load(o.rig, o.costume)
    os.makedirs(o.outdir, exist_ok=True)
    W, H = rig["size"]
    margin = round(max(W, H) * 0.35)
    rest = render(rig, base, by, margin=margin)
    ra = np.array(rest)[..., 3]
    mats = world(rig, by, {})
    rows, bad = [], []
    tiles = []
    for p in rig["parts"]:
        # 差し替えの部品（目・口）は親の上に貼る絵で、関節として回さない。位置合わせは swapcheck で見る
        if not p.get("parent") or ("swaps" in p and not o.swaps):
            continue
        pid = p["id"]
        px, py, _ = (T(margin, margin) @ mats[pid] @ np.array([*p["pivot"], 1.0]))
        ca = np.array(render(rig, base, by, margin=margin, only={pid}))[..., 3]
        r = joint_radius(ra, ca, px, py)
        if r == 0 and not (ca[max(0, int(py) - 3):int(py) + 4, max(0, int(px) - 3):int(px) + 4] > 0).any():
            # pivot が部品の上に無い（取っ手のように、両端を結ぶ線の中点で回す）ものは関節ではない
            print(f"{pid:<14}{'—':>8}  関節ではない（pivot が部品の外。ぶら下がり・倒れの軸）")
            continue
        # 縁のにじみ（1〜2px）は穴に数えない
        rr = max(r - 2.0, 0)
        yy, xx = np.ogrid[:ra.shape[0], :ra.shape[1]]
        disc = (xx - px) ** 2 + (yy - py) ** 2 <= rr ** 2
        full = disc & (ra >= 200)
        res = {"id": pid, "radius": round(r, 1)}
        strip = []
        for deg in (-o.deg, 0, o.deg):
            im = render(rig, base, by, {pid: deg}, margin=margin) if deg else rest
            a = np.array(im)[..., 3]
            hole = full & (a < 128)
            n = int(hole.sum())
            if deg:
                res[f"{deg:+g}"] = n
            vis = on(im, NAVY)
            d = ImageDraw.Draw(vis)
            d.ellipse((px - r, py - r, px + r, py + r), outline=(255, 220, 0), width=1)
            d.ellipse((px - 3, py - 3, px + 3, py + 3), fill=(255, 220, 0))
            if n:
                # 穴は円の線より上に、少し太らせて塗る（1px の穴でも縮めた絵で見えるように）
                from scipy import ndimage

                v = np.array(vis)
                v[ndimage.binary_dilation(hole, iterations=2)] = (255, 40, 40)
                vis = Image.fromarray(v)
            # 関節のまわりだけ切り出して見る（点検する円の3倍ほど）
            half = max(3 * r, 60)
            box = tuple(int(v) for v in (px - half, py - half, px + half, py + half))
            strip.append(vis.crop(box).resize((360, 360), Image.LANCZOS))
        tile = Image.new("RGB", (360 * 3 + 20, 360 + 34), (20, 20, 30))
        for i, s in enumerate(strip):
            tile.paste(s, (i * 370, 34))
        ImageDraw.Draw(tile).text((8, 8), f"{pid}  r={r:.0f}px  -{o.deg}°:{res[f'{-o.deg:+g}']}  +{o.deg}°:{res[f'{o.deg:+g}']}",
                                  fill=(255, 255, 255))
        tile.save(os.path.join(o.outdir, f"{pid}.png"))
        tiles.append(tile)
        rows.append(res)
        if res[f"{-o.deg:+g}"] > o.allow or res[f"{o.deg:+g}"] > o.allow or r < o.min_radius:
            bad.append(pid)
    if tiles:
        cols = 2
        tw, th = tiles[0].size
        sheet = Image.new("RGB", (tw * cols + 10, (th + 10) * math.ceil(len(tiles) / cols)), (0, 0, 0))
        for i, t in enumerate(tiles):
            sheet.paste(t, ((i % cols) * (tw + 10), (i // cols) * (th + 10)))
        sheet.save(os.path.join(o.outdir, "all.png"))
    print(f"{'関節':<14}{'半径px':>8}{'-' + str(o.deg) + '°':>8}{'+' + str(o.deg) + '°':>8}")
    for r in rows:
        print(f"{r['id']:<14}{r['radius']:>8}{r[f'{-o.deg:+g}']:>8}{r[f'{o.deg:+g}']:>8}")
    print(f"穴が出た関節 {len(bad)}/{len(rows)}" + (f": {', '.join(bad)}" if bad else ""))
    print("→", os.path.join(o.outdir, "all.png"))
    sys.exit(1 if bad else 0)


# ---------------------------------------------------------------- compare

def silhouette(im):
    return np.array(im.convert("RGBA"))[..., 3] >= 128


def white_mask(im, thr=232):
    """白い地の設定画から、絵の外形を取る（地とつながった白だけを地とみなす）"""
    from scipy import ndimage

    a = np.array(im.convert("RGBA")).astype(int)
    if (a[..., 3] < 255).any():
        return a[..., 3] >= 128
    light = (a[..., :3].min(-1) >= thr)
    lab, _ = ndimage.label(light)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bg = np.isin(lab, list(edge))
    return ~bg


def crop_to(mask, im):
    ys, xs = np.nonzero(mask)
    box = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
    return im.crop(box), mask[box[1]:box[3], box[0]:box[2]]


def cmd_compare(o):
    rig, base, by = load(o.rig, o.costume)
    asm = render(rig, base, by, parse_kv(o.pose, float), parse_kv(o.swap))
    am = silhouette(asm)
    asm_c, am_c = crop_to(am, asm)
    ref = Image.open(o.ref).convert("RGBA")
    if o.crop:
        x0, y0, x1, y1 = (int(v) for v in o.crop.split(","))
        ref = ref.crop((x0, y0, x1, y1))
    if o.flip:
        ref = ImageOps.mirror(ref)
    rm = white_mask(ref)
    ref_c, rm_c = crop_to(rm, ref)
    # 高さをそろえて、外形がいちばん重なる位置を探す（ずらし ±8%）
    H = 600
    A = asm_c.resize((round(asm_c.width * H / asm_c.height), H), Image.LANCZOS)
    Am = silhouette(A)
    best = None
    for k in np.linspace(0.9, 1.1, 9):
        h = round(H * k)
        Rr = ref_c.resize((round(ref_c.width * h / ref_c.height), h), Image.LANCZOS)
        Rm = np.array(Image.fromarray(rm_c.astype(np.uint8) * 255).resize(Rr.size, Image.NEAREST)) > 127
        CW, CH = max(A.width, Rr.width) + 120, max(A.height, Rr.height) + 120
        a_canvas = np.zeros((CH, CW), bool)
        a_canvas[60:60 + A.height, 60:60 + A.width] = Am
        for dx in range(-60, 61, 6):
            for dy in range(-60, 61, 6):
                r_canvas = np.zeros((CH, CW), bool)
                ox = 60 + (A.width - Rr.width) // 2 + dx
                oy = 60 + (A.height - Rr.height) // 2 + dy
                if ox < 0 or oy < 0 or ox + Rr.width > CW or oy + Rr.height > CH:
                    continue
                r_canvas[oy:oy + Rr.height, ox:ox + Rr.width] = Rm
                iou = (a_canvas & r_canvas).sum() / max((a_canvas | r_canvas).sum(), 1)
                if best is None or iou > best[0]:
                    best = (iou, Rr, ox, oy, CW, CH, r_canvas)
    iou, Rr, ox, oy, CW, CH, r_canvas = best
    # 並べた絵: 設定画 | 組み上がり（紺の地）| 重ね（設定画を薄く、組み上がりの外形を赤で）
    left = Image.new("RGBA", (CW, CH), (255, 255, 255, 255))
    left.alpha_composite(Rr, (ox, oy))
    mid = Image.new("RGBA", (CW, CH), NAVY + (255,))
    mid.alpha_composite(A, (60, 60))
    over = Image.new("RGBA", (CW, CH), (255, 255, 255, 255))
    ghost = Rr.copy()
    ghost.putalpha(Image.fromarray((np.array(Rr)[..., 3] * 0.45).astype(np.uint8)))
    over.alpha_composite(ghost, (ox, oy))
    Ad = A.copy()
    Ad.putalpha(Image.fromarray((np.array(A)[..., 3] * 0.55).astype(np.uint8)))
    over.alpha_composite(Ad, (60, 60))
    from scipy import ndimage

    am_canvas = np.zeros((CH, CW), bool)
    am_canvas[60:60 + A.height, 60:60 + A.width] = Am
    ov = np.array(over)
    ov[am_canvas ^ ndimage.binary_erosion(am_canvas, iterations=2)] = (230, 30, 60, 255)
    ov[r_canvas ^ ndimage.binary_erosion(r_canvas, iterations=2)] = (30, 110, 230, 255)
    over = Image.fromarray(ov)
    out = Image.new("RGB", (CW * 3 + 20, CH + 30), (40, 40, 40))
    for i, im in enumerate((left, mid, over)):
        out.paste(im.convert("RGB"), (i * (CW + 10), 30))
    ImageDraw.Draw(out).text((8, 8), f"設定画 | 組み上がり | 重ね（赤=組み上がり 青=設定画）  IoU {iou:.3f}", fill=(255, 255, 255))
    out.save(o.out)
    print(f"{o.out} 外形の重なり IoU {iou:.3f}")


# ---------------------------------------------------------------- swapcheck

def cmd_swapcheck(o):
    rig, base, by = load(o.rig, o.costume)
    ok = True
    for p in rig["parts"]:
        if "swaps" not in p:
            continue
        sizes = {}
        centers = {}
        for name, f in p["swaps"].items():
            a = np.array(Image.open(os.path.join(base, f)).convert("RGBA"))
            sizes[name] = (a.shape[1], a.shape[0])
            ys, xs = np.nonzero(a[..., 3] > 0)
            centers[name] = ((xs.min() + xs.max()) / 2, (ys.min() + ys.max()) / 2)
        same = len(set(sizes.values())) == 1
        ok &= same
        cx = [c[0] for c in centers.values()]
        print(f"{p['id']}: 寸法 {'そろっている' if same else 'ばらばら'} {sorted(set(sizes.values()))} "
              f"中身の中心 x のぶれ {max(cx) - min(cx):.1f}px  "
              + " ".join(f"{n}=({c[0]:.0f},{c[1]:.0f})" for n, c in centers.items()))
    sys.exit(0 if ok else 1)


def main(argv=None):
    ap = argparse.ArgumentParser()
    add(ap.add_subparsers(dest="cmd", required=True))
    o = ap.parse_args(argv)
    globals()["cmd_" + o.cmd](o)


def add(sp):
    """alert_theme.py からも同じ口で呼べるように、引数の定義をここに置く"""
    p = sp.add_parser("assemble"); p.add_argument("rig"); p.add_argument("out")
    p.add_argument("--pose"); p.add_argument("--swap"); p.add_argument("--bg")
    p.add_argument("--scale", type=float, default=1.0); p.add_argument("--margin", type=int, default=0)
    p = sp.add_parser("jointcheck"); p.add_argument("rig"); p.add_argument("outdir")
    p.add_argument("--deg", type=float, default=30); p.add_argument("--allow", type=int, default=0)
    p.add_argument("--min-radius", type=float, default=3)
    p.add_argument("--swaps", action="store_true", help="差し替えの部品も関節として回す")
    p = sp.add_parser("compare"); p.add_argument("rig"); p.add_argument("ref"); p.add_argument("out")
    p.add_argument("--crop"); p.add_argument("--flip", action="store_true")
    p.add_argument("--pose"); p.add_argument("--swap")
    p = sp.add_parser("swapcheck"); p.add_argument("rig")
    # 仮装（costume-*.json）を素体に重ねてから点検・組み立てる。rig.json と同じ置き場からの名前でよい
    for name in ("assemble", "jointcheck", "compare", "swapcheck"):
        sp.choices[name].add_argument("--costume")


if __name__ == "__main__":
    main()
