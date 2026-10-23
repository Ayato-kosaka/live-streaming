#!/usr/bin/env python3
"""ChatGPT が描いた切り絵の部品から、rig.json と部品の PNG を作る道具（rig.py が点検する側）。

    python3 tools/alert-theme/rigbuild.py strip <in.png> <out.png>
        部品の外側の「光のふち（rim）」をはがして芯（core）だけにする
    python3 tools/alert-theme/rigbuild.py knob <in.png> <out.png> <x> <y> <r>
        関節の重なりしろ: (x, y) を中心にした半径 r の毛の色の円を、部品の下に足す（輪郭線は引かない）
    python3 tools/alert-theme/rigbuild.py build <pose.json> <src_dir> <out_dir> [--scale 0.72] [--rim 11]
            [--rim-color c871fb] [--norim eye,mouth] [--no-quant a.png,b.png]
        pose.json（元の絵の座標で書いた置き方）から部品を焼き、組み上がりの外形にだけ rim を付け、
        台紙を中身に詰め、減色して out_dir に書き出す（rig.json つき）
    python3 tools/alert-theme/rigbuild.py fmt <rig.json> …
        rig.json を部品1つ1行に書き直す

pose.json の部品は「src の絵の座標」で書く（焼いたあとの座標は build が直す）:

    {"id", "src" | "swaps": {名前: src}, "mirror"?, "rot"?, "scale"?, "dim"?, "out"?,
     "parent", "pivot": [x, y], "at": [x, y], "z"}

- rot は CSS と同じ向き（正で時計回り）。静止の姿勢の傾きを絵に焼くのに使う（rig.json には回転の欄が無い）
- dim は色を暗くする割合（奥の脚など）。out は書き出しの名前（同じ src を2つの部品で別の絵にするとき）

なぜ rim を付け直すか: ChatGPT は部品ごとに光のふちを描くので、そのまま組むと、脚の付け根や帽子のつばの下に
部品を隔てるふちの線が出る。ふちは組み上がりの外形にだけ欲しい。そこで全部はがし、組んだあとで
「静止の組み上がりで、自分より奥の部品の芯に重なり、しかも手前の部品に隠れていないところ」を除いて付け直す。
自分より奥の部品の上でも、手前の部品に隠れているところは残す（動いてはみ出たとき、そこにふちが要る）。
"""
import argparse
import json
import math
import os
import shutil
import sys

import numpy as np
from PIL import Image, ImageOps
from scipy import ndimage

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import alert_theme as AT  # noqa: E402
import rig as R  # noqa: E402

LAVENDER = (201, 113, 251)


# ---------------------------------------------------------------- rim（光のふち）

def lavender_mask(a):
    rgb = a[..., :3].astype(int)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    # 明るいラベンダー。帽子の紫（暗い）や、芯の中のハイライトとは明るさで分かれる
    return (a[..., 3] > 0) & (b > 190) & (r > 140) & (g < 175) & (b > r) & (b - g > 70)


def strip_rim(a, band=40):
    """外とつながったラベンダーの帯をはがして、芯だけの RGBA を返す（芯の縁 1px は半透明）"""
    a = a.copy()
    alpha = a[..., 3]
    ext = alpha < 16
    lav = lavender_mask(a) | ((alpha > 0) & (alpha < 250) & ~ext)
    lab, _ = ndimage.label(lav)
    touch = ndimage.binary_dilation(ext, iterations=2)
    rim = np.isin(lab, np.unique(lab[touch & (lab > 0)]))
    # 外から band px より奥のものは rim とみなさない（芯の中のハイライト）
    rim &= ndimage.distance_transform_edt(~ext) <= band
    a[rim] = 0
    core = ndimage.binary_opening(a[..., 3] > 0, iterations=1)
    a[~core] = 0
    a[..., 3] = np.where(core, 255, 0).astype(np.uint8)
    edge = core & ~ndimage.binary_erosion(core)
    a[edge, 3] = 170
    return a


def add_rim(core_rgba, width, color=LAVENDER, forbid=None):
    """芯のまわりに幅 width の rim を敷く。forbid（bool）の内へ 1px までは残し、そこから 2px で消す
    （隣の部品の rim と少し重ねて、継ぎ目に 1px の穴が出ないように）"""
    inside = core_rgba[..., 3] > 127
    d = ndimage.distance_transform_edt(~inside)
    ra = np.clip(width + 0.5 - d, 0, 1)
    if forbid is not None:
        din = ndimage.distance_transform_edt(forbid)
        ra *= np.clip(1.0 - (din - 1.0) / 2.0, 0, 1)
    out = np.zeros_like(core_rgba)
    out[..., :3] = color
    out[..., 3] = (ra * 255).astype(np.uint8)
    im = Image.fromarray(out)
    im.alpha_composite(Image.fromarray(core_rgba))
    return np.array(im)


def add_knob(a, cx, cy, r, color=None):
    """関節の重なりしろ: pivot を中心にした毛の色の円を、部品の下（透明なところだけ）に足す。
    はみ出すなら台紙を広げ、(左, 上) に足した量を返す（pivot をずらすのに使う）"""
    h, w = a.shape[:2]
    pl, pt = int(max(0, r - cx + 2)), int(max(0, r - cy + 2))
    pr, pb = int(max(0, cx + r - w + 2)), int(max(0, cy + r - h + 2))
    if pl or pt or pr or pb:
        b = np.zeros((h + pt + pb, w + pl + pr, 4), np.uint8)
        b[pt:pt + h, pl:pl + w] = a
        a, cx, cy = b, cx + pl, cy + pt
        h, w = a.shape[:2]
    yy, xx = np.mgrid[:h, :w]
    d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
    if color is None:
        rgb = a[..., :3].astype(int)
        lum = 0.299 * rgb[..., 0] + 0.587 * rgb[..., 1] + 0.114 * rgb[..., 2]
        # 円の近くの、輪郭線でもハイライトでもない画素の中央値
        pick = (a[..., 3] == 255) & (d < r * 1.5) & (lum > 38) & (lum < 200)
        color = np.median(a[pick][:, :3], axis=0).astype(np.uint8)
    under = np.zeros_like(a)
    under[..., :3] = color
    under[..., 3] = (np.clip(r + 0.5 - d, 0, 1) * 255).astype(np.uint8)
    im = Image.fromarray(under)
    im.alpha_composite(Image.fromarray(a))
    return np.array(im), (pl, pt)


def pad(a, n):
    h, w = a.shape[:2]
    out = np.zeros((h + 2 * n, w + 2 * n, 4), np.uint8)
    out[n:n + h, n:n + w] = a
    return out


# ---------------------------------------------------------------- 焼く（反転・回転・縮小）

def transform_image(im, mirror=False, rot=0.0, scale=1.0):
    """戻り値: (焼いた絵, 元の座標 → 焼いた座標 の関数)"""
    w, h = im.size
    if mirror:
        im = ImageOps.mirror(im)
    if scale != 1.0:
        im = im.convert("RGBa").resize((max(1, round(w * scale)), max(1, round(h * scale))),
                                       Image.LANCZOS).convert("RGBA")
    sw, sh = im.size
    kx, ky = sw / w, sh / h
    # PIL の rotate は反時計回りが正。CSS に合わせて符号を反転する
    rim = im.convert("RGBa").rotate(-rot, resample=Image.BICUBIC, expand=True).convert("RGBA") if rot else im
    rw, rh = rim.size
    c, s = math.cos(math.radians(rot)), math.sin(math.radians(rot))

    def f(pt):
        x, y = pt
        if mirror:
            x = w - x
        x, y = x * kx, y * ky
        if rot:
            dx, dy = x - sw / 2, y - sh / 2
            x, y = rw / 2 + c * dx - s * dy, rh / 2 + s * dx + c * dy
        return [round(x, 2), round(y, 2)]

    return rim, f


def bake(pose, src_dir, out_dir, extra_scale=1.0):
    """pose から部品の絵を out_dir に焼き、rig（dict）を返す。親は子より前に並べておく"""
    os.makedirs(out_dir, exist_ok=True)
    maps, parts, done = {}, [], {}
    for p in pose["parts"]:
        k = p.get("scale", 1.0) * extra_scale
        if "swaps" in p:
            sw = {}
            for name, src in p["swaps"].items():
                im = Image.open(os.path.join(src_dir, src)).convert("RGBA")
                b, fmap = transform_image(im, p.get("mirror", False), p.get("rot", 0.0), k)
                fn = f"{p['id']}-{name}.png"
                b.save(os.path.join(out_dir, fn))
                sw[name] = fn
            entry = {"id": p["id"], "swaps": sw}
        else:
            key = (p["src"], p.get("mirror", False), p.get("rot", 0.0), k, p.get("out"), p.get("dim"))
            im = Image.open(os.path.join(src_dir, p["src"])).convert("RGBA")
            if p.get("dim"):
                a = np.array(im).astype(float)
                a[..., :3] *= p["dim"]
                im = Image.fromarray(a.astype(np.uint8))
            b, fmap = transform_image(im, p.get("mirror", False), p.get("rot", 0.0), k)
            if key not in done:
                done[key] = p.get("out") or f"{p['id']}.png"
                b.save(os.path.join(out_dir, done[key]))
            entry = {"id": p["id"], "file": done[key]}
        maps[p["id"]] = fmap
        entry["parent"] = p.get("parent")
        entry["pivot"] = fmap(p["pivot"])
        entry["at"] = maps[p["parent"]](p["at"]) if p.get("parent") else [v * extra_scale for v in p["at"]]
        entry["z"] = p["z"]
        parts.append(entry)
    W, H = pose["size"]
    return {"name": pose["name"], "size": [round(W * extra_scale), round(H * extra_scale)], "parts": parts}


def _files(p):
    return [p["file"]] if "file" in p else list(p["swaps"].values())


def build(pose_path, src_dir, out_dir, scale=1.0, rim=10.0, rim_color=LAVENDER, norim=(), margin=12,
          no_quant=()):
    pose = json.load(open(pose_path))
    tmp = out_dir.rstrip("/") + ".tmp"
    shutil.rmtree(tmp, ignore_errors=True)
    rig = bake(pose, src_dir, tmp, extra_scale=scale)
    P = int(math.ceil(rim)) + 3

    # 1) 部品の絵を rim の幅ぶん広げる（pivot と、子の at もずらす）
    files = []
    for p in rig["parts"]:
        p["pivot"] = [p["pivot"][0] + P, p["pivot"][1] + P]
        for f in _files(p):
            if f not in files:
                files.append(f)
                a = np.array(Image.open(os.path.join(tmp, f)).convert("RGBA"))
                Image.fromarray(pad(a, P)).save(os.path.join(tmp, f))
    for p in rig["parts"]:
        if p.get("parent"):
            p["at"] = [p["at"][0] + P, p["at"][1] + P]
    json.dump(rig, open(os.path.join(tmp, "rig.json"), "w"))
    rg, base, by = R.load(os.path.join(tmp, "rig.json"))
    R._cache.clear()
    M = 200
    mats = R.world(rg, by, {})

    # 2) 部品ごとに、rim を付けないところ（静止で見えている、奥の部品の芯の上）を、その部品の座標に写す
    forbid_of = {}
    for p in rg["parts"]:
        if p["id"] in norim:
            continue
        f = _files(p)[0]
        behind = {q["id"] for q in rg["parts"] if q.get("z", 0) < p.get("z", 0)}
        front = {q["id"] for q in rg["parts"] if q.get("z", 0) > p.get("z", 0)}
        om = np.array(R.render(rg, base, by, margin=M, only=behind))[..., 3] >= 128
        if front:
            om &= ~(np.array(R.render(rg, base, by, margin=M, only=front))[..., 3] >= 250)
        a = np.array(Image.open(os.path.join(base, f)).convert("RGBA"))
        h, w = a.shape[:2]
        ys, xs = np.mgrid[:h, :w]
        pts = np.stack([xs.ravel() + 0.5, ys.ravel() + 0.5, np.ones(h * w)])
        cx, cy = (R.T(M, M) @ mats[p["id"]] @ pts)[:2]
        ix, iy = np.floor(cx).astype(int), np.floor(cy).astype(int)
        ok = (ix >= 0) & (iy >= 0) & (ix < om.shape[1]) & (iy < om.shape[0])
        forbid = np.zeros(h * w, bool)
        forbid[ok] = om[iy[ok], ix[ok]]
        forbid = forbid.reshape(h, w)
        # 同じ絵を2つの部品が使うなら、両方で禁じるところの和
        for g in _files(p):
            forbid_of[g] = forbid | forbid_of.get(g, np.zeros_like(forbid))

    for f in files:
        a = np.array(Image.open(os.path.join(base, f)).convert("RGBA"))
        if f in forbid_of:
            a = add_rim(a, rim, rim_color, forbid=forbid_of[f])
        Image.fromarray(a).save(os.path.join(tmp, "r-" + f))
    for p in rg["parts"]:
        if "file" in p:
            p["file"] = "r-" + p["file"]
        else:
            p["swaps"] = {k: "r-" + v for k, v in p["swaps"].items()}

    # 3) 台紙を中身に詰める。差し替えのどの絵を出しても収まる大きさ（あふれの山は空より高い）
    R._cache.clear()
    al = np.array(R.render(rg, base, by, margin=M))[..., 3] > 0
    for p in rg["parts"]:
        for k in (list(p["swaps"])[1:] if "swaps" in p else []):
            al |= np.array(R.render(rg, base, by, swaps={p["id"]: k}, margin=M))[..., 3] > 0
    ys, xs = np.nonzero(al)
    x0, y0 = xs.min() - margin, ys.min() - margin
    x1, y1 = xs.max() + 1 + margin, ys.max() + 1 + margin
    for p in rg["parts"]:
        if not p.get("parent"):
            p["at"] = [p["at"][0] + M - x0, p["at"][1] + M - y0]
    rg["size"] = [int(x1 - x0), int(y1 - y0)]

    # 4) 書き出し（256色に減色。no_quant に挙げた絵はそのまま）
    shutil.rmtree(out_dir, ignore_errors=True)
    os.makedirs(out_dir)
    written = set()
    for p in rg["parts"]:
        for f in _files(p):
            name = f[2:]
            if name not in written:
                im = Image.fromarray(AT.clean_alpha(np.array(Image.open(os.path.join(base, f)).convert("RGBA"))))
                AT.save(im, os.path.join(out_dir, name), quant=name not in no_quant)
                written.add(name)
    for p in rg["parts"]:
        if "file" in p:
            p["file"] = p["file"][2:]
        else:
            p["swaps"] = {k: v[2:] for k, v in p["swaps"].items()}
    out = {"name": rg["name"], "size": rg["size"], "parts": rg["parts"]}
    write_rig(out, os.path.join(out_dir, "rig.json"))
    shutil.rmtree(tmp, ignore_errors=True)
    total = sum(os.path.getsize(os.path.join(out_dir, n)) for n in os.listdir(out_dir))
    print(f"{out_dir}: 台紙 {rg['size'][0]}×{rg['size'][1]}、部品 {len(rg['parts'])}、"
          f"ファイル {len(os.listdir(out_dir))}、計 {total / 1024:.0f}KB")
    return out


def write_rig(rig, path):
    """部品1つを1行に。座標は 0.1px まで"""
    for p in rig["parts"]:
        for key in ("pivot", "at"):
            p[key] = [round(float(v), 1) for v in p[key]]
    lines = ["{"]
    keys = list(rig)
    for i, k in enumerate(keys):
        end = "," if i < len(keys) - 1 else ""
        if k == "parts":
            lines.append(' "parts": [')
            for j, p in enumerate(rig["parts"]):
                lines.append("  " + json.dumps(p, ensure_ascii=False) + ("," if j < len(rig["parts"]) - 1 else ""))
            lines.append(" ]" + end)
        else:
            lines.append(f" {json.dumps(k)}: {json.dumps(rig[k], ensure_ascii=False)}{end}")
    lines.append("}")
    open(path, "w").write("\n".join(lines) + "\n")


def color(s):
    s = s.lstrip("#")
    return tuple(int(s[i:i + 2], 16) for i in (0, 2, 4))


def main():
    ap = argparse.ArgumentParser()
    sp = ap.add_subparsers(dest="cmd", required=True)
    p = sp.add_parser("strip"); p.add_argument("src"); p.add_argument("out")
    p = sp.add_parser("knob"); p.add_argument("src"); p.add_argument("out")
    p.add_argument("x", type=float); p.add_argument("y", type=float); p.add_argument("r", type=float)
    p = sp.add_parser("build"); p.add_argument("pose"); p.add_argument("src"); p.add_argument("out")
    p.add_argument("--scale", type=float, default=1.0); p.add_argument("--rim", type=float, default=10)
    p.add_argument("--rim-color", default="c971fb"); p.add_argument("--norim", default="")
    p.add_argument("--margin", type=int, default=12); p.add_argument("--no-quant", default="")
    p = sp.add_parser("fmt"); p.add_argument("rigs", nargs="+")
    o = ap.parse_args()
    if o.cmd == "strip":
        Image.fromarray(strip_rim(np.array(Image.open(o.src).convert("RGBA")))).save(o.out)
    elif o.cmd == "knob":
        a, shift = add_knob(np.array(Image.open(o.src).convert("RGBA")), o.x, o.y, o.r)
        Image.fromarray(a).save(o.out)
        if any(shift):
            print(f"台紙を広げた: 左 {shift[0]} 上 {shift[1]}（pivot をこのぶんずらす）")
    elif o.cmd == "build":
        build(o.pose, o.src, o.out, o.scale, o.rim, color(o.rim_color),
              set(filter(None, o.norim.split(","))), o.margin, set(filter(None, o.no_quant.split(","))))
    elif o.cmd == "fmt":
        for path in o.rigs:
            write_rig(json.load(open(path)), path)


if __name__ == "__main__":
    main()
