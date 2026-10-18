#!/usr/bin/env python3
"""白い地を透過させる。**元の画素は描き直さない**（境目の 1〜2px だけ白を差し引いて色を戻す）。

手元（このセッションの箱）で動く。EC2 も ChatGPT も要らない。

    python3 .claude/skills/chatgpt-image/cutout.py <入力> <出力.png> [--tchroma 40] [--min-island 1500] [--gaps]

背景透過は、まずこれ（#780 D1: 原則は手元。抜いて汚れが目立つときだけ ChatGPT）。
🃏（1600×1200）を抜いたのがこれで、不透明部分の元画素との差 0・境目の白っぽい画素 0 / 19,407 だった。

やり方:
  1. 「明るくて色の薄い画素」を外周から塗りつぶして、外とつながった地を決める
     （輪郭線の小さな切れ目から中へ漏れないよう、壁を1px太らせてから塗り、あとで1px戻す）
  2. 境目の数pxだけ、その場の地の色 B と線の色 F の間のどこにいるかで alpha を出す
     （C = a*F + (1-a)*B を a について解く）。色は B を差し引いて戻す
  3. 外の白い粒（JPEG のまだら）で alpha が薄く残ったものは消す
  4. `--gaps` を付けたときだけ、**外と繋がっていない地**も抜く（長い髪の房が
     閉じ込めた白い楔。`trapped_bg`）

効かないもの: 地が白でない（写真・模様・グラデーション）、輪郭線が無くて絵と地の色が近い。
そういうときは ChatGPT（SKILL.md 2）。
"""
import argparse
import numpy as np
from PIL import Image
from scipy import ndimage as ndi


def disk(r):
    y, x = np.mgrid[-r:r + 1, -r:r + 1]
    return x * x + y * y <= r * r + 0.5


def nconv(val, w, sigma):
    """重み付きのぼかし（w が 0 のところは数えない）"""
    if val.ndim == 3:
        num = np.stack([ndi.gaussian_filter(val[..., c] * w, sigma) for c in range(val.shape[2])], -1)
    else:
        num = ndi.gaussian_filter(val * w, sigma)
    den = ndi.gaussian_filter(w.astype(float), sigma)
    return num, den


def flood_bg(C, tmin, tchroma, close=1):
    mn = C.min(2)
    chroma = C.max(2) - mn
    light = (mn >= tmin) & (chroma <= tchroma)
    wall = ndi.binary_dilation(~light, disk(close)) if close else ~light
    seed = light & ~wall
    lab, n = ndi.label(seed)
    edge = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    edge = edge[edge > 0]
    bg0 = np.isin(lab, edge)
    # 太らせた壁のぶんを、明るい画素の中だけで戻す
    bg = ndi.binary_dilation(bg0, iterations=close + 1, mask=light) if close else bg0
    return bg, light


def soft_edge(C, bg, min_contrast=40.0):
    """境目の alpha と、白を差し引いた色"""
    fg = ~bg
    din = ndi.distance_transform_edt(fg)    # 地からの距離（fg 側）
    dout = ndi.distance_transform_edt(bg)   # 絵からの距離（bg 側）
    bgcore = bg & (dout >= 2.5)
    fgcore = fg & (din >= 2.5)
    nb, db = nconv(C, bgcore, 4.0)
    B = nb / np.maximum(db, 1e-6)[..., None]
    gB = np.median(C[bgcore], axis=0)
    B[db < 1e-3] = gB
    # 線の色 F: 境目の近くの「絵の側」の画素を、暗いものほど重く平均する
    # （輪郭線が細い所でも、線の内側の白や塗りを F に混ぜないため）
    lum = C @ np.array([0.299, 0.587, 0.114])
    wdark = fg * ((255 - lum) / 255) ** 4
    nf, df = nconv(C, wdark, 1.2)
    F = nf / np.maximum(df, 1e-9)[..., None]
    nf2, df2 = nconv(C, fg, 2.5)
    F2 = nf2 / np.maximum(df2, 1e-9)[..., None]
    weak = df < 1e-4
    F[weak] = F2[weak]

    band = (fg & (din <= 3.0)) | (bg & (dout <= 1.5))
    alpha = fg.astype(float)
    FB = F - B
    den = (FB * FB).sum(2)
    a = ((C - B) * FB).sum(2) / np.maximum(den, 1e-6)
    a = np.clip(a, 0, 1)
    ok = band & (np.sqrt(den) >= min_contrast)
    alpha[ok] = a[ok]
    # 内へ向かって alpha は下がらない。輪郭線の内側の白（飛行機の胴など）を
    # 「地と同じ色」として抜かないよう、外側の画素の alpha を内へ持ち上げる
    levels = np.unique(din[fg & (din <= 3.0)])
    for lv in levels:
        m = fg & (din == lv)
        src = np.where(din < lv, alpha, 0.0)
        alpha[m] = np.maximum(alpha[m], ndi.maximum_filter(src, size=3)[m])
    # 2px より内側は必ず不透明（境目は 1〜2px に収める）
    alpha[fg & (din >= 2.5)] = 1.0
    # 地の側で薄く残るのは JPEG のにじみ。切る
    alpha[bg & (alpha < 0.12)] = 0.0
    alpha[alpha >= 0.96] = 1.0

    # 色を戻す: C = a F + (1-a) B → F' = B + (C-B)/a
    out = C.copy()
    part = (alpha > 0) & (alpha < 1)
    ap = alpha[part][:, None]
    dec = B[part] + (C[part] - B[part]) / ap
    dec = np.clip(dec, 0, 255)
    w = np.clip((ap - 0.2) / 0.5, 0, 1)
    out[part] = w * dec + (1 - w) * F[part]
    return alpha, out, F, B


def drop_specks(alpha, max_a=0.5, min_area=4):
    lab, n = ndi.label(alpha > 0, structure=np.ones((3, 3)))
    if n == 0:
        return alpha
    mx = ndi.maximum(alpha, lab, np.arange(1, n + 1))
    area = ndi.sum(alpha > 0, lab, np.arange(1, n + 1))
    kill = np.zeros(n + 1, bool)
    kill[1:] = (mx <= max_a) | (area < min_area)
    alpha = alpha.copy()
    alpha[kill[lab]] = 0
    return alpha


def finish(C, out, alpha):
    a8 = np.round(alpha * 255).astype(np.uint8)
    rgb = np.clip(np.round(out), 0, 255).astype(np.uint8)
    full = a8 == 255
    rgb[full] = C[full].astype(np.uint8)  # 不透明は元の画素そのもの
    # 透明画素の色は、いちばん近い見えている画素の色にしておく（縮小時に白が混ざらないように）
    vis = a8 > 0
    idx = ndi.distance_transform_edt(~vis, return_distances=False, return_indices=True)
    rgb[~vis] = rgb[idx[0][~vis], idx[1][~vis]]
    return np.dstack([rgb, a8])


def trapped_bg(C, light, surround=0.85, chroma=14.0, min_area=20):
    """**外と繋がっていない地**を見つける（髪の房が輪になって閉じ込めた白）。

    外周からの塗りつぶしは、どこかで外と繋がっている白しか抜けない。
    長い髪の絵は房が交差して白い楔を閉じ込めるので、そのままだと
    **髪の中に白い楔が何十か所も残る。** 縮めて眺めると髪の艶に見えるので
    気づきにくい（2026-10-18、住人1人の絵で 38 か所・17,709画素）。

    体の白（帽子・エプロン・靴下・髪に付いた星・リボンの白）と見分けるのは、
    **囲っているものが髪色だけか**と、**色味が無いか**の2つ。星やリボンの
    白は周りに青や金が混ざり、色も暖かい（赤 − 青が 15 以上）。

    Args:
        C: RGB の float 配列
        light: 地とみなせる明るさの画素（`flood_bg` の2つ目）
        surround: 囲いのうち髪色が占める割合の下限
        chroma: これ以上色味があるものは体の白とみなして残す
        min_area: これより小さい塊は見ない

    Returns:
        閉じ込められた地の mask
    """
    lab, n = ndi.label(light, structure=np.ones((3, 3)))
    if not n:
        return np.zeros(light.shape, bool)
    edge = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    edge = set(int(x) for x in edge if x > 0)
    R, G, B = C[..., 0], C[..., 1], C[..., 2]
    lum = C @ np.array([0.299, 0.587, 0.114])
    hair = (R >= B + 12) & (R >= G + 4) & (lum < 215)
    out = np.zeros(light.shape, bool)
    for i, sl in enumerate(ndi.find_objects(lab), start=1):
        if i in edge or sl is None:
            continue
        pad = tuple(slice(max(0, s.start - 8), min(d, s.stop + 8))
                    for s, d in zip(sl, light.shape))
        m = lab[pad] == i
        if m.sum() < min_area:
            continue
        ring = ndi.binary_dilation(
            m, ndi.generate_binary_structure(2, 2), iterations=5) & ~m & ~light[pad]
        if ring.sum() < 10:
            continue
        col = C[pad][m].mean(0)
        if hair[pad][ring].mean() >= surround and col.max() - col.min() < chroma:
            out[pad] |= m
    return out


def cut(C, tchroma=40.0, min_island=1500, min_contrast=40.0, gaps=False):
    """C は RGB の float 配列。RGBA の uint8 配列を返す"""
    bg, light = flood_bg(C, tmin=200, tchroma=tchroma, close=1)
    if gaps:
        bg = bg | trapped_bg(C, light)
    fg = ~bg
    # 輪郭線の外に落ちている小さな描きこみ（🃏 の帽子と角のすき間の薄い線など）は捨てる
    lab, n = ndi.label(fg, structure=np.ones((3, 3)))
    if n:
        area = ndi.sum(fg, lab, np.arange(1, n + 1))
        keep = np.zeros(n + 1, bool)
        keep[1:] = area >= min_island
        bg = bg | (fg & ~keep[lab])
    alpha, out, _, _ = soft_edge(C, bg, min_contrast=min_contrast)
    alpha = drop_specks(alpha)
    return finish(C, out, alpha)


def report(C, rgba):
    """確かめる数。外周・全体の透明、不透明部分が元と同じか、境目に白が残っていないか"""
    a = rgba[..., 3]
    ring = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
    op = a == 255
    diff = int(np.abs(rgba[..., :3][op].astype(int) - C[op].astype(int)).max()) if op.any() else 0
    edge = (a > 0) & (ndi.distance_transform_edt(a > 0) <= 3)
    px = rgba[..., :3][edge].astype(int)
    whiteish = int(((px.min(1) >= 235) & ((px.max(1) - px.min(1)) / 255 < 0.15)).sum())
    print(f"外周の透明 {(ring == 0).mean() * 100:.1f}% / 全体の透明 {(a == 0).mean() * 100:.1f}% / "
          f"不透明部分の元画素との差 最大 {diff} / 境目3px の白っぽい画素 {whiteish} / {int(edge.sum())}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("out")
    ap.add_argument("--tchroma", type=float, default=40.0, help="地とみなす色の薄さ。JPEG のにじみが多い絵は 28 くらいに下げる")
    ap.add_argument("--min-island", type=int, default=1500, help="これより小さい離れ小島は捨てる（px）。小さい絵は下げる")
    ap.add_argument("--min-contrast", type=float, default=40.0)
    ap.add_argument("--gaps", action="store_true",
                    help="外と繋がっていない地（長い髪が閉じ込めた白い楔）も抜く。"
                         "**抜いたあと必ず目で見る**（体の白を巻き込んでいないか）")
    o = ap.parse_args()
    C = np.asarray(Image.open(o.src).convert("RGB")).astype(float)
    rgba = cut(C, o.tchroma, o.min_island, o.min_contrast, o.gaps)
    Image.fromarray(rgba, "RGBA").save(o.out, optimize=True)
    report(C, rgba)
