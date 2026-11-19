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

## 題の帯と目印の名前を焼く（`bake_map_title`・`bake_names`）

画像検索の上位の地図は、どれも題の帯（「SOFIA ATTRACTION MAP」）と目印ごとの名前を絵に入れている（`docs/seo.md` 7章・#332）。
帯は絵のいちばん上の横いっぱい（紙の色に街の名前と、赤い札の「見どころマップ」。240px で街の名前が 15px）、目印の名前は
描いてある目印の絵の真下か脇に白い札（字は絵の幅の 2.7%）。**番号の点は足さない**（あやと 2026-11-16「見どころマップは詳しすぎてダサい、概要だけ」）。
焼く順は 目印の名前 → 地区の名前 → 帯（あとのものほど上）。札どうし・地区の札・帯が重なるときは止める
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


def _hit(a: dict, b: dict) -> bool:
    """2つの箱（中心と幅・高さ。割合）が重なるか"""
    return abs(a["x"] - b["x"]) < (a["w"] + b["w"]) / 2 and abs(a["y"] - b["y"]) < (a["h"] + b["h"]) / 2


def area_boxes(areas: list[dict], W: int, H: int) -> dict[str, dict]:
    """地区の札の箱（`bake` が焼くのと同じ寸法）。目印の名前と題の帯が、地区の札に重ならないかを見るのに使う"""
    return {f"地区の札「{a['id']}」": {**box(a["label"], W / H, W), "x": a["x"], "y": a["y"]} for a in areas if "label" in a}


def bake(im, areas: list[dict], avoid: dict[str, dict] | None = None):
    """`areas` の `label`（行の並び）を `x`・`y`（札の中心。割合）に焼いた絵を返す。
    札が絵の外にはみ出す・札どうしが重なる・`avoid`（題の帯など、先に場所を取ったもの）に重なるときは止める（黙って重ねない）"""
    from PIL import Image, ImageDraw, ImageFilter
    W, H = im.size
    f, fs, lh, padx, pady, edge = _metrics(W)
    shadow = Image.new("RGBA", im.size, (0, 0, 0, 0))
    top = Image.new("RGBA", im.size, (0, 0, 0, 0))
    sd, td = ImageDraw.Draw(shadow), ImageDraw.Draw(top)
    boxes = {}
    for a in areas:
        for k, o in (avoid or {}).items():
            if _hit({**box(a["label"], W / H, W), "x": a["x"], "y": a["y"]}, o):
                raise ValueError(f"札「{a['id']}」が{k}に重なる（頼み書きの areas の x・y を離す）")
        lines = _lines(a["label"])
        b = box(a["label"], W / H, W)
        if a["x"] - b["w"] / 2 < 0 or a["x"] + b["w"] / 2 > 1 or a["y"] - b["h"] / 2 < 0 or a["y"] + b["h"] / 2 > 1:
            raise ValueError(f"札「{''.join(lines)}」が絵の外にはみ出す（頼み書きの areas の x・y を内側へ）")
        for k, o in boxes.items():
            if _hit({**b, "x": a["x"], "y": a["y"]}, o):
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


# ---------------------------------------------------------------- 見どころマップの題の帯と、目印の名前

#: 題の帯（地図のいちばん上、横いっぱい）。字の高さは絵の幅に対して。**横 240px に縮めて街の名前が 15px・帯の字が 12px**
MAP_TITLE_FS = {"name": 0.064, "label": 0.05}
MAP_TITLE_H = 0.105   # 帯の高さ（絵の幅に対して。1200px の絵で 126px）
#: 目印の名前の札。字の高さは絵の幅の 2.7%（1200px で 32px）。画像検索の縮小（240px）で読ませるのは題と地区の名前で、
#: 目印の名前は開いた絵で読む字
NAME_FS = 0.027


def map_title_box(W: int, H: int) -> dict:
    """題の帯の箱（中心と幅・高さ。割合）。影のぶんを少し足す（地区の札・目印の名前を帯の影にも重ねない）"""
    h = (W * MAP_TITLE_H + W * 0.012) / H
    return {"x": 0.5, "y": h / 2, "w": 1.0, "h": h}


def bake_map_title(im, t: dict):
    """見どころマップのいちばん上に、題の帯（「ソフィア」＋赤い札の「見どころマップ」）を焼いた絵を返す。

    **画像検索の上位の地図は、どれも題の帯を絵に焼いている**（「SOFIA ATTRACTION MAP」。`docs/seo.md` 7章、#332）。
    表紙の題（`bake_title`）と同じ作り: 紙の色の地に街の名前を面の `--ink` で、「見どころマップ」を `--gb-c` の札に白で。
    帯は地図の絵の上に重ねる（絵の寸法と地区の札の位置を変えない）。字が帯からあふれるときは止める
    """
    from PIL import Image, ImageDraw, ImageFilter, ImageFont
    W, H = im.size
    fn = ImageFont.truetype(str(font("Black")), round(W * MAP_TITLE_FS["name"]))
    fl = ImageFont.truetype(str(font("Black")), round(W * MAP_TITLE_FS["label"]))
    bh = W * MAP_TITLE_H
    gap, padx = W * 0.022, W * 0.03
    nw = fn.getlength(t["name"])
    lw = fl.getlength(t["label"]) + 2 * padx
    total = nw + gap + lw
    if total > W * 0.92:
        raise ValueError(f"見どころマップの題「{t['name']}{t['label']}」が帯に収まらない（{total:.0f}px / 絵 {W}px）")
    shadow = Image.new("RGBA", im.size, (0, 0, 0, 0))
    top = Image.new("RGBA", im.size, (0, 0, 0, 0))
    sd, td = ImageDraw.Draw(shadow), ImageDraw.Draw(top)
    sd.rectangle((0, 0, W, bh + W * 0.006), fill=(60, 40, 20, 110))
    td.rectangle((0, 0, W, bh), fill=TITLE_PAPER + (242,))
    # 帯の下の細い線（地図と帯の境目を、影だけに任せない）
    td.rectangle((0, bh - W * 0.005, W, bh), fill=TITLE_ACCENT + (255,))
    x0, cy = (W - total) / 2, (bh - W * 0.005) / 2
    td.text((x0, cy), t["name"], font=fn, fill=INK + (255,), anchor="lm")
    ph = W * MAP_TITLE_FS["label"] * 1.45
    lx = x0 + nw + gap
    td.rounded_rectangle((lx, cy - ph / 2, lx + lw, cy + ph / 2), ph / 2, fill=TITLE_ACCENT + (255,))
    td.text((lx + lw / 2, cy), t["label"], font=fl, fill=(255, 255, 255, 255), anchor="mm")
    shadow = shadow.filter(ImageFilter.GaussianBlur(W * 0.006))
    return Image.alpha_composite(Image.alpha_composite(im.convert("RGBA"), shadow), top).convert("RGB")


def _name_metrics(W: int):
    from PIL import ImageFont
    fs = round(W * NAME_FS)
    return ImageFont.truetype(str(font("Bold")), fs), fs, round(fs * 1.22), round(fs * 0.48), round(fs * 0.26), max(1, round(fs * 0.08))


def name_box(label: list[str], W: int, H: int) -> dict:
    """目印の名前の札の幅と高さ（割合）"""
    f, fs, lh, padx, pady, edge = _name_metrics(W)
    lines = _lines(label)
    return {"w": (max(f.getlength(t) for t in lines) + 2 * padx + 2 * edge) / W,
            "h": (lh * len(lines) + 2 * pady + 2 * edge) / H}


def bake_names(im, names: list[dict], avoid: dict[str, dict]):
    """描いてある目印の絵のそばに、その名前の札（白い角丸に `--ink` の字）を焼いた絵を返す。

    画像検索の上位の地図は、目印ごとに名前を書いている（#332）。**番号の点は足さない**（あやと 2026-11-16「見どころマップは
    詳しすぎてダサい、概要だけ」）。焼くのは絵に描いてある目印だけで、名前は面の見たいものの字にそろえる。
    `names` は `label`（行の並び）と札の中心 `x`・`y`（割合。描けた絵を見て、目印の絵の真下か脇に置く）。
    `avoid` は地区の札と題の帯の箱。札が絵の外へ出る・ほかの札や `avoid` に重なるときは止める（黙って重ねない）
    """
    from PIL import Image, ImageDraw, ImageFilter
    W, H = im.size
    f, fs, lh, padx, pady, edge = _name_metrics(W)
    shadow = Image.new("RGBA", im.size, (0, 0, 0, 0))
    top = Image.new("RGBA", im.size, (0, 0, 0, 0))
    sd, td = ImageDraw.Draw(shadow), ImageDraw.Draw(top)
    taken = dict(avoid)
    for n in names:
        lines = _lines(n["label"])
        b = {**name_box(n["label"], W, H), "x": n["x"], "y": n["y"]}
        if b["x"] - b["w"] / 2 < 0 or b["x"] + b["w"] / 2 > 1 or b["y"] - b["h"] / 2 < 0 or b["y"] + b["h"] / 2 > 1:
            raise ValueError(f"目印の名前「{''.join(lines)}」が絵の外にはみ出す（頼み書きの names の x・y を内側へ）")
        for k, o in taken.items():
            if _hit(b, o):
                raise ValueError(f"目印の名前「{''.join(lines)}」が{k}に重なる（頼み書きの names の x・y を離す）")
        # 地区と同じ id の目印がある（ネフスキー大聖堂と、その周辺の地区）。札の名前で控え、地区の箱を上書きしない
        taken[f"目印「{''.join(lines)}」"] = b
        w, h = b["w"] * W - 2 * edge, b["h"] * H - 2 * edge
        cx, cy = b["x"] * W, b["y"] * H
        x0, y0 = cx - w / 2, cy - h / 2
        r = min(h / 2, fs * 0.7)
        sd.rounded_rectangle((x0 - edge, y0 - edge + fs * 0.1, x0 + w + edge, y0 + h + edge + fs * 0.1), r + edge, fill=(60, 40, 20, 80))
        td.rounded_rectangle((x0 - edge, y0 - edge, x0 + w + edge, y0 + h + edge), r + edge, fill=INK + (90,))
        td.rounded_rectangle((x0, y0, x0 + w, y0 + h), r, fill=(255, 255, 255, 245))
        for i, t in enumerate(lines):
            td.text((cx, y0 + pady + lh * i + lh / 2), t, font=f, fill=INK + (255,), anchor="mm")
    shadow = shadow.filter(ImageFilter.GaussianBlur(fs * 0.2))
    return Image.alpha_composite(Image.alpha_composite(im.convert("RGBA"), shadow), top).convert("RGB")


# ---------------------------------------------------------------- 表紙に題を焼く

#: 題の札の字の高さ（絵の幅×`scale` に対して）。街の名前は**横 240px に縮めても 23px 前後**（読める）。
#: 上から 国・街の名前・「観光ガイド」の帯・キャッチ。行の高さは字の高さの 1.2〜1.6 倍
TITLE_FS = {"kicker": 0.027, "name": 0.098, "label": 0.042, "catch": 0.029}
TITLE_LH = {"kicker": 0.040, "name": 0.115, "label": 0.064, "catch": 0.046}
TITLE_PAD = 0.03          # 札の内の余白（同じく幅×scale に対して）
TITLE_EDGE = 0.04         # 札と絵の端のあいだ（絵の幅・高さに対して）。og の 1.91:1 に切っても札が切れない
TITLE_PAPER = (255, 250, 228)   # 面の `--paper`
TITLE_ACCENT = (179, 64, 47)    # 面の `--gb-c`（「観光ガイド」の帯。白い字が 4.5 以上で読める）


def _title_fonts(u: float):
    from PIL import ImageFont
    return {k: ImageFont.truetype(str(font("Bold" if k == "kicker" else "Black")), round(u * v)) for k, v in TITLE_FS.items()}


def title_box(t: dict, W: int, scale: float = 1.0) -> tuple[float, float]:
    """題の札の幅と高さ（画素）。いちばん長い行（街の名前かキャッチ）で幅が決まる"""
    u = W * scale
    f = _title_fonts(u)
    pad = u * TITLE_PAD
    widths = [f["kicker"].getlength(t["kicker"]), f["name"].getlength(t["name"]),
              f["label"].getlength(t["label"]) + u * 0.05, f["catch"].getlength(t["catch"])]
    h = pad * 1.6 + sum(u * v for v in TITLE_LH.values())
    return max(widths) + 2 * pad, h


def bake_title(im, t: dict, at: dict):
    """表紙の絵に題の札を焼いた絵を返す。

    **画像検索で押してもらうため**（あやと 2026-11-18 #1228「水彩のイラストだけが出て、誰も押さない。ほかのサイトの絵には
    字が入っている」）。日本の旅行ブログのアイキャッチと同じく、街の名前を大きく・「観光ガイド」を帯で・キャッチを小さく。
    字はこちらで焼く（ChatGPT に字を描かせない。面と同じ丸ゴシック）。札は面の紙の色（`--paper`）の角丸で、絵の上に置く。

    `t` は字（`name` 街・`label` 観光ガイド・`catch` キャッチ・`kicker` 国）、`at` は置き場（`x`・`y` は札の基準の点の位置。割合。
    `anchor` は札のどこを基準にするか: 縦 `t`/`m`/`b` ＋ 横 `l`/`c`/`r`。`scale` は字の大きさの倍率）。
    札が絵の端から `TITLE_EDGE` より外へ出るときは止める（og に切ったときに札が欠ける。黙って焼かない）
    """
    from PIL import Image, ImageDraw, ImageFilter
    W, H = im.size
    scale = at.get("scale", 1.0)
    u = W * scale
    f = _title_fonts(u)
    w, h = title_box(t, W, scale)
    anchor = at.get("anchor", "tc")
    if len(anchor) != 2 or anchor[0] not in "tmb" or anchor[1] not in "lcr":
        raise ValueError(f"題の札の anchor「{anchor}」は 縦 t/m/b ＋ 横 l/c/r（例 tr）")
    x0 = at["x"] * W - {"l": 0, "c": w / 2, "r": w}[anchor[1]]
    y0 = at["y"] * H - {"t": 0, "m": h / 2, "b": h}[anchor[0]]
    ex, ey = W * TITLE_EDGE, H * TITLE_EDGE
    if x0 < ex - 0.5 or y0 < ey - 0.5 or x0 + w > W - ex + 0.5 or y0 + h > H - ey + 0.5:
        raise ValueError(f"題の札「{t['name']}{t['label']}」が絵の端（{TITLE_EDGE:.0%}）より外へ出る"
                         f"（札 {w:.0f}x{h:.0f}px・左上 {x0:.0f},{y0:.0f}・絵 {W}x{H}。頼み書きの title の x・y・scale を直す）")
    shadow = Image.new("RGBA", im.size, (0, 0, 0, 0))
    top = Image.new("RGBA", im.size, (0, 0, 0, 0))
    sd, td = ImageDraw.Draw(shadow), ImageDraw.Draw(top)
    r = u * 0.025
    sd.rounded_rectangle((x0, y0 + u * 0.008, x0 + w, y0 + h + u * 0.008), r, fill=(60, 40, 20, 110))
    # 絵が少し透ける紙（238/255）。字は面の `--ink`
    td.rounded_rectangle((x0, y0, x0 + w, y0 + h), r, fill=TITLE_PAPER + (238,))
    cx, y = x0 + w / 2, y0 + u * TITLE_PAD * 0.8
    ink = INK + (255,)
    for k in ("kicker", "name", "label", "catch"):
        lh = u * TITLE_LH[k]
        if k == "label":
            bw = f["label"].getlength(t["label"]) + u * 0.05
            m = u * 0.006
            td.rounded_rectangle((cx - bw / 2, y + m, cx + bw / 2, y + lh - m), (lh - 2 * m) / 2, fill=TITLE_ACCENT + (255,))
            td.text((cx, y + lh / 2), t[k], font=f[k], fill=(255, 255, 255, 255), anchor="mm")
        else:
            td.text((cx, y + lh / 2), t[k], font=f[k], fill=ink, anchor="mm")
        y += lh
    shadow = shadow.filter(ImageFilter.GaussianBlur(u * 0.01))
    return Image.alpha_composite(Image.alpha_composite(im.convert("RGBA"), shadow), top).convert("RGB")
