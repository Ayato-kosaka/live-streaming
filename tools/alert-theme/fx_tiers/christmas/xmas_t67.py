"""12月の段6・段7 だけが使う部品（段3〜5 は xmas_t345.py、共通は xmas_kit.py）。

段6・段7 は、滞在のあいだもキャラ絵の後ろに全面の景色を残す（11月の城の段6・段7 と同じ）。
景色は「人の居ない背景の1枚」（`fx_art/christmas/t<段>/plate.webp`。どこから来た絵かは各段の台本に書く）。
箱の縁のぼかしは城と同じ（box_edge 60/60/120/80）で、内側は不透明。
"""
import math

import cv2
import numpy as np

import fx_stage as fs
from fx_stage import GOLD, H, W, WHITE, ease_out, glow


def load_plate(path, focus_y=0.5):
    """背景の1枚を、箱（720×1280）いっぱいに cover で敷いた前掛けの絵（不透明）にする。
    縦横比が違うぶんは、左右（または上下）を真ん中から切る。focus_y は上下を切るときの寄せ（0 で上を残す）"""
    rgba = fs.load_rgba(path)
    ih, iw = rgba.shape[:2]
    s = max(W / iw, H / ih)
    nw, nh = max(W, round(iw * s)), max(H, round(ih * s))
    im = cv2.resize(rgba, (nw, nh), interpolation=cv2.INTER_AREA if s < 1 else cv2.INTER_CUBIC)
    x0 = (nw - W) // 2
    y0 = int(round((nh - H) * focus_y))
    im = im[y0:y0 + H, x0:x0 + W].copy()
    im[..., :3] = im[..., :3] / np.maximum(im[..., 3:4], 1e-4)
    im[..., 3] = 1.0
    return im.astype(np.float32)


def put_plate(cv, plate, a):
    """背景の1枚を、濃さ a（(H,W) か (H,1) の 0〜1）で敷く"""
    a = np.broadcast_to(np.asarray(a, np.float32), (H, W)) if np.ndim(a) else np.full((H, W), float(a), np.float32)
    cv.over((plate[..., :3] * a[..., None]).astype(np.float32), a.astype(np.float32))


def firework(sp, cv, x, y, age, seed, col, k, n=56, spd=(140.0, 220.0), life=1.1):
    """花火1発: 光の粒が丸く開いて、少し落ちながら消える（粒は5つの遅れで尾を引く）"""
    if not (0 <= age < life) or k <= 0.003:
        return
    R = np.random.default_rng(seed)
    ang = 2 * np.pi * (np.arange(n) + R.random(n) * 0.5) / n
    v = spd[0] + (spd[1] - spd[0]) * R.random(n)
    for lag in (0.0, 0.035, 0.07, 0.105, 0.14):
        ag = max(age - lag, 0.0)
        e = 1 - (1 - min(ag / (life * 0.82), 1.0)) ** 3
        xs = x + np.cos(ang) * v * e
        ys = y + np.sin(ang) * v * e * 0.9 + 70 * ag * ag
        b = (1 - age / life) ** 1.5 * (1 - lag / 0.18) * k
        sp.add_screen(xs, ys, col[None] * np.full((n, 1), 2.2 * b, np.float32), coc=np.full(n, 1.0))
        if lag == 0.0:
            sp.add_screen(xs, ys, col[None] * np.full((n, 1), 5.0 * b, np.float32), coc=np.full(n, 3.0))
    if age < 0.25:
        glow(cv, x, y, 46, col * 0.8 + WHITE * 0.3, 0.9 * (1 - age / 0.25) ** 2 * k)


def shooting_star(kit, cv, sp, x0, y0, ang, length, age, k, dur=0.7, col=None):
    """流れ星1つ: 頭の星が (x0, y0) から ang（度）の向きへ length px 走り、尾を引いて消える（age 秒）"""
    if not (0 <= age < dur) or k <= 0.003:
        return
    col = WHITE * 1.2 + GOLD * 0.4 if col is None else col
    p = ease_out(age / dur)
    ca, sa = math.cos(math.radians(ang)), math.sin(math.radians(ang))
    tail = np.linspace(0, 0.35, 160)
    q = np.clip(p - tail, 0, 1)
    xs, ys = x0 + ca * length * q, y0 + sa * length * q
    fade = (1 - tail / 0.35) ** 1.5 * (p - tail > 0) * math.sin(math.pi * min(1.0, age / dur)) ** 0.5
    sp.add_screen(xs, ys, col[None] * (fade * 1.6 * k)[:, None], coc=np.full(len(xs), 1.0))
    sp.add_screen(xs[::2], ys[::2], col[None] * (fade[::2] * 4.0 * k)[:, None], coc=np.full(len(xs[::2]), 3.0))
    hb = math.sin(math.pi * min(1.0, age / dur)) ** 0.6 * k
    fs.fxv.stamp(cv.L, kit.star["white"], float(xs[0]), float(ys[0]), hb)


def plate_lights(plate):
    """背景の1枚の中の、灯り（暖かく明るい小さな点）の覆い。窓・街灯・電飾をまたたかせるのに使う"""
    return fs.window_mask(plate)
