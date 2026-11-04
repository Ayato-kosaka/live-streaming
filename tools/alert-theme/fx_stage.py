#!/usr/bin/env python3
"""投げ銭の段の演出を、1つのカメラで写して透明つきの動画に焼く道具（#1095）。

ChatGPT の絵を層（奥の景色・中の建物・地面・手前・あやと）の**板**にして3Dの位置に立て、
同じカメラで写す（寄る・回る・視差）。そこへ光（にじみ・光の筋）・霧・粒・ぼけ・材質（金の映り込み）を足す。
段ごとの中身は台本（`fx_tiers/t<段>_<町>.py`）に書き、ここは道具だけを持つ。段を足すのは台本を1本足すだけ。

    python3 tools/alert-theme/fx_stage.py render <台本> --variant full --clip intro --work <置き場> [--jobs 2]
    python3 tools/alert-theme/fx_stage.py encode <台本> --work <置き場> --out <書き出し先>
    python3 tools/alert-theme/fx_stage.py all    <台本> --work <置き場> --out public/alert/themes/castle/fx [--jobs 2] [--keep]
    python3 tools/alert-theme/fx_stage.py clean  <台本> --work <置き場>      # --keep で残した連番の絵を消す（画質を数えたあと）
    python3 tools/alert-theme/fx_stage.py still  <台本> --variant full --t 2.2 --out <絵.png>      # 1コマだけ（目で見る）

`all` は 段の全部の通り × 3本（登場・滞在・締め）を焼いて書き出し、`manifest.json` の段を書き、連番の絵を消す
（ディスクを食うので。`--keep` で残す）。確かめは `fx_check.py`、配信画面に重ねた縦の録画は `fx_review.py`。

## 動画の約束（scratchpad の CONTRACT.md。3人で共通）

- 1段は「登場（intro）→ 滞在（stay）をくり返す → 締め（outro）」の3本。層は back（投げた人のキャラ絵の後ろ）と
  front（前。光と粒だけ）の2つまで。1,000円〜は full（全面）と light（光の線で描いてキャラが出たら薄くする）の2通り
- 720×1280・30コマ/秒・透明つき WebM（VP8・yuva420p・`-auto-alt-ref 0`・キーフレーム2秒おきに固定）
- 名前 `t{段}-{通り}-{層}-{本}.webm`。秒（`introDur` など）は動画の実のコマ数から書く

## 時間の決まり（滞在の継ぎ目を出さないため）

台本の `draw(c)` は1コマぶんの `c`（`Ctx`）を受け取る:

- `c.T` … 場面の時刻。登場は 0〜INTRO、滞在は INTRO〜INTRO+STAY、締めは **INTRO から**（滞在の長さが 0 だったかのように）
- `c.Ti` … 一度きりの動き（登場の流れ）を引く時刻。滞在と締めでは INTRO で止まる＝登場の終わりの姿のまま
- `c.ph` … 滞在の輪の位相（0〜1）。**滞在で動き続けるものは、全部 `c.ph` の周期関数で書く**（`c.osc`・`Loop` の粒）
- `c.u` … 締めの進み（0→1。最後のコマで 1）。登場と滞在では 0

こうしておくと、滞在の最後のコマの次が滞在の最初のコマにそのままつながり（位相 1 ≡ 0）、締めの最初のコマも
滞在の最初と同じ姿から始まる。**一度きりの動きは INTRO までに終える**（INTRO の時点で途中だと、滞在で止まって見える）。
くり返す出来事（鐘の輪など）は `events()` で「滞在の周期で並んだ出来事」として書くと、登場の山場から滞在へ切れ目なく続く。

## 重ね方

`Canvas` は前掛けの色 `P`（HDR）・覆い `A`・足し算の光 `L`・奥行き `Z` を持つ。板を `over` で重ねると、
それより前に足した光は板の後ろに隠れる（光の筋が建物の陰に入る）。最後ににじみ（bloom）を掛け、
**絵の色を変えないトーンの曲線**（0.78 まではそのまま、そこから白へ肩を落とす）で 0〜1 に落とす。
PR #1089 の `1-exp(-x)` は絵の 1.0 を 0.65 まで暗くするので、絵の板には使えない。

透明は「物の覆い」と「光の明るさ」の大きいほう。光だけの所は、明るいほど不透明になる（PR #1089 と同じ読み方）。
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import math
import os
import shutil
import subprocess
import sys
import time
from concurrent.futures import ProcessPoolExecutor

import cv2
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import dijkstra

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import fx_video as fxv  # noqa: E402  にじみ・ぼけ玉・星・閃きの絵を借りる

W, H = 720, 1280
FPS = 30
cv2.setNumThreads(1)  # 2本並べて焼くので、1本は1コアに留める（箱は4コアで、ほかの担当も動く）

# 投げた人のキャラ絵と字の場所（scratchpad/nov-fx-pera/index.html の枠。720×1280 の座標）
CHAR_BOX = (137, 486, 583, 1024)
FACE = (360.0, 590.0, 74.0)
TEXT_BOX = (44, 694, 676, 822)
# 箱を手で広げたとき（664×1180）、配信画面（1920）の下で切れる高さ。ここより下に大事なものを置かない
SAFE_BOTTOM = 1140

# 色（0〜1、HDR で 1 を超えてよい）
WHITE = np.array([1.0, 0.96, 0.9], np.float32)
GOLD = np.array([1.0, 0.74, 0.32], np.float32)
AMBER = np.array([1.0, 0.52, 0.16], np.float32)
PINK = np.array([1.0, 0.52, 0.72], np.float32)
ROSE = np.array([1.0, 0.36, 0.55], np.float32)
MAGENTA = np.array([1.0, 0.3, 0.8], np.float32)
VIOLET = np.array([0.58, 0.36, 1.0], np.float32)
CYAN = np.array([0.42, 0.85, 1.0], np.float32)
EMERALD = np.array([0.2, 0.95, 0.75], np.float32)


# ------------------------------------------------------------------ 時間の曲線
def clamp01(x):
    return float(min(1.0, max(0.0, x)))


def ease(x):
    x = clamp01(x)
    return x * x * (3 - 2 * x)


def ease_out(x):
    x = clamp01(x)
    return 1 - (1 - x) ** 3


def ease_in(x):
    x = clamp01(x)
    return x ** 3


def back_out(x, s=1.7):
    """少し行き過ぎて戻る（ぽんと出る）"""
    x = clamp01(x)
    return 1 + (s + 1) * (x - 1) ** 3 + s * (x - 1) ** 2


def ramp(t, a, b):
    return clamp01((t - a) / (b - a)) if b != a else float(t >= a)


def env(t, a, b, c, d):
    """a→b で上がり c→d で下がる台形（なめらか）"""
    return ease(ramp(t, a, b)) * (1 - ease(ramp(t, c, d)))


def pulse(t, t0, w):
    return math.exp(-((t - t0) / w) ** 2)


def lerp(a, b, k):
    return a + (b - a) * k


# ------------------------------------------------------------------ 1コマの時刻
class Ctx:
    def __init__(self, clip, i, intro, stay, outro, variant):
        self.clip, self.i, self.variant = clip, i, variant
        self.INTRO, self.STAY, self.OUTRO = intro, stay, outro
        dt = i / FPS
        if clip == "intro":
            self.T, self.Ti, self.u = dt, dt, 0.0
        elif clip == "stay":
            self.T, self.Ti, self.u = intro + dt, intro, 0.0
        else:
            n = max(1, int(round(outro * FPS)) - 1)
            self.T, self.Ti, self.u = intro + dt, intro, i / n
        self.ph = ((self.T - intro) / stay) % 1.0

    def osc(self, n=1, ph=0.0):
        """滞在の周期で n 回まわる sin（滞在の継ぎ目でつながる）"""
        return math.sin(2 * math.pi * (n * self.ph + ph))

    def bump(self, n=1, ph=0.0):
        """0→1→0（滞在の頭で 0・速さも 0）。カメラの漂いに使う"""
        return 0.5 - 0.5 * math.cos(2 * math.pi * (n * self.ph + ph))

    def events(self, base, period, first=-1e9, dur=1.0):
        """base + k*period に起きる出来事のうち、いま進行中のもの → [(経過秒, k)]。
        period を滞在の長さにすると、滞在の輪で同じ出来事がくり返す（登場の山場の出来事をそのまま続けられる）"""
        out = []
        k0 = math.floor((self.T - base) / period) - 2
        for k in range(k0, k0 + 4):
            t0 = base + k * period
            if t0 < first - 1e-9:
                continue
            age = self.T - t0
            if 0 <= age < dur:
                out.append((age, k))
        return out


# ------------------------------------------------------------------ カメラ
class Cam:
    """世界は Z が上・Y が奥。pos から target を見る。foc は 720 幅のときの焦点距離（px）"""

    def __init__(self, pos, target, foc=1250.0, cx=W / 2, cy=H / 2, focus=None, dof=30.0):
        self.pos = np.asarray(pos, np.float64)
        f = np.asarray(target, np.float64) - self.pos
        self.fwd = f / np.linalg.norm(f)
        r = np.cross(self.fwd, [0, 0, 1.0])
        self.right = r / np.linalg.norm(r)
        self.up = np.cross(self.right, self.fwd)
        self.foc, self.cx, self.cy = foc, cx, cy
        self.focus = float(np.linalg.norm(np.asarray(target) - self.pos)) if focus is None else focus
        self.dof = dof

    def project(self, P):
        d = np.asarray(P, np.float64) - self.pos
        zc = np.maximum(d @ self.fwd, 0.05)
        return self.cx + self.foc * (d @ self.right) / zc, self.cy - self.foc * (d @ self.up) / zc, zc

    def coc(self, z):
        """ぼけの半径（px）。ピントの奥行きでは 0"""
        z = np.maximum(np.asarray(z, np.float64), 0.1)
        return self.dof * np.abs(1 / z - 1 / self.focus) * self.focus


def unproject(cam, x, y, depth=None, plane_z=None):
    """画面の (x, y) を通る光線の上の点。depth（カメラの前向きの奥行き）か、高さ plane_z の床との交わり"""
    d = cam.fwd * cam.foc + cam.right * (x - cam.cx) - cam.up * (y - cam.cy)
    d = d / np.linalg.norm(d)
    if plane_z is not None:
        t = (plane_z - cam.pos[2]) / d[2] if abs(d[2]) > 1e-9 else 1e6
        t = t if t > 0 else 1e6
    else:
        t = depth / max(d @ cam.fwd, 1e-6)
    return cam.pos + d * t


def floor_rect(cam, x0, y0, x1, y1, z=0.0):
    """画面の矩形（基準のカメラで見たとき）を床（高さ z）へ戻した4点。描かれた遠近を、床の遠近として読み直す。
    返す: 世界の4点（左上・右上・右下・左下）"""
    return np.array([unproject(cam, x, y, plane_z=z) for x, y in ((x0, y0), (x1, y0), (x1, y1), (x0, y1))])


# ------------------------------------------------------------------ 絵（前掛けの RGBA）
def load_rgba(path, max_side=None):
    im = Image.open(path).convert("RGBA")
    if max_side and max(im.size) > max_side:
        k = max_side / max(im.size)
        im = im.resize((max(1, round(im.size[0] * k)), max(1, round(im.size[1] * k))), Image.LANCZOS)
    a = np.asarray(im, np.float32) / 255.0
    a[..., :3] *= a[..., 3:4]
    return a


class Art:
    """板にする絵。縮めて写すときにちらつかないよう、半分ずつ縮めた絵を持っておく"""

    def __init__(self, rgba):
        self.levels = [np.ascontiguousarray(rgba, np.float32)]
        while max(self.levels[-1].shape[:2]) > 64:
            p = self.levels[-1]
            self.levels.append(cv2.resize(p, (max(1, p.shape[1] // 2), max(1, p.shape[0] // 2)), interpolation=cv2.INTER_AREA))
        self.h, self.w = rgba.shape[:2]

    @classmethod
    def load(cls, path, max_side=None):
        return cls(load_rgba(path, max_side))

    def level_for(self, scale):
        """写す倍率（絵の1px が画面の何px か）に合う段"""
        lv = 0
        while scale < 0.6 and lv + 1 < len(self.levels):
            scale *= 2
            lv += 1
        return lv


def warp_into(img, src_quad, dst_quad, interp=cv2.INTER_LINEAR):
    """img の src_quad（4点）を、画面の dst_quad（4点）へ写す。返す: (切り抜いた絵, x0, y0) か None"""
    dst = np.asarray(dst_quad, np.float32)
    if not np.all(np.isfinite(dst)):
        return None
    x0, y0 = max(0, int(math.floor(dst[:, 0].min())) - 1), max(0, int(math.floor(dst[:, 1].min())) - 1)
    x1, y1 = min(W, int(math.ceil(dst[:, 0].max())) + 2), min(H, int(math.ceil(dst[:, 1].max())) + 2)
    if x1 <= x0 or y1 <= y0:
        return None
    M = cv2.getPerspectiveTransform(np.asarray(src_quad, np.float32), dst - np.float32([x0, y0]))
    out = cv2.warpPerspective(img, M, (x1 - x0, y1 - y0), flags=interp, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
    if out.ndim == 2:
        out = out[..., None]
    return out, x0, y0


# ------------------------------------------------------------------ 重ねる面
class Canvas:
    def __init__(self):
        self.P = np.zeros((H, W, 3), np.float32)
        self.A = np.zeros((H, W), np.float32)
        self.L = np.zeros((H, W, 3), np.float32)
        self.Z = np.full((H, W), 1e6, np.float32)

    def over(self, p, a, x0=0, y0=0, z=None):
        """前掛けの (p, a) を (x0, y0) に重ねる。前に足した光も、覆われたぶん隠す"""
        h, w = a.shape[:2]
        sl = (slice(y0, y0 + h), slice(x0, x0 + w))
        inv = (1 - a)[..., None]
        self.P[sl] = p + self.P[sl] * inv
        self.L[sl] *= inv
        self.A[sl] = a + self.A[sl] * (1 - a)
        if z is not None:
            zz = self.Z[sl]
            np.copyto(zz, np.float32(z), where=(a > 0.5))

    def shade(self, k, col=(0.03, 0.02, 0.07)):
        """暗さを敷く（k は (H,W) の濃さ）。いちばん下に敷く"""
        p = k[..., None] * np.asarray(col, np.float32)
        self.over(p.astype(np.float32), k.astype(np.float32))

    def emit(self, rgb, x0=0, y0=0):
        h, w = rgb.shape[:2]
        self.L[y0:y0 + h, x0:x0 + w] += rgb

    def finish(self, bloom=1.0, edge=None, rays=None, p_thr=1.05):
        """にじみを掛けて 0〜1 の前掛け RGBA（H,W,4）にする。
        にじむのは足し算の光と、絵のうち p_thr を超えた所だけ（描かれた絵まで白くにじませない）"""
        hdr = self.P + self.L
        src = self.L + np.maximum(self.P - p_thr, 0) * 2.0
        if bloom > 0:
            hdr = hdr + fxv.bloom(src) * bloom
        if rays is not None:
            hdr = hdr + god_rays(src, *rays)
        light = hdr - self.P
        if edge is not None:
            hdr = hdr * edge[..., None]
            light = light * edge[..., None]
            A = self.A * edge
        else:
            A = self.A
        out = tone(hdr)
        a_l = np.clip(tone(np.maximum(light, 0)).max(-1), 0, 1)
        Af = np.clip(A + (1 - A) * a_l, 0, 1)
        out = np.minimum(out, Af[..., None])
        return np.dstack([out, Af]).astype(np.float32)


def tone(x):
    """絵の色はそのまま（0.78 まで）、そこから上は白へ肩を落とす。明るい所ほど白く飛ぶ"""
    k = 0.78
    lum = x.max(-1, keepdims=True)
    hot = np.clip((lum - 1.1) / 2.5, 0, 1)
    x = x + hot * 0.6 * (lum - x)
    y = np.where(x < k, x, k + (1 - k) * (1 - np.exp(-(x - k) / (1 - k))))
    return np.clip(y, 0, 1).astype(np.float32)


def god_rays(hdr, x, y, k, thresh=1.0, n=10, step=0.035):
    """明るい所を (x, y) へ向けて伸ばす（光の筋）"""
    if k <= 0.003:
        return 0
    b = np.maximum(hdr - thresh, 0)
    small = cv2.resize(b, (W // 2, H // 2), interpolation=cv2.INTER_AREA)
    acc = np.zeros_like(small)
    for i in range(n):
        s = 1.0 + step * i
        M = np.float32([[s, 0, x / 2 * (1 - s)], [0, s, y / 2 * (1 - s)]])
        acc += cv2.warpAffine(small, M, (W // 2, H // 2), flags=cv2.INTER_LINEAR) * (0.88 ** i)
    acc = cv2.GaussianBlur(acc, (0, 0), 1.5)
    return cv2.resize(acc, (W, H), interpolation=cv2.INTER_LINEAR) * (k * 0.06)


def box_edge(left=60, right=60, top=120, bottom=80):
    """箱の縁で 0 に溶かす（ウィジェットは画面いっぱいではないので、四角い切り口を見せない）"""
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    f = lambda d, w: np.clip(d / max(w, 1), 0, 1) ** 1.0
    e = f(xx, left) * f(W - 1 - xx, right) * f(yy, top) * f(H - 1 - yy, bottom)
    return (e * e * (3 - 2 * e)).astype(np.float32)


def face_hole(pad_in=14, pad_out=58):
    """投げた人のキャラ絵の顔の丸に穴（front 層に掛ける。丸の中は 0）"""
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    d = np.hypot(xx - FACE[0], yy - FACE[1]) - FACE[2]
    k = np.clip((d - pad_in) / (pad_out - pad_in), 0, 1)
    return (k * k * (3 - 2 * k)).astype(np.float32)


# ------------------------------------------------------------------ 板（2.5D）
def board_quad(cam, pos, w, h, anchor=(0.5, 1.0), facing=True, yaw=0.0):
    """世界の pos（anchor の点）に、幅 w・高さ h の板を立てる。facing なら板はカメラを向く（上は世界の上）"""
    pos = np.asarray(pos, np.float64)
    if facing:
        r = cam.right.copy()
        r[2] = 0
        r /= np.linalg.norm(r) + 1e-9
    else:
        r = np.array([math.cos(yaw), math.sin(yaw), 0.0])
    u = np.array([0, 0, 1.0])
    ax, ay = anchor
    tl = pos - r * w * ax + u * h * ay
    c4 = np.array([tl, tl + r * w, tl + r * w - u * h, tl - u * h])
    x, y, z = cam.project(c4)
    return np.stack([x, y], -1), float(np.mean(z))


def draw_board(cv, cam, art: Art, pos, h, anchor=(0.5, 1.0), k=1.0, blur=None, grade=None, rim=None,
               light_dir=None, crop=None, sharp=False, floor_fade=None, z_extra=0.0, facing=True, yaw=0.0, mul=None):
    """板を写して cv に重ねる。返す: (前掛けの p, a, x0, y0, 奥行き) か None。
    blur: None なら奥行きでぼかす（sharp で 0）。grade: (3,) 色を掛ける。rim: 光の来る側のふちの光の強さ。
    floor_fade: (画面の y, 幅px) より下を溶かす（霧に立つ足元）。mul: (H,W) 画面の濃さを掛ける"""
    if k <= 0.002:
        return None
    w = h * art.w / art.h
    dst, z = board_quad(cam, pos, w, h, anchor, facing, yaw)
    scale = (dst[:, 1].max() - dst[:, 1].min()) / art.h
    lv = art.level_for(scale)
    img = art.levels[lv]
    ih, iw = img.shape[:2]
    src = np.float32([[0, 0], [iw, 0], [iw, ih], [0, ih]])
    if crop is not None:
        # 絵の一部だけを写す（u0, v0, u1, v1 は 0〜1）
        u0, v0, u1, v1 = crop
        src = np.float32([[u0 * iw, v0 * ih], [u1 * iw, v0 * ih], [u1 * iw, v1 * ih], [u0 * iw, v1 * ih]])
        dst = np.stack([_bil(dst, u0, v0), _bil(dst, u1, v0), _bil(dst, u1, v1), _bil(dst, u0, v1)])
    r = warp_into(img, src, dst)
    if r is None:
        return None
    im, x0, y0 = r
    p, a = im[..., :3].copy(), im[..., 3].copy()
    if grade is not None:
        p *= np.asarray(grade, np.float32)
    if rim and light_dir is not None:
        p += rim_light(a, light_dir) * rim
    if floor_fade is not None:
        fy, fw = floor_fade
        ys = np.arange(y0, y0 + a.shape[0], dtype=np.float32)[:, None]
        m = np.clip((fy - ys) / fw, 0, 1)
        m = m * m * (3 - 2 * m)
        p *= m[..., None]
        a *= m
    sig = 0.0 if sharp else (float(cam.coc(z)) * 0.55 if blur is None else blur)
    if sig > 0.5:
        pad = int(sig * 3) + 2
        p, a, x0, y0 = _pad(p, a, x0, y0, pad)
        p = cv2.GaussianBlur(p, (0, 0), sig)
        a = cv2.GaussianBlur(a, (0, 0), sig)
    if mul is not None:
        m = mul[y0:y0 + a.shape[0], x0:x0 + a.shape[1]]
        p *= m[..., None]
        a *= m
    if k < 1:
        p *= k
        a *= k
    cv.over(p, a, x0, y0, z + z_extra)
    return p, a, x0, y0, z


def _bil(q, u, v):
    top = q[0] + (q[1] - q[0]) * u
    bot = q[3] + (q[2] - q[3]) * u
    return top + (bot - top) * v


def _pad(p, a, x0, y0, pad):
    """ぼかすぶん、画面の中で余白を広げる"""
    nx0, ny0 = max(0, x0 - pad), max(0, y0 - pad)
    nx1, ny1 = min(W, x0 + a.shape[1] + pad), min(H, y0 + a.shape[0] + pad)
    P = np.zeros((ny1 - ny0, nx1 - nx0, 3), np.float32)
    A = np.zeros((ny1 - ny0, nx1 - nx0), np.float32)
    P[y0 - ny0:y0 - ny0 + a.shape[0], x0 - nx0:x0 - nx0 + a.shape[1]] = p
    A[y0 - ny0:y0 - ny0 + a.shape[0], x0 - nx0:x0 - nx0 + a.shape[1]] = a
    return P, A, nx0, ny0


def rim_light(a, light_dir, col=None, width=2.5):
    """光の来る向き（画面の (dx, dy)）に面したふちに光。足し算の色（前掛け）"""
    col = (GOLD * 1.4 + WHITE * 0.6) if col is None else col
    ab = cv2.GaussianBlur(a, (0, 0), 3)
    gx = cv2.Sobel(ab, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(ab, cv2.CV_32F, 0, 1, ksize=3)
    d = np.asarray(light_dir, np.float32)
    d = d / (np.linalg.norm(d) + 1e-6)
    facing = np.clip(-(gx * d[0] + gy * d[1]) * 3, 0, 1)
    edge = np.clip(a - cv2.GaussianBlur(a, (0, 0), width), 0, 1) * 2.5
    return (np.clip(facing * edge, 0, 1)[..., None] * col).astype(np.float32)


def draw_quad(cv, cam, art: Art, quad, k=1.0, mul=None, horizon_fade=0.12, grade=None):
    """世界の4点（左上・右上・右下・左下）に絵を貼る（床・壁）。絵の上の端は horizon_fade（絵の高さの割合）で溶かす"""
    if k <= 0.002:
        return None
    P = np.asarray(quad, np.float64)
    x, y, zc = cam.project(P)
    dst = np.stack([x, y], -1)
    scale = abs(dst[2, 0] - dst[3, 0]) / art.w
    img = art.levels[art.level_for(scale)]
    ih, iw = img.shape[:2]
    if horizon_fade > 0:
        img = img.copy()
        v = np.arange(ih, dtype=np.float32) / ih
        m = np.clip(v / horizon_fade, 0, 1)
        img *= (m * m * (3 - 2 * m))[:, None, None]
    r = warp_into(img, np.float32([[0, 0], [iw, 0], [iw, ih], [0, ih]]), dst)
    if r is None:
        return None
    im, ox, oy = r
    p, a = im[..., :3].copy(), im[..., 3].copy()
    if grade is not None:
        p *= np.asarray(grade, np.float32)
    if mul is not None:
        m = mul[oy:oy + a.shape[0], ox:ox + a.shape[1]]
        p *= m[..., None]
        a *= m
    if k < 1:
        p *= k
        a *= k
    cv.over(p, a, ox, oy, float(np.mean(zc)))
    return p, a, ox, oy, dst


def board_map(cam, art_w, art_h, pos, h, anchor=(0.5, 1.0), facing=True):
    """板の絵の座標 → 画面の写し（3×3）。絵の上に重ねる光（金の映り込み・窓の灯り）を同じ所へ置くため"""
    w = h * art_w / art_h
    dst, z = board_quad(cam, pos, w, h, anchor, facing)
    src = np.float32([[0, 0], [art_w, 0], [art_w, art_h], [0, art_h]])
    return cv2.getPerspectiveTransform(src, dst.astype(np.float32)), dst, z


def emit_mapped(cv, img, M, dst, mul=None):
    """絵の座標の光（前掛けの RGB）を、M で画面へ写して足す"""
    src = np.float32([[0, 0], [img.shape[1], 0], [img.shape[1], img.shape[0]], [0, img.shape[0]]])
    r = warp_into(img, src, dst)
    if r is None:
        return
    im, x0, y0 = r
    im = im[..., :3]
    if mul is not None:
        im = im * mul[y0:y0 + im.shape[0], x0:x0 + im.shape[1], None]
    cv.emit(im, x0, y0)


def map_point(M, u, v):
    p = M @ np.array([u, v, 1.0])
    return p[0] / p[2], p[1] / p[2]


# ------------------------------------------------------------------ 絵の中の材質（描かれた金・灯り）
def gold_mask(rgba):
    """描かれた金（黄〜橙で明るく、彩度が高い）。前掛けの絵から"""
    a = rgba[..., 3]
    c = rgba[..., :3] / np.maximum(a[..., None], 1e-4)
    r, g, b = c[..., 0], c[..., 1], c[..., 2]
    hue_ok = (r > 0.55) & (g > 0.38) & (g < r * 1.02) & (b < g * 0.72)
    lum = 0.3 * r + 0.59 * g + 0.11 * b
    m = hue_ok & (lum > 0.42) & (a > 0.5)
    m = cv2.GaussianBlur(m.astype(np.float32), (0, 0), 1.2)
    return np.clip(m * 1.4, 0, 1).astype(np.float32)


def window_mask(rgba):
    """灯った窓・街灯（とても明るい暖色の小さな塊）"""
    a = rgba[..., 3]
    c = rgba[..., :3] / np.maximum(a[..., None], 1e-4)
    r, g, b = c[..., 0], c[..., 1], c[..., 2]
    m = (r > 0.9) & (g > 0.72) & (b < 0.75) & (a > 0.5)
    m = m.astype(np.float32)
    # 大きく明るい面（空の光）ではなく、小さな塊だけ
    big = cv2.GaussianBlur(m, (0, 0), 9)
    m = m * np.clip(1.6 - big * 2.2, 0, 1)
    return cv2.GaussianBlur(m, (0, 0), 0.8).astype(np.float32)


def sweep(mask_img, t, x_from, x_to, width=0.12, tilt=0.45):
    """絵の座標で、斜めの光の帯が左から右へ滑る（映り込みが走る）。返す: (h,w) の強さ"""
    h, w = mask_img.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    u = xx / w + tilt * (yy / h - 0.5)
    c = lerp(x_from, x_to, t)
    return (np.exp(-((u - c) / width) ** 2) * mask_img).astype(np.float32)


# ------------------------------------------------------------------ 光の線で描く（建物の輪郭）
class LineArt:
    """建物の絵から輪郭を取り、**描かれていく順**（線をたどる道のり）を付けておく。
    描くときは time（0〜1）までに描けた線を光らせ、描いている先（筆の先）に閃きを置く。"""

    def __init__(self, rgba, start=(0.5, 1.0), lo=40, hi=110, min_len=30, work_w=900, blur=1.4, inner=None, outer_blur=0.0):
        """inner: 中の線（Canny）を取ってよい所（絵と同じ割合の (h,w) の 0〜1。None なら全部）。
        outer_blur: 外形をなめらかにするぼかし（岩肌のようなギザギザの外形を、光の線では丸める）"""
        # 画面に写る大きさに近い細かさで線を取る（細かすぎる線は、縮めて写すとちらつき、密すぎて面に見える）
        if rgba.shape[1] > work_w:
            k = work_w / rgba.shape[1]
            rgba = cv2.resize(rgba, (work_w, max(1, round(rgba.shape[0] * k))), interpolation=cv2.INTER_AREA)
        a = rgba[..., 3]
        c = rgba[..., :3] / np.maximum(a[..., None], 1e-4)
        g = (np.clip(c.mean(-1) * a, 0, 1) * 255).astype(np.uint8)
        g = cv2.GaussianBlur(g, (0, 0), blur)
        e = cv2.Canny(g, lo, hi) > 0
        if inner is not None:
            e &= cv2.resize(np.asarray(inner, np.float32), (e.shape[1], e.shape[0])) > 0.5
        # 外形（透明とのさかい）も必ず線にする
        ab = ((cv2.GaussianBlur(a, (0, 0), outer_blur) if outer_blur > 0 else a) > 0.5).astype(np.uint8)
        outer = (cv2.morphologyEx(ab, cv2.MORPH_GRADIENT, np.ones((3, 3), np.uint8)) > 0)
        e = e | outer
        n, lab = cv2.connectedComponents(e.astype(np.uint8), connectivity=8)
        sizes = np.bincount(lab.ravel())
        keep = sizes >= min_len
        keep[0] = False
        e = keep[lab]
        self.h, self.w = e.shape
        ys, xs = np.nonzero(e)
        idx = -np.ones(e.shape, np.int64)
        idx[ys, xs] = np.arange(len(ys))
        # 8近傍のつながりで道のりを測る（建物の下の真ん中から、線をたどって広がる）
        rows, cols, wts = [], [], []
        for dy, dx in ((0, 1), (1, 0), (1, 1), (1, -1)):
            y2, x2 = ys + dy, xs + dx
            ok = (y2 >= 0) & (y2 < self.h) & (x2 >= 0) & (x2 < self.w)
            j = np.full(len(ys), -1)
            j[ok] = idx[y2[ok], x2[ok]]
            m = j >= 0
            rows.append(np.arange(len(ys))[m])
            cols.append(j[m])
            wts.append(np.full(m.sum(), math.hypot(dy, dx)))
        r = np.concatenate(rows)
        cidx = np.concatenate(cols)
        wv = np.concatenate(wts)
        G = coo_matrix((np.concatenate([wv, wv]), (np.concatenate([r, cidx]), np.concatenate([cidx, r]))), shape=(len(ys), len(ys))).tocsr()
        # 種: つながった線ごとに、start にいちばん近い点。つながりどうしの始まりは、start からの距離でずらす
        lab2 = lab[ys, xs]
        sx, sy = start[0] * self.w, start[1] * self.h
        dist0 = np.hypot(xs - sx, ys - sy)
        seeds, offs = [], []
        for L in np.unique(lab2):
            m = np.nonzero(lab2 == L)[0]
            j = m[np.argmin(dist0[m])]
            seeds.append(j)
            offs.append(dist0[j])
        D = dijkstra(G, indices=np.array(seeds), min_only=False)
        D = np.where(np.isfinite(D), D, np.inf)
        best = np.full(len(ys), np.inf)
        for s, (j, o) in enumerate(zip(seeds, offs)):
            best = np.minimum(best, D[s] + o * 0.9)
        best[~np.isfinite(best)] = np.nanmax(best[np.isfinite(best)]) if np.isfinite(best).any() else 0
        # 道のりの順位で 0〜1 にする（描ける線の量が時間に比例する＝筆の速さが一定に見える）
        rank = np.empty(len(best))
        rank[np.argsort(best, kind="stable")] = np.arange(len(best))
        ordv = (rank / max(len(best) - 1, 1)).astype(np.float32)
        order = np.zeros(e.shape, np.float32)
        order[ys, xs] = ordv
        self.order = order
        self.mask = e.astype(np.float32)
        self.ys, self.xs = ys, xs
        self.ord_pts = ordv

    def image(self, prog, soft=0.025, tail=0.18, fade=1.0, core=None, glow=None):
        """prog（0〜1）まで描けた線の光（絵の座標、前掛けの RGB）。描いた直後ほど明るい"""
        core = (WHITE * 0.9 + GOLD * 0.6) if core is None else core
        glow = (GOLD * 0.8 + AMBER * 0.3) if glow is None else glow
        drawn = np.clip((prog - self.order) / soft, 0, 1) * self.mask
        fresh = np.exp(-np.maximum(prog - self.order, 0) / tail) * drawn
        line = drawn * (0.5 + 1.1 * fresh) * fade
        g1 = cv2.GaussianBlur(line, (0, 0), 1.3)
        g2 = cv2.GaussianBlur(line, (0, 0), 4.0)
        rgb = line[..., None] * core + g1[..., None] * glow * 0.9 + g2[..., None] * glow * 0.35
        return rgb.astype(np.float32)

    def heads(self, prog, n=14, band=0.02):
        """いま描いている先の点（絵の座標）を n 個まで"""
        sel = np.nonzero(np.abs(self.ord_pts - prog) < band)[0]
        if len(sel) == 0:
            return []
        pick = sel[np.linspace(0, len(sel) - 1, min(n, len(sel))).astype(int)]
        return [(float(self.xs[j]), float(self.ys[j])) for j in pick]


def draw_lines(cv, cam, lines: LineArt, pos, h, prog, k=1.0, anchor=(0.5, 1.0), facing=True, heads_k=1.0, flare=None):
    """光の線を、板と同じ置き方で写して足す（足し算の光）"""
    if k <= 0.002:
        return
    w = h * lines.w / lines.h
    dst, z = board_quad(cam, pos, w, h, anchor, facing)
    img = lines.image(prog) * k
    src = np.float32([[0, 0], [lines.w, 0], [lines.w, lines.h], [0, lines.h]])
    r = warp_into(img, src, dst)
    if r is None:
        return
    im, x0, y0 = r
    cv.emit(im[..., :3] if im.shape[2] >= 3 else im, x0, y0)
    if flare is not None and heads_k > 0 and 0 < prog < 1:
        M = cv2.getPerspectiveTransform(src, dst.astype(np.float32))
        for (hx, hy) in lines.heads(prog):
            p = M @ np.array([hx, hy, 1.0])
            fxv.stamp(cv.L, flare, p[0] / p[2], p[1] / p[2], 0.22 * heads_k * k)


# ------------------------------------------------------------------ 粒（同じカメラで写して、奥行きでぼかす）
class Splat:
    LAY = (0.8, 2.4, 6.0)

    def __init__(self):
        self.bufs = [np.zeros((3, H * W), np.float32) for _ in self.LAY]

    def add(self, cam, P, rgb, zbuf=None, soft=False, max_gain=6.0, sharp=False):
        """sharp: ピントに関係なくくっきり（花火のように、遠くても主役の光）"""
        P = np.asarray(P, np.float64).reshape(-1, 3)
        if len(P) == 0:
            return
        x, y, zc = cam.project(P)
        rgb = np.asarray(rgb, np.float32).reshape(-1, 3) * np.clip((cam.focus / zc) ** 2, 0, max_gain)[:, None].astype(np.float32)
        self.add_screen(x, y, rgb, np.zeros(len(x)) if sharp else cam.coc(zc), zc, zbuf, soft)

    def add_screen(self, x, y, rgb, coc=None, zc=None, zbuf=None, soft=False):
        x = np.asarray(x, np.float64)
        y = np.asarray(y, np.float64)
        rgb = np.asarray(rgb, np.float32).reshape(-1, 3)
        coc = np.zeros(len(x)) if coc is None else np.asarray(coc)
        lay = np.where(coc < 1.6, 0, np.where(coc < 4.5, 1, 2))
        if soft:
            lay = np.maximum(lay, 1)
        x0 = np.floor(x).astype(np.int64)
        y0 = np.floor(y).astype(np.int64)
        ok = (x0 >= 0) & (x0 < W - 1) & (y0 >= 0) & (y0 < H - 1)
        if zbuf is not None and zc is not None:
            xi, yi = np.clip(x0, 0, W - 1), np.clip(y0, 0, H - 1)
            ok &= zc < zbuf[yi, xi] + 0.05
        fx_, fy_ = (x - x0).astype(np.float32), (y - y0).astype(np.float32)
        for li in range(3):
            sel = ok & (lay == li)
            if not sel.any():
                continue
            idx = y0[sel] * W + x0[sel]
            a, b = fx_[sel], fy_[sel]
            ii = np.concatenate([idx, idx + 1, idx + W, idx + W + 1])
            ww = np.concatenate([(1 - a) * (1 - b), a * (1 - b), (1 - a) * b, a * b])
            c = rgb[sel]
            for ch in range(3):
                self.bufs[li][ch] += np.bincount(ii, weights=ww * np.tile(c[:, ch], 4), minlength=H * W).astype(np.float32)

    def into(self, cv):
        for buf, s in zip(self.bufs, self.LAY):
            if buf.any():
                cv.L += cv2.GaussianBlur(buf.reshape(3, H, W).transpose(1, 2, 0), (0, 0), s)


class Loop:
    """滞在の周期でくり返す粒の素（位相・速さの倍数・種）。cycles は滞在1周で何回めぐるか（整数）"""

    def __init__(self, n, seed, cycles=(1, 2)):
        R = np.random.default_rng(seed)
        self.n = n
        self.R = R
        self.ph = R.random(n)
        self.m = R.integers(cycles[0], cycles[1] + 1, n)
        self.r = R.random((n, 8))

    def age(self, c: Ctx):
        """各粒の、いまのめぐりの進み（0〜1）"""
        return (c.ph * self.m + self.ph) % 1.0


def sprite_rot(spr, ang, k):
    """前掛けの RGBA の小さな絵を回して縮める"""
    h, w = spr.shape[:2]
    M = cv2.getRotationMatrix2D((w / 2, h / 2), math.degrees(ang), k)
    n = int(max(h, w) * k * 1.5) + 4
    M[0, 2] += n / 2 - w / 2
    M[1, 2] += n / 2 - h / 2
    return cv2.warpAffine(spr, M, (n, n), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0)


def put_sprite(cv, spr, x, y, k=1.0, blur=0.0, light=False):
    """小さな絵（前掛けの RGBA）を画面の (x, y) を真ん中に置く。light なら足し算の光として"""
    h, w = spr.shape[:2]
    x0, y0 = int(round(x - w / 2)), int(round(y - h / 2))
    sx0, sy0 = max(0, -x0), max(0, -y0)
    dx0, dy0 = max(0, x0), max(0, y0)
    dx1, dy1 = min(W, x0 + w), min(H, y0 + h)
    if dx1 <= dx0 or dy1 <= dy0:
        return
    s = spr[sy0:sy0 + dy1 - dy0, sx0:sx0 + dx1 - dx0]
    if blur > 0.5:
        s = cv2.GaussianBlur(s, (0, 0), blur)
    s = s * k
    if light:
        cv.L[dy0:dy1, dx0:dx1] += s[..., :3]
    else:
        cv.over(s[..., :3].copy(), s[..., 3].copy(), dx0, dy0)


def sprite(cv, art: Art, x, y, h, anchor=(0.5, 1.0), rot=0.0, sx=1.0, sy=1.0, k=1.0, blur=0.0, grade=None,
           rim=0.0, light_dir=(0.0, -1.0), clip_below=None):
    """画面の (x, y) に、高さ h px の絵を置く（anchor の点を (x, y) に）。rot は度（anchor のまわり）。
    sx, sy で伸び縮み（弾む・つぶれる）。clip_below: この画面の y より下を切る（落ち葉の山の後ろに隠れる）。
    〜999円の段の猫たちのように、カメラの奥行きが要らない小さな主役に使う"""
    if k <= 0.002 or h <= 1:
        return None
    s = h / art.h
    img = art.levels[art.level_for(s * max(sx, sy))]
    ih, iw = img.shape[:2]
    sc = h / ih
    ax, ay = anchor[0] * iw, anchor[1] * ih
    c_, s_ = math.cos(math.radians(rot)), math.sin(math.radians(rot))
    # 絵の (u, v) → 画面: 伸ばしてから回す
    A = np.array([[c_ * sc * sx, -s_ * sc * sy], [s_ * sc * sx, c_ * sc * sy]])
    corners = np.array([[0, 0], [iw, 0], [iw, ih], [0, ih]], np.float64) - [ax, ay]
    dst = corners @ A.T + [x, y]
    src = np.float32([[0, 0], [iw, 0], [iw, ih], [0, ih]])
    r = warp_into(img, src, dst)
    if r is None:
        return None
    im, x0, y0 = r
    p, a = im[..., :3].copy(), im[..., 3].copy()
    if grade is not None:
        p *= np.asarray(grade, np.float32)
    if rim:
        p += rim_light(a, light_dir) * rim
    if clip_below is not None:
        ys = np.arange(y0, y0 + a.shape[0], dtype=np.float32)[:, None]
        m = np.clip((clip_below - ys) / 3.0, 0, 1)
        p *= m[..., None]
        a *= m
    if blur > 0.5:
        p, a, x0, y0 = _pad(p, a, x0, y0, int(blur * 3) + 2)
        p = cv2.GaussianBlur(p, (0, 0), blur)
        a = cv2.GaussianBlur(a, (0, 0), blur)
    if k < 1:
        p *= k
        a *= k
    cv.over(p, a, x0, y0)
    return dst


def contact_shadow(cv, x, y, w, k=0.35):
    """足もとの影（楕円のやわらかい暗さ）。物が地に立って見える"""
    if k <= 0.003:
        return
    x0, x1 = max(0, int(x - w)), min(W, int(x + w))
    y0, y1 = max(0, int(y - w * 0.25)), min(H, int(y + w * 0.25))
    if x1 <= x0 or y1 <= y0:
        return
    yy, xx = np.mgrid[y0:y1, x0:x1].astype(np.float32)
    g = np.exp(-(((xx - x) / (w * 0.55)) ** 2 + ((yy - y) / (w * 0.12)) ** 2)) * k
    cv.over((g[..., None] * np.float32([0.04, 0.02, 0.06])).astype(np.float32), g.astype(np.float32), x0, y0)


# ------------------------------------------------------------------ 霧（つながる模様を、滞在の周期で流す）
class Mist:
    def __init__(self, seed, size=512):
        R = np.random.default_rng(seed)
        nz = R.random((size, size)).astype(np.float32)
        m = sum(gaussian_filter(nz, s, mode="wrap") * w for s, w in ((10, 0.35), (28, 1.0), (70, 1.6)))
        m = (m - m.mean()) / m.std()
        self.m = m.astype(np.float32)
        self.size = size
        yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
        self.yy, self.xx = yy, xx

    def layer(self, c: Ctx, y_top, y_bot, amt, col, laps=1, scale=1.3, soft_top=200, soft_bot=260, edge=None, drift_y=0.0):
        """y_top〜y_bot の帯に霧。滞在1周で模様が laps 枚ぶん横へ流れる（継ぎ目でつながる）。返す: (p, a)"""
        if amt <= 0.002:
            return None
        n = self.size
        off = (c.ph * laps + 0.37) * n
        sx = ((self.xx / (W * scale)) * n + off) % n
        sy = ((self.yy - y_top) / max(1.0, (y_bot - y_top) * scale) * n * 0.5 + drift_y * n) % n
        nz = cv2.remap(self.m, sx.astype(np.float32), sy.astype(np.float32), cv2.INTER_LINEAR, borderMode=cv2.BORDER_WRAP)
        band = np.clip((self.yy - y_top) / soft_top, 0, 1) * np.clip((y_bot - self.yy) / soft_bot, 0, 1)
        band = band * band * (3 - 2 * band)
        a = np.clip(0.55 + 0.25 * nz, 0, 1) * band * amt
        if edge is not None:
            a = a * edge
        a = a.astype(np.float32)
        return (a[..., None] * np.asarray(col, np.float32)).astype(np.float32), a


# ------------------------------------------------------------------ 小さな光の絵（借りものを縮めて持つ）
class Kit:
    def __init__(self):
        self.flare = fxv.flare_sprite(300)
        self.flare_s = fxv.flare_sprite(140)
        self.star = {name: fxv.star_sprite(40, col) for name, col in (("gold", GOLD), ("white", WHITE), ("pink", PINK), ("violet", VIOLET), ("cyan", CYAN), ("magenta", MAGENTA))}
        self.star_big = {name: fxv.star_sprite(96, col) for name, col in (("gold", GOLD), ("white", WHITE), ("pink", PINK), ("magenta", MAGENTA))}
        self.bokeh = {}

    def bokeh_spr(self, r, col_name, col, soft):
        key = (int(r), col_name, int(soft))
        if key not in self.bokeh:
            self.bokeh[key] = fxv.bokeh_sprite(r, col, soft)
        return self.bokeh[key]


def streak(cv, x, y, k, col=None, len_=320, thick=2.4):
    """横に走る光の筋（レンズの筋）"""
    if k <= 0.003:
        return
    col = (CYAN * 0.4 + VIOLET * 0.3 + WHITE * 0.5) if col is None else col
    y0, y1 = max(0, int(y - 40)), min(H, int(y + 40))
    ys = np.arange(y0, y1, dtype=np.float32)[:, None] - y
    xs = np.abs(np.arange(W, dtype=np.float32)[None, :] - x)
    st = np.exp(-(ys / thick) ** 2) * np.exp(-xs / len_) * 2.0 + np.exp(-(ys / 10) ** 2) * np.exp(-xs / (len_ * 0.6)) * 0.4
    cv.L[y0:y1] += st[..., None] * col * k


def glow(cv, x, y, r, col, k):
    if k <= 0.003:
        return
    x0, x1 = max(0, int(x - 3 * r)), min(W, int(x + 3 * r))
    y0, y1 = max(0, int(y - 3 * r)), min(H, int(y + 3 * r))
    if x1 <= x0 or y1 <= y0:
        return
    yy, xx = np.mgrid[y0:y1, x0:x1].astype(np.float32)
    g = np.exp(-((xx - x) ** 2 + (yy - y) ** 2) / (r * r))
    cv.L[y0:y1, x0:x1] += g[..., None] * np.asarray(col, np.float32) * k


def ring3d(sp, cam, center, radius, k, col, zbuf=None, n=2400, thick=(0.0, 0.035, -0.035), sparks=400, seed=0):
    """水平な光の輪（鐘の音）。物の陰に入った所は zbuf で隠れる"""
    if k <= 0.003:
        return
    a = np.arange(n) / n * 2 * math.pi
    cx, cy, cz = center
    for dz, w in zip(thick, (1.6, 0.6, 0.6)):
        P = np.stack([cx + np.cos(a) * radius, cy + np.sin(a) * radius, np.full(n, cz + dz)], -1)
        sp.add(cam, P, np.tile(col, (n, 1)) * (k * w * 0.6), zbuf, soft=True)
    if sparks:
        j = np.arange(sparks)
        aa = (j * 2.399 + seed) % (2 * math.pi)
        rr = radius * (0.84 + 0.16 * ((j * 0.618 + seed * 0.1) % 1.0))
        P = np.stack([cx + np.cos(aa) * rr, cy + np.sin(aa) * rr, cz + 0.22 * ((j * 0.377) % 1.0 - 0.5)], -1)
        sp.add(cam, P, np.tile(GOLD * 1.4 + WHITE, (sparks, 1)) * (k * 1.1), zbuf)


# ------------------------------------------------------------------ 台本の土台
class Stage:
    """台本はこれを継いで、TIER・INTRO・STAY・OUTRO・REVEAL・VARIANTS・FRONT を決め、setup() と draw(c) を書く。
    draw は (back の RGBA, front の RGBA か None) を返す（`self.back()`・`self.front()` が組み立てを助ける）"""

    TIER = 0
    INTRO, STAY, OUTRO, REVEAL = 3.0, 3.0, 1.2, 2.0
    VARIANTS = ("full",)
    FRONT = {"full": True}
    # 1通りの大きさの予算（KB）。無ければ VARIANT_BUDGET_KB。焼き方は encode_budget
    BUDGET_KB = {}

    def __init__(self, variant):
        self.variant = variant
        self.kit = Kit()
        self.edge = box_edge()
        # 主役（あやと）の層の縁は細く溶かす。主役はキャラ絵が出たら上の帯（headroom）へ退くので、
        # ほかの層と同じ幅（上 120px）で溶かすと、顔が縁で薄くなる
        self.hero_edge = box_edge(left=14, right=14, top=14, bottom=80)
        self.hole = face_hole()
        self.last_hero = None
        self.setup()

    def setup(self):
        pass

    def frames(self, clip):
        d = {"intro": self.INTRO, "stay": self.STAY, "outro": self.OUTRO}[clip]
        return int(round(d * FPS))

    def ctx(self, clip, i):
        return Ctx(clip, i, self.INTRO, self.STAY, self.OUTRO, self.variant)

    def draw(self, c: Ctx):
        raise NotImplementedError

    def has_front(self):
        return bool(self.FRONT.get(self.variant))

    def finish_hero(self, cv: Canvas, bloom=0.4):
        """主役だけの層を仕上げて覚えておく（`fx_hero.py` がこの層で、キャラ絵に隠れていないかを数える）。
        台本はこれを back の仕上げの上に `over_rgba` で重ねる"""
        rgba = cv.finish(bloom=bloom, edge=self.hero_edge)
        self.last_hero = rgba
        return rgba

    def finish_front(self, cv: Canvas, bloom=0.8):
        """front は光と粒だけ。顔の丸に穴を開け、箱の縁で溶かす"""
        rgba = cv.finish(bloom=bloom, edge=self.edge * self.hole)
        return rgba


def over_rgba(top, base):
    """前掛けの RGBA どうしを重ねる（top が上）"""
    return (top + base * (1 - top[..., 3:4])).astype(np.float32)


# ------------------------------------------------------------------ 焼く・書き出す
def load_script(path):
    spec = importlib.util.spec_from_file_location(os.path.splitext(os.path.basename(path))[0], path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)
    return mod


def save_rgba(path, rgba):
    """前掛けを外して（ふつうの RGBA に）書く。
    透明が 2/255 以下の所は色も 0 にする: 前掛けを外すと、ほぼ透明な所（にじみの裾）の色が割り算で暴れ、
    見えないのに動画の量を食う（light の滞在 3秒が 2.2MB → 0.7MB。2026-11-04）"""
    a = rgba[..., 3:4]
    c = np.where(a > 1e-4, rgba[..., :3] / np.maximum(a, 1e-4), 0)
    out = (np.dstack([np.clip(c, 0, 1), np.clip(a, 0, 1)]) * 255 + 0.5).astype(np.uint8)
    out[out[..., 3] <= 2] = 0
    Image.fromarray(out, "RGBA").save(path, compress_level=1)


def _render_part(args):
    script, variant, clip, work, idxs = args
    mod = load_script(script)
    st = mod.Scene(variant)
    t0 = time.time()
    for n, i in enumerate(idxs):
        c = st.ctx(clip, i)
        back, front = st.draw(c)
        save_rgba(os.path.join(work, variant, clip, "back", f"{i:04d}.png"), back)
        if front is not None and st.has_front():
            save_rgba(os.path.join(work, variant, clip, "front", f"{i:04d}.png"), front)
        if n % 15 == 0:
            print(f"  {variant}/{clip} {i}  {(time.time() - t0) / (n + 1):.2f}秒/コマ", flush=True)
    return len(idxs), time.time() - t0


def render(script, variant, clip, work, jobs=2, only=None):
    mod = load_script(script)
    st_cls = mod.Scene
    n = int(round({"intro": st_cls.INTRO, "stay": st_cls.STAY, "outro": st_cls.OUTRO}[clip] * FPS))
    for layer in ("back", "front"):
        os.makedirs(os.path.join(work, variant, clip, layer), exist_ok=True)
    idxs = list(range(n)) if only is None else only
    parts = [(script, variant, clip, work, idxs[k::jobs]) for k in range(jobs)]
    t0 = time.time()
    if jobs == 1:
        res = [_render_part(parts[0])]
    else:
        with ProcessPoolExecutor(jobs) as ex:
            res = list(ex.map(_render_part, parts))
    done = sum(r[0] for r in res)
    print(f"{variant}/{clip}: {done}コマ {time.time() - t0:.0f}秒（{sum(r[1] for r in res) / max(done, 1):.2f}秒/コマ・{jobs}本）", flush=True)


def ff(*args):
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *args], check=True)


# ---- 焼き方（2026-11-04 に直した。1万円の段の `blender/t7_pack.py` と同じ考え方）
# 前は 2パスの VBR（`-b:v` と `-qmin 4 -qmax 56`）で焼いていた。率に合わせて1コマずつ画質を上げ下げするので、
# 輪の頭（必ずキーフレーム）だけ尻より 3.2dB 良く焼かれ（段5 の滞在。焼く前の絵との PSNR 31.4 → 28.2）、
# 2秒おきに階段や窓枠のくっきりさが変わった（1万円の段の担当が等倍で見つけた）。
# いまは画質の段（`-crf`＝`-qmin`）を1本の中で1つに決めて焼く。`-b:v` は天井を高くして（KBPS_CEIL）当てない。
# 当てると率の側が画質を上げ下げして、同じ跳ねが戻る（天井 2,400k で頭と尻 2.3dB、天井なしで 0.2dB。段5 の滞在）。
# 大きさは画質の段で決まるので、予算に収まる段を探して焼き直す（encode_budget）。
# 大きさは段が 13 上がるとおよそ半分（段5 の滞在: 24 で 2,942KB・30 で 2,133KB・36 で 1,642KB）
QSTART = {"back": 32, "front": 18}
QBEST = {"back": 16, "front": 10}   # これより良くしない（大きさが増えるだけで、見た目は変わらない）
QWORST = 50
Q_PER_HALF = 13.0
KBPS_CEIL = 12000
# 1通り（full / light）の合計の予算（KB）。約束は 1通り 6MB 以内（6,000,000 バイト）。余裕を残す
VARIANT_BUDGET_KB = 5300


def encode_one(src_dir, out_path, q, last_key=False):
    """透明つき VP8 を、画質の段 q で1本焼く。透明のキーフレームを色とそろえる（2秒おきに固定。PR #1089）。返す: KB
    last_key: 最後のコマもキーフレームにする（締め）。前のコマからの差で焼くと、消えていく透明が 6/255 で止まって
    消えきらなかった（段5 の締め。焼く前の絵は 0。画質の段 16 でも同じ）"""
    n = len([f for f in os.listdir(src_dir) if f.endswith(".png")])
    keys = "expr:gte(t,n_forced*2)" + (f"+eq(n,{n - 1})" if last_key else "")
    ff("-framerate", str(FPS), "-i", os.path.join(src_dir, "%04d.png"), "-vf", "format=yuva420p",
       "-c:v", "libvpx", "-pix_fmt", "yuva420p", "-auto-alt-ref", "0", "-b:v", f"{KBPS_CEIL}k",
       "-crf", str(q), "-qmin", str(q), "-qmax", "56", "-deadline", "good", "-cpu-used", "0",
       "-g", str(FPS * 2), "-keyint_min", str(FPS * 2), "-force_key_frames", keys, "-an", out_path)
    return os.path.getsize(out_path) / 1024


def encode_budget(src_dir, out_path, budget_kb, n, layer, clip):
    """予算に収まるいちばん良い画質の段を探して焼く（4回まで）。予算の 85〜100% に入るか、
    QBEST で予算に収まれば止める。返す: [(段, KB), …]（最後が書き出したもの）"""
    q = QSTART[layer]
    tries = []
    for _ in range(4):
        kb = encode_one(src_dir, out_path, q, clip == "outro")
        tries.append((q, round(kb)))
        if kb <= budget_kb and (kb >= 0.85 * budget_kb or q <= QBEST[layer]):
            break
        if kb > budget_kb and q >= QWORST:
            break
        # 大きさと段の関係（2回焼いていれば、その2点の傾き）から、予算の 93% になる段を見込む
        slope = Q_PER_HALF
        if len(tries) >= 2 and tries[-1][0] != tries[-2][0] and tries[-1][1] != tries[-2][1]:
            slope = max(4.0, min(30.0, (tries[-1][0] - tries[-2][0]) / max(1e-6, math.log2(tries[-2][1] / tries[-1][1]))))
        nq = int(round(q + slope * math.log2(kb / (0.93 * budget_kb))))
        nq = max(QBEST[layer], min(QWORST, nq))
        if nq == q:
            nq = q + (1 if kb > budget_kb else -1)
            nq = max(QBEST[layer], min(QWORST, nq))
        if any(t[0] == nq for t in tries) or nq == q:
            break
        q = nq
    # 最後が予算を超えていたら、予算に収まった中でいちばん良い段で焼き直す
    if tries[-1][1] > budget_kb:
        ok = [t for t in tries if t[1] <= budget_kb]
        if ok:
            q = min(t[0] for t in ok)
            tries.append((q, round(encode_one(src_dir, out_path, q, clip == "outro"))))
    elif any(t[1] <= budget_kb and t[0] < tries[-1][0] for t in tries[:-1]):
        # 前に焼いた、より良い段が予算に収まっていたら、そちらで焼き直す
        q = min(t[0] for t in tries if t[1] <= budget_kb)
        tries.append((q, round(encode_one(src_dir, out_path, q, clip == "outro"))))
    return tries


def name_of(tier, variant, layer, clip):
    return f"t{tier}-{variant}-{layer}-{clip}.webm"


def budgets(S, work):
    """1本ごとの予算（KB）: 1通りの予算を、層（back 85%・front 15%。front が無ければ back に全部）と
    本のコマ数で割る。締めは1回しか流れないので軽く"""
    out = {}
    w_clip = {"intro": 1.0, "stay": 1.0, "outro": 0.7}
    for variant in S.VARIANTS:
        total = getattr(S, "BUDGET_KB", {}).get(variant, VARIANT_BUDGET_KB)
        have = {(layer, clip): len([f for f in os.listdir(os.path.join(work, variant, clip, layer)) if f.endswith(".png")])
                for layer in ("back", "front") for clip in ("intro", "stay", "outro")
                if os.path.isdir(os.path.join(work, variant, clip, layer))}
        have = {k: v for k, v in have.items() if v}
        front = any(k[0] == "front" for k in have)
        share = {"back": 0.85 if front else 1.0, "front": 0.15}
        for layer in ("back", "front"):
            ks = [k for k in have if k[0] == layer]
            wsum = sum(have[k] * w_clip[k[1]] for k in ks)
            for k in ks:
                out[(variant, k[0], k[1])] = (total * share[layer] * have[k] * w_clip[k[1]] / max(wsum, 1), have[k])
    return out


def encode(script, work, out, jobs=2):
    from concurrent.futures import ThreadPoolExecutor
    mod = load_script(script)
    S = mod.Scene
    os.makedirs(out, exist_ok=True)
    plan = budgets(S, work)
    todo = []
    for (variant, layer, clip), (bud, n) in plan.items():
        d = os.path.join(work, variant, clip, layer)
        todo.append((d, os.path.join(out, name_of(S.TIER, variant, layer, clip)), bud, n, layer, clip))
    # libvpx は1本につきほぼ CPU 1本なので、本ごとに並べる（箱は4コアで、ほかの担当も動くので2本まで）
    made = []
    with ThreadPoolExecutor(jobs) as ex:
        for job, tries in zip(todo, ex.map(lambda j: encode_budget(*j), todo)):
            made.append(job[1])
            print(f"{os.path.basename(job[1]):34s} {tries[-1][1]:6d}KB（予算 {job[2]:.0f}KB・画質の段と大きさ {tries}）", flush=True)
    for variant in S.VARIANTS:
        tot = sum(os.path.getsize(p) for p in made if f"-{variant}-" in os.path.basename(p))
        print(f"段{S.TIER} {variant} 合計 {tot / 1e6:.2f}MB")
    return made


def frame_count(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries",
                        "stream=nb_read_frames", "-of", "csv=p=0", path], capture_output=True, text=True, check=True)
    return int(r.stdout.strip().split(",")[0])


def write_manifest(script, out):
    """manifest.json の、この段のところだけを書き直す（ほかの段は触らない）。秒は動画の実のコマ数から"""
    mod = load_script(script)
    S = mod.Scene
    path = os.path.join(out, "manifest.json")
    man = json.load(open(path, encoding="utf-8")) if os.path.exists(path) else {}
    man.setdefault("tiers", {})
    variants = {}
    durs = {}
    for variant in S.VARIANTS:
        v = {}
        for layer in ("back", "front"):
            files = {clip: name_of(S.TIER, variant, layer, clip) for clip in ("intro", "stay", "outro")}
            if all(os.path.exists(os.path.join(out, f)) for f in files.values()):
                v[layer] = files
                for clip, f in files.items():
                    durs.setdefault(clip, set()).add(frame_count(os.path.join(out, f)))
            else:
                v[layer] = None
        variants[variant] = v
    for clip, s in durs.items():
        if len(s) != 1:
            raise SystemExit(f"段{S.TIER} の {clip} のコマ数が層・通りでそろっていない: {sorted(s)}")
    man["tiers"][str(S.TIER)] = {
        "variants": variants,
        "revealAt": round(S.REVEAL, 3),
        "introDur": round(next(iter(durs["intro"])) / FPS, 3),
        "stayDur": round(next(iter(durs["stay"])) / FPS, 3),
        "outroDur": round(next(iter(durs["outro"])) / FPS, 3),
    }
    man["tiers"] = dict(sorted(man["tiers"].items(), key=lambda kv: int(kv[0])))
    with open(path, "w", encoding="utf-8") as f:
        json.dump(man, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(path, json.dumps(man["tiers"][str(S.TIER)], ensure_ascii=False))


def keep_samples(script, work):
    """確かめ（fx_check.py）のために、焼いたコマを少しだけ残す（透明の差・継ぎ目の元）"""
    mod = load_script(script)
    S = mod.Scene
    dst = os.path.join(work, "_samples")
    os.makedirs(dst, exist_ok=True)
    for variant in S.VARIANTS:
        for clip in ("intro", "stay", "outro"):
            for layer in ("back", "front"):
                d = os.path.join(work, variant, clip, layer)
                if not os.path.isdir(d):
                    continue
                names = sorted(os.listdir(d))
                if not names:
                    continue
                for nm in {names[0], names[len(names) // 2], names[-1]}:
                    shutil.copy(os.path.join(d, nm), os.path.join(dst, f"{variant}-{clip}-{layer}-{nm}"))


def still(script, variant, t, out, clip=None):
    mod = load_script(script)
    st = mod.Scene(variant)
    if clip is None:
        clip = "intro" if t < st.INTRO else "stay"
    i = int(round((t if clip == "intro" else t - st.INTRO) * FPS))
    t0 = time.time()
    back, front = st.draw(st.ctx(clip, i))
    print(f"{time.time() - t0:.2f}秒")
    base = os.path.splitext(out)[0]
    save_rgba(base + "-back.png", back)
    if front is not None:
        save_rgba(base + "-front.png", front)


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("render")
    r.add_argument("script")
    r.add_argument("--variant", default="full")
    r.add_argument("--clip", default="intro")
    r.add_argument("--work", required=True)
    r.add_argument("--jobs", type=int, default=2)
    e = sub.add_parser("encode")
    e.add_argument("script")
    e.add_argument("--work", required=True)
    e.add_argument("--out", required=True)
    a = sub.add_parser("all")
    a.add_argument("script")
    a.add_argument("--work", required=True)
    a.add_argument("--out", required=True)
    a.add_argument("--jobs", type=int, default=2)
    a.add_argument("--keep", action="store_true")
    a.add_argument("--variants", default=None)
    cl = sub.add_parser("clean")
    cl.add_argument("script")
    cl.add_argument("--work", required=True)
    s = sub.add_parser("still")
    s.add_argument("script")
    s.add_argument("--variant", default="full")
    s.add_argument("--t", type=float, required=True)
    s.add_argument("--clip", default=None)
    s.add_argument("--out", required=True)
    m = sub.add_parser("manifest")
    m.add_argument("script")
    m.add_argument("--out", required=True)
    o = ap.parse_args()
    if o.cmd == "render":
        render(o.script, o.variant, o.clip, o.work, o.jobs)
    elif o.cmd == "encode":
        encode(o.script, o.work, o.out)
    elif o.cmd == "manifest":
        write_manifest(o.script, o.out)
    elif o.cmd == "still":
        still(o.script, o.variant, o.t, o.out, o.clip)
    elif o.cmd == "clean":
        # `all --keep` で残した連番の絵を、fx_check.py で画質を数えたあとに消す（_samples だけ残す）
        keep_samples(o.script, o.work)
        for v in load_script(o.script).Scene.VARIANTS:
            shutil.rmtree(os.path.join(o.work, v), ignore_errors=True)
        print("連番の絵を消した（_samples だけ残す）")
    else:
        S = load_script(o.script).Scene
        vs = o.variants.split(",") if o.variants else S.VARIANTS
        for v in vs:
            for clip in ("intro", "stay", "outro"):
                render(o.script, v, clip, o.work, o.jobs)
        encode(o.script, o.work, o.out)
        keep_samples(o.script, o.work)
        write_manifest(o.script, o.out)
        if not o.keep:
            for v in vs:
                shutil.rmtree(os.path.join(o.work, v), ignore_errors=True)
            print("連番の絵を消した（_samples だけ残す）")


if __name__ == "__main__":
    main()
