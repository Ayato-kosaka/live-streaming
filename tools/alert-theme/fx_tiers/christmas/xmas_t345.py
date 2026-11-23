"""12月の段3〜5 の台本で共通に使う部品（星空の粒・流れ星・星の閃き・描いた背景の板）。

xmas_kit.py の関数は段1〜6 が使っているので変えずに、段3〜5 の見直し（2026-11-23。あやと「500円がちょいショボい」
「1,000以上の演出も11月に比べてショボくない？」）で要ったものをここへ足す。段6・7 の分は xmas_t67.py。
段の名前（t<段>_）を持たないので、ここを直して push すると 12月の段が全部焼き直される（fx_ci/run.py の plan）。
"""
import math

import cv2
import numpy as np

from fx_stage import GOLD, H, W, WHITE, ease_out, fxv, glow


class StarSky:
    """夜空の星（瞬く小さな点と、十字のきらめき）。光と粒だけなので front に置ける。
    位置は乱数で決めて動かさず、瞬きは滞在の位相（c.ph）の周期で書く（継ぎ目でつながる）"""

    def __init__(self, seed, n=140, n_big=18, y0=20, y1=1100):
        R = np.random.default_rng(seed)
        self.pts = np.stack([20 + R.random(n) * (W - 40), y0 + R.random(n) ** 1.15 * (y1 - y0),
                             R.random(n), R.random(n), R.random(n)], -1)
        self.big = np.stack([40 + R.random(n_big) * (W - 80), y0 + R.random(n_big) ** 1.2 * (y1 - y0) * 0.85,
                             R.random(n_big), R.random(n_big)], -1)

    def draw(self, c, kit, cv, sp, k, wave=None):
        """wave: (x, y, 経過秒)。星の閃きから光の波が広がり、波が届いた星がぱっと明るむ（一度きり。1.2秒で消える）"""
        if k <= 0.003:
            return
        p = self.pts
        tw = (0.5 + 0.5 * np.sin(2 * np.pi * (c.ph * (1 + (p[:, 2] * 3).astype(int)) + p[:, 3]))) ** 3
        kk = (0.12 + 0.6 * tw * (0.4 + 0.6 * p[:, 4])) * k
        if wave is not None and 0 <= wave[2] < 1.2:
            d = np.hypot(p[:, 0] - wave[0], p[:, 1] - wave[1])
            kk = kk + 1.3 * np.exp(-((d - wave[2] * 900) / 70) ** 2) * k
        sp.add_screen(p[:, 0], p[:, 1], (WHITE * 1.1)[None] * kk[:, None])
        for j, (x, y, r0, r1) in enumerate(self.big):
            b = 0.2 + 0.7 * max(0.0, math.sin(2 * math.pi * (c.ph * (1 + int(r0 * 2)) + r1))) ** 4
            if wave is not None and 0 <= wave[2] < 1.2:
                b += 1.0 * math.exp(-((math.hypot(x - wave[0], y - wave[1]) - wave[2] * 900) / 80) ** 2)
            if b * k > 0.02:
                fxv.stamp(cv.L, kit.star["white" if j % 3 else "gold"], x, y, b * k)


def shooting_star(kit, cv, sp, x0, y0, ang_deg, length, age, dur, k, head="white"):
    """流れ星1本。age 0→dur で、頭が (x0, y0) から ang の向きへ length 進む。尾は頭の後ろに細く伸びて消える"""
    if not (0 <= age < dur) or k <= 0.003:
        return
    p = age / dur
    a = math.radians(ang_deg)
    dx, dy = math.cos(a), math.sin(a)
    hd = ease_out(p) * length
    tl = np.linspace(0, max(1.0, min(hd, 0.42 * length)), 90)
    x, y = x0 + dx * (hd - tl), y0 + dy * (hd - tl)
    fade = (1 - tl / (0.42 * length + 1e-6)) ** 1.5
    e = math.sin(math.pi * p) ** 0.6 * k
    sp.add_screen(x, y, (WHITE * 1.2 + GOLD * 0.4)[None] * (fade * 1.2 * e)[:, None], coc=np.full(len(x), 1.0))
    sp.add_screen(x[::3], y[::3], (GOLD * 0.5 + WHITE * 0.5)[None] * (fade[::3] * 3.0 * e)[:, None], coc=np.full(len(x[::3]), 2.6))
    fxv.stamp(cv.L, kit.star[head], float(x[0]), float(y[0]), 0.95 * e)


def shooting_stars(c, kit, cv, sp, plan, period, k):
    """流れ星の並び（滞在の輪でくり返す）。plan は (起きる秒, x0, y0, 向き, 長さ, 長さの秒) の並び。
    秒は登場の頭から数え、period（滞在の長さ）ごとにくり返す"""
    for t0, x0, y0, ang, ln, dur in plan:
        for age, _ in c.events(t0, period, first=t0, dur=dur):
            shooting_star(kit, cv, sp, x0, y0, ang, ln, age, dur, k)


def star_burst(kit, cv, sp, x, y, age, k, seed, n=30, reach=380, rays=10, ring=True):
    """星が灯る瞬間の閃き（age は秒。一度きり）: 真ん中の閃光・放射の光の筋・広がる光の輪・四方へ飛ぶきらめき"""
    if not (0 <= age < 1.4) or k <= 0.003:
        return
    R = np.random.default_rng(seed)
    q = age / 1.4
    fl = math.exp(-((age - 0.03) / 0.09) ** 2)
    if fl > 0.01:
        fxv.stamp(cv.L, kit.flare_s, x, y, 0.75 * fl * k)
        glow(cv, x, y, 40, GOLD * 0.8 + WHITE * 0.6, 0.9 * fl * k)
    # 放射の光の筋（点の並びをにじませる。細く、根もとが明るい）
    if age < 0.7:
        e = (1 - age / 0.7) ** 1.6 * k
        L = 60 + 260 * ease_out(age / 0.5)
        for j in range(rays):
            a = 2 * math.pi * (j + 0.3 * R.random()) / rays
            t = np.linspace(14, L * (0.7 + 0.3 * R.random()), 60)
            sp.add_screen(x + np.cos(a) * t, y + np.sin(a) * t * 0.9,
                          (GOLD * 1.0 + WHITE * 0.7)[None] * ((1 - t / (L + 1)) ** 1.3 * 1.1 * e)[:, None], coc=np.full(60, 1.2))
    # 広がる光の輪（金の粒の輪）
    if ring and age < 0.9:
        rr = 20 + reach * 0.8 * ease_out(age / 0.9)
        m = 90
        a = np.linspace(0, 2 * math.pi, m, endpoint=False) + R.random() * 0.1
        e = (1 - age / 0.9) ** 1.5 * k
        sp.add_screen(x + np.cos(a) * rr, y + np.sin(a) * rr * 0.85, (GOLD * 1.2 + WHITE * 0.5)[None] * np.full((m, 1), 0.9 * e),
                      coc=np.full(m, 1.8))
    # 四方へ飛ぶきらめき（少し上へ浮きながら、瞬いて消える）
    for j in range(n):
        a = 2 * math.pi * (j + R.random() * 0.7) / n
        d = (20 + reach * (0.45 + 0.55 * R.random())) * ease_out(min(1.0, age / 0.9))
        yy = y + math.sin(a) * d * 0.85 - 40 * q
        tw = 0.6 + 0.4 * math.sin(2 * math.pi * (age * (3 + 3 * R.random()) + R.random()))
        kk = (1 - q) ** 1.3 * tw * k
        if kk > 0.02:
            fxv.stamp(cv.L, kit.star[("gold", "white", "gold", "cyan")[j % 4]], x + math.cos(a) * d, yy, 0.9 * kk)


def plate_layer(plate, x0, y0, s, rot=0.0, blur=0.0):
    """描いた背景の板（前掛けの RGBA, 絵の座標）を、絵の (0,0) が画面の (x0, y0) に来るよう s 倍で写す。
    返す: (前掛けの RGB, 透明)。画面の外へはみ出た所は捨てる。blur は画面の px のぼけ"""
    M = np.float32([[s, 0, x0], [0, s, y0]])
    out = cv2.warpAffine(plate, M, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
    if blur > 0.5:
        out = cv2.GaussianBlur(out, (0, 0), blur)
    return np.ascontiguousarray(out[..., :3]), np.ascontiguousarray(out[..., 3])


def plate_emit(cv, win, x0, y0, s, on, k, col=None, small=2):
    """描いた背景の板の灯り（window_mask）を、on(yy, xx)（0〜1 の格子。絵の割合）の濃さで光らせる。
    絵の (0,0) が画面の (x0, y0)・s 倍（plate_layer と同じ写し方）。small: 灯りの格子を何分の1で計算するか（軽くする）"""
    if k <= 0.003:
        return
    w = win[::small, ::small]
    ih, iw = w.shape
    yy = np.linspace(0, 1, ih, dtype=np.float32)[:, None]
    xx = np.linspace(0, 1, iw, dtype=np.float32)[None, :]
    col = GOLD * 0.9 + WHITE * 0.45 if col is None else col
    em = (w * on(yy, xx))[..., None] * col * 0.75 * k
    ss = s * small
    M = np.float32([[ss, 0, x0], [0, ss, y0]])
    cv.L += cv2.warpAffine(em.astype(np.float32), M, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
