#!/usr/bin/env python3
"""ソフィア中心部の地図の絵を焼く（OpenStreetMap のタイルを1枚に合成する）。

自前の SVG（灰色の紙に丸が散っているだけ）では「ほかの人が見てワクワクしない」ので、
通りと公園がそのまま読める本物の地図を地として敷く。ピンや記号は焼かない——
印は面の側（SVG）が tiles.json の範囲を読んで重ねるので、絵は地だけにしておく。

  python3 python/build_bulgaria_map.py          # 焼く（タイルは控えから。無ければ落とす）
  python3 python/build_bulgaria_map.py --check  # 焼けた絵と範囲が合っているかを数字で見る

OSM のタイルは「1枚ずつ・間をあけて・大量に取らない」のが決まり。落としたものは
控え（既定 /tmp/osm_tiles_bulgaria）に残すので、2回目からは1枚も取りに行かない。
焼いた PNG は git に入れて本番は自分のところから配る（本番が OSM を叩かない）。
"""
from __future__ import annotations

import argparse
import json
import math
import os
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FACTS = ROOT / "python" / "data" / "bulgaria" / "facts.json"
OUT_JSON = ROOT / "python" / "data" / "bulgaria" / "tiles.json"
OUT_DIR = ROOT / "site" / "public" / "bulgaria"
PNG_1X = OUT_DIR / "city.png"
PNG_2X = OUT_DIR / "city@2x.png"

TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
UA = "ayato-island-guide/1.0 (https://github.com/Ayato-kosaka/live-streaming)"
CACHE = Path(os.environ.get("OSM_TILE_CACHE", "/tmp/osm_tiles_bulgaria"))

# 写す範囲の決めごと
RADIUS_KM = 1.0      # 中心からこれより遠い見どころは地図に入れない（面の側の決まりに合わせる）
PAD = 1.10           # 四方に1割の余白
OUT_W = 1600         # city.png の横幅。@2x はこの2倍
ASPECT = 1600 / 1100 # 見どころの広がりだけだと横長すぎるので、この形まで縦に広げる
MAX_TILES = 30       # OSM に優しく。超えるならズームを1つ下げる
ZOOM_START = 16


# --- メルカトル（0..1 の世界座標）-------------------------------------------
def wx(lon: float) -> float:
    return (lon + 180.0) / 360.0


def wy(lat: float) -> float:
    s = math.sin(math.radians(lat))
    return 0.5 - math.log((1 + s) / (1 - s)) / (4 * math.pi)


def wy_inv(y: float) -> float:
    return math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y))))


def km_between(lat1, lon1, lat2, lon2) -> float:
    dy = (lat2 - lat1) * 111.32
    dx = (lon2 - lon1) * 111.32 * math.cos(math.radians((lat1 + lat2) / 2))
    return math.hypot(dx, dy)


# --- 範囲を決める ------------------------------------------------------------
def load_facts() -> dict:
    return json.loads(FACTS.read_text(encoding="utf-8"))


def in_range_spots(facts: dict) -> list[dict]:
    c = facts["center"]
    out = []
    for s in facts.get("spots", []):
        if s.get("lat") is None or s.get("lon") is None:
            continue
        d = km_between(c["lat"], c["lon"], s["lat"], s["lon"])
        if d <= RADIUS_KM:
            out.append({**s, "km": d})
    return out


def frame(facts: dict) -> dict:
    """中心を真ん中に置いたまま、1km 以内の見どころが全部入る枠を出す。"""
    c = facts["center"]
    cx, cy = wx(c["lon"]), wy(c["lat"])
    hx = hy = 0.0
    for s in in_range_spots(facts):
        hx = max(hx, abs(wx(s["lon"]) - cx))
        hy = max(hy, abs(wy(s["lat"]) - cy))
    hx *= PAD
    hy *= PAD
    # 見どころの広がりは東西に偏っていて、そのままだと細長い帯になる。
    # 中心をずらさずに足りないほうを広げて、地図らしい形にする。
    if hx / hy > ASPECT:
        hy = hx / ASPECT
    else:
        hx = hy * ASPECT
    return {"cx": cx, "cy": cy, "hx": hx, "hy": hy}


def pick_zoom(f: dict) -> tuple[int, dict]:
    """30枚に収まる、いちばん細かいズームを選ぶ。"""
    for z in range(ZOOM_START, 10, -1):
        n = 2 ** z
        x0 = math.floor((f["cx"] - f["hx"]) * n)
        x1 = math.floor((f["cx"] + f["hx"]) * n)
        y0 = math.floor((f["cy"] - f["hy"]) * n)
        y1 = math.floor((f["cy"] + f["hy"]) * n)
        count = (x1 - x0 + 1) * (y1 - y0 + 1)
        if count <= MAX_TILES:
            return z, {"x0": x0, "x1": x1, "y0": y0, "y1": y1, "n": n, "count": count}
    raise SystemExit("30枚に収まるズームが無い")


# --- タイルを落とす ----------------------------------------------------------
def fetch_tile(z: int, x: int, y: int, sleep: float = 0.6) -> bytes:
    path = CACHE / str(z) / str(x) / f"{y}.png"
    if path.exists():
        return path.read_bytes()
    path.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(TILE_URL.format(z=z, x=x, y=y), headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        data = r.read()
    path.write_bytes(data)
    time.sleep(sleep)  # 1枚ずつ、間をあけて。並列では叩かない
    return data


# --- 焼く --------------------------------------------------------------------
def build() -> dict:
    from PIL import Image, ImageEnhance

    facts = load_facts()
    f = frame(facts)
    z, t = pick_zoom(f)
    n, ts = t["n"], 256

    sheet = Image.new("RGB", ((t["x1"] - t["x0"] + 1) * ts, (t["y1"] - t["y0"] + 1) * ts), "white")
    got = 0
    for x in range(t["x0"], t["x1"] + 1):
        for y in range(t["y0"], t["y1"] + 1):
            import io
            sheet.paste(Image.open(io.BytesIO(fetch_tile(z, x, y))).convert("RGB"),
                        ((x - t["x0"]) * ts, (y - t["y0"]) * ts))
            got += 1

    # 枠ぴったりに切る（世界座標 → この一枚の中の画素）
    left = (f["cx"] - f["hx"]) * n * ts - t["x0"] * ts
    right = (f["cx"] + f["hx"]) * n * ts - t["x0"] * ts
    top = (f["cy"] - f["hy"]) * n * ts - t["y0"] * ts
    bottom = (f["cy"] + f["hy"]) * n * ts - t["y0"] * ts
    crop = sheet.crop((round(left), round(top), round(right), round(bottom)))

    out_h = round(OUT_W / ASPECT)
    img1 = crop.resize((OUT_W, out_h), Image.LANCZOS)
    img2 = crop.resize((OUT_W * 2, out_h * 2), Image.LANCZOS)

    def tone(im):
        # 島の紙（生成り）に馴染むよう、彩度を落として明るくする。
        # 通りの名前が読めなくなるので、やりすぎない。
        im = ImageEnhance.Color(im).enhance(0.72)
        im = ImageEnhance.Brightness(im).enhance(1.07)
        return ImageEnhance.Contrast(im).enhance(0.94)

    img1, img2 = tone(img1), tone(img2)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    # 地図はもともと色数が少ないので、減色すると字を保ったまま小さくなる
    img1.convert("P", palette=Image.ADAPTIVE, colors=256).save(PNG_1X, optimize=True)
    img2.convert("P", palette=Image.ADAPTIVE, colors=256).save(PNG_2X, optimize=True)

    meta = {
        "png": "/bulgaria/city.png",
        "png2x": "/bulgaria/city@2x.png",
        "w": OUT_W,
        "h": out_h,
        "west": round(360.0 * (f["cx"] - f["hx"]) - 180.0, 6),
        "east": round(360.0 * (f["cx"] + f["hx"]) - 180.0, 6),
        "south": round(wy_inv(f["cy"] + f["hy"]), 6),
        "north": round(wy_inv(f["cy"] - f["hy"]), 6),
        "zoom": z,
        "tiles": got,
        "projection": "web-mercator",
        "attribution": "© OpenStreetMap contributors",
        "licence": "https://www.openstreetmap.org/copyright",
    }
    OUT_JSON.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return meta


# --- 確かめる ----------------------------------------------------------------
def to_px(meta: dict, lat: float, lon: float) -> tuple[float, float]:
    """面の側がやるのと同じ計算。範囲が1つでもずれると、ここで全部ずれる。"""
    x = (lon - meta["west"]) / (meta["east"] - meta["west"]) * meta["w"]
    y0, y1 = wy(meta["north"]), wy(meta["south"])
    y = (wy(lat) - y0) / (y1 - y0) * meta["h"]
    return x, y


def check() -> int:
    meta = json.loads(OUT_JSON.read_text(encoding="utf-8"))
    facts = load_facts()
    c = facts["center"]
    bad = 0

    for p in (PNG_1X, PNG_2X):
        print(f"{p.relative_to(ROOT)}: {'在り' if p.exists() else '無い'} "
              f"{p.stat().st_size/1024/1024:.2f}MB" if p.exists() else f"{p}: 無い")
        if not p.exists():
            bad += 1

    cx, cy = to_px(meta, c["lat"], c["lon"])
    print(f"中心（{c['name']}）  px=({cx:.1f}, {cy:.1f})  絵の真ん中=({meta['w']/2:.1f}, {meta['h']/2:.1f})")
    if abs(cx - meta["w"] / 2) > 2 or abs(cy - meta["h"] / 2) > 2:
        print("  ✗ 中心が真ん中に来ていない")
        bad += 1

    nev = next((s for s in facts["spots"] if "ネフスキー" in s["name"]), None)
    nx, ny = to_px(meta, nev["lat"], nev["lon"])
    print(f"大聖堂（{nev['name']}）px=({nx:.1f}, {ny:.1f})  中心より{'右（東）' if nx > cx else '左（西）'}へ {abs(nx-cx):.1f}px")
    if not nx > cx:
        print("  ✗ 大聖堂が中心の東に来ていない")
        bad += 1

    spots = in_range_spots(facts)
    outside = []
    for s in spots:
        x, y = to_px(meta, s["lat"], s["lon"])
        if not (0 <= x <= meta["w"] and 0 <= y <= meta["h"]):
            outside.append((s["name"], round(x), round(y)))
    print(f"1.0km 以内の見どころ {len(spots)} 件 / 枠の外に出たもの {len(outside)} 件 {outside if outside else ''}")
    bad += len(outside)

    print(f"範囲 west={meta['west']} east={meta['east']} south={meta['south']} north={meta['north']} "
          f"zoom={meta['zoom']} tiles={meta['tiles']}")
    if meta["tiles"] > MAX_TILES:
        print("  ✗ タイルが30枚を超えている")
        bad += 1
    if PNG_1X.exists() and PNG_1X.stat().st_size > 1.5 * 1024 * 1024:
        print("  ✗ city.png が 1.5MB を超えている")
        bad += 1
    if PNG_2X.exists() and PNG_2X.stat().st_size > 4 * 1024 * 1024:
        print("  ✗ city@2x.png が 4MB を超えている")
        bad += 1

    print("合格" if bad == 0 else f"不合格（{bad}件）")
    return 0 if bad == 0 else 1


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="焼けた絵と範囲が合っているかを数字で見る")
    ap.add_argument("--plan", action="store_true", help="落とす枚数とズームだけ見る（取りに行かない）")
    a = ap.parse_args()
    if a.check:
        return check()
    if a.plan:
        f = frame(load_facts())
        z, t = pick_zoom(f)
        print(f"zoom={z} tiles={t['count']} x={t['x0']}..{t['x1']} y={t['y0']}..{t['y1']} "
              f"素の画素={(2*f['hx']*t['n']*256):.0f}x{(2*f['hy']*t['n']*256):.0f}")
        return 0
    m = build()
    print(json.dumps(m, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
