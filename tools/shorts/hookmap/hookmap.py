#!/usr/bin/env python3
"""街を回る回のフック（0秒目〜）に置く、地図のアニメーションを描く（帳面 F-060）。

    python3 tools/shorts/hookmap/hookmap.py <回の hookmap.json> --out <置き場> [--fps 30] [--frames-only]
    python3 tools/shorts/hookmap/hookmap.py --fix-edit <edit_X.json>   # 組んだ指示書で、地図の素材の透かしの切り落としを外す

出来るもの: `<置き場>/hook_map.mp4`（1080x1920・30fps・H.264・音なし）と、build_edit.py にそのまま渡せる
窓の一覧 `<置き場>/index.json`（配信に無い素材なので、配信の時間軸の外の秒 `start` に置く。spec の src にその秒を書く）、
確かめ用の `<置き場>/contact.jpg`（0.25秒ごとのコマの一覧）。

## 何を描くか（3つの段。秒は hookmap.json の `timeline`）

1. **国**: 国の地図に、大きい街の印を順に出す（`cities` の rank の順）。主役の街（`hero`）は大きく光らせ、
   題の言葉（「第三の街」など）が並びで分かるようにする。地図は止めずに、ゆっくり寄せ続ける
2. **寄る**: 主役の街へ一気に寄る（倍率は指数で動かす。等速だと最後だけ急に見える）
3. **道のり**: その日に回った場所（`stops`）を、回った順に線でつなぎ、着いた場所に小さな絵を出す。
   縮尺の棒（`scale_bar_m`）を添える。線の破線は流れ続ける（止め絵の検査 `still_image` に当たらないように）

題の札（黒い箱）は書き出しが上に重ねるので、ここでは描かない。札の帯（`layout.title_band`）に、
街の印と字を置かない（帯の外に置けなければ止まる）。

## 地図の素材

Natural Earth の 1:50m の国境（`ne_50m_admin_0_countries.geojson`、版 v5.1.2）。**公有（public domain）で、
表示の義務も無い**（https://www.naturalearthdata.com/about/terms-of-use/）。OpenStreetMap のタイルのように
帰属の表示が要る素材は使わない。初回に GitHub の nvkelso/natural-earth-vector の版の札から落として
`--cache`（既定 ~/.cache/hookmap）に置き、sha256 を確かめる（中身が変わっていたら止まる）。

街の中（寄ったあと）は、国の地図の解像度では道が無いので、地の色だけにして、場所どうしの位置と縮尺だけを
正しく描く（緯度・経度を同じ投影で置く。縮尺の棒も同じ投影から出す）。

## 書体と絵

字は M PLUS Rounded 1c Black（`tools/shorts/render/fonts/`。OFL。無ければ `render/fetch_fonts.sh`）。
場所の絵（`icon`）はここでコードで描く: townhall（時計塔の建物）・donut（穴の無い丸いドーナツ）・
helmet（騎士の兜）・water（水面と灯り）・pin（汎用）。絵文字の書体は使わない（字形が版で変わる）。
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import shutil
import subprocess
import sys
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = Path(__file__).resolve().parent
FONTS = HERE.parent / "render" / "fonts"
NE_TAG = "v5.1.2"
NE_FILE = "ne_50m_admin_0_countries.geojson"
NE_URL = f"https://raw.githubusercontent.com/nvkelso/natural-earth-vector/{NE_TAG}/geojson/{NE_FILE}"
NE_SHA256 = "3e458fc036ad0a66411f2c1e6cac49c5d7bfb81cb1123bc513b22511a2b7fdeb"
M_PER_DEG = 111_320.0
SS = 2                      # 2倍で描いて縮める（縁のギザギザを消す）
# 配信の時間軸の外の秒（配信は10時間まで。100000秒 = 27:46:40）。build_edit.py の窓の一覧は秒で引くので、
# 配信と重ならない所に置けば、ほかの窓と取り違えない
T_BASE = 100000.0

COL = {
    "sea_top": (176, 220, 240), "sea_bottom": (138, 196, 228),
    "land": (238, 230, 210), "focus": (250, 244, 228), "edge": (196, 178, 140),
    "shadow": (60, 90, 120, 70), "city": (88, 104, 140), "hero": (255, 78, 54), "glow": (255, 196, 64),
    "route": (255, 90, 54), "route_edge": (255, 255, 255), "town": (246, 238, 220), "ink": (40, 40, 52),
}


# ---------------------------------------------------------------- 素材

def natural_earth(cache: Path) -> dict:
    cache.mkdir(parents=True, exist_ok=True)
    p = cache / f"{NE_TAG}_{NE_FILE}"
    if not p.exists():
        tmp = p.with_suffix(".part")
        with urllib.request.urlopen(NE_URL, timeout=120) as r, open(tmp, "wb") as f:
            shutil.copyfileobj(r, f)
        tmp.rename(p)
    got = hashlib.sha256(p.read_bytes()).hexdigest()
    if got != NE_SHA256:
        sys.exit(f"Natural Earth の中身が控えと違う（{got}）。版 {NE_TAG} を取り直すか、控えを確かめて書き換える")
    return json.loads(p.read_text(encoding="utf-8"))


def polygons(ne: dict, codes: list[str]) -> dict[str, list[list[tuple[float, float]]]]:
    """国の記号（ADM0_A3。France の ISO_A3 は -99 なので ISO は使わない）→ 外周の輪の並び（経度, 緯度）。"""
    out: dict[str, list] = {c: [] for c in codes}
    for f in ne["features"]:
        c = f["properties"].get("ADM0_A3")
        if c not in out:
            continue
        g = f["geometry"]
        polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
        for poly in polys:
            out[c].append([tuple(pt) for pt in poly[0]])
    missing = [c for c, v in out.items() if not v]
    if missing:
        sys.exit(f"Natural Earth に無い国の記号: {missing}（ADM0_A3 で書く）")
    return out


def font(size: float, bold: str = "Black") -> ImageFont.FreeTypeFont:
    p = FONTS / f"MPLUSRounded1c-{bold}.ttf"
    if not p.exists():
        sys.exit(f"書体が無い: {p}（tools/shorts/render/fetch_fonts.sh）")
    return ImageFont.truetype(str(p), int(size))


# ---------------------------------------------------------------- 投影とカメラ

class Cam:
    """正距円筒に、基準の緯度の cos を横に掛けた投影。scale は「緯度1度あたりの画素」（2倍の描画の画素）。"""

    def __init__(self, lat0: float, cx: float, cy: float, lon: float, lat: float, scale: float):
        self.k = math.cos(math.radians(lat0))
        self.cx, self.cy, self.lon, self.lat, self.scale = cx, cy, lon, lat, scale

    def xy(self, lon: float, lat: float) -> tuple[float, float]:
        return (self.cx + (lon - self.lon) * self.k * self.scale, self.cy - (lat - self.lat) * self.scale)


def ease(t: float) -> float:
    t = min(1.0, max(0.0, t))
    return t * t * (3 - 2 * t)


def ease_out_back(t: float) -> float:
    t = min(1.0, max(0.0, t))
    c = 1.70158
    return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2


def lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


# ---------------------------------------------------------------- 描く部品

def stroke_text(d: ImageDraw.ImageDraw, xy, text: str, f, fill, stroke=None, sw=0, anchor="lm"):
    d.text(xy, text, font=f, fill=fill, stroke_width=sw, stroke_fill=stroke or (255, 255, 255), anchor=anchor)


def badge(img: Image.Image, x: float, y: float, r: float, fill, num: str | None, a: float = 1.0):
    lay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    d.ellipse([x - r - 3 * SS, y - r - 3 * SS, x + r + 3 * SS, y + r + 3 * SS], fill=(255, 255, 255, int(255 * a)))
    d.ellipse([x - r, y - r, x + r, y + r], fill=fill + (int(255 * a),))
    if num:
        d.text((x, y + r * 0.04), num, font=font(r * 1.35), fill=(255, 255, 255, int(255 * a)), anchor="mm")
    img.alpha_composite(lay)


def icon(kind: str, size: float) -> Image.Image:
    """場所の小さな絵（size×size・透明の地）。"""
    s = int(size)
    im = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    u = s / 100.0
    if kind == "townhall":
        stone, dark = (214, 196, 160), (120, 98, 70)
        d.rectangle([14 * u, 62 * u, 86 * u, 88 * u], fill=stone, outline=dark, width=int(2 * u))
        for i in range(6):
            x = 20 * u + i * 12 * u
            d.rectangle([x, 66 * u, x + 5 * u, 86 * u], fill=(236, 222, 190))
        d.polygon([(10 * u, 62 * u), (50 * u, 52 * u), (90 * u, 62 * u)], fill=dark)
        d.rectangle([38 * u, 26 * u, 62 * u, 54 * u], fill=stone, outline=dark, width=int(2 * u))
        d.ellipse([42 * u, 30 * u, 58 * u, 46 * u], fill=(255, 255, 255), outline=dark, width=int(2 * u))
        d.line([(50 * u, 38 * u), (50 * u, 33 * u)], fill=dark, width=int(2 * u))
        d.line([(50 * u, 38 * u), (54 * u, 38 * u)], fill=dark, width=int(2 * u))
        d.pieslice([38 * u, 10 * u, 62 * u, 34 * u], 180, 360, fill=(110, 140, 150), outline=dark, width=int(2 * u))
        d.line([(50 * u, 4 * u), (50 * u, 12 * u)], fill=dark, width=int(2 * u))
    elif kind == "donut":
        # 穴の無い丸いドーナツ（砂糖の粒と、上にチョコの塊）。リーズの回の「穴が無い！」
        d.ellipse([12 * u, 30 * u, 88 * u, 92 * u], fill=(226, 166, 92), outline=(160, 104, 48), width=int(2 * u))
        d.ellipse([20 * u, 36 * u, 74 * u, 70 * u], fill=(240, 190, 120))
        for i in range(26):
            a = i * 2.39996
            rr = 30 * u * math.sqrt((i + 0.5) / 26)
            px, py = 50 * u + rr * math.cos(a) * 1.15, 62 * u + rr * math.sin(a) * 0.9
            d.ellipse([px - 1.6 * u, py - 1.6 * u, px + 1.6 * u, py + 1.6 * u], fill=(255, 250, 240))
        d.polygon([(30 * u, 40 * u), (40 * u, 14 * u), (58 * u, 10 * u), (72 * u, 22 * u), (70 * u, 42 * u)],
                  fill=(92, 52, 30), outline=(60, 32, 18))
        d.ellipse([44 * u, 16 * u, 54 * u, 24 * u], fill=(140, 90, 60))
    elif kind == "helmet":
        steel, dark, gold = (190, 196, 206), (80, 86, 98), (222, 176, 52)
        d.chord([18 * u, 8 * u, 82 * u, 72 * u], 180, 360, fill=steel, outline=dark, width=int(2 * u))
        d.rectangle([18 * u, 40 * u, 82 * u, 80 * u], fill=steel, outline=dark, width=int(2 * u))
        d.polygon([(18 * u, 80 * u), (50 * u, 94 * u), (82 * u, 80 * u)], fill=steel, outline=dark)
        d.rectangle([26 * u, 44 * u, 74 * u, 50 * u], fill=dark)
        d.line([(50 * u, 10 * u), (50 * u, 92 * u)], fill=gold, width=int(4 * u))
        for y in (58, 66, 74):
            d.line([(30 * u, y * u), (44 * u, y * u)], fill=dark, width=int(2 * u))
            d.line([(56 * u, y * u), (70 * u, y * u)], fill=dark, width=int(2 * u))
    elif kind == "water":
        d.rounded_rectangle([8 * u, 20 * u, 92 * u, 88 * u], radius=14 * u, fill=(36, 62, 110))
        for i, y in enumerate((44, 60, 76)):
            pts = [(10 * u + k * 4 * u, (y + 4 * math.sin(k * 0.9 + i)) * u) for k in range(21)]
            d.line(pts, fill=(120, 170, 230), width=int(3 * u))
        for x, y in ((28, 36), (50, 30), (70, 38), (40, 52), (62, 56)):
            d.ellipse([(x - 3) * u, (y - 3) * u, (x + 3) * u, (y + 3) * u], fill=(255, 214, 110))
            d.line([(x * u, (y + 5) * u), (x * u, (y + 14) * u)], fill=(255, 214, 110), width=int(2 * u))
    else:
        d.ellipse([20 * u, 10 * u, 80 * u, 70 * u], fill=COL["route"])
        d.polygon([(28 * u, 56 * u), (50 * u, 94 * u), (72 * u, 56 * u)], fill=COL["route"])
        d.ellipse([38 * u, 28 * u, 62 * u, 52 * u], fill=(255, 255, 255))
    return im


def stop_card(img: Image.Image, x: float, y: float, kind: str, label: str, t: float, side: str):
    """道のりの場所: 白い丸に絵、横に名前。t は出てくる途中（0→1）。"""
    if t <= 0:
        return
    k = ease_out_back(t)
    r = 56 * SS * k
    a = min(1.0, t * 2)
    lay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    d.ellipse([x - r - 6 * SS, y - r - 6 * SS, x + r + 6 * SS, y + r + 6 * SS], fill=COL["route"] + (int(255 * a),))
    d.ellipse([x - r, y - r, x + r, y + r], fill=(255, 255, 255, int(255 * a)))
    img.alpha_composite(lay)
    if r > 4:
        ic = icon(kind, r * 1.5)
        img.alpha_composite(ic, (int(x - ic.width / 2), int(y - ic.height / 2)))
    if t > 0.35:
        d2 = ImageDraw.Draw(img)
        f = font(50 * SS)
        if side == "right":
            stroke_text(d2, (x + 70 * SS, y), label, f, COL["ink"], sw=9 * SS, anchor="lm")
        elif side == "left":
            stroke_text(d2, (x - 70 * SS, y), label, f, COL["ink"], sw=9 * SS, anchor="rm")
        elif side == "below":
            stroke_text(d2, (x, y + 78 * SS), label, f, COL["ink"], sw=9 * SS, anchor="mt")
        else:
            stroke_text(d2, (x, y - 78 * SS), label, f, COL["ink"], sw=9 * SS, anchor="mb")


# ---------------------------------------------------------------- 1コマ

def sea(W: int, H: int) -> Image.Image:
    g = Image.new("RGB", (1, H))
    for y in range(H):
        t = y / (H - 1)
        g.putpixel((0, y), tuple(int(lerp(a, b, t)) for a, b in zip(COL["sea_top"], COL["sea_bottom"])))
    return g.resize((W, H)).convert("RGBA")


def national_layer(cfg: dict, polys: dict, t: float, W: int, H: int, bg: Image.Image) -> tuple[Image.Image, Cam]:
    """国の地図。止めずに寄せ続ける: 国の段 1.0→1.1 倍、寄る段で主役の街へ（指数で）、そのあともゆっくり。"""
    tl, nat = cfg["timeline"], cfg["national"]
    z0, z1 = tl["zoom"]
    hero = next(c for c in cfg["cities"] if c["name"] == cfg["hero"])
    zmax = nat.get("zoom_to", 2.4)
    if t < z0:
        u, lon, lat = t / z0, nat["lon"], nat["lat"]
        f = 1.0 + 0.10 * u
    elif t < z1:
        u = ease((t - z0) / (z1 - z0))
        lon, lat = lerp(nat["lon"], hero["lon"], u), lerp(nat["lat"], hero["lat"], u)
        f = math.exp(lerp(math.log(1.10), math.log(zmax), u))
    else:
        u = (t - z1) / max(1e-6, cfg["seconds"] - z1)
        # 札が開いたあとも、後ろの国の地図を寄せ続ける。札の中の線の伸びだけでは、隣のコマとの差が小さく
        # 書き出しの「止まったコマ」（差の平均 0.5 未満が 1.5秒）に近づく（リーズ p3 v4 で 1.3秒）
        lon, lat, f = hero["lon"], hero["lat"], zmax * (1.0 + 0.40 * u)
    cam = Cam(cfg["lat0"], W / 2, nat["cy"] * SS, lon, lat, nat["scale"] * SS * f)
    img = bg.copy()
    sh = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ds = ImageDraw.Draw(sh)
    land = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    dl = ImageDraw.Draw(land)
    for code, rings in polys.items():
        focus = code == cfg["focus"]
        for ring in rings:
            pts = [cam.xy(lo, la) for lo, la in ring]
            if focus:
                ds.polygon([(x + 10 * SS, y + 14 * SS) for x, y in pts], fill=COL["shadow"])
            dl.polygon(pts, fill=(COL["focus"] if focus else COL["land"]) + (255,),
                       outline=COL["edge"] + (255,), width=int(2.5 * SS))
    img.alpha_composite(sh.filter(ImageFilter.GaussianBlur(10 * SS)))
    img.alpha_composite(land)
    return img, cam


def city_pins(img: Image.Image, cfg: dict, cam: Cam, t: float, fade: float):
    """国の段: 大きい街の印を rank の順に。主役の街は広がる輪を出し続ける。"""
    W, H = img.size
    for c, t_pin in zip(sorted(cfg["cities"], key=lambda c: c["rank"]), cfg["timeline"]["pins"]):
        if t < t_pin or fade <= 0:
            continue
        k = ease_out_back((t - t_pin) / 0.22)
        x, y = cam.xy(c["lon"], c["lat"])
        is_hero = c["name"] == cfg["hero"]
        if is_hero:
            for j in range(3):
                ph = ((t - t_pin) * 1.6 + j / 3) % 1.0
                rr = (40 + 120 * ph) * SS
                lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
                ImageDraw.Draw(lay).ellipse([x - rr, y - rr, x + rr, y + rr],
                                            outline=COL["glow"] + (int(230 * (1 - ph) * fade),), width=int(10 * SS))
                img.alpha_composite(lay)
        r = (50 if is_hero else 36) * SS * k
        badge(img, x, y, r, COL["hero"] if is_hero else COL["city"], str(c["rank"]) if r > 10 * SS else None, fade)
        if k > 0.5:
            f = font((84 if is_hero else 54) * SS)
            off = (70 if is_hero else 52) * SS
            col = (COL["hero"] if is_hero else COL["ink"]) + (int(255 * fade),)
            sw = (12 if is_hero else 9) * SS
            d = ImageDraw.Draw(img)
            if c.get("label", "right") == "right":
                stroke_text(d, (x + off, y), c["name"], f, col, sw=sw, anchor="lm")
            else:
                stroke_text(d, (x - off, y), c["name"], f, col, sw=sw, anchor="rm")


def city_layer(cfg: dict, t: float, W: int, H: int) -> Image.Image:
    """街の段（札の中身）: 地の色に、回った順の道のりと場所の絵と縮尺の棒。全画面の座標で描き、札の枠で切る。"""
    tl, city = cfg["timeline"], cfg["city"]
    r0, r1 = tl["route"]
    u = max(0.0, (t - tl["zoom"][0]) / max(1e-6, cfg["seconds"] - tl["zoom"][0]))
    cam = Cam(cfg["lat0"], W / 2, city["cy"] * SS, city["_lon"], city["_lat"], city["_scale"] * SS * (0.88 + 0.20 * u))
    img = Image.new("RGBA", (W, H), COL["town"] + (255,))
    d = ImageDraw.Draw(img)
    # 方位（北が上）だけを小さく。道は描かない（国の地図の解像度に道は無い。位置と縮尺だけを正しく）
    cx0, cy0, cx1, cy1 = [v * SS for v in city["card"]]
    nx, ny = cx1 - 60 * SS, cy0 + 120 * SS
    d.polygon([(nx, ny - 34 * SS), (nx - 16 * SS, ny + 6 * SS), (nx + 16 * SS, ny + 6 * SS)], fill=(150, 140, 120))
    d.text((nx, ny + 12 * SS), "N", font=font(30 * SS), fill=(150, 140, 120), anchor="mt")
    stops = cfg["stops"]
    pts = [cam.xy(s["lon"], s["lat"]) for s in stops]
    seg = [math.dist(pts[i], pts[i + 1]) for i in range(len(pts) - 1)]
    total = sum(seg)
    walk = r1 - r0 - 0.25
    prog = ease((t - r0) / walk) * total if t > r0 else 0.0
    drawn, acc = [pts[0]], 0.0
    for i, L in enumerate(seg):
        if acc + L <= prog:
            drawn.append(pts[i + 1])
            acc += L
        else:
            f = (prog - acc) / L if L else 0
            drawn.append((lerp(pts[i][0], pts[i + 1][0], f), lerp(pts[i][1], pts[i + 1][1], f)))
            break
    if prog > 0:
        lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        dl = ImageDraw.Draw(lay)
        dl.line(drawn, fill=COL["route_edge"] + (255,), width=int(30 * SS), joint="curve")
        dl.line(drawn, fill=COL["route"] + (255,), width=int(18 * SS), joint="curve")
        step, ph = 46 * SS, (t * 160 * SS) % (46 * SS)
        run = 0.0
        for a, b in zip(drawn, drawn[1:]):
            L = math.dist(a, b)
            s = (ph - run) % step
            while L and s < L:
                q = (lerp(a[0], b[0], s / L), lerp(a[1], b[1], s / L))
                dl.ellipse([q[0] - 4 * SS, q[1] - 4 * SS, q[0] + 4 * SS, q[1] + 4 * SS], fill=(255, 255, 255, 255))
                s += step
            run += L
        img.alpha_composite(lay)
    acc = 0.0
    for i, s in enumerate(stops):
        if i > 0:
            acc += seg[i - 1]
        t_at = r0 + (acc / total) * walk if total else r0
        stop_card(img, pts[i][0], pts[i][1], s["icon"], s["name"], (t - t_at) / 0.25, s.get("label", "right"))
    sb = cfg.get("scale_bar_m")
    if sb:
        px = sb / M_PER_DEG * cam.scale
        x0, y0 = cfg["layout"]["scale_bar_xy"][0] * SS, cfg["layout"]["scale_bar_xy"][1] * SS
        d = ImageDraw.Draw(img)
        d.rectangle([x0, y0 - 8 * SS, x0 + px, y0 + 8 * SS], fill=(40, 40, 52))
        d.rectangle([x0 + px / 2, y0 - 8 * SS, x0 + px, y0 + 8 * SS], fill=(255, 255, 255), outline=(40, 40, 52))
        label = f"{sb}m" if sb < 1000 else f"{sb / 1000:g}km"
        stroke_text(d, (x0, y0 - 22 * SS), label, font(40 * SS), (40, 40, 52), sw=7 * SS, anchor="lb")
    tn = cfg.get("town_label")
    if tn:
        x0, y0 = cfg["layout"]["town_label_xy"][0] * SS, cfg["layout"]["town_label_xy"][1] * SS
        stroke_text(ImageDraw.Draw(img), (x0, y0), tn, font(56 * SS), COL["hero"], sw=10 * SS, anchor="lm")
    return img


def frame(cfg: dict, polys: dict, t: float, W: int, H: int, bg: Image.Image) -> Image.Image:
    tl = cfg["timeline"]
    z0, z1 = tl["zoom"]
    img, cam = national_layer(cfg, polys, t, W, H, bg)
    fade = 1.0 - ease((t - z0) / (0.5 * (z1 - z0))) if t > z0 else 1.0
    city_pins(img, cfg, cam, t, fade)
    if t <= z0:
        return img
    # 寄る段: 主役の街の印から、街の札が広がる（虫眼鏡で寄る見え方）。後ろの国の地図は少し沈める
    k = ease_out_back((t - z0) / (z1 - z0))
    dim = Image.new("RGBA", (W, H), (20, 40, 60, int(30 * min(1.0, (t - z0) / (z1 - z0)))))
    img.alpha_composite(dim)
    hero = next(c for c in cfg["cities"] if c["name"] == cfg["hero"])
    hx, hy = cam.xy(hero["lon"], hero["lat"])
    x0, y0, x1, y1 = [v * SS for v in cfg["city"]["card"]]
    cw, ch = int(x1 - x0), int(y1 - y0)
    card = city_layer(cfg, t, W, H).crop((int(x0), int(y0), int(x1), int(y1)))
    mask = Image.new("L", (cw, ch), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, cw - 1, ch - 1], radius=48 * SS, fill=255)
    card.putalpha(mask)
    sw, sh = max(2, int(cw * k)), max(2, int(ch * k))
    cx, cy = lerp(hx, (x0 + x1) / 2, min(1.0, k)), lerp(hy, (y0 + y1) / 2, min(1.0, k))
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle([cx - sw / 2 + 8 * SS, cy - sh / 2 + 16 * SS, cx + sw / 2 + 8 * SS,
                                              cy + sh / 2 + 16 * SS], radius=48 * SS * k, fill=(0, 0, 0, 90))
    img.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(14 * SS)))
    border = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(border).rounded_rectangle([cx - sw / 2 - 8 * SS, cy - sh / 2 - 8 * SS, cx + sw / 2 + 8 * SS,
                                              cy + sh / 2 + 8 * SS], radius=56 * SS * k, fill=(255, 255, 255, 255))
    img.alpha_composite(border)
    img.alpha_composite(card.resize((sw, sh), Image.LANCZOS), (int(cx - sw / 2), int(cy - sh / 2)))
    return img


# ---------------------------------------------------------------- 準備と確かめ

def prepare(cfg: dict) -> None:
    """街の段のカメラ（場所の外接の中心と、枠に収まる倍率）を、場所の緯度・経度から決める。"""
    k = math.cos(math.radians(cfg["lat0"]))
    st = cfg["stops"]
    lons, lats = [s["lon"] for s in st], [s["lat"] for s in st]
    box = cfg["city"]["box"]          # [x0, y0, x1, y1]（1倍の画素）。場所の印がこの中に収まる（札 card の内側）
    w_deg, h_deg = (max(lons) - min(lons)) * k, max(lats) - min(lats)
    sc = min((box[2] - box[0]) / max(w_deg, 1e-9), (box[3] - box[1]) / max(h_deg, 1e-9))
    cfg["city"]["_scale"] = sc
    cfg["city"]["_lon"] = (max(lons) + min(lons)) / 2
    cfg["city"]["_lat"] = (max(lats) + min(lats)) / 2
    cfg["city"]["cy"] = (box[1] + box[3]) / 2
    # 札の帯に、街の印と道のりの場所を置かない
    band = cfg["layout"]["title_band"]
    nat = cfg["national"]
    cam = Cam(cfg["lat0"], 540, nat["cy"], nat["lon"], nat["lat"], nat["scale"])
    bad = [c["name"] for c in cfg["cities"] if band[0] - 60 <= cam.xy(c["lon"], c["lat"])[1] <= band[1] + 60]
    camc = Cam(cfg["lat0"], 540, cfg["city"]["cy"], cfg["city"]["_lon"], cfg["city"]["_lat"], sc)
    bad += [s["name"] for s in st if band[0] - 90 <= camc.xy(s["lon"], s["lat"])[1] <= band[1] + 90]
    if bad:
        sys.exit(f"札の帯 {band} に印が掛かる: {bad}（national の lat・cy か city の box を動かす）")
    cfg["_check"] = {"national_y": {c["name"]: round(cam.xy(c["lon"], c["lat"])[1]) for c in cfg["cities"]},
                     "city_xy": {s["name"]: [round(v) for v in camc.xy(s["lon"], s["lat"])] for s in st},
                     "city_m_per_px": round(M_PER_DEG / sc, 2)}


def fix_edit(path: Path) -> int:
    """build_edit.py は窓をみな配信の素材とみなし、右下の透かし（PRISM Live）の帯を切り落とす。地図は切らない。"""
    d = json.loads(path.read_text(encoding="utf-8"))
    hit = [k for k, s in d["sources"].items() if Path(s["path"]).name == "hook_map.mp4"]
    if not hit:
        print(f"!! {path} に hook_map.mp4 の素材が無い（build_edit.py の --clips に地図の index.json を足した？）")
        return 1
    for k in hit:
        d["sources"][k]["watermark"] = None
    path.write_text(json.dumps(d, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"透かしの切り落としを外した: {', '.join(hit)}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("config", type=Path, nargs="?", help="回の hookmap.json（街・場所・秒）")
    ap.add_argument("--out", type=Path, help="出す置き場（リポジトリの外）")
    ap.add_argument("--fix-edit", type=Path, help="組んだ指示書（edit_X.json）の地図の素材の透かしの切り落としを外して終わる")
    ap.add_argument("--fps", type=int, default=30)
    ap.add_argument("--cache", type=Path, default=Path.home() / ".cache" / "hookmap")
    ap.add_argument("--frames-only", action="store_true", help="mp4 を作らず、コマの PNG だけ")
    a = ap.parse_args()
    if a.fix_edit:
        return fix_edit(a.fix_edit)
    if not a.config or not a.out:
        ap.error("hookmap.json と --out を渡す（指示書を直すだけなら --fix-edit）")
    cfg = json.loads(a.config.read_text(encoding="utf-8"))
    W, H = 1080 * SS, 1920 * SS
    prepare(cfg)
    ne = natural_earth(a.cache)
    polys = polygons(ne, cfg["countries"])
    fr = a.out / "frames"
    if fr.exists():
        shutil.rmtree(fr)
    fr.mkdir(parents=True)
    bg = sea(W, H)
    n = round(cfg["seconds"] * a.fps)
    for i in range(n):
        img = frame(cfg, polys, i / a.fps, W, H, bg)
        img.convert("RGB").resize((1080, 1920), Image.LANCZOS).save(fr / f"{i:04d}.png")
    # 確かめ用: 0.25秒ごとのコマを並べる
    picks = list(range(0, n, max(1, a.fps // 4)))
    cols = 6
    th = Image.new("RGB", (cols * 270, ((len(picks) + cols - 1) // cols) * 500), (20, 20, 20))
    dd = ImageDraw.Draw(th)
    for j, i in enumerate(picks):
        im = Image.open(fr / f"{i:04d}.png").resize((270, 480))
        th.paste(im, ((j % cols) * 270, (j // cols) * 500))
        dd.text(((j % cols) * 270 + 6, (j // cols) * 500 + 482), f"{i / a.fps:.2f}s", fill=(255, 255, 255))
    th.save(a.out / "contact.jpg", quality=88)
    meta = {"frames": n, "fps": a.fps, "seconds": n / a.fps, "check": cfg["_check"],
            "source": f"Natural Earth {NE_TAG} {NE_FILE}（public domain）"}
    if not a.frames_only:
        mp4 = a.out / "hook_map.mp4"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-framerate", str(a.fps), "-i", str(fr / "%04d.png"),
                        "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo",
                        # 無音の音を付ける（ほかの窓と同じく音の流れを持たせる）。-shortest は映像の最後の1コマを
                        # 落とすことがあるので使わず、映像のコマ数で切る
                        "-frames:v", str(n), "-t", f"{n / a.fps:.4f}",
                        "-c:v", "libx264", "-crf", "16", "-preset", "slow", "-pix_fmt", "yuv420p",
                        "-c:a", "aac", "-movflags", "+faststart", str(mp4)], check=True)
        idx = {"_note": "hookmap.py が描いた地図のアニメーション（配信に無い素材）。秒は配信の時間軸の外（T_BASE）",
               "clips": [{"n": 1, "range": "hook-map", "start": T_BASE, "end": T_BASE + n / a.fps,
                          "file": mp4.name, "duration": n / a.fps, "width": 1080, "height": 1920, "fps": a.fps,
                          "frames": n, "ok": True, "watermark": None,
                          "sha256": hashlib.sha256(mp4.read_bytes()).hexdigest()}]}
        (a.out / "index.json").write_text(json.dumps(idx, ensure_ascii=False, indent=1), encoding="utf-8")
        meta["mp4"] = str(mp4)
        meta["src_t"] = "27:46:40.0"
    (a.out / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps(meta, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
