"""12月の段の台本で共通に使う部品（段3・段4 で作って、段1・2・5・6 で使い回すもの）。

段の名前（t<段>_）を持たないので、ここを直して push すると 12月の段が全部焼き直される（fx_ci/run.py の plan）。
"""
import math

import numpy as np

from fx_stage import GOLD, W, WHITE, ease_out, fxv, glow, sprite_top


def pose_point(pose, fx, fy, bottom, ceiling):
    """put_pose で置いた絵の、絵の中の点（割合）が画面のどこに来るか（返すのは put_pose と同じく pose が持つ）"""
    art = pose.art
    sx = -pose.sx if pose.flip else pose.sx
    if pose.spin:
        anchor, y = (0.5, 0.5), bottom - pose.ground - pose.lift - pose.h * 0.5 * pose.sy
    else:
        anchor, y = (0.5, 1.0), bottom - pose.ground - pose.lift
    top = sprite_top(art, pose.h, anchor, pose.rot, abs(sx), pose.sy)
    y = max(y, ceiling + top)
    sc = pose.h / art.h
    dx, dy = (fx - anchor[0]) * art.w * sc, (fy - anchor[1]) * art.h * sc
    c_, s_ = math.cos(math.radians(pose.rot)), math.sin(math.radians(pose.rot))
    return pose.x + c_ * sx * dx - s_ * pose.sy * dy, y + s_ * sx * dx + c_ * pose.sy * dy


def burst(cv, kit, x, y, age, seed, n=12, spread=46, cols=("gold", "white"), k=1.0):
    """光の粒がはじける（age 0→1）"""
    if not (0 <= age < 1):
        return
    R = np.random.default_rng(seed)
    for j in range(n):
        ang = 2 * math.pi * (j + R.random() * 0.6) / n
        d = (10 + spread * (0.6 + 0.4 * R.random())) * ease_out(age)
        fxv.stamp(cv.L, kit.star[cols[j % len(cols)]], x + math.cos(ang) * d, y + math.sin(ang) * d * 0.85,
                  0.9 * (1 - age) ** 1.3 * k)
    glow(cv, x, y, 18, GOLD * 0.6 + WHITE * 0.4, 0.3 * (1 - age) ** 2 * k)


def soft_dot(r, col=None):
    """雪の粒・光の粒（やわらかい丸。真ん中が 1 の光の絵）"""
    n = int(r * 6) + 3
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float32) - (n - 1) / 2
    g = np.exp(-(xx * xx + yy * yy) / (r * r))
    col = WHITE * np.float32([0.95, 0.98, 1.05]) if col is None else col
    return (g[..., None] * col).astype(np.float32)


def snowfall(c, layers, amb):
    """箱ぜんぶに降る雪。layers は (Loop, 絵, 濃さ, 落ちる px, ゆれ px, 足す面, y の上の端) の並び。
    Loop の周期で書くので、滞在の継ぎ目でつながる"""
    for g, spr, k_, fall, sway, cv, y0 in layers:
        a = g.age(c)
        x = g.r[:, 0] * W + sway * np.sin(6.283 * (a * 2 + g.r[:, 1]))
        y = y0 + a * fall
        kd = np.sin(np.pi * a) ** 0.4 * (0.6 + 0.4 * g.r[:, 2]) * k_ * amb
        for j in range(g.n):
            if kd[j] > 0.01:
                fxv.stamp(cv.L, spr, float(x[j]), float(y[j]), float(kd[j]))


def trail(kit, cv, sp, x, y, fade, k, head="gold", core=1.6, halo=9.0):
    """太く明るい光の筋1本（芯・にじみ・道々の星・頭の大きな星）。x, y は頭から尾へ"""
    if k <= 0.003 or len(x) == 0:
        return
    sp.add_screen(x, y, (GOLD * 1.5 + WHITE * 0.8)[None] * (fade * core * k)[:, None], coc=np.full(len(x), 1.2))
    sp.add_screen(x[::2], y[::2], (GOLD * 1.3 + WHITE * 0.2)[None] * (fade[::2] * halo * k)[:, None],
                  coc=np.full(len(x[::2]), 3.0))
    for i in range(0, len(x) // 2, 40):
        fxv.stamp(cv.L, kit.star["gold" if i else "white"], float(x[i]), float(y[i]), 0.7 * k * float(fade[i]))
    fxv.stamp(cv.L, kit.star_big[head], float(x[0]), float(y[0]), 1.0 * k)
    glow(cv, float(x[0]), float(y[0]), 18, GOLD * 0.8 + WHITE * 0.4, 0.5 * k)


def emit_masked(cv, win, dst, on, k, col=None):
    """描かれた灯り（window_mask）を、on(yy, xx)（0〜1 の格子）の濃さで、絵を置いた所（dst の4隅）に光らせる"""
    import fx_stage as fs
    if dst is None or k <= 0.003:
        return
    ih, iw = win.shape
    yy = np.linspace(0, 1, ih, dtype=np.float32)[:, None]
    xx = np.linspace(0, 1, iw, dtype=np.float32)[None, :]
    col = GOLD * 0.9 + WHITE * 0.45 if col is None else col
    em = (win * on(yy, xx))[..., None] * col * 0.75 * k
    r = fs.warp_into(em.astype(np.float32), np.float32([[0, 0], [iw, 0], [iw, ih], [0, ih]]), dst)
    if r is not None:
        im, ox, oy = r
        cv.emit(im[..., :3], ox, oy)


def lip_of(art_rgba, top, bot):
    """絵の、縦の割合 top〜bot の帯だけを残した RGBA（入れ物の口の手前を、主役の上に重ねるのに使う）"""
    hh = art_rgba.shape[0]
    ys = np.arange(hh, dtype=np.float32)[:, None]
    keep = np.clip((ys - top * hh) / 2.0, 0, 1) * np.clip((bot * hh - ys) / 2.0, 0, 1)
    return np.ascontiguousarray(art_rgba * keep[..., None])



def crystal(r=20):
    """光の雪の結晶（6本の腕に小枝。前掛けの RGB の光）。11月の段3 の雪の結晶と同じ描き方"""
    import cv2
    from fx_stage import CYAN
    n = int(r * 2 + 10)
    img = np.zeros((n, n), np.float32)
    c = n / 2
    for k in range(6):
        a = math.pi / 3 * k + math.pi / 2
        dx, dy = math.cos(a), math.sin(a)
        cv2.line(img, (int(c * 4), int(c * 4)), (int((c + dx * r) * 4), int((c + dy * r) * 4)), 1.0, 4, cv2.LINE_AA, shift=2)
        for f, ln in ((0.55, 0.35), (0.8, 0.22)):
            px, py = c + dx * r * f, c + dy * r * f
            for sgn in (-1, 1):
                b = a + sgn * math.pi / 3
                cv2.line(img, (int(px * 4), int(py * 4)), (int((px + math.cos(b) * r * ln) * 4), int((py + math.sin(b) * r * ln) * 4)),
                         0.9, 3, cv2.LINE_AA, shift=2)
    core = img[..., None] * (WHITE * 1.3 + CYAN * 0.3)
    halo = cv2.GaussianBlur(img, (0, 0), 3.0)[..., None] * (CYAN * 0.5 + WHITE * 0.4)
    return (core + halo * 0.6).astype(np.float32)
