#!/usr/bin/env python3
"""1万円の段（段7）の Blender の場面で使う、下ごしらえの絵を作る（この箱で回す。Blender は要らない）。

    python3 tools/alert-theme/blender/t7_prep.py            # tools/alert-theme/blender/assets/ に書く
    python3 tools/alert-theme/blender/t7_prep.py --check out.png   # できた絵を紺の地に並べる（目で見る用）

作るもの（どれも public/alert/themes/ の本物の絵から、毎回同じに出る）:
- `bank-windows.png` … 貯金箱の城の絵（`castle/bank-base-0.png`）の窓だけを白くした絵。
  前兆で「いつもの城の窓が灯る」ところに使う（窓の色は紫がかった濃い灰。縁取りの黒と分けて拾う）
- `<名前>-rim.png` … キャラの板（ピポ・あやと）の縁の光。絵の透明の縁から内へ数 px の帯を、
  光の来る向き（`RIM` の向き）ほど明るくした白黒の絵。Blender の板の材質で「縁が光る」に使う。
  板には法線の変化が無いので、縁の光は絵の側に持たせる
- `<名前>-normal.png` … キャラの板の法線の絵（接空間・OpenGL の向き）。透明の縁を丸く盛り上げ、絵の線をわずかにへこませた
  高さから作る。板が城の光（門・灯り・前からの月の光）を、縁の向きごとに受けて立体に見えるように（2026-11-04。
  「板が動かない」の採点の続き）。あやとは絵の半分の大きさで持つ（光の向きだけなので細かさは要らない）

なぜ Blender の中で作らないか: Blender はこの箱に入れない（runner の中だけで動く）。
絵の処理は numpy だけで済むので、ここで作って git に入れ、runner では読むだけにする（試せる所を増やす）。
"""
import argparse
import os

import numpy as np
from PIL import Image
from scipy.ndimage import binary_opening, distance_transform_edt, gaussian_filter, label

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
THEMES = os.path.join(ROOT, "public", "alert", "themes")
OUT = os.path.join(HERE, "assets")

# キャラの板と、縁の光が来る向き（絵の上での向き。x は右、y は下が正）
# ピポは右の奥の塔に居て、満月（右上）と門の光（左下）の両方から照らされる → 右上を強く
# あやとは左上の空に居て、満月は右上 → 右上から
RIMS = {
    "pipo-flag": (os.path.join(THEMES, "castle", "pipo-flag.png"), (0.75, -0.65)),
    "pipo-cheer": (os.path.join(THEMES, "castle", "pipo-cheer.png"), (0.75, -0.65)),
    "ayato-rise": (os.path.join(THEMES, "halloween", "poses", "dracula", "rise.webp"), (0.8, -0.6)),
    "ayato-spread": (os.path.join(THEMES, "halloween", "poses", "dracula", "spread.webp"), (0.8, -0.6)),
}


def window_mask(path):
    """貯金箱の城の窓（紫がかった濃い灰の形）だけを 0〜1 で返す"""
    im = np.asarray(Image.open(path).convert("RGBA")).astype(np.float32)
    r, g, b, a = (im[..., i] for i in range(4))
    lum = 0.299 * r + 0.587 * g + 0.114 * b
    h, w = lum.shape
    yy, xx = np.mgrid[0:h, 0:w]
    # 窓は 紫〜紺がかった濃い色（b が r 以上）・明るさ 22〜75。縁取りの黒（もっと暗い）・屋根の影（赤い）は外す
    m = (a > 200) & (lum > 22) & (lum < 75) & (b >= r - 2) & (b > g + 4)
    # 城の壁の高さだけ（岩・木・門の下は拾わない）。絵の 560×470 で、壁は y 60〜300 あたり
    m &= (yy > 55) & (yy < 300)
    m = binary_opening(m, iterations=1)
    # 小さすぎる点（縁取りの角のにじみ）を捨てる
    lab, n = label(m)
    keep = np.zeros_like(m)
    for i in range(1, n + 1):
        part = lab == i
        if part.sum() >= 40:
            keep |= part
    soft = gaussian_filter(keep.astype(np.float32), 0.8)
    return np.clip(soft * 1.4, 0, 1)


def rim_mask(path, direction, width=0.012):
    """透明の縁から内へ帯を取り、光の来る向きほど明るく（0〜1）。帯の幅は絵の長辺に対する割合"""
    im = Image.open(path).convert("RGBA")
    a = np.asarray(im).astype(np.float32)[..., 3] / 255
    inside = a > 0.5
    px = max(2.0, width * max(a.shape))
    d = distance_transform_edt(inside)
    band = np.clip(1 - d / px, 0, 1) * inside
    # 向き: 透明の濃さの勾配（外向き）と、光の向きの内積
    sa = gaussian_filter(a, px * 0.6)
    gy, gx = np.gradient(sa)
    gl = np.hypot(gx, gy) + 1e-6
    nx, ny = -gx / gl, -gy / gl  # 外向き
    dx, dy = direction
    dl = (dx * dx + dy * dy) ** 0.5
    facing = np.clip((nx * dx + ny * dy) / dl, 0, 1) ** 1.5
    rim = band * (0.15 + 0.85 * facing)
    return np.clip(gaussian_filter(rim, 0.7), 0, 1)


def normal_map(path, width=0.022, relief=0.08):
    """透明の縁を丸く盛り上げた高さ（縁から内へ width の帯でドームの断面）と、絵の線のへこみから、法線の絵（0〜1 の RGB）"""
    im = Image.open(path).convert("RGBA")
    arr = np.asarray(im).astype(np.float32) / 255
    a = arr[..., 3]
    inside = a > 0.5
    px = max(3.0, width * max(a.shape))
    u = np.clip(distance_transform_edt(inside) / px, 0, 1)
    h = np.sqrt(np.clip(1 - (1 - u) ** 2, 0, 1)) * inside
    lum = arr[..., :3] @ np.array([0.299, 0.587, 0.114], np.float32)
    h = h + relief * gaussian_filter(lum, 1.0) * inside
    h = gaussian_filter(h, 1.2)
    gy, gx = np.gradient(h)
    # 高さは「帯の幅 px」を 1 とした単位。画像の y は下向きなので、上向きの傾きは -gy
    nx, ny, nz = -gx * px, gy * px, np.ones_like(h)
    n = np.dstack([nx, ny, nz])
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    n[~(gaussian_filter(inside.astype(np.float32), 2.0) > 0.01)] = (0.0, 0.0, 1.0)
    return n * 0.5 + 0.5


def save_rgb(arr, path, half=False):
    im = Image.fromarray((np.clip(arr, 0, 1) * 255 + 0.5).astype(np.uint8), "RGB")
    if half:
        im = im.resize((im.width // 2, im.height // 2), Image.LANCZOS)
    im.save(path, optimize=True)


def save_gray(arr, path):
    Image.fromarray((np.clip(arr, 0, 1) * 255 + 0.5).astype(np.uint8), "L").save(path, optimize=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", help="できた絵を紺の地に並べた一覧の書き出し先")
    args = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)
    made = []
    p = os.path.join(OUT, "bank-windows.png")
    save_gray(window_mask(os.path.join(THEMES, "castle", "bank-base-0.png")), p)
    made.append((p, os.path.join(THEMES, "castle", "bank-base-0.png")))
    for name, (src, direction) in RIMS.items():
        p = os.path.join(OUT, f"{name}-rim.png")
        save_gray(rim_mask(src, direction), p)
        made.append((p, src))
        p = os.path.join(OUT, f"{name}-normal.png")
        save_rgb(normal_map(src), p, half=name.startswith("ayato"))
        made.append((p, src))
    for p, _ in made:
        print(f"{os.path.relpath(p, ROOT)}  {os.path.getsize(p) / 1024:.0f}KB")
    if args.check:
        tiles = []
        for p, src in made:
            base = Image.open(src).convert("RGBA")
            mi = Image.open(p)
            if mi.size != base.size:
                mi = mi.resize(base.size, Image.LANCZOS)
            m = np.asarray(mi).astype(np.float32) / 255
            bg = np.zeros((base.height, base.width, 3), np.float32) + np.array([0.05, 0.06, 0.14])
            rgb = np.asarray(base).astype(np.float32)[..., :3] / 255
            al = np.asarray(base).astype(np.float32)[..., 3:] / 255
            comp = rgb * al + bg * (1 - al)
            if m.ndim == 3:
                # 法線の絵は、左上からの光で陰をつけて見る
                nrm = m * 2 - 1
                lit = np.clip(nrm @ np.array([-0.5, 0.5, 0.7], np.float32) / 0.995, 0, 1)
                comp = np.clip(comp * (0.35 + 0.9 * lit[..., None]), 0, 1)
            else:
                comp = np.clip(comp + m[..., None] * np.array([1.0, 0.75, 0.3]), 0, 1)
            t = Image.fromarray((comp * 255).astype(np.uint8))
            t.thumbnail((360, 360))
            tiles.append(t)
        W = sum(t.width for t in tiles) + 8 * (len(tiles) + 1)
        H = max(t.height for t in tiles) + 16
        sheet = Image.new("RGB", (W, H), (20, 20, 30))
        x = 8
        for t in tiles:
            sheet.paste(t, (x, 8))
            x += t.width + 8
        sheet.save(args.check)
        print(args.check)


if __name__ == "__main__":
    main()
