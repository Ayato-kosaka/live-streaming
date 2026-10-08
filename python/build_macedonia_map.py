"""
北マケドニアの地図を焼く（`site/content/northMacedonia/map.json`）。

    curl -sL https://cdn.jsdelivr.net/npm/world-atlas@2/countries-10m.json -o /tmp/world10m.json
    NE=https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson
    curl -sL $NE/ne_10m_lakes.geojson -o /tmp/ne_lakes.geojson
    python3 python/build_macedonia_map.py

## なぜ地図なのか

旅・場所・ルートは一覧や表で済ませず、**SVG の地図にする**
（`docs/island-design.md` 4章）。この国でいちばん先に伝えたいのは
**「海に出ない」**ことなので、アドリア海とアルバニアを一緒に入れる。
海が左端にあって、そこから東は山と湖だけ——それが1枚で見える。

## 形は本物

陸は world-atlas 10m（Natural Earth 由来）、湖は ne_10m_lakes。
**手で描かない。** 手で描くと、オフリド湖が国境のどちら側にどれだけ
あるかのような「見れば分かること」が嘘になる。

## 座標はここで焼く

街の点も、画面の大きさも、ここが計算する。**TS 側で経度緯度から
座標を出し直さない**（`python/build_nordic_map.py` と同じ決まり。
投影のパラメータが片方だけ変わったときに黙ってズレる）。

## 投影

範囲が経度 3.7度 × 緯度 1.85度しかないので、**緯線を基準緯度の
cos で縮めた正距円筒**で足りる。南北の端でのゆがみは
cos(40.6)/cos(42.45) = 1.03 で、3% は 1000px の絵で 30px——
国の形が変わって見える量ではない。北欧の地図がランベルト正角円錐
なのは、あちらが緯度 14度ぶんあって、そのままだと北が間延びするため。
"""

from __future__ import annotations

import json
import math
import os
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SRC = "/tmp/world10m.json"
SRC_LAKES = "/tmp/ne_lakes.geojson"
OUT = REPO / "site" / "content" / "northMacedonia" / "map.json"

# 描く範囲（度）。
# 西はアドリア海の岸（19.3E あたり）より外まで。**海を1片だけ入れるため**で
# ——海が1片も写っていないと、「北マケドニアは海に出ない」が絵で言えない。
# 東はドイラン湖（22.75E）の先まで。南はオフリド湖とプレスパ湖の南端、
# 北はコキノ（42.26N）の上。
LON_MIN, LON_MAX = 19.00, 23.25
LAT_MIN, LAT_MAX = 40.60, 42.45
LAT_0 = (LAT_MIN + LAT_MAX) / 2

W = 1000
H = round(W * (LAT_MAX - LAT_MIN) / ((LON_MAX - LON_MIN) * math.cos(math.radians(LAT_0))))

# 点を間引く強さ（画面の px）。国の形が崩れない上限を目で見て決めた
EPS_LAND = 1.1
EPS_MK = 0.7
EPS_LAKE = 0.5


def project(lon: float, lat: float) -> tuple[float, float]:
    x = (lon - LON_MIN) * math.cos(math.radians(LAT_0))
    y = LAT_MAX - lat
    k = W / ((LON_MAX - LON_MIN) * math.cos(math.radians(LAT_0)))
    return x * k, y * k


def decode_arcs(topo: dict) -> list[list[tuple[float, float]]]:
    """TopoJSON の arc を経度緯度に戻す（差分 → 絶対）。"""
    sx, sy = topo["transform"]["scale"]
    tx, ty = topo["transform"]["translate"]
    out = []
    for arc in topo["arcs"]:
        x = y = 0
        pts = []
        for dx, dy in arc:
            x += dx
            y += dy
            pts.append((x * sx + tx, y * sy + ty))
        out.append(pts)
    return out


def ring_points(arcs: list, idx: list[int]) -> list[tuple[float, float]]:
    pts: list[tuple[float, float]] = []
    for i in idx:
        a = arcs[~i][::-1] if i < 0 else arcs[i]
        pts.extend(a[1:] if pts else a)
    return pts


def clip(pts: list, box: tuple[float, float, float, float]) -> list:
    """Sutherland–Hodgman。画面の外を落とす（JSON が太るので）。"""
    x0, y0, x1, y1 = box

    def inside(p, e):
        return (p[0] >= x0, p[0] <= x1, p[1] >= y0, p[1] <= y1)[e]

    def cross(a, b, e):
        if e < 2:
            xe = x0 if e == 0 else x1
            t = (xe - a[0]) / (b[0] - a[0])
            return (xe, a[1] + t * (b[1] - a[1]))
        ye = y0 if e == 2 else y1
        t = (ye - a[1]) / (b[1] - a[1])
        return (a[0] + t * (b[0] - a[0]), ye)

    out = pts
    for e in range(4):
        src, out = out, []
        if not src:
            break
        for i, b in enumerate(src):
            a = src[i - 1]
            if inside(b, e):
                if not inside(a, e):
                    out.append(cross(a, b, e))
                out.append(b)
            elif inside(a, e):
                out.append(cross(a, b, e))
    return out


def rdp(pts: list, eps: float) -> list:
    """Ramer–Douglas–Peucker。形を保ったまま点を減らす。

    **閉じた環は、先に閉じ目の1点を落とす。** 最初と最後が同じ点だと
    基準の線分の長さが 0 になって、どの点も距離 0 に出る——**環が
    まるごと2点に潰れる。** エラーにならず、国が1つ消えるだけなので
    気づけない（実際に北マケドニアとアルバニアが 0環で焼けた）。
    1点落とせば両端は環のうえで隣どうしの別の点になり、ふつうに効く。
    """
    if len(pts) >= 4 and math.dist(pts[0], pts[-1]) < 1e-9:
        pts = pts[:-1]
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        i, j = stack.pop()
        ax, ay = pts[i]
        bx, by = pts[j]
        dx, dy = bx - ax, by - ay
        n = math.hypot(dx, dy) or 1e-9
        best, bi = 0.0, -1
        for k in range(i + 1, j):
            px, py = pts[k]
            d = abs(dy * px - dx * py + bx * ay - by * ax) / n
            if d > best:
                best, bi = d, k
        if bi >= 0 and best > eps:
            keep[bi] = True
            stack.extend([(i, bi), (bi, j)])
    return [p for p, k in zip(pts, keep) if k]


def area(pts: list) -> float:
    a = 0.0
    for i in range(len(pts)):
        x0, y0 = pts[i]
        x1, y1 = pts[(i + 1) % len(pts)]
        a += x0 * y1 - x1 * y0
    return abs(a) / 2


def path_of(rings: list) -> str:
    out = []
    for r in rings:
        if len(r) < 3:
            continue
        out.append("M" + " ".join(f"{x:.1f} {y:.1f}" for x, y in r) + "Z")
    return "".join(out).replace("M", "M", 1)


def to_path(rings: list) -> str:
    """`M x y L x y … Z` を短く書いた形（`L` は省けないので最小限）。"""
    out = []
    for r in rings:
        if len(r) < 3:
            continue
        head = f"M{r[0][0]:.1f} {r[0][1]:.1f}"
        rest = "".join(f"L{x:.1f} {y:.1f}" for x, y in r[1:])
        out.append(head + rest + "Z")
    return "".join(out)


def rings_of(arcs, geom: dict, eps: float, min_area: float) -> list:
    polys = [geom["arcs"]] if geom["type"] == "Polygon" else list(geom["arcs"])
    box = (0.0, 0.0, float(W), float(H))
    out = []
    for poly in polys:
        for ring in poly:
            pts = [project(lon, lat) for lon, lat in ring_points(arcs, ring)]
            pts = clip(pts, box)
            if len(pts) < 3:
                continue
            pts = rdp(pts, eps)
            if len(pts) >= 3 and area(pts) >= min_area:
                out.append(pts)
    return out


def main() -> None:
    if not os.path.exists(SRC):
        sys.exit(f"元データが無い: {SRC}（頭の curl を先に回す）")
    topo = json.load(open(SRC, encoding="utf-8"))
    arcs = decode_arcs(topo)
    geoms = topo["objects"]["countries"]["geometries"]
    by_name = {g["properties"]["name"]: g for g in geoms}

    # world-atlas@2 の国名は改名前のまま（"Macedonia"）。**ここで直さない**
    # ——元データの綴りを書き換えると、次に落とし直したときに合わなくなる
    mk = rings_of(arcs, by_name["Macedonia"], EPS_MK, 4.0)
    al = rings_of(arcs, by_name["Albania"], EPS_MK, 4.0)

    land_geom = topo["objects"]["land"]["geometries"][0]
    land = rings_of(arcs, land_geom, EPS_LAND, 6.0)

    lakes = []
    gj = json.load(open(SRC_LAKES, encoding="utf-8"))
    for f in gj["features"]:
        g = f["geometry"]
        polys = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
        for poly in polys:
            for ring in poly:
                pts = [project(lon, lat) for lon, lat in ring]
                pts = clip(pts, (0.0, 0.0, float(W), float(H)))
                if len(pts) < 3:
                    continue
                pts = rdp(pts, EPS_LAKE)
                # 小さい池まで入れると、地図が斑になって湖が読めなくなる
                if area(pts) >= 120:
                    lakes.append(pts)

    # 街と目印。**経度緯度はここに書いて、座標はここで出す**
    PLACES = [
        ("skopje", "スコピエ", 21.4254, 41.9981, "cap"),
        ("matka", "マトカ渓谷", 21.3000, 41.9525, "spot"),
        ("ohrid", "オフリド", 20.8016, 41.1231, "town"),
        ("bitola", "ビトラ", 21.3347, 41.0319, "town"),
        ("kavadarci", "カヴァダルツィ", 22.0119, 41.4331, "town"),
        ("stip", "シュティプ", 22.1958, 41.7458, "town"),
        ("kokino", "コキノ", 21.9561, 42.2631, "spot"),
        ("tirana", "ティラナ", 19.8187, 41.3275, "away"),
    ]
    places = []
    for pid, name, lon, lat, kind in PLACES:
        x, y = project(lon, lat)
        places.append({"id": pid, "name": name, "x": round(x, 1), "y": round(y, 1), "kind": kind})

    out = {
        "w": W,
        "h": H,
        "land": to_path(land),
        "al": to_path(al),
        "mk": to_path(mk),
        "lakes": to_path(lakes),
        "places": places,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"{OUT} {OUT.stat().st_size:,}B  w={W} h={H}  陸{len(land)}環 MK{len(mk)}環 AL{len(al)}環 湖{len(lakes)}環")


if __name__ == "__main__":
    main()
