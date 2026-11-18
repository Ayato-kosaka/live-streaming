#!/usr/bin/env python3
"""**エリア地図の下敷き（ChatGPT に渡す、字の無い地図）と、描けた絵に地区の名前を焼く道具。** `guide_art.py` から呼ぶ。

    python3 guide_art.py <国>/<街> layout --work <スクラッチ>    # 頼み書きの areamap から下敷きを作る

## 下敷き（`layout`）

頼み書きの `areamap` の `bbox`（写す範囲）・`districts`（地区の多角形。緯度経度）・`marks`（目印の番号と緯度経度）から、
道・川・公園だけの地図に地区の色と目印の黒い点（脇に番号）を重ねた1枚を作る。ChatGPT はこの配置どおりに描く。

- 地図のデータは OpenFreeMap のベクトルタイル（OpenStreetMap。鍵が要らない）。**CARTO のラスタは 2026-11 から鍵が要る**
  （鍵なしで取ると「API KEY REQUIRED」の絵が返る）。タイルは控え（`/tmp/ofm_tiles`）に残し、2回目からは取りに行かない
- **建物と字は描かない**（ChatGPT が写す）。道の太さは種類で決める

## 地区の名前を焼く（`bake`）

画像検索に出る絵そのものに地区の名前が写るように（あやと 2026-11-18 #1262「見どころマップと検索したら、画像検索の結果に、
地区の表示が出て欲しい」）、**字はこちらで焼く**（ChatGPT に字を描かせない。面と同じ丸ゴシック Zen Maru Gothic の Black）。

- 札の字の高さは絵の幅の 4.2%。**画像検索の縮小（横 240px）で 10px** になり、読める（2026-11-18 に縮めて見た）
- 札は地区の色の角丸、白いふちと薄い影。字は面の `--ink`
- 2行の札は頼み書きの `label` の通りに折る。行の終わりの「・」は描かない（「ジェンスキー・／パザール周辺」→「ジェンスキー／パザール周辺」）
- 返すのは札の箱（中心と幅・高さ。割合）。面はここに透明の押しどころを重ねる（`components/guidebook/SpotMap.tsx`）
"""
from __future__ import annotations

import json
import math
import struct
import time
import urllib.request
from pathlib import Path

TILEJSON = "https://tiles.openfreemap.org/planet"
CACHE = Path("/tmp/ofm_tiles")
UA = {"User-Agent": "island-guide-map/1.0"}
FONT_URL = "https://raw.githubusercontent.com/google/fonts/main/ofl/zenmarugothic/ZenMaruGothic-{}.ttf"
FONT_CACHE = Path("/tmp/zenmaru-src")   # `tools/fonts/subset.py` と同じ控え
INK = (91, 63, 21)                      # 面の `--ink`（`app/css/tokens.css`）
LABEL_FS = 0.042                        # 札の字の高さ（絵の幅に対して）
PAPER = (243, 237, 225)
GREEN = (214, 230, 192)
WATER = (160, 200, 228)
ROAD_W = {"motorway": 13, "trunk": 13, "primary": 11, "secondary": 9, "tertiary": 7, "minor": 4}


# ---------------------------------------------------------------- ベクトルタイル（Mapbox Vector Tile）を読む

def _varint(b: bytes, i: int) -> tuple[int, int]:
    r = s = 0
    while True:
        c = b[i]
        i += 1
        r |= (c & 0x7F) << s
        s += 7
        if c < 0x80:
            return r, i


def _fields(b: bytes):
    i = 0
    while i < len(b):
        k, i = _varint(b, i)
        f, t = k >> 3, k & 7
        if t == 0:
            v, i = _varint(b, i)
        elif t == 2:
            n, i = _varint(b, i)
            v = b[i:i + n]
            i += n
        elif t == 5:
            v, i = b[i:i + 4], i + 4
        elif t == 1:
            v, i = b[i:i + 8], i + 8
        else:
            raise ValueError(f"知らない型 {t}")
        yield f, v


def _packed(b: bytes) -> list[int]:
    out, i = [], 0
    while i < len(b):
        v, i = _varint(b, i)
        out.append(v)
    return out


def _value(b: bytes):
    for f, v in _fields(b):
        if f == 1:
            return v.decode()
        if f == 2:
            return struct.unpack("<f", v)[0]
        if f == 3:
            return struct.unpack("<d", v)[0]
        if f in (4, 5):
            return v
        if f == 6:
            return (v >> 1) ^ -(v & 1)
        if f == 7:
            return bool(v)
    return None


def _geom(g: list[int]) -> list[list[tuple[int, int]]]:
    rings, cur, x, y, i = [], [], 0, 0, 0
    while i < len(g):
        cmd, n = g[i] & 7, g[i] >> 3
        i += 1
        if cmd in (1, 2):
            for _ in range(n):
                dx, dy = g[i], g[i + 1]
                i += 2
                x += (dx >> 1) ^ -(dx & 1)
                y += (dy >> 1) ^ -(dy & 1)
                if cmd == 1 and cur:
                    rings.append(cur)
                    cur = []
                cur.append((x, y))
        elif cmd == 7 and cur:
            cur.append(cur[0])
    if cur:
        rings.append(cur)
    return rings


def mvt_layers(b: bytes):
    """(層の名前, extent, [(型, 属性, 輪の並び)]) を1層ずつ"""
    for f, v in _fields(b):
        if f != 3:
            continue
        name, feats, keys, vals, ext = "", [], [], [], 4096
        for g, w in _fields(v):
            if g == 1:
                name = w.decode()
            elif g == 2:
                feats.append(w)
            elif g == 3:
                keys.append(w.decode())
            elif g == 4:
                vals.append(_value(w))
            elif g == 5:
                ext = w
        out = []
        for fb in feats:
            tags, typ, geom = [], 0, []
            for g, w in _fields(fb):
                if g == 2:
                    tags = _packed(w)
                elif g == 3:
                    typ = w
                elif g == 4:
                    geom = _packed(w)
            out.append((typ, {keys[tags[i]]: vals[tags[i + 1]] for i in range(0, len(tags), 2)}, _geom(geom)))
        yield name, ext, out


# ---------------------------------------------------------------- 下敷き

def _wx(lon: float) -> float:
    return (lon + 180) / 360


def _wy(lat: float) -> float:
    s = math.sin(math.radians(lat))
    return 0.5 - math.log((1 + s) / (1 - s)) / (4 * math.pi)


def _get(url: str) -> bytes:
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
        return r.read()


def _hex(c: str) -> tuple[int, int, int]:
    c = c.lstrip("#")
    return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]


def layout(am: dict, out: Path, width: int = 1024) -> tuple[int, int]:
    """頼み書きの `areamap` から下敷きを作って `out` に置く。返すのは寸法"""
    from PIL import Image, ImageDraw, ImageFilter, ImageFont
    bb = am["bbox"]
    z = 14   # OpenFreeMap のいちばん細かい段
    n = 2 ** z
    x0, x1 = _wx(bb["west"]) * n, _wx(bb["east"]) * n
    y0, y1 = _wy(bb["north"]) * n, _wy(bb["south"]) * n
    big = width * 3 // 2   # 大きく描いて縮める（細い道がにじまない）
    S = big / (x1 - x0)
    W, H = big, round((y1 - y0) * S)
    CACHE.mkdir(parents=True, exist_ok=True)
    tiles_url = None
    green, water, river, road = [], [], [], []
    for tx in range(int(x0), int(x1) + 1):
        for ty in range(int(y0), int(y1) + 1):
            p = CACHE / f"{z}_{tx}_{ty}.pbf"
            if not p.is_file():
                tiles_url = tiles_url or json.loads(_get(TILEJSON))["tiles"][0]
                p.write_bytes(_get(tiles_url.format(z=z, x=tx, y=ty)))
                time.sleep(0.3)   # 1枚ずつ、間をあけて
            for name, ext, fs in mvt_layers(p.read_bytes()):
                def tr(q, tx=tx, ty=ty, ext=ext):
                    return ((tx + q[0] / ext - x0) * S, (ty + q[1] / ext - y0) * S)
                for typ, pr, rings in fs:
                    rs = [[tr(q) for q in r] for r in rings]
                    cls = pr.get("class")
                    if typ == 3 and (name == "park" or (name == "landcover" and cls in ("grass", "wood"))):
                        green.append(rs)
                    elif typ == 3 and name == "water":
                        water.append(rs)
                    elif typ == 2 and name == "waterway" and cls in ("river", "canal", "stream"):
                        river.append(rs)
                    elif typ == 2 and name == "transportation" and cls in ROAD_W and pr.get("brunnel") != "tunnel":
                        road.append((ROAD_W[cls], rs))
    k = W / 1024
    im = Image.new("RGB", (W, H), PAPER)
    d = ImageDraw.Draw(im)
    for rs in green:
        for r in rs:
            if len(r) > 2:
                d.polygon(r, fill=GREEN)
    for rs in water:
        for r in rs:
            if len(r) > 2:
                d.polygon(r, fill=WATER)
    for rs in river:
        for r in rs:
            d.line(r, fill=WATER, width=max(1, round(9 * k)), joint="curve")
    for w, rs in sorted(road, key=lambda x: x[0]):
        for r in rs:
            d.line(r, fill=(255, 255, 255), width=max(1, round(w * k)), joint="curve")

    def px(lat, lon):
        return ((_wx(lon) * n - x0) * S, (_wy(lat) * n - y0) * S)
    ov = Image.new("RGBA", im.size, (0, 0, 0, 0))
    od = ImageDraw.Draw(ov)
    for ar in am.get("districts", []):
        od.polygon([px(la, lo) for la, lo in ar["poly"]], fill=_hex(ar["color"]) + (165,))
    ov = ov.filter(ImageFilter.GaussianBlur(3 * k))
    im = Image.alpha_composite(im.convert("RGBA"), ov)
    d = ImageDraw.Draw(im)
    r = 11 * k
    f = ImageFont.truetype(str(font("Bold")), round(26 * k))
    for m in am.get("marks", []):
        x, y = px(m["lat"], m["lon"])
        d.ellipse((x - r, y - r, x + r, y + r), fill=(40, 40, 50, 255))
        d.text((x + r * 1.3, y - r * 1.3), str(m["n"]), font=f, fill=(40, 40, 50, 255), anchor="ls")
    im = im.convert("RGB").resize((width, round(H * width / W)), Image.LANCZOS)
    out.parent.mkdir(parents=True, exist_ok=True)
    im.save(out)
    return im.size


# ---------------------------------------------------------------- あとから足す地区の色

def wash(im, am: dict, bias: float = 0.5):
    """頼み書きの `districts` のうち `paint: true` のもの（ChatGPT が描いた後で足した地区）の色を、描けた絵に重ねて返す。

    2026-11-18、スコピエの地図に3つ目の地区（デバル・マーロ）を足した。描き直すと ChatGPT の絵が変わるので、
    残した焼く前の1枚（`<街>-areamap-base.webp`）に、下敷きと同じ緯度経度→画素の写しで薄い色を重ねる。
    描けた絵は下敷きの配置どおりなので（`fix` で守らせている）、同じ写しで重なる。絵の外へ出るぶんは切れる
    """
    from PIL import Image, ImageDraw, ImageFilter
    ds = [d for d in am.get("districts", []) if d.get("paint")]
    if not ds:
        return im
    bb = am["bbox"]
    W, H = im.size
    y0, y1 = _wy(bb["north"]), _wy(bb["south"])
    # 下敷きの縦の長さ（幅に対して）。描けた絵はこれを ratio に切ったもの
    full = W * (y1 - y0) / (_wx(bb["east"]) - _wx(bb["west"]))
    off = (full - H) * bias

    def px(lat, lon):
        return ((lon - bb["west"]) / (bb["east"] - bb["west"]) * W, (_wy(lat) - y0) / (y1 - y0) * full - off)
    fill = Image.new("RGBA", im.size, (0, 0, 0, 0))
    edge = Image.new("RGBA", im.size, (0, 0, 0, 0))
    fd, ed = ImageDraw.Draw(fill), ImageDraw.Draw(edge)
    for d in ds:
        pts = [px(la, lo) for la, lo in d["poly"]]
        c = _hex(d["color"])
        fd.polygon(pts, fill=c + (120,))
        ed.line(pts + pts[:1], fill=tuple(round(v * 0.88) for v in c) + (110,), width=max(2, round(W * 0.005)), joint="curve")
    fill = fill.filter(ImageFilter.GaussianBlur(W * 0.004))
    edge = edge.filter(ImageFilter.GaussianBlur(W * 0.003))
    return Image.alpha_composite(Image.alpha_composite(im.convert("RGBA"), fill), edge).convert("RGB")


# ---------------------------------------------------------------- 札を焼く

def font(style: str = "Black") -> Path:
    p = FONT_CACHE / f"ZenMaruGothic-{style}.ttf"
    if not p.is_file():
        FONT_CACHE.mkdir(parents=True, exist_ok=True)
        p.write_bytes(_get(FONT_URL.format(style)))
    return p


def _metrics(W: int):
    from PIL import ImageFont
    fs = round(W * LABEL_FS)
    return ImageFont.truetype(str(font("Black")), fs), fs, round(fs * 1.18), round(fs * 0.55), round(fs * 0.32), round(fs * 0.12)


def _lines(label: list[str]) -> list[str]:
    return [t.rstrip("・") for t in label]


def box(label: list[str], ratio: float, W: int = 1200) -> dict:
    """札の箱の幅と高さ（白いふちまで。割合。高さは絵の高さ＝幅÷`ratio` に対して）。字は幅に比例するので、どの版でも同じ"""
    f, fs, lh, padx, pady, edge = _metrics(W)
    lines = _lines(label)
    w = max(f.getlength(t) for t in lines) + 2 * padx + 2 * edge
    h = lh * len(lines) + 2 * pady + 2 * edge
    return {"w": round(w / W, 4), "h": round(h / (W / ratio), 4)}


def bake(im, areas: list[dict]):
    """`areas` の `label`（行の並び）を `x`・`y`（札の中心。割合）に焼いた絵を返す。
    札が絵の外にはみ出す・札どうしが重なるときは止める（黙って重ねない）"""
    from PIL import Image, ImageDraw, ImageFilter
    W, H = im.size
    f, fs, lh, padx, pady, edge = _metrics(W)
    shadow = Image.new("RGBA", im.size, (0, 0, 0, 0))
    top = Image.new("RGBA", im.size, (0, 0, 0, 0))
    sd, td = ImageDraw.Draw(shadow), ImageDraw.Draw(top)
    boxes = {}
    for a in areas:
        lines = _lines(a["label"])
        b = box(a["label"], W / H, W)
        if a["x"] - b["w"] / 2 < 0 or a["x"] + b["w"] / 2 > 1 or a["y"] - b["h"] / 2 < 0 or a["y"] + b["h"] / 2 > 1:
            raise ValueError(f"札「{''.join(lines)}」が絵の外にはみ出す（頼み書きの areas の x・y を内側へ）")
        for k, o in boxes.items():
            if abs(a["x"] - o["x"]) < (b["w"] + o["w"]) / 2 and abs(a["y"] - o["y"]) < (b["h"] + o["h"]) / 2:
                raise ValueError(f"札「{a['id']}」と「{k}」が重なる（頼み書きの areas の x・y を離す）")
        boxes[a["id"]] = {**b, "x": a["x"], "y": a["y"]}
        w, h = b["w"] * W - 2 * edge, b["h"] * H - 2 * edge
        cx, cy = a["x"] * W, a["y"] * H
        x0, y0 = cx - w / 2, cy - h / 2
        r = min(h / 2, fs * 0.9)
        drop = fs * 0.12
        sd.rounded_rectangle((x0 - edge, y0 - edge + drop, x0 + w + edge, y0 + h + edge + drop), r + edge, fill=(60, 40, 20, 90))
        td.rounded_rectangle((x0 - edge, y0 - edge, x0 + w + edge, y0 + h + edge), r + edge, fill=(255, 255, 255, 255))
        td.rounded_rectangle((x0, y0, x0 + w, y0 + h), r, fill=_hex(a.get("tag_color") or a["color"]) + (255,))
        for i, t in enumerate(lines):
            td.text((cx, y0 + pady + lh * i + lh / 2), t, font=f, fill=INK + (255,), anchor="mm")
    shadow = shadow.filter(ImageFilter.GaussianBlur(fs * 0.18))
    return Image.alpha_composite(Image.alpha_composite(im.convert("RGBA"), shadow), top).convert("RGB")
