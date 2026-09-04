"""
北欧ヒッチハイク旅のルート地図を作る。

実際の地形（Natural Earth 10m / world-atlas の TopoJSON）から、
ジョージア→ポーランド→バルト三国→北欧のルートが入る範囲を切り出して、
SVG のパスに起こす。

地図の絵は島と同じ作りにする。
  - 陸のかたまり全体に砂色の縁をつける（島の砂浜と同じ）
  - 輪郭線は引かない。国の境は薄い色の差だけで見せる
  - 通る国は草の緑、通らない国はくすませる

投影はランベルト正角円錐（標準緯線 51N / 60N）。
メルカトルだと北へ行くほど間延びして、ポーランドとフィンランドの
大きさの関係が嘘になるため。

実行:
  curl -sL https://cdn.jsdelivr.net/npm/world-atlas@2/countries-10m.json -o /tmp/world10m.json
  python python/build_nordic_map.py
"""

import json
import math
import os

SRC = "/tmp/world10m.json"
OUT = "site/content/nordic/map.json"

# 描く範囲（度）。ルート全体が入って、余白が出すぎないところ。
LON_MIN, LON_MAX = 13.0, 29.5
LAT_MIN, LAT_MAX = 48.6, 61.9

# ランベルト正角円錐の設定
LAT0, LON0 = 48.6, 21.0
LAT1, LAT2 = 51.5, 59.5

# 通る国。ここだけ色をつける。
ROUTE = {
    "Poland": "poland",
    "Lithuania": "lithuania",
    "Latvia": "latvia",
    "Estonia": "estonia",
    "Finland": "finland",
    "Sweden": "sweden",
}
# 背景として描く国。名前は出さない。
CONTEXT = [
    "Germany", "Denmark", "Norway", "Belarus", "Russia",
    "Ukraine", "Czechia", "Slovakia", "Austria", "Netherlands",
    "Hungary", "Romania", "Moldova", "Switzerland",
]


def lcc(lon: float, lat: float) -> tuple[float, float]:
    """ランベルト正角円錐図法。

    Args:
        lon: 経度(度)
        lat: 緯度(度)
    Returns:
        投影後の (x, y)。y は南が大きい向きに直してある。
    """
    r = math.radians
    p1, p2, p0, l0 = r(LAT1), r(LAT2), r(LAT0), r(LON0)
    n = math.log(math.cos(p1) / math.cos(p2)) / math.log(
        math.tan(math.pi / 4 + p2 / 2) / math.tan(math.pi / 4 + p1 / 2)
    )
    f = math.cos(p1) * math.tan(math.pi / 4 + p1 / 2) ** n / n
    rho = f / math.tan(math.pi / 4 + r(lat) / 2) ** n
    rho0 = f / math.tan(math.pi / 4 + p0 / 2) ** n
    theta = n * (r(lon) - l0)
    x = rho * math.sin(theta)
    y = rho0 - rho * math.cos(theta)
    return x * 1000.0, -y * 1000.0


def decode_arcs(topo: dict) -> list[list[tuple[float, float]]]:
    """TopoJSON の量子化された差分を、経度緯度の並びに戻す。

    Args:
        topo: TopoJSON 全体
    Returns:
        arc ごとの点の並び
    """
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


def ring_points(arcs: list, idx_list: list[int]) -> list[tuple[float, float]]:
    """arc の番号列（負なら逆向き）から、輪の点列を作る。

    Args:
        arcs: 復号ずみ arc
        idx_list: arc の番号列
    Returns:
        点の並び
    """
    pts: list[tuple[float, float]] = []
    for i in idx_list:
        a = arcs[~i][::-1] if i < 0 else arcs[i]
        pts.extend(a[1:] if pts else a)
    return pts


def clip(pts: list[tuple[float, float]], box: tuple[float, float, float, float]):
    """サザーランド・ホジマンで、見せる範囲の四角に切る。

    ユーラシアのように1本の輪がシベリアまで続いているものがあるので、
    輪ごと捨てる/残すではなく、範囲で切らないと SVG が巨大になる。

    Args:
        pts: 経度緯度の並び
        box: (lonMin, latMin, lonMax, latMax)
    Returns:
        切ったあとの点の並び
    """
    lo, la, hi, lb = box

    def inside(p, edge):
        if edge == 0:
            return p[0] >= lo
        if edge == 1:
            return p[0] <= hi
        if edge == 2:
            return p[1] >= la
        return p[1] <= lb

    def cross(a, b, edge):
        if edge in (0, 1):
            xe = lo if edge == 0 else hi
            t = (xe - a[0]) / (b[0] - a[0])
            return (xe, a[1] + t * (b[1] - a[1]))
        ye = la if edge == 2 else lb
        t = (ye - a[1]) / (b[1] - a[1])
        return (a[0] + t * (b[0] - a[0]), ye)

    out = pts
    for edge in range(4):
        if not out:
            return []
        src, out = out, []
        prev = src[-1]
        for cur in src:
            ci, pi = inside(cur, edge), inside(prev, edge)
            if ci:
                if not pi:
                    out.append(cross(prev, cur, edge))
                out.append(cur)
            elif pi:
                out.append(cross(prev, cur, edge))
            prev = cur
    return out


def rdp(pts: list[tuple[float, float]], eps: float) -> list[tuple[float, float]]:
    """ダグラス・ポイカー。細かすぎる海岸線を落として、SVG を軽くする。

    Args:
        pts: 点の並び
        eps: 許容誤差
    Returns:
        間引いた点の並び
    """
    if len(pts) < 3:
        return pts
    ax, ay = pts[0]
    bx, by = pts[-1]
    dx, dy = bx - ax, by - ay
    n2 = dx * dx + dy * dy
    worst, wi = -1.0, 0
    for i in range(1, len(pts) - 1):
        px, py = pts[i]
        if n2 == 0:
            d = math.hypot(px - ax, py - ay)
        else:
            t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / n2))
            d = math.hypot(px - (ax + t * dx), py - (ay + t * dy))
        if d > worst:
            worst, wi = d, i
    if worst <= eps:
        return [pts[0], pts[-1]]
    return rdp(pts[: wi + 1], eps)[:-1] + rdp(pts[wi:], eps)


def area(pts: list[tuple[float, float]]) -> float:
    """輪の面積。小さすぎる岩礁を落とすのに使う。

    Args:
        pts: 投影ずみの点の並び
    Returns:
        面積
    """
    a = 0.0
    for i in range(len(pts)):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % len(pts)]
        a += x1 * y2 - x2 * y1
    return abs(a) / 2


def smooth_path(pts: list[tuple[float, float]], nd: int = 1) -> str:
    """折れ線を、角のない閉じた曲線にする。

    各頂点を制御点、隣り合う頂点の中点を通過点にした2次ベジェでつなぐ。
    点の数を増やさずに角が取れるので、島の絵と同じ「かたい角を作らない」を
    地図でも守れて、しかも SVG が太らない。

    Args:
        pts: 閉じた輪の点の並び
        nd: 座標の小数桁
    Returns:
        SVG のパス文字列
    """
    n = len(pts)
    f = f"{{:.{nd}f}}"

    def mid(a, b):
        return ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)

    m0 = mid(pts[0], pts[1])
    d = ["M", f.format(m0[0]), " ", f.format(m0[1])]
    for i in range(1, n + 1):
        c = pts[i % n]
        m = mid(c, pts[(i + 1) % n])
        d += ["Q", f.format(c[0]), " ", f.format(c[1]), " ", f.format(m[0]), " ", f.format(m[1])]
    d.append("Z")
    return "".join(d)


def main() -> None:
    topo = json.load(open(SRC, encoding="utf-8"))
    arcs = decode_arcs(topo)
    geoms = topo["objects"]["countries"]["geometries"]

    # 範囲より少し広めに取ってから切る（縁で欠けないように）
    pad = 6.0
    x0, y0 = lcc(LON_MIN, LAT_MIN)
    x1, y1 = lcc(LON_MAX, LAT_MAX)
    xs, ys = lcc(LON_MIN, LAT_MAX)
    xe, ye = lcc(LON_MAX, LAT_MIN)
    minx = min(x0, x1, xs, xe)
    maxx = max(x0, x1, xs, xe)
    miny = min(y0, y1, ys, ye)
    maxy = max(y0, y1, ys, ye)
    w, h = maxx - minx, maxy - miny
    # 800 幅に収める
    k = 800.0 / w

    def project(lon: float, lat: float) -> tuple[float, float]:
        px, py = lcc(lon, lat)
        return (px - minx) * k, (py - miny) * k

    def polys_of(geom: dict) -> list[list[list[int]]]:
        if geom["type"] == "Polygon":
            return [geom["arcs"]]
        if geom["type"] == "MultiPolygon":
            return [p for p in geom["arcs"]]
        return []

    def to_path(geom: dict, eps: float, min_area: float = 14.0, nd: int = 1) -> str:
        d = []
        for poly in polys_of(geom):
            for ring in poly:
                pts = ring_points(arcs, ring)
                pts = clip(pts, (LON_MIN - pad, LAT_MIN - pad, LON_MAX + pad, LAT_MAX + pad))
                if len(pts) < 3:
                    continue
                pp = [project(x, y) for x, y in pts]
                pp = rdp(pp, eps)
                if len(pp) < 3 or area(pp) < min_area:
                    continue
                d.append(smooth_path(pp, nd))
        return "".join(d)

    out: dict = {
        "view": {"w": 800.0, "h": round(h * k, 1)},
        "bounds": {"lonMin": LON_MIN, "lonMax": LON_MAX, "latMin": LAT_MIN, "latMax": LAT_MAX},
        "countries": {},
        "context": "",
        "land": "",
    }

    def label_at(geom: dict) -> tuple[float, float]:
        """国名を置く場所。いちばん大きい輪の重心。

        重心が海に出る国（スウェーデンなど）は、あとで手で寄せる。

        Args:
            geom: 国のジオメトリ
        Returns:
            投影後の (x, y)
        """
        best, ba = None, -1.0
        for poly in polys_of(geom):
            for ring in poly:
                pts = ring_points(arcs, ring)
                pts = clip(pts, (LON_MIN, LAT_MIN, LON_MAX, LAT_MAX))
                if len(pts) < 3:
                    continue
                pp = [project(x, y) for x, y in pts]
                a = area(pp)
                if a > ba:
                    ba, best = a, pp
        if not best:
            return (0.0, 0.0)
        cx = sum(p[0] for p in best) / len(best)
        cy = sum(p[1] for p in best) / len(best)
        return (round(cx, 1), round(cy, 1))

    out["labels"] = {}
    ctx_paths = []
    for g in geoms:
        name = g["properties"]["name"]
        if name in ROUTE:
            out["countries"][ROUTE[name]] = to_path(g, 1.6, 20.0)
            out["labels"][ROUTE[name]] = label_at(g)
        elif name in CONTEXT:
            ctx_paths.append(to_path(g, 3.0, 60.0, 0))
    out["context"] = "".join(ctx_paths)

    # 陸のかたまり全体。砂色の縁をつけるのに使う。
    # land は GeometryCollection なので、中の MultiPolygon を取り出す。
    land = topo["objects"]["land"]["geometries"][0]
    out["land"] = to_path(land, 3.0, 60.0, 0)

    # ---- 街とルート -------------------------------------------------
    # 経度緯度から SVG 座標への変換を TypeScript 側でもう一度書くと必ずズレるので、
    # ここで計算して焼き込む。
    cities = [
        ("katowice", "カトヴィツェ", 19.024, 50.264, "land", "poland"),
        ("krakow", "クラクフ", 19.937, 50.062, "stay", "poland"),
        ("oswiecim", "オシフィエンチム", 19.222, 50.038, "side", "poland"),
        ("warszawa", "ワルシャワ", 21.011, 52.230, "stay", "poland"),
        ("bialystok", "ビャウィストク", 23.169, 53.132, "stay", "poland"),
        ("vilnius", "ヴィリニュス", 25.280, 54.687, "stay", "lithuania"),
        ("siauliai", "シャウレイ", 23.317, 55.933, "side", "lithuania"),
        ("riga", "リガ", 24.105, 56.949, "stay", "latvia"),
        ("tallinn", "タリン", 24.754, 59.437, "stay", "estonia"),
        ("helsinki", "ヘルシンキ", 24.938, 60.170, "pass", "finland"),
        ("stockholm", "ストックホルム", 18.069, 59.329, "goal", "sweden"),
    ]
    at = {}
    out["cities"] = []
    for cid, name, lon, lat, kind, country in cities:
        x, y = project(lon, lat)
        at[cid] = (x, y)
        out["cities"].append(
            {
                "id": cid,
                "name": name,
                "x": round(x, 1),
                "y": round(y, 1),
                "kind": kind,
                "country": country,
            }
        )

    def leg(a: str, b: str, move: str, bulge: float = 0.10) -> dict:
        """区間の線。まっすぐだと図面くさいので、少しふくらませる。

        Args:
            a: 出発地のID
            b: 到着地のID
            move: 移動のしかた
            bulge: ふくらみ具合（進行方向に対して左が正）
        Returns:
            線1本ぶんの定義
        """
        (ax, ay), (bx, by) = at[a], at[b]
        mx, my = (ax + bx) / 2, (ay + by) / 2
        dx, dy = bx - ax, by - ay
        cx, cy = mx - dy * bulge, my + dx * bulge
        return {
            "from": a,
            "to": b,
            "move": move,
            "d": f"M{ax:.1f} {ay:.1f}Q{cx:.1f} {cy:.1f} {bx:.1f} {by:.1f}",
        }

    out["legs"] = [
        leg("katowice", "krakow", "hitch", 0.12),
        leg("krakow", "oswiecim", "side", -0.18),
        leg("krakow", "warszawa", "hitch", 0.10),
        leg("warszawa", "bialystok", "hitch", 0.10),
        leg("bialystok", "vilnius", "hitch", 0.08),
        leg("vilnius", "siauliai", "side", 0.14),
        leg("vilnius", "riga", "hitch", -0.10),
        leg("riga", "tallinn", "hitch", -0.10),
        leg("tallinn", "helsinki", "ferry", 0.20),
        leg("helsinki", "stockholm", "ferry", 0.14),
    ]

    # ジョージアからの飛行機。画面の外（南東）から入ってくる。
    kx, ky = at["katowice"]
    out["fly"] = {
        "d": f"M{out['view']['w'] + 40:.0f} {out['view']['h'] * 0.86:.0f}"
        f"Q{out['view']['w'] * 0.62:.0f} {out['view']['h'] * 0.98:.0f} {kx:.1f} {ky:.1f}",
    }

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False)
    size = os.path.getsize(OUT)
    print(f"view {out['view']}  -> {OUT}  ({size // 1024} KB)")
    for k2, v in out["countries"].items():
        print(f"  {k2:10} {len(v) // 1024} KB")


if __name__ == "__main__":
    import sys
    sys.setrecursionlimit(100000)
    main()
