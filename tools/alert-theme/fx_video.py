#!/usr/bin/env python3
"""投げ銭アラートの「光の演出を動画で流す」試しの動画を焼く道具（#1079。試し専用、本番には出さない）。

    python3 tools/alert-theme/fx_video.py render <作業の置き場>            # コマを焼く（7秒・30コマ/秒・720×1280）
    python3 tools/alert-theme/fx_video.py encode <作業の置き場> <書き出し先> [--sizes 720,540]
    python3 tools/alert-theme/fx_video.py sheet  <作業の置き場> <配信画面の置き場> <一覧.png>       # 1秒おきを配信画面に
    python3 tools/alert-theme/fx_video.py checksheet <alpha の置き場> <一覧.png>                     # 地の色を替えた2枚
    python3 tools/alert-theme/fx_video.py scenesheet <scene の置き場> <配信画面の置き場> <一覧.png>  # perf.html の場面を配信画面に

`checksheet` と `scenesheet` は `fx_video_check.mjs` の `alpha` / `scene` が撮ったものを並べる。

何を確かめるための動画か:
TikTok のギフトはほとんどが3Dで描いた**動画**。PR #1088 は動画を「重い」として外したが、その数は
この箱（合成も動画の展開もソフトウェア）のもの。スマホは動画をハードウェアで展開するので、
あやとのスマホ（Android の PRISM）で `/alert/perf` を流して、**何コマ出るか**と**配信に写るか**を取る。

題材: 魔法陣が床に現れて光る → 力が集まる → 光の柱 → ぼけの玉と粒が舞う → 消える（7秒。最後は真っ黒に戻るのでループの継ぎ目が出ない）。

焼き方:
- 光は足し算で溜める（HDR）。最後に、明るい所から広くにじませて（bloom。縮めてぼかす段を5つ）、
  1 - exp(-x) で 0〜1 に落とす。芯が白く飛び、にじみに色が残る
- 床の魔法陣・粒・光の柱は、**同じカメラ**（見下ろし 24°）で3Dから写す。奥の線は細く、手前は太く、
  粒は奥行きでぼけの大きさが変わる
- 魔法陣の絵は PR #1088 の `lux_art.py`（外の文字の輪・内の六芒星）をそのまま使う

書き出すコマは2組:
- `rgba/` … 透明つき（色は前掛けを外したもの）。**光の下に薄い暗さを敷く**（真ん中 0.3、箱の縁で 0）。
  透明つきなら暗くできるので、昼の明るい配信の上でも光が白く溶けない
- `black/` … 黒地（光だけ）。`mix-blend-mode: screen` で重ねる形のため。暗さは敷けない

`encode` で作るもの（大きさごと）:
- `glow-<幅>.webm` … (a) 透明つき VP8（yuva420p・`-auto-alt-ref 0`）
- `glow-<幅>-black.mp4` … (b) 黒地の H.264（screen で重ねる）
- `glow-<幅>-pack.mp4` … (c) 色と透明を左右に並べた H.264（左が色、右が透明の濃さ）。
  SVG のフィルタで右半分を透明に読み替える（`public/alert/perf.html`）。H.264 はスマホで
  ハードウェアが展開でき、透明も正しく抜ける

乱数は種を決めてあるので、何度焼いても同じコマになる。
"""
import argparse
import math
import os
import subprocess
import sys

import cv2
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lux_art  # noqa: E402

W, H = 720, 1280
FPS = 30
DUR = 7.0
N = int(round(DUR * FPS))

# カメラ（床の魔法陣を、少し見下ろして写す）。床の真ん中が画面の (CX, CY) に写る
ELEV = math.radians(24)
DIST = 3.6
FOC = 980.0
CX, CY = 360.0, 905.0
CAM = np.array([0.0, -DIST * math.cos(ELEV), DIST * math.sin(ELEV)])
FWD = np.array([0.0, math.cos(ELEV), -math.sin(ELEV)])
UP = np.array([0.0, math.sin(ELEV), math.cos(ELEV)])

# 色
WHITE = np.array([1.0, 0.96, 0.9], np.float32)
GOLD = np.array([1.0, 0.72, 0.3], np.float32)
AMBER = np.array([1.0, 0.5, 0.16], np.float32)
MAGENTA = np.array([1.0, 0.32, 0.82], np.float32)
PINK = np.array([1.0, 0.5, 0.72], np.float32)
VIOLET = np.array([0.56, 0.34, 1.0], np.float32)
CYAN = np.array([0.42, 0.82, 1.0], np.float32)
SHADE_COL = np.array([0.05, 0.02, 0.1], np.float32)


def ease_out(x):
    x = np.clip(x, 0, 1)
    return 1 - (1 - x) ** 3


def ease_in_out(x):
    x = np.clip(x, 0, 1)
    return x * x * (3 - 2 * x)


def ramp(t, a, b):
    """t が a→b で 0→1（外は止まる）"""
    return float(np.clip((t - a) / (b - a), 0, 1))


def env(t, a, b, c, d):
    """a→b で上がり、c→d で下がる台形"""
    return ease_in_out(ramp(t, a, b)) * (1 - ease_in_out(ramp(t, c, d)))


def project(P):
    """世界の点 (…,3)（Z が上・床が Z=0・魔法陣の半径が 1）→ 画面の (x, y, 奥行き)"""
    d = P - CAM
    zc = d @ FWD
    xc = d[..., 0]
    yc = d @ UP
    zc = np.maximum(zc, 0.2)
    return CX + FOC * xc / zc, CY - FOC * yc / zc, zc


# ------------------------------------------------------------------ 魔法陣の絵（lux_art から）
def grab_rings():
    """lux_art の外の輪・内の輪を、光（にじみ込み）で受け取る。1024px・前掛けの RGB"""
    o_rgb, _ = lux_art.ring_outer(1024)
    i_rgb, _ = lux_art.ring_inner(1024)
    return o_rgb.astype(np.float32), i_rgb.astype(np.float32)


TEX = 1024
TC = (TEX - 1) / 2
_ty, _tx = np.mgrid[0:TEX, 0:TEX].astype(np.float32)
TEX_ANG = np.mod(np.arctan2(_ty - TC, _tx - TC) + math.pi / 2, 2 * math.pi)  # 上（12時）から時計回りに 0→2π
del _ty, _tx


def tex_to_world(u, v, rot, scale, z):
    """絵の座標 → 世界の床（rot だけ回し、scale 倍、高さ z）"""
    X = (u - TC) / (TEX / 2) * scale
    Y = -(v - TC) / (TEX / 2) * scale
    c, s = math.cos(rot), math.sin(rot)
    return np.stack([X * c - Y * s, X * s + Y * c, np.full_like(np.asarray(X, np.float64), z)], -1)


SS_RING = 2  # 魔法陣は2倍で写して縮める（回すと細い線がちらつくので）


def warp_ring(tex, rot, scale, z, out):
    """絵を床に貼って、画面へ写して out に足す"""
    src = np.array([[0, 0], [TEX - 1, 0], [TEX - 1, TEX - 1], [0, TEX - 1]], np.float32)
    P = tex_to_world(src[:, 0].astype(np.float64), src[:, 1].astype(np.float64), rot, scale, z)
    x, y, _ = project(P)
    dst = np.stack([x, y], -1).astype(np.float32)
    x0, y0 = max(0, int(dst[:, 0].min()) - 2), max(0, int(dst[:, 1].min()) - 2)
    x1, y1 = min(W, int(dst[:, 0].max()) + 3), min(H, int(dst[:, 1].max()) + 3)
    if x1 <= x0 or y1 <= y0:
        return
    M = cv2.getPerspectiveTransform(src, ((dst - [x0, y0]) * SS_RING).astype(np.float32))
    big = cv2.warpPerspective(tex, M, ((x1 - x0) * SS_RING, (y1 - y0) * SS_RING), flags=cv2.INTER_LINEAR,
                              borderMode=cv2.BORDER_CONSTANT, borderValue=0)
    out[y0:y1, x0:x1] += cv2.resize(big, (x1 - x0, y1 - y0), interpolation=cv2.INTER_AREA)


def reveal(tex, frac, reverse=False, soft=0.12):
    """12時から時計回り（reverse で反時計回り）に、frac（0〜1）まで描けた絵"""
    if frac >= 1:
        return tex
    ang = (2 * math.pi - TEX_ANG) if reverse else TEX_ANG
    head = frac * (2 * math.pi + soft)
    m = np.clip((head - ang) / soft, 0, 1)
    return tex * m[..., None]


def head_point(frac, radius, reverse, rot, scale, z):
    """描いている先（筆の先）の世界の位置"""
    a = frac * 2 * math.pi
    a = -a if reverse else a
    # 絵の角度（12時から時計回り）→ 絵の座標
    u = TC + math.sin(a) * radius * TEX / 2
    v = TC - math.cos(a) * radius * TEX / 2
    return tex_to_world(np.array(u), np.array(v), rot, scale, z)


# ------------------------------------------------------------------ 粒（点を足して、奥行きでぼかす）
class Splat:
    """奥行きごとに3枚（くっきり・やや・ぼけ）。最後にそれぞれぼかして足す"""

    SIG = (0.85, 2.0, 5.5)

    def __init__(self):
        self.bufs = [np.zeros((3, H * W), np.float32) for _ in self.SIG]

    def add(self, P, rgb, k=1.0, soft=False):
        """P: 世界の点 (n,3)、rgb: (n,3) の明るさ（足し算。1点の明るさの合計）。
        soft なら奥行きに関係なく、ややぼかす（線のように並べる粒）"""
        if len(P) == 0:
            return
        x, y, zc = project(P)
        # 手前ほど大きく明るい（ピントは魔法陣の奥行き）
        rgb = rgb * (k * (DIST / zc) ** 2)[:, None]
        dz = np.abs(1 / zc - 1 / DIST)
        layer = np.where(dz < 0.045, 0, np.where(dz < 0.11, 1, 2))
        if soft:
            layer = np.maximum(layer, 1)
        x0 = np.floor(x).astype(np.int64)
        y0 = np.floor(y).astype(np.int64)
        fx = (x - x0).astype(np.float32)
        fy = (y - y0).astype(np.float32)
        ok = (x0 >= 0) & (x0 < W - 1) & (y0 >= 0) & (y0 < H - 1)
        for li in range(3):
            sel = ok & (layer == li)
            if not sel.any():
                continue
            idx = y0[sel] * W + x0[sel]
            a, b = fx[sel], fy[sel]
            ii = np.concatenate([idx, idx + 1, idx + W, idx + W + 1])
            ww = np.concatenate([(1 - a) * (1 - b), a * (1 - b), (1 - a) * b, a * b])
            c = rgb[sel]
            for ch in range(3):
                self.bufs[li][ch] += np.bincount(ii, weights=ww * np.tile(c[:, ch], 4), minlength=H * W).astype(np.float32)

    def into(self, img):
        for buf, s in zip(self.bufs, self.SIG):
            if not buf.any():
                continue
            im = buf.reshape(3, H, W).transpose(1, 2, 0)
            img += cv2.GaussianBlur(im, (0, 0), s)


def stamp(img, spr, x, y, k):
    """絵（前掛けの RGB）を (x, y) を真ん中に k 倍で足す"""
    h, w = spr.shape[:2]
    x0, y0 = int(round(x - w / 2)), int(round(y - h / 2))
    sx0, sy0 = max(0, -x0), max(0, -y0)
    dx0, dy0 = max(0, x0), max(0, y0)
    dx1, dy1 = min(W, x0 + w), min(H, y0 + h)
    if dx1 <= dx0 or dy1 <= dy0:
        return
    img[dy0:dy1, dx0:dx1] += spr[sy0:sy0 + dy1 - dy0, sx0:sx0 + dx1 - dx0] * k


def bokeh_sprite(r, col, soft=1.6):
    """ぼけの玉（ふちが少し明るい円。中はやわらかく）。soft はふちのぼけ幅（px）"""
    n = int(r * 2 + 6)
    y, x = np.mgrid[0:n, 0:n].astype(np.float32)
    d = np.hypot(x - (n - 1) / 2, y - (n - 1) / 2) / r
    edge = np.clip((1 - d) * r / soft, 0, 1)
    body = 0.55 + 0.25 * (1 - d ** 2)
    rim = np.exp(-((d - 0.9) / 0.07) ** 2) * 0.55
    k = (body + rim) * edge
    return k[..., None] * col[None, None, :]


def star_sprite(n, col):
    """4方向に光る星（lux_art の sparkle を縮めて）"""
    s = lux_art.sparkle(128, col.astype(np.float64)).astype(np.float32)
    return cv2.resize(s, (n, n), interpolation=cv2.INTER_AREA)


def flare_sprite(n):
    f = lux_art.flare(256).astype(np.float32)
    return cv2.resize(f, (n, n), interpolation=cv2.INTER_AREA)


# ------------------------------------------------------------------ 仕上げ
def bloom(img):
    """明るい所を、縮めながらぼかして足す（5段）。にじみの広さが段ごとに倍になる"""
    b = np.maximum(img - 0.25, 0)
    levels = []
    cur = b
    for _ in range(6):
        cur = cv2.resize(cur, (max(1, cur.shape[1] // 2), max(1, cur.shape[0] // 2)), interpolation=cv2.INTER_AREA)
        cur = cv2.GaussianBlur(cur, (0, 0), 1.2)
        levels.append(cur)
    w = [0.42, 0.42, 0.4, 0.38, 0.34, 0.3]
    acc = levels[-1] * w[-1]
    for lv, wt in zip(reversed(levels[:-1]), reversed(w[:-1])):
        acc = cv2.resize(acc, (lv.shape[1], lv.shape[0]), interpolation=cv2.INTER_LINEAR)
        acc = cv2.GaussianBlur(acc, (0, 0), 0.8) + lv * wt
    return cv2.resize(acc, (W, H), interpolation=cv2.INTER_LINEAR)


def tonemap(img):
    """足し算で溜めた光 → 0〜1。明るい所は白へ寄せる（光が飛んで見える）"""
    lum = img.max(axis=-1, keepdims=True)
    hot = np.clip((lum - 1.2) / 3.0, 0, 1)
    img = img + hot * 0.7 * (lum - img)
    return 1 - np.exp(-img * 1.05)


# ------------------------------------------------------------------ 場面
class Scene:
    def __init__(self):
        R = np.random.default_rng(1079)
        self.R = R
        print("魔法陣の絵を焼く（lux_art）…", flush=True)
        self.outer, self.inner = grab_rings()
        self.outer *= 0.8
        self.inner *= 0.85
        # 光の柱の流れ（縦に伸びた筋。上へ流す）
        nz = R.random((512, 96)).astype(np.float32)
        nz = gaussian_filter(nz, (22, 1.4), mode="wrap")
        nz = (nz - nz.mean()) / (nz.std() + 1e-6)
        self.pillar_noise = nz
        self.flare = flare_sprite(360)
        self.stars = {c: star_sprite(n, col) for c, col in (("g", GOLD), ("p", PINK), ("v", VIOLET), ("c", CYAN)) for n in (40,)}
        self.star_big = star_sprite(96, GOLD)
        yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
        self.yy, self.xx = yy, xx
        # 暗さ（透明つきだけ）。魔法陣のまわりを中心に、箱の縁で 0
        e = np.minimum.reduce([xx, W - 1 - xx, yy, H - 1 - yy]) / 70.0
        edge = np.clip(e, 0, 1) ** 1.5
        g = np.exp(-(((xx - CX) / 430) ** 2 + ((yy - (CY - 120)) / 470) ** 2))
        self.shade_map = (g * edge).astype(np.float32)
        # 光も箱の縁で 0 に溶かす。ウィジェットは画面いっぱいではないので、縁で切れた光の柱や玉が
        # 四角い切り口に見える（2026-11-02 配信画面に重ねて見た）。上は柱が抜けていくので広めに
        fade = lambda d, w: ease_in_out(np.clip(d / w, 0, 1))
        self.light_edge = (fade(np.minimum(xx, W - 1 - xx), 70) * fade(yy, 300) * fade(H - 1 - yy, 70)).astype(np.float32)
        self._mk_particles()
        self._mk_bokeh()

    # ---------------- 粒の素
    def _mk_particles(self):
        R = self.R
        # 前兆: 床から昇るほのかな粒
        n = 140
        a = R.random(n) * 2 * math.pi
        r = np.sqrt(R.random(n)) * 1.5
        self.mote = dict(x=np.cos(a) * r, y=np.sin(a) * r, ts=R.random(n) * 1.6, life=1.0 + R.random(n) * 0.9,
                         vz=0.25 + R.random(n) * 0.45, col=np.where(R.random(n)[:, None] < 0.5, VIOLET, GOLD) * (0.6 + R.random(n)[:, None] * 0.6))
        # 筆の先から散る火の粉（外の輪・内の輪）
        self.trail = []
        for which, cnt in (("o", 520), ("i", 360)):
            self.trail.append(dict(which=which, u=R.random(cnt), life=0.3 + R.random(cnt) * 0.6,
                                   v=np.stack([(R.random(cnt) - 0.5) * 0.6, (R.random(cnt) - 0.5) * 0.6, 0.3 + R.random(cnt) * 1.1], -1),
                                   col=np.where(R.random(cnt)[:, None] < 0.75, GOLD, WHITE) * (1.2 + R.random(cnt)[:, None])))
        # 集まる: 外から渦を巻いて真ん中へ
        n = 620
        a0 = R.random(n) * 2 * math.pi
        r0 = 1.2 + R.random(n) * 1.9
        # 手前（カメラ側）から来る粒は、カメラに近づきすぎて大きなにじみになるので、手前は浅く
        r0 = np.where(np.sin(a0) < 0, np.minimum(r0, 1.7 / np.maximum(-np.sin(a0), 0.3)), r0)
        self.gather = dict(ts=1.85 + R.random(n) * 0.75, dur=0.35 + R.random(n) * 0.4, r0=r0,
                           a0=a0, z0=0.05 + R.random(n) ** 1.5 * 2.3,
                           col=np.where(R.random(n)[:, None] < 0.7, GOLD, np.where(R.random(n)[:, None] < 0.5, WHITE, MAGENTA)) * (1.0 + R.random(n)[:, None] * 1.2))
        # はじける: 根元から外と上へ
        n = 900
        ang = R.random(n) * 2 * math.pi
        vh = 0.4 + R.random(n) ** 1.3 * 3.2
        vz = 0.2 + R.random(n) ** 0.8 * 4.2
        self.burst = dict(t0=2.95 + R.random(n) * 0.14, v=np.stack([np.cos(ang) * vh, np.sin(ang) * vh, vz], -1),
                          life=0.8 + R.random(n) * 1.6, ph=R.random(n) * 6.28, fq=3 + R.random(n) * 6,
                          col=np.select([R.random(n)[:, None] < 0.55, R.random(n)[:, None] < 0.5], [GOLD, WHITE], MAGENTA) * (1.2 + R.random(n)[:, None] * 1.5))
        # 柱に巻きつく2本の螺旋
        n = 170
        self.helix = dict(t0=np.concatenate([2.95 + np.arange(n) / n * 1.5] * 2), strand=np.repeat([0, 1], n),
                          col=np.concatenate([np.tile(WHITE * 1.1 + GOLD * 0.6, (n, 1)), np.tile(MAGENTA * 1.0 + VIOLET * 0.5, (n, 1))]))
        # 舞う: 柱からはじけて、空間いっぱいに漂う
        n = 1100
        ang = R.random(n) * 2 * math.pi
        rt = 0.35 + np.sqrt(R.random(n)) * 2.3
        self.glit = dict(t0=2.95 + R.random(n) * 0.35, ang=ang, rt=rt, z=0.05 + R.random(n) ** 0.9 * 2.6,
                         sway=R.random(n) * 6.28, fq=0.8 + R.random(n) * 3.5, ph=R.random(n) * 6.28,
                         out=5.5 + R.random(n) * 1.35, k=0.5 + R.random(n) ** 2 * 1.8,
                         col=np.select([R.random(n)[:, None] < 0.36, R.random(n)[:, None] < 0.35, R.random(n)[:, None] < 0.5],
                                       [GOLD, WHITE * 0.95, PINK], VIOLET * 0.8 + CYAN * 0.3))
        self.glit_star = np.argsort(-self.glit["k"])[:70]
        # 魔法陣のふちから立つ光の幕（細い縦の筋）
        n = 120
        self.curtain = dict(a=np.arange(n) / n * 2 * math.pi + R.random(n) * 0.03, h=0.18 + R.random(n) * 0.35,
                            fq=1.5 + R.random(n) * 3, ph=R.random(n) * 6.28)

    def _mk_bokeh(self):
        R = self.R
        cols = [PINK, GOLD, VIOLET, MAGENTA, CYAN * 0.9 + WHITE * 0.1]
        self.bokeh = []
        # 手前の大きな玉（薄く、ふちもぼける）8・中くらい 28・小さな玉 14
        for i, kind in enumerate(["near"] * 8 + ["mid"] * 28 + ["small"] * 14):
            col = cols[R.integers(len(cols))] * 0.85 + WHITE * 0.15
            if kind == "near":
                r, k, soft = 46 + R.random() * 38, 0.06 + R.random() * 0.07, 10 + R.random() * 8
            elif kind == "mid":
                r, k, soft = 10 + R.random() * 15, 0.22 + R.random() * 0.32, 1.8
            else:
                r, k, soft = 4 + R.random() * 5, 0.45 + R.random() * 0.5, 1.4
            t0 = 2.95 + R.random() * (0.3 if i % 3 else 2.0)
            ang = R.random() * 2 * math.pi
            dist = 60 + R.random() * (440 if kind == "near" else 330)
            self.bokeh.append(dict(spr=bokeh_sprite(r, col, soft), t0=t0, ang=ang, dist=dist,
                                   vy=-(14 + R.random() * 40) * (1.6 if kind == "near" else 1.0), sway=R.random() * 6.28,
                                   k=k, out=5.7 + R.random() * 1.15, y0=CY - 80 - R.random() * 300, near=kind == "near"))

    # ---------------- 1コマ
    def frame(self, t):
        light = np.zeros((H, W, 3), np.float32)
        sp = Splat()
        R_OUT = 1.0

        # 魔法陣の回り方・明るさ
        f_o = ease_in_out(ramp(t, 0.7, 1.65))
        f_i = ease_in_out(ramp(t, 0.95, 1.85))
        spin = 40 * ease_in_out(ramp(t, 2.85, 3.8))
        rot_o = math.radians(-6 * t - spin)
        rot_i = math.radians(10 * t + spin * 1.3)
        grow = 0.86 + 0.14 * float(ease_out(ramp(t, 0.7, 1.9))) + 0.07 * ease_in_out(ramp(t, 5.7, 6.8))
        lift = 0.12 * ease_in_out(ramp(t, 1.9, 2.5)) * (1 - ease_in_out(ramp(t, 5.6, 6.6)))
        I = 0.95
        I += 0.6 * math.exp(-((t - 1.95) / 0.12) ** 2)  # 描き終わりの一拍
        I += 0.35 * ease_in_out(ramp(t, 2.1, 2.92))  # 力が溜まる
        I += 0.9 * math.exp(-max(0, t - 2.95) / 0.35) * (t >= 2.95) - 0.35 * ease_in_out(ramp(t, 2.92, 3.4))
        I += 0.06 * math.sin(t * 7.0)
        I *= 1 - ease_in_out(ramp(t, 5.8, 6.75))
        if t >= 0.7 and I > 0.003:
            ring = np.zeros_like(light)
            warp_ring(reveal(self.outer, f_o), rot_o, R_OUT * grow, 0.0, ring)
            warp_ring(reveal(self.inner, f_i, reverse=True), rot_i, R_OUT * grow, lift, ring)
            light += ring * I

        # 床の光だまり（魔法陣の真ん中）
        pool = 0.15 * ease_in_out(ramp(t, 0.4, 1.4)) + 0.3 * ease_in_out(ramp(t, 2.0, 2.92)) + 0.9 * math.exp(-max(0, t - 2.95) / 0.45) * (t >= 2.95)
        pool *= 1 - ease_in_out(ramp(t, 5.4, 6.6))
        if pool > 0.003:
            g = np.exp(-(((self.xx - CX) / 115) ** 2 + ((self.yy - CY) / 40) ** 2))
            g2 = np.exp(-(((self.xx - CX) / 300) ** 2 + ((self.yy - CY) / 105) ** 2))
            light += (g[..., None] * (WHITE * 0.7 + GOLD * 0.5) + g2[..., None] * (VIOLET * 0.4 + MAGENTA * 0.2)) * pool

        # 前兆の種火（真ん中に小さな光が灯る）
        seed = env(t, 0.25, 0.75, 0.9, 1.6)
        if seed > 0:
            x, y, _ = project(np.array([0.0, 0.0, 0.08]))
            stamp(light, self.flare, x, y, 0.55 * seed)

        # ---- 粒
        # 前兆
        m = self.mote
        tau = t - m["ts"]
        live = (tau > 0) & (tau < m["life"])
        if live.any():
            z = m["vz"][live] * tau[live]
            P = np.stack([m["x"][live], m["y"][live], z], -1)
            k = np.sin(np.pi * tau[live] / m["life"][live]) ** 2
            sp.add(P, m["col"][live] * (k * 5.0)[:, None])

        # 筆の先と火の粉
        for tr, (a0, a1, rad, rev, rot_f, zz) in zip(self.trail, (
                (0.7, 1.65, 0.97, False, lambda tt: math.radians(-6 * tt), 0.0),
                (0.95, 1.85, 0.735, True, lambda tt: math.radians(10 * tt), 0.0))):
            ts = a0 + tr["u"] * (a1 - a0)
            tau = t - ts
            live = (tau > 0) & (tau < tr["life"])
            if live.any():
                idx = np.nonzero(live)[0]
                pts = []
                for j in idx:
                    fr = ease_in_out(ramp(ts[j], a0, a1))
                    g0 = 0.86 + 0.14 * float(ease_out(ramp(ts[j], 0.7, 1.9)))
                    pts.append(head_point(fr, rad, rev, rot_f(ts[j]), g0, zz))
                P0 = np.array(pts).reshape(-1, 3)
                for sub in range(3):
                    tt = tau[idx] - sub / FPS / 6
                    P = P0 + tr["v"][idx] * np.maximum(tt, 0)[:, None] * 0.8
                    k = (1 - tau[idx] / tr["life"][idx]) ** 1.5
                    sp.add(P, tr["col"][idx] * (k / 3 * 3.6)[:, None])
            if a0 <= t <= a1 + 0.05:
                fr = ease_in_out(ramp(t, a0, a1))
                P = head_point(fr, rad, rev, rot_f(t), 0.86 + 0.14 * float(ease_out(ramp(t, 0.7, 1.9))), zz)
                x, y, _ = project(P)
                stamp(light, self.flare, float(x), float(y), 0.32)
                sp.add(P.reshape(1, 3), (WHITE * 30)[None, :])

        # 光の幕（魔法陣のふちから立つ細い縦の筋）
        cur = env(t, 1.75, 2.2, 5.1, 5.8) * (1 + 1.2 * ease_in_out(ramp(t, 2.2, 2.92)) * (1 - ease_in_out(ramp(t, 2.95, 3.4))))
        if cur > 0.003:
            c = self.curtain
            a = c["a"] + rot_o
            h = c["h"] * (0.65 + 0.35 * np.sin(t * c["fq"] + c["ph"])) * (1 + 0.8 * ease_in_out(ramp(t, 2.2, 2.92)))
            nz = 56
            s = (np.arange(nz) + 0.5) / nz
            Z = h[:, None] * s[None, :]
            rr = R_OUT * grow * 0.985
            P = np.stack([np.broadcast_to((np.cos(a) * rr)[:, None], Z.shape), np.broadcast_to((np.sin(a) * rr)[:, None], Z.shape), Z], -1).reshape(-1, 3)
            fall = ((1 - s) ** 1.6)[None, :].repeat(len(a), 0).reshape(-1)
            col = (VIOLET * 0.5 + MAGENTA * 0.35 + GOLD * 0.25)
            sp.add(P, col[None, :] * (fall * cur * 0.75)[:, None], soft=True)

        # 集まる
        g = self.gather
        s = (t - g["ts"]) / g["dur"]
        live = (s > 0) & (s < 1)
        if live.any():
            # 速いので、1コマのあいだを12に割って尾を引かせる（点が飛び飛びに並ばないように）
            for sub in range(12):
                ss = np.clip(s[live] - sub / FPS / 12 / g["dur"][live], 0, 1)
                e = ss ** 2.2
                r = g["r0"][live] * (1 - e)
                a = g["a0"][live] + 2.8 * e
                P = np.stack([np.cos(a) * r, np.sin(a) * r, g["z0"][live] * (1 - e) + 0.05], -1)
                k = np.clip(ss * 4, 0, 1) * (0.5 + 1.0 * ss)
                sp.add(P, g["col"][live] * (k * 11.0 / 12)[:, None])

        # 光の柱
        self._pillar(t, light)

        # 閃き（柱が立つ瞬間）
        if 2.9 <= t <= 4.0:
            k = math.exp(-max(0, t - 2.95) / 0.22) * (t >= 2.95) + 0.6 * math.exp(-((t - 2.92) / 0.03) ** 2)
            x, y = CX, CY - 10
            stamp(light, self.flare, x, y, 1.5 * k)
            glow = np.exp(-(((self.xx - x) / 85) ** 2 + ((self.yy - y) / 85) ** 2))
            light += glow[..., None] * (WHITE * 1.0 + MAGENTA * 0.4) * k
            # 横に走る光の筋（レンズの筋）
            dy = self.yy - y
            dx = np.abs(self.xx - x)
            st = np.exp(-(dy / 2.2) ** 2) * np.exp(-dx / 330) * 2.6 + np.exp(-(dy / 9) ** 2) * np.exp(-dx / 210) * 0.5
            light += st[..., None] * (CYAN * 0.5 + VIOLET * 0.4 + WHITE * 0.4) * k

        # 床を走る衝撃の輪（2つ）
        for t0, rmax, kk, dur in ((2.95, 2.9, 2.2, 0.9), (3.22, 1.9, 1.3, 0.8)):
            tau = (t - t0) / dur
            if 0 <= tau <= 1:
                r = 0.25 + (rmax - 0.25) * float(ease_out(tau))
                n = 1400
                a = np.arange(n) / n * 2 * math.pi
                for dr, w in ((-0.035, 0.35), (0.0, 1.0), (0.03, 0.4)):
                    P = np.stack([np.cos(a) * (r + dr), np.sin(a) * (r + dr), np.zeros(n)], -1)
                    sp.add(P, np.tile(WHITE * 0.5 + VIOLET * 0.6 + MAGENTA * 0.3, (n, 1)) * (kk * (1 - tau) ** 1.6 * w * 0.4), soft=True)

        # はじける火の粉
        b = self.burst
        tau = t - b["t0"]
        live = (tau > 0) & (tau < b["life"])
        if live.any():
            for sub in range(4):
                tt = np.maximum(tau[live] - sub / FPS / 2 / 4, 0)
                kd = 2.2
                P = b["v"][live] * ((1 - np.exp(-kd * tt)) / kd)[:, None]
                P[:, 2] += 0.05 - 0.18 * tt ** 2
                fade = (1 - tau[live] / b["life"][live]) ** 1.3
                tw = 0.6 + 0.4 * np.sin(b["fq"][live] * t + b["ph"][live])
                sp.add(P, b["col"][live] * (fade * tw * 3.6 / 4)[:, None])

        # 柱に巻きつく螺旋
        hx = self.helix
        tau = t - hx["t0"]
        live = (tau > 0) & (tau < 1.6)
        if live.any() and t < 5.4:
            for sub in range(4):
                tt = np.maximum(tau[live] - sub / FPS / 2 / 4, 0)
                Z = tt * 1.9
                a = hx["strand"][live] * math.pi + Z * 3.4 + t * 2.0
                r = 0.2 + 0.07 * Z
                P = np.stack([np.cos(a) * r, np.sin(a) * r, Z], -1)
                fade = np.clip(1 - Z / 2.9, 0, 1) * np.clip(tt * 8, 0, 1) * (1 - ease_in_out(ramp(t, 4.6, 5.3)))
                sp.add(P, hx["col"][live] * (fade * 4.0 / 4)[:, None])

        # 舞う粒
        gl = self.glit
        tau = t - gl["t0"]
        live = tau > 0
        if live.any():
            tt = tau[live]
            r = gl["rt"][live] * (1 - np.exp(-2.6 * tt)) + 0.05
            a = gl["ang"][live] + 0.12 * tt
            z = gl["z"][live] * (0.55 + 0.45 * (1 - np.exp(-2.0 * tt))) + 0.07 * tt
            x = np.cos(a) * r + 0.06 * np.sin(1.3 * tt + gl["sway"][live])
            y = np.sin(a) * r
            P = np.stack([x, y, z], -1)
            tw = (0.5 + 0.5 * np.sin(gl["fq"][live] * t * 2 + gl["ph"][live])) ** 2
            fin = np.clip(tt / 0.15, 0, 1) * (1 - np.clip((t - gl["out"][live]) / 0.6, 0, 1))
            k = gl["k"][live] * (0.35 + 0.9 * tw) * fin
            sp.add(P, gl["col"][live] * (k * 1.8)[:, None])
            # いちばん明るい粒に星を付ける
            idx_live = np.nonzero(live)[0]
            pos = {j: i for i, j in enumerate(idx_live)}
            px, py, pz = project(P)
            for j in self.glit_star:
                if j in pos:
                    i = pos[j]
                    kk = float(k[i]) * (DIST / float(pz[i])) ** 2
                    if kk > 0.25:
                        key = "gpvc"[j % 4]
                        stamp(light, self.stars[key], float(px[i]), float(py[i]), 0.55 * kk)

        sp.into(light)

        # ぼけの玉（画面で。手前の大きいのはゆっくり、薄く）
        for bk in self.bokeh:
            tau = t - bk["t0"]
            if tau <= 0:
                continue
            fin = min(1.0, tau / 0.35) * (1 - float(np.clip((t - bk["out"]) / 0.55, 0, 1)))
            if fin <= 0:
                continue
            d = bk["dist"] * (1 - math.exp(-2.2 * tau))
            x = CX + math.cos(bk["ang"]) * d * 0.95 + 14 * math.sin(0.9 * tau + bk["sway"])
            y = bk["y0"] + math.sin(bk["ang"]) * d * 0.55 + bk["vy"] * tau
            stamp(light, bk["spr"], x, y, bk["k"] * fin * (0.85 + 0.15 * math.sin(2.1 * t + bk["sway"])))

        light += bloom(light)
        light *= self.light_edge[..., None]
        out = tonemap(light)
        shade = 0.3 * env(t, 0.0, 0.9, 5.7, 6.8) * self.shade_map
        return out.astype(np.float32), shade.astype(np.float32)

    def _pillar(self, t, light):
        if not (2.92 <= t <= 5.45):
            return
        tau = t - 2.95
        y_b = CY - 6
        top = y_b - (y_b + 260) * float(ease_out(np.clip(tau / 0.24, 0, 1)))
        bright = 1.0 + 1.3 * math.exp(-max(0, tau) / 0.3)
        bright *= 1 - 0.25 * ease_in_out(ramp(t, 3.6, 4.6))
        bright *= 1 - ease_in_out(ramp(t, 4.7, 5.4))
        wid = 1.5 - 0.5 * ease_out(ramp(t, 2.95, 3.4)) - 0.35 * ease_in_out(ramp(t, 3.8, 4.9)) - 0.35 * ease_in_out(ramp(t, 4.9, 5.4))
        x0, x1 = int(CX - 300), int(CX + 300)
        y0, y1 = 0, int(y_b + 40)
        xs = (np.arange(x0, x1, dtype=np.float32) - CX)[None, :]
        ys = np.arange(y0, y1, dtype=np.float32)[:, None]
        nz = self.pillar_noise
        # 筋を上へ流す（1秒に 1,100px）
        ri = ((ys + t * 1100).astype(np.int64) // 3) % nz.shape[0]
        ci = np.clip(((xs / (24 * wid) + 1) * 0.5 * (nz.shape[1] - 1)).astype(np.int64), 0, nz.shape[1] - 1)
        flow = 1 + 0.45 * nz[ri, ci]
        core = np.exp(-(xs / (5.5 * wid)) ** 2) * 3.4
        mid = np.exp(-(xs / (24 * wid)) ** 2) * 1.0 * flow
        wide = np.exp(-(xs / (85 * wid)) ** 2) * 0.32
        haze = np.exp(-(xs / (200 * wid)) ** 2) * 0.1
        vert = np.clip((ys - top) / 140, 0, 1) ** 1.2 * np.clip((y_b + 30 - ys) / 40, 0, 1)
        up = 0.55 + 0.45 * np.exp(-(y_b - ys) / 700)
        k = (vert * up * bright)[..., None]
        band = (core[..., None] * WHITE + mid[..., None] * (GOLD * 0.55 + PINK * 0.45) + wide[..., None] * (MAGENTA * 0.6 + VIOLET * 0.5) + haze[..., None] * VIOLET) * k
        light[y0:y1, x0:x1] += band.astype(np.float32)


# ------------------------------------------------------------------ 書き出し
def write_frames(work, start=0, stop=N):
    os.makedirs(os.path.join(work, "rgba"), exist_ok=True)
    os.makedirs(os.path.join(work, "black"), exist_ok=True)
    sc = Scene()
    import time
    t0 = time.time()
    for i in range(start, stop):
        t = i / FPS
        out, shade = sc.frame(t)
        # 黒地: 光だけ
        black = (np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8)
        Image.fromarray(black, "RGB").save(os.path.join(work, "black", f"{i:04d}.png"), compress_level=1)
        # 透明つき: 光の下に暗さを敷く。前掛けを外して書く
        a_l = out.max(axis=-1)
        alpha = a_l + (1 - a_l) * shade
        pre = out + ((1 - a_l) * shade)[..., None] * SHADE_COL
        straight = np.where(alpha[..., None] > 1e-4, pre / np.maximum(alpha[..., None], 1e-4), 0)
        rgba = np.dstack([np.clip(straight, 0, 1), np.clip(alpha, 0, 1)])
        Image.fromarray((rgba * 255 + 0.5).astype(np.uint8), "RGBA").save(os.path.join(work, "rgba", f"{i:04d}.png"), compress_level=1)
        if i % 15 == 0:
            print(f"  {i}/{N}  t={t:.2f}  {(time.time() - t0) / (i - start + 1):.2f}秒/コマ", flush=True)


def ff(*args):
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *args]
    subprocess.run(cmd, check=True)


def encode(work, out, sizes):
    """(a) 透明つき WebM・(b) 黒地 MP4・(c) 色と透明を並べた MP4 を、大きさごとに書き出す"""
    os.makedirs(out, exist_ok=True)
    made = []
    for w in sizes:
        h = w * 16 // 9
        sc = f"scale={w}:{h}:flags=lanczos"
        # VP8 の透明つき。色は BT.601（VP8 はそれで読まれる）
        # 1,800k（720）では、柱が立った直後の込み入ったコマで魔法陣の線がにじんで四角く崩れた（2026-11-02 目で見た）
        kb = {720: 2600, 540: 1700}.get(w, 2200)
        p = os.path.join(out, f"glow-{w}.webm")
        # 透明は別の VP8 の流れとして焼かれ、キーフレームの置き場を色の流れと別に決める。ずれると、
        # キーフレームに頭出ししたとき透明だけが前のコマを当てにして崩れる（2秒・4秒で四角く崩れた。
        # 2026-11-02 この箱の Chromium）。2秒おきに固定して、両方そろえる
        ff("-framerate", str(FPS), "-i", os.path.join(work, "rgba", "%04d.png"), "-vf", f"{sc},format=yuva420p",
           "-c:v", "libvpx", "-pix_fmt", "yuva420p", "-auto-alt-ref", "0", "-b:v", f"{kb}k", "-crf", "12",
           "-qmin", "4", "-qmax", "40", "-deadline", "good", "-cpu-used", "0", "-g", str(FPS * 2),
           "-keyint_min", str(FPS * 2), "-force_key_frames", "expr:gte(t,n_forced*2)", "-an", p)
        made.append(p)
        # H.264（BT.709 で変換して印も付ける）
        x264 = ["-c:v", "libx264", "-preset", "slow", "-profile:v", "high", "-pix_fmt", "yuv420p",
                "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
                "-g", str(FPS * 2), "-movflags", "+faststart", "-an"]
        # CRF 21 と 25 で、目で見て差が無かった（2026-11-02）。間を取る
        crf = "23"
        p = os.path.join(out, f"glow-{w}-black.mp4")
        ff("-framerate", str(FPS), "-i", os.path.join(work, "black", "%04d.png"),
           "-vf", f"{sc}:out_color_matrix=bt709:out_range=tv,format=yuv420p", "-crf", crf, *x264, p)
        made.append(p)
        p = os.path.join(out, f"glow-{w}-pack.mp4")
        ff("-framerate", str(FPS), "-i", os.path.join(work, "rgba", "%04d.png"), "-filter_complex",
           f"[0:v]{sc},format=rgba,split[x][y];[x]format=rgb24[c];[y]alphaextract,format=rgb24[a];"
           f"[c][a]hstack=inputs=2,scale=out_color_matrix=bt709:out_range=tv,format=yuv420p[v]",
           "-map", "[v]", "-crf", crf, *x264, p)
        made.append(p)
    for p in made:
        print(f"{os.path.basename(p):26s} {os.path.getsize(p) / 1024:7.0f}KB")


def sheet(work, bg_dir, path, secs=(1, 2, 3, 4, 5, 6)):
    """1秒おきのコマを、配信画面（street・face）に重ねて並べる（焼いたコマから。動画にする前の絵）。
    箱は広げたときの位置（1080×1920 の 76,445 から幅 927）。見せるのは箱のまわりを切り出したもの"""
    rows = []
    labels = []
    for bgname in ("street", "face"):
        bg = np.asarray(Image.open(os.path.join(bg_dir, f"prism-{bgname}.jpg")).convert("RGB"), np.float32) / 255
        for mode in ("rgba", "screen"):
            row = []
            for s in secs:
                i = min(N - 1, int(round(s * FPS)))
                fr = bg.copy()
                bx, by, bw = 76, 445, 927
                bh = bw * 16 // 9
                if mode == "rgba":
                    im = np.asarray(Image.open(os.path.join(work, "rgba", f"{i:04d}.png")).resize((bw, bh), Image.LANCZOS), np.float32) / 255
                    c, a = im[..., :3], im[..., 3:4]
                    reg = fr[by:by + bh, bx:bx + bw]
                    hh = reg.shape[0]
                    reg[:] = c[:hh] * a[:hh] + reg * (1 - a[:hh])
                else:
                    im = np.asarray(Image.open(os.path.join(work, "black", f"{i:04d}.png")).resize((bw, bh), Image.LANCZOS), np.float32) / 255
                    reg = fr[by:by + bh, bx:bx + bw]
                    hh = reg.shape[0]
                    reg[:] = 1 - (1 - reg) * (1 - im[:hh])
                tile = Image.fromarray((fr * 255 + 0.5).astype(np.uint8)).resize((360, 640), Image.LANCZOS)
                row.append(tile)
            rows.append(row)
            labels.append(f"{bgname} / {'透明つき (a)(c)' if mode == 'rgba' else 'screen (b) ※ページの中に地がある場合'}")
    pad = 6
    sh = Image.new("RGB", (len(secs) * (360 + pad) + pad, len(rows) * (640 + pad) + pad), (255, 255, 255))
    for r, row in enumerate(rows):
        for c, tile in enumerate(row):
            sh.paste(tile, (pad + c * (360 + pad), pad + r * (640 + pad)))
    sh.save(path, quality=88)
    print(path, "\n".join(labels))


MAGENTA_BG = np.array([1.0, 0.0, 1.0], np.float32)
GREEN_BG = np.array([0.0, 1.0, 0.0], np.float32)


def checksheet(alpha_dir, path, secs=(3, 5)):
    """`fx_video_check.mjs alpha` が撮ったものを、地の色を替えて並べる。
    1行が1種類×1秒。左から: ページの外に紫 / ページの外に緑（PRISM と同じ）/ ページの下地に紫 / 下地に緑（参考）。
    外で重ねた2枚が**同じ所**は、動画がその地を隠している所（透明が抜けていない）"""
    tiles = []
    for kind in ("webm", "screen", "pack"):
        for s in secs:
            im = np.asarray(Image.open(os.path.join(alpha_dir, f"{kind}-{s}-out.png")).convert("RGBA"), np.float32) / 255
            c, a = im[..., :3], im[..., 3:4]
            row = [c * a + bg * (1 - a) for bg in (MAGENTA_BG, GREEN_BG)]
            for tag in ("in-m", "in-g"):
                row.append(np.asarray(Image.open(os.path.join(alpha_dir, f"{kind}-{s}-{tag}.png")).convert("RGB"), np.float32) / 255)
            tiles.append([Image.fromarray((np.clip(x, 0, 1) * 255 + 0.5).astype(np.uint8)).resize((270, 480), Image.LANCZOS) for x in row])
    pad = 6
    sh = Image.new("RGB", (4 * (270 + pad) + pad, len(tiles) * (480 + pad) + pad), (255, 255, 255))
    for r, row in enumerate(tiles):
        for c, t in enumerate(row):
            sh.paste(t, (pad + c * (270 + pad), pad + r * (480 + pad)))
    sh.save(path, quality=88)
    print(path, "行: webm×(" + ",".join(map(str, secs)) + ") / screen×… / pack×…  列: 外に紫・外に緑・下地に紫・下地に緑")


def scenesheet(scene_dir, bg_dir, path):
    """`fx_video_check.mjs scene` が撮った `perf.html` の場面（アラート＋動画、透明つき）を、配信画面に重ねる。
    箱は広げたときの位置（1080×1920 の 76,445 から幅 927）。1行が1場面、左から street の2枚・face の2枚"""
    names = sorted({f.split("-")[0] for f in os.listdir(scene_dir) if f.endswith(".png")}, key=int)
    bgs = [np.asarray(Image.open(os.path.join(bg_dir, f"prism-{b}.jpg")).convert("RGB"), np.float32) / 255 for b in ("street", "face")]
    rows, labels = [], []
    for n in names:
        row = []
        for bg in bgs:
            for i in (0, 1):
                im = Image.open(os.path.join(scene_dir, f"{n}-{i}.png")).convert("RGBA")
                bw = 927
                bh = round(im.size[1] * bw / im.size[0])
                im = np.asarray(im.resize((bw, bh), Image.LANCZOS), np.float32) / 255
                fr = bg.copy()
                reg = fr[445:445 + bh, 76:76 + bw]
                hh = reg.shape[0]
                c, a = im[:hh, :, :3], im[:hh, :, 3:4]
                reg[:] = c * a + reg * (1 - a)
                row.append(Image.fromarray((fr * 255 + 0.5).astype(np.uint8)).resize((360, 640), Image.LANCZOS))
        rows.append(row)
        lab = os.path.join(scene_dir, f"{n}.txt")
        labels.append(open(lab, encoding="utf-8").read().strip() if os.path.exists(lab) else n)
    pad = 6
    sh = Image.new("RGB", (4 * (360 + pad) + pad, len(rows) * (640 + pad) + pad), (255, 255, 255))
    for r, row in enumerate(rows):
        for c, t in enumerate(row):
            sh.paste(t, (pad + c * (360 + pad), pad + r * (640 + pad)))
    sh.save(path, quality=88)
    print(path, " / ".join(labels))


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("render")
    r.add_argument("work")
    r.add_argument("--start", type=int, default=0)
    r.add_argument("--stop", type=int, default=N)
    e = sub.add_parser("encode")
    e.add_argument("work")
    e.add_argument("out")
    e.add_argument("--sizes", default="720,540")
    s = sub.add_parser("sheet")
    s.add_argument("work")
    s.add_argument("bg")
    s.add_argument("path")
    c = sub.add_parser("checksheet")
    c.add_argument("alpha_dir")
    c.add_argument("path")
    g = sub.add_parser("scenesheet")
    g.add_argument("scene_dir")
    g.add_argument("bg")
    g.add_argument("path")
    a = ap.parse_args()
    if a.cmd == "render":
        write_frames(a.work, a.start, a.stop)
    elif a.cmd == "encode":
        encode(a.work, a.out, [int(x) for x in a.sizes.split(",")])
    elif a.cmd == "checksheet":
        checksheet(a.alpha_dir, a.path)
    elif a.cmd == "scenesheet":
        scenesheet(a.scene_dir, a.bg, a.path)
    else:
        sheet(a.work, a.bg, a.path)


if __name__ == "__main__":
    main()
