#!/usr/bin/env python3
"""投げ銭アラートの「光の絵」を焼く道具（#1079 の質の試作 `fx=lux`）。

    python3 tools/alert-theme/lux_art.py public/alert/themes/halloween/lux [--preview <置き場>]

TikTok のギフトが高く見えるのは、3D で描いたあと**光をにじませて（bloom）焼いてある**から。
スマホの上で毎コマ光をにじませる計算をすると重い（WebGL も透明つきの動画も、この箱で GPU が
1,000 ms/秒を超えた。2026-11-02 実測）。そこで**にじみまで焼いた絵**をここで作り、アラートの面では
transform と opacity だけで動かす（合成のスレッドで回る）。

焼き方（どの絵も同じ）:
- 線や形を4倍の細かさで描いて縮める（ふちが滑らか）
- 線そのもの（芯）は白に近い金、そのまわりに金の狭いにじみ、さらに外に紫の広いにじみを足す。
  芯が白く、にじみが色づく、が光に見える形
- 書き出しは「光」として: 色は足し算で溜め、透明度は色のいちばん明るい成分（前掛けの決まりを破らない
  いちばん明るい置き方）。暗い配信の上では光に、明るい地の上でも色が濁らない

できる絵（`<置き場>/*.webp`、WebP q88。透明つき）:

| 名前 | 大きさ | 何 |
| --- | --- | --- |
| circle | 1152 | 魔法陣（外の文字の輪・内の六芒星と三日月・後ろの光だまり・下に敷く薄い暗さ・まわりのきらめき）を1枚に重ねたもの |
| pillar | 256×1024 | 呼び出しの光の柱 |
| rays | 1024 | キャラ絵の後ろで広がる光の筋 |
| orb-gold / orb-violet / orb-pink | 128 | ぼけた光の玉（1つずつ置いて、ゆっくり昇らせる） |
| sparkle-gold / sparkle-violet | 128 | 4方向に光る星 |
| streak | 512×128 | 彗星の尾（ほうきの後ろ） |
| shock | 512 | 広がる光の輪 |
| flare | 256 | 杖の先・呼び出しの閃き（長い光芒） |
| mist | 1024×384 | 前兆の紫の霧（下から湧く） |

`--preview` を渡すと、全部を暗い地と灰色の地に並べた1枚（`lux-preview.png`）も出す（見て決めるため）。
乱数は種を決めてあるので、何度焼いても同じ絵になる（この箱で約1分）。
"""
import argparse
import math
import os

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import gaussian_filter

SS = 4  # 線を描くときの細かさ（縮めてふちを滑らかにする）

# 色（0〜1）。芯は白に近い金、狭いにじみは金、広いにじみは紫
WHITE_GOLD = np.array([1.0, 0.95, 0.82])
GOLD = np.array([1.0, 0.76, 0.30])
AMBER = np.array([1.0, 0.55, 0.18])
VIOLET = np.array([0.62, 0.36, 1.0])
MAGENTA = np.array([0.95, 0.38, 0.95])
PALE = np.array([1.0, 0.97, 0.92])
RING_CORE = np.array([1.0, 0.9, 0.6])  # 魔法陣の線の芯（白に寄せすぎると、昼の配信の上で桃色の線に見えた）

rng = np.random.default_rng(1079)


def lines(w, h, draw_fn):
    """4倍で描いて縮めた、線の濃さ（0〜1）"""
    im = Image.new("L", (w * SS, h * SS), 0)
    d = ImageDraw.Draw(im)
    draw_fn(d, SS)
    im = im.resize((w, h), Image.BOX)
    return np.asarray(im, dtype=np.float32) / 255.0


def light(core, glows, core_col=WHITE_GOLD):
    """芯（濃さ）とにじみ（[(ぼかし σ, 色, 強さ)]）から、光の RGB（前掛け）を作る"""
    rgb = core[..., None] * core_col
    for sigma, col, k in glows:
        g = gaussian_filter(core, sigma) if sigma > 0 else core
        rgb = rgb + g[..., None] * col * k
    return rgb


SHADE = np.array([0.10, 0.03, 0.20])  # 線の下に敷く影の色（濃い紫）


def to_rgba(rgb, alpha_scale=1.0, shade=None):
    """光（前掛けの RGB、足し算で溜めたもの）を、前掛けの (RGB, 透明度) にする。
    透明度 = 色のいちばん明るい成分（1 で頭打ち）。
    `shade`（0〜1 の濃さ）を渡すと、光の下に濃い紫の影を敷く。明るい配信（昼の街）の上でも
    線が白く溶けずに読めるように（光だけだと、明るい地の上では地より暗くならない）"""
    rgb = np.clip(rgb, 0, None)
    # 明るすぎる所は白へ寄せる（足し算で 1 を超えた光は、白く飛んで見えるのが自然）
    over = np.clip(rgb.max(axis=-1, keepdims=True) - 1.0, 0, None)
    rgb = np.clip(rgb + over * 0.6, 0, 1)
    a = np.clip(rgb.max(axis=-1) * alpha_scale, 0, 1)
    if shade is not None:
        sa = np.clip(shade, 0, 1)
        rgb = rgb + (SHADE * sa[..., None]) * (1 - a[..., None])
        a = a + sa * (1 - a)
    return rgb, a


def over(dst, src, at=(0, 0)):
    """前掛けの RGBA を重ねる（src を dst の上へ。at は左上）"""
    (dr, da), (sr, sa) = dst, src
    y, x = at
    h, w = sa.shape
    dr[y:y + h, x:x + w] = sr + dr[y:y + h, x:x + w] * (1 - sa[..., None])
    da[y:y + h, x:x + w] = sa + da[y:y + h, x:x + w] * (1 - sa)


def write_rgba(rgb, a, path, quality=88):
    straight = np.where(a[..., None] > 1e-4, rgb / np.maximum(a[..., None], 1e-4), 0)
    straight = np.clip(straight, 0, 1)
    out = np.dstack([straight, a])
    img = Image.fromarray((out * 255 + 0.5).astype(np.uint8), "RGBA")
    img.save(path, "WEBP", quality=quality, method=6, alpha_quality=100)
    return img


def save_light(rgb, path, quality=88, alpha_scale=1.0, shade=None):
    """光を、透明つきの WebP に書く（`to_rgba` → `write_rgba`）"""
    return write_rgba(*to_rgba(rgb, alpha_scale, shade), path, quality)


def scaled(rgba, size):
    """前掛けの RGBA を縮める（色と透明度を同じに縮める）"""
    rgb, a = rgba
    arr = np.dstack([rgb, a]).astype(np.float32)
    chans = [np.asarray(Image.fromarray(arr[..., i]).resize((size, size), Image.LANCZOS)) for i in range(4)]
    out = np.clip(np.dstack(chans), 0, None)
    return out[..., :3], np.clip(out[..., 3], 0, 1)


def circle(n=1152):
    """魔法陣（外の輪・内の六芒星・光だまり）を1枚に重ねる。

    3枚に分けて重ねると、滞在中にあやとが浮いているだけで GPU が 380 ms/秒になった（1枚なら 36。
    2026-11-02 この箱）。大きな絵が2枚以上重なると、その上で小さなものが動くだけで重くなるので、
    止まっているあいだに見えるものは1枚にしておく。外の輪の直径は 1024px（真ん中に置く）、
    内の六芒星はその 0.8 倍、光だまりは 1.1 倍で濃さ 0.5（アラートで重ねていた大きさと濃さ）。

    いちばん下に**薄い暗さ**（濃い紫、真ん中 0.42 → 絵の縁で 0）を敷く。昼の明るい配信の上では、光だけでは
    地より明るくならず白く溶ける。箱いっぱいの暗さを別の層で敷くと、その層と魔法陣の2枚が重なって
    登場のあいだ 60 コマを割った（2026-11-02 この箱）ので、魔法陣の絵の中に焼く"""
    rgb = np.zeros((n, n, 3), np.float32)
    a = np.zeros((n, n), np.float32)
    dst = (rgb, a)
    r, _ = polar(n)
    rr = r / (n / 2)
    da = 0.5 * np.clip(1 - rr, 0, 1) ** 1.1 * (1 - np.clip((rr - 0.82) / 0.18, 0, 1)) ** 2
    over(dst, (SHADE[None, None, :] * da[..., None], da))
    # 輪のまわりのきらめき（止まった絵に焼く。動かす粒を増やすと重いので、止まった光で密度を出す）
    R = np.random.default_rng(23)
    pts = np.zeros((n, n), np.float32)
    orbs = np.zeros((n, n), np.float32)
    c = n / 2
    for i in range(90):
        ang = R.random() * 2 * math.pi
        rad = (0.3 + R.random() * 0.62) * 512
        x, y = int(c + math.cos(ang) * rad), int(c + math.sin(ang) * rad)
        pts[y, x] += 8 + R.random() * 10
    for i in range(14):
        ang = R.random() * 2 * math.pi
        rad = (0.55 + R.random() * 0.4) * 512
        x, y = int(c + math.cos(ang) * rad), int(c + math.sin(ang) * rad)
        orbs[y, x] += 1
    glit = gaussian_filter(pts, 1.1)[..., None] * PALE + gaussian_filter(pts, 3.5)[..., None] * GOLD * 0.9
    bok = gaussian_filter(orbs, 9)[..., None] * (GOLD * 0.6 + VIOLET * 0.5) * 420
    over(dst, to_rgba(glit + bok))
    pr, pa = to_rgba(pool(512))
    pool_rgba = scaled((pr * 0.5, pa * 0.5), 1126)
    over(dst, pool_rgba, ((n - 1126) // 2, (n - 1126) // 2))
    o_rgb, o_shade = ring_outer(1024)
    over(dst, to_rgba(o_rgb, shade=o_shade), ((n - 1024) // 2, (n - 1024) // 2))
    i_rgb, i_shade = ring_inner(1024)
    inner = scaled(to_rgba(i_rgb, shade=i_shade), 819)
    over(dst, inner, ((n - 819) // 2, (n - 819) // 2))
    return dst


def polar(n):
    y, x = np.mgrid[0:n, 0:n].astype(np.float32)
    c = (n - 1) / 2
    dx, dy = x - c, y - c
    return np.hypot(dx, dy), np.arctan2(dy, dx)


# ------------------------------------------------------------------ 魔法陣
def rune(d, cx, cy, size, ang, seed, width):
    """それらしい文字を1つ（線を3〜5本。縦の幹に枝）。ang は文字の上の向き（輪の外向き）"""
    r = np.random.default_rng(seed)
    up = np.array([math.cos(ang), math.sin(ang)])
    side = np.array([-up[1], up[0]])
    h = size
    pts = lambda u, v: tuple((np.array([cx, cy]) + side * u * h * 0.5 + up * v * h * 0.5).tolist())
    strokes = [((0, -1), (0, 1))]  # 幹
    kinds = [((0, 1), (0.7, 0.4)), ((0, 0.2), (0.7, -0.3)), ((0, -0.3), (-0.7, 0.2)),
             ((0, 0.6), (-0.6, 0.95)), ((-0.6, -0.5), (0.6, -0.5)), ((0, 0), (0.6, 0.6)),
             ((0.7, 0.4), (0.7, -0.6)), ((0, -1), (-0.6, -0.6))]
    for k in r.choice(len(kinds), size=r.integers(2, 4), replace=False):
        strokes.append(kinds[k])
    if r.random() < 0.3:
        strokes = [((-0.5, -1), (-0.5, 1)), ((0.5, -1), (0.5, 1)), ((-0.5, 0.3), (0.5, -0.3))]
    for a, b in strokes:
        d.line([pts(*a), pts(*b)], fill=255, width=width)


def shade_of(core):
    """線の下の影（線のまわり 3〜10px に濃く、外へ薄く）"""
    return np.clip(gaussian_filter(core, 3.0) * 1.6 + gaussian_filter(core, 9.0) * 0.6, 0, 0.72)


def ring_outer(n=1024):
    c = n / 2

    def draw(d, s):
        C = c * s

        def circ(r, w, fill=None):
            d.ellipse([C - r * s, C - r * s, C + r * s, C + r * s], outline=255, width=max(1, int(w * s)), fill=fill)

        circ(498, 5.0)
        circ(486, 2.4)
        circ(404, 6.0)
        circ(394, 1.4)
        # 目盛り（外の輪の外側）
        for i in range(120):
            a = i / 120 * 2 * math.pi
            r0, r1 = (502, 511) if i % 5 == 0 else (502, 507)
            d.line([(C + math.cos(a) * r0 * s, C + math.sin(a) * r0 * s), (C + math.cos(a) * r1 * s, C + math.sin(a) * r1 * s)],
                   fill=255, width=int(1.4 * s))
        # 文字の帯
        N = 30
        for i in range(N):
            a = (i + 0.5) / N * 2 * math.pi
            rx, ry = C + math.cos(a) * 445 * s, C + math.sin(a) * 445 * s
            rune(d, rx, ry, 46 * s, a, 7000 + i, int(4.6 * s))
        # 菱形（8方向）と小さな点
        for i in range(8):
            a = i / 8 * 2 * math.pi
            x, y = C + math.cos(a) * 492 * s, C + math.sin(a) * 492 * s
            r = 13 * s
            d.polygon([(x + math.cos(a) * r, y + math.sin(a) * r), (x - math.sin(a) * r * 0.6, y + math.cos(a) * r * 0.6),
                       (x - math.cos(a) * r, y - math.sin(a) * r), (x + math.sin(a) * r * 0.6, y - math.cos(a) * r * 0.6)], fill=255)
        for i in range(60):
            a = (i + 0.5) / 60 * 2 * math.pi
            x, y = C + math.cos(a) * 398.5 * s, C + math.sin(a) * 398.5 * s
            if i % 2:
                d.ellipse([x - 2.2 * s, y - 2.2 * s, x + 2.2 * s, y + 2.2 * s], fill=255)

    core = lines(n, n, draw)
    rgb = light(core, [(1.5, GOLD, 1.7), (5.0, AMBER, 1.1), (18.0, VIOLET, 0.9), (55.0, VIOLET, 0.45)], RING_CORE)
    return rgb, shade_of(core)


def ring_inner(n=1024):
    c = n / 2

    def draw(d, s):
        C = c * s

        def circ(r, w, x=0, y=0, fill=None):
            d.ellipse([C + x * s - r * s, C + y * s - r * s, C + x * s + r * s, C + y * s + r * s], outline=255,
                      width=max(1, int(w * s)), fill=fill)

        R = 376
        circ(R, 4.6)
        circ(R - 10, 1.2)
        for rot in (0, math.pi):
            p = [(C + math.cos(rot + i * 2 * math.pi / 3 - math.pi / 2) * R * s,
                  C + math.sin(rot + i * 2 * math.pi / 3 - math.pi / 2) * R * s) for i in range(3)]
            d.line(p + [p[0]], fill=255, width=int(5.4 * s), joint="curve")
        # 星の先の小さな輪
        for i in range(6):
            a = i * math.pi / 3 - math.pi / 2
            x, y = math.cos(a) * R, math.sin(a) * R
            circ(26, 3.8, x, y)
            circ(7, 1, x, y, fill=255)
        # 内の輪（六角形の内側）
        circ(212, 4.4)
        circ(200, 1.2)
        # 内の輪と外の輪の間の小さな星（8つ）
        for i in range(6):
            a = i * math.pi / 3
            x, y = C + math.cos(a) * 290 * s, C + math.sin(a) * 290 * s
            r = 14 * s
            d.polygon([(x, y - r), (x + r * 0.28, y - r * 0.28), (x + r, y), (x + r * 0.28, y + r * 0.28), (x, y + r),
                       (x - r * 0.28, y + r * 0.28), (x - r, y), (x - r * 0.28, y - r * 0.28)], fill=255)
        # 真ん中: 三日月と星（魔女の印）
        d.ellipse([C - 92 * s, C - 92 * s, C + 92 * s, C + 92 * s], outline=255, width=int(2.4 * s))
        moon = Image.new("L", (int(2 * c * s), int(2 * c * s)), 0)
        md = ImageDraw.Draw(moon)
        md.ellipse([C - 70 * s, C - 70 * s, C + 70 * s, C + 70 * s], fill=255)
        md.ellipse([C - 40 * s, C - 86 * s, C + 92 * s, C + 46 * s], fill=0)
        d.bitmap((0, 0), moon, fill=255)
        x, y, r = C + 30 * s, C - 20 * s, 26 * s
        d.polygon([(x, y - r), (x + r * 0.25, y - r * 0.25), (x + r, y), (x + r * 0.25, y + r * 0.25), (x, y + r),
                   (x - r * 0.25, y + r * 0.25), (x - r, y), (x - r * 0.25, y - r * 0.25)], fill=255)
        # 内の輪に沿った細かい文字
        N = 24
        for i in range(N):
            a = (i + 0.5) / N * 2 * math.pi
            rune(d, C + math.cos(a) * 150 * s, C + math.sin(a) * 150 * s, 24 * s, a, 9100 + i, int(3.0 * s))

    core = lines(n, n, draw)
    rgb = light(core, [(1.5, GOLD, 1.6), (5.0, AMBER, 0.9), (16.0, MAGENTA, 0.35), (18.0, VIOLET, 0.8), (50.0, VIOLET, 0.4)], RING_CORE)
    return rgb, shade_of(core)


def pool(n=512):
    r, _ = polar(n)
    r = r / (n / 2)
    core = np.exp(-(r / 0.22) ** 2) * 0.9
    mid = np.exp(-(r / 0.55) ** 2)
    wide = np.clip(1 - r, 0, 1) ** 2
    rgb = core[..., None] * WHITE_GOLD * 0.5 + mid[..., None] * GOLD * 0.4 + wide[..., None] * VIOLET * 0.45
    return rgb


def pillar(w=256, h=1024):
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    u = (x - w / 2) / (w / 2)  # -1..1
    v = y / h  # 0 上 .. 1 下
    # 縦の筋（横の位置ごとに明るさが違う。縦にはゆっくり変わる）
    streak = gaussian_filter(rng.random((h // 16, w)).astype(np.float32), (1.5, 2.5))
    streak = np.asarray(Image.fromarray((streak * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC), np.float32) / 255
    streak = 0.55 + 0.9 * (streak - streak.mean())
    core = np.exp(-(u / 0.07) ** 2)
    mid = np.exp(-(u / 0.25) ** 2) * streak
    wide = np.exp(-(u / 0.6) ** 2)
    fade = np.clip(v, 0, 1) ** 1.6 * (1 - np.clip((v - 0.96) / 0.04, 0, 1))  # 上へ消える。下の端は少し落とす
    rgb = (core[..., None] * PALE * 1.2 + mid[..., None] * GOLD * 0.7 + wide[..., None] * VIOLET * 0.55) * fade[..., None]
    # 根元のまぶしさ
    base = np.exp(-((u / 0.5) ** 2 + ((v - 0.97) / 0.05) ** 2))
    rgb += base[..., None] * WHITE_GOLD * 0.8
    return rgb


def rays(n=1024):
    r, th = polar(n)
    rr = r / (n / 2)
    acc = np.zeros((n, n), np.float32)
    accv = np.zeros((n, n), np.float32)
    R = np.random.default_rng(42)
    for i in range(34):
        a0 = R.random() * 2 * math.pi
        wid = 0.012 + R.random() ** 2 * 0.06
        ln = 0.55 + R.random() * 0.45
        k = 0.35 + R.random() * 0.65
        d = np.angle(np.exp(1j * (th - a0)))
        prof = np.exp(-(d / wid) ** 2) * np.exp(-(rr / ln) ** 2 * 2.2) * k
        if i % 4 == 0:
            accv += prof
        else:
            acc += prof
    hole = np.clip(rr / 0.12, 0, 1) ** 1.5  # 真ん中は芯の光に任せる
    acc *= hole
    accv *= hole
    glow = np.exp(-(rr / 0.18) ** 2) * 0.55
    rgb = acc[..., None] * (GOLD * 0.6 + PALE * 0.4) * 0.75 + accv[..., None] * VIOLET * 0.8 + glow[..., None] * GOLD
    return gaussian_filter(rgb, (2.5, 2.5, 0))


def orb(n=128, col=GOLD):
    """ぼけた光の玉1つ（真ん中が少し明るく、ふちがやわらかい。うっすら輪がある）"""
    r, _ = polar(n)
    d = r / (n / 2 - 2)
    soft = np.exp(-(d / 0.62) ** 2)
    rim = np.exp(-((d - 0.8) / 0.1) ** 2) * (d < 1.0) * 0.35
    edge = np.clip((1 - d) * 8, 0, 1)
    k = (soft * 0.85 + rim) * edge
    return k[..., None] * (col * 0.75 + PALE * 0.25)


def sparkle(n=128, col=GOLD):
    y, x = np.mgrid[0:n, 0:n].astype(np.float32)
    c = (n - 1) / 2
    dx, dy = (x - c) / c, (y - c) / c
    arm = np.exp(-(dy / 0.035) ** 2) * np.exp(-(np.abs(dx) / 0.75) ** 1.4) + np.exp(-(dx / 0.035) ** 2) * np.exp(-(np.abs(dy) / 0.75) ** 1.4)
    diag = (np.exp(-(((dx - dy) / 1.414) / 0.03) ** 2) + np.exp(-(((dx + dy) / 1.414) / 0.03) ** 2)) * np.exp(-(np.hypot(dx, dy) / 0.32) ** 1.4) * 0.6
    r = np.hypot(dx, dy)
    core = np.exp(-(r / 0.09) ** 2)
    glow = np.exp(-(r / 0.35) ** 2)
    rgb = (arm + diag + core * 1.4)[..., None] * PALE + (arm * 0.6 + glow * 0.55)[..., None] * col
    return rgb


def streak(w=512, h=128):
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    u = x / w  # 0 尾の端 .. 1 頭
    v = (y - h / 2) / (h / 2)
    along = np.clip(u, 0, 1) ** 2.2 * (1 - np.clip((u - 0.97) / 0.03, 0, 1) ** 2)
    thin = np.exp(-(v / (0.05 + 0.1 * u)) ** 2)
    wide = np.exp(-(v / (0.25 + 0.35 * u)) ** 2)
    rgb = along[..., None] * (thin[..., None] * PALE * 1.3 + wide[..., None] * (GOLD * 0.55 + VIOLET * 0.45) * 0.8)
    # 尾の中の粒
    R = np.random.default_rng(5)
    pts = np.zeros((h, w), np.float32)
    for i in range(40):
        px = int(R.random() ** 0.6 * (w - 20))
        py = int(h / 2 + (R.random() - 0.5) * h * 0.5 * (1 - px / w))
        pts[py, px] += 3 * (px / w)
    rgb += gaussian_filter(pts, 1.5)[..., None] * PALE + gaussian_filter(pts, 4)[..., None] * GOLD
    return rgb


def shock(n=512):
    r, _ = polar(n)
    rr = r / (n / 2)
    ring = np.exp(-((rr - 0.88) / 0.012) ** 2)
    glow = np.exp(-((rr - 0.86) / 0.06) ** 2)
    inner = np.clip(rr / 0.88, 0, 1) ** 4 * (rr < 0.9) * 0.18
    return ring[..., None] * PALE * 1.2 + glow[..., None] * (GOLD * 0.6 + VIOLET * 0.5) + inner[..., None] * VIOLET


def flare(n=256):
    y, x = np.mgrid[0:n, 0:n].astype(np.float32)
    c = (n - 1) / 2
    dx, dy = (x - c) / c, (y - c) / c
    r = np.hypot(dx, dy)
    th = np.arctan2(dy, dx)
    spikes = np.zeros_like(r)
    for i in range(8):
        a = i * math.pi / 4
        d = np.angle(np.exp(1j * (th - a)))
        ln = 1.0 if i % 2 == 0 else 0.55
        spikes += np.exp(-(d * r / 0.012) ** 2) * np.exp(-(r / ln) ** 1.3 * 2.5)
    core = np.exp(-(r / 0.07) ** 2)
    glow = np.exp(-(r / 0.25) ** 2)
    halo = np.exp(-((r - 0.42) / 0.03) ** 2) * 0.12
    rgb = (spikes + core * 1.6)[..., None] * PALE + glow[..., None] * GOLD * 0.8 + (glow * 0.3 + halo)[..., None] * VIOLET
    return rgb


def mist(w=1024, h=384):
    def noise(scale, seed):
        R = np.random.default_rng(seed)
        small = R.random((max(2, h // scale), max(2, w // scale))).astype(np.float32)
        small = gaussian_filter(small, 1.0, mode="wrap")
        return np.asarray(Image.fromarray((small * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC), np.float32) / 255

    f = noise(96, 1) * 0.5 + noise(40, 2) * 0.3 + noise(16, 3) * 0.2
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    v = y / h
    u = x / w
    shape = np.clip((v - 0.15) / 0.6, 0, 1) ** 1.2  # 下ほど濃い
    side = np.clip(np.minimum(u, 1 - u) / 0.2, 0, 1)
    dens = np.clip((f - 0.5) * 3.2 + shape * 0.7 - 0.3, 0, 1) * shape * side
    dens = gaussian_filter(dens, 2.5) ** 1.3
    top = np.clip(1 - v * 1.4, 0, 1)  # 上のふちは明るい（光が当たる）
    rgb = dens[..., None] * (VIOLET * 0.42 + MAGENTA * 0.1) + (dens * top * 0.6)[..., None] * (GOLD * 0.25 + PALE * 0.15)
    return rgb


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out")
    ap.add_argument("--preview", default="")
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    made = {}
    for name, fn in [
        ("circle", circle),
        ("pillar", pillar),
        ("rays", rays),
        ("orb-gold", lambda: orb(128, GOLD)),
        ("orb-violet", lambda: orb(128, VIOLET)),
        ("orb-pink", lambda: orb(128, MAGENTA)),
        ("sparkle-gold", lambda: sparkle(128, GOLD)),
        ("sparkle-violet", lambda: sparkle(128, VIOLET)),
        ("streak", streak),
        ("shock", shock),
        ("flare", flare),
        ("mist", mist),
    ]:
        p = os.path.join(a.out, f"{name}.webp")
        r = fn()
        # circle は前掛けの (RGB, 透明度) で返る（3枚を重ね終えたもの）
        made[name] = write_rgba(r[0], r[1], p) if isinstance(r, tuple) else save_light(r, p)
        print(f"{name:15s} {made[name].size[0]}x{made[name].size[1]}  {os.path.getsize(p) / 1024:.0f}KB")
    total = sum(os.path.getsize(os.path.join(a.out, f"{n}.webp")) for n in made)
    print(f"合計 {total / 1024:.0f}KB")
    if a.preview:
        tiles = []
        for bgc in ((10, 8, 22), (120, 120, 120)):
            row = []
            for name, im in made.items():
                t = im.copy()
                t.thumbnail((256, 256))
                bg = Image.new("RGBA", (260, 260), bgc + (255,))
                bg.alpha_composite(t, ((260 - t.size[0]) // 2, (260 - t.size[1]) // 2))
                row.append(bg)
            tiles.append(row)
        sheet = Image.new("RGBA", (260 * len(made), 520))
        for j, row in enumerate(tiles):
            for i, t in enumerate(row):
                sheet.paste(t, (i * 260, j * 260))
        sheet.convert("RGB").save(os.path.join(a.preview, "lux-preview.png"))


if __name__ == "__main__":
    main()
