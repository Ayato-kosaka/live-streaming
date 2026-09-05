"""
北欧ヒッチハイク旅のルート地図を作る。

実際の地形（Natural Earth 10m）から、ジョージア→ポーランド→バルト三国→北欧の
ルートが入る範囲を切り出して、SVG のパスに起こす。

地図の絵は島と同じ作りにする。
  - 陸のかたまり全体に、浅瀬・泡・砂の帯をつける（島の砂浜と同じ重ね方）
  - 輪郭線は引かない。国の境も、通らない国どうしの境も描かない
  - 通る国だけ草の緑。通らない陸はひとかたまりのくすんだ色

投影はランベルト正角円錐（標準緯線 51N / 61N）。
メルカトルだと北へ行くほど間延びして、ポーランドとフィンランドの
大きさの関係が嘘になるため。

## 座標をここで焼き込む理由

街・ルート・凡例・方位・縮尺、画面に出る座標はぜんぶこのスクリプトが計算する。
経度緯度から座標を出す式を TypeScript 側にもう一度書くと、投影のパラメータが
片方だけ変わったときに黙ってズレる。**TS 側で座標を計算しないこと。**

## 元データ

```bash
curl -sL https://cdn.jsdelivr.net/npm/world-atlas@2/countries-10m.json -o /tmp/world10m.json
# 湖と川（無くても地図は焼ける。あると水の情報が入って地図らしくなる）
NE=https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson
curl -sL $NE/ne_10m_lakes.geojson                   -o /tmp/ne_lakes.geojson
curl -sL $NE/ne_10m_rivers_lake_centerlines.geojson -o /tmp/ne_rivers.geojson
python3 python/build_nordic_map.py
```
"""

import hashlib
import json
import math
import os

SRC = "/tmp/world10m.json"
SRC_LAKES = "/tmp/ne_lakes.geojson"
SRC_RIVERS = "/tmp/ne_rivers.geojson"
OUT = "site/content/nordic/map.json"

# 描く範囲（度）。
# 西はデンマークが丸ごと入るところまで（ユトランド半島は 8.1E から）。
# ここを切ると、スウェーデン南端との海峡が画面の縁に来て、
# 「スカンジナビアの地図」に見えなくなる。
#
# 南北は「ルートの外側にどれだけ余白を残すか」で決める。
# クラクフ(50.06N)の下に 2.2 度、ヘルシンキ(60.17N)の上に 2.0 度。下は
# オシフィエンチムの名札と「クタイシから」の札が入るぶんだけ余分に要る。
# 前は 47.3〜63.6 にしていたが、誰も行かないドイツ南部とラップランドが
# 画面の3割を占めて、地図が縦に間延びしていた。切るぶんだけ縮尺が上がって、
# スマホでも街の名前が読める大きさになる。
LON_MIN, LON_MAX = 7.6, 31.6
LAT_MIN, LAT_MAX = 47.85, 62.15

# ランベルト正角円錐の設定
LAT0, LON0 = 47.3, 20.0
LAT1, LAT2 = 51.0, 61.0

# 画面上の幅。値は整数で焼くので、細かさはこの数字で決まる。
VIEW_W = 1000.0

# 通る国。ここだけ色をつける。
ROUTE = {
    "Poland": "poland",
    "Lithuania": "lithuania",
    "Latvia": "latvia",
    "Estonia": "estonia",
    "Finland": "finland",
    "Sweden": "sweden",
}

# 描く湖。名前で選ぶ。小さいものまで入れると点だらけになるので、
# 「地図を見た人が形で場所を分かる」大きさのものだけ。
LAKES = {
    "Lake Ladoga", "Lake Onega", "Lake Saimaa", "Päijänne", "Vänern", "Vättern",
    "Mälaren", "Hjälmaren", "Lake Peipus", "Lake Pskov", "Võrtsjärv", "Pielinen",
    "Oulujärvi", "Pyhäjärvi", "Lake Il'Men'", "Storsjön", "Mjøsa", "Siljan",
    "Zalew Wislany", "Kaliningradskiy Zaliv", "Bodensee", "Koitere", "Rikkavesi",
}

# 描く川。ルートが渡る川と、地形の骨になる川だけ。
RIVERS = {
    "Vistula", "Oder", "Warta", "Bug", "Neman", "Neris", "Narva", "Neva",
    "Elbe", "Daugava", "Zapadnaya Dvina", "Velikaya", "Dalälven", "Klarlven",
    "Glomma", "Gta lv", "Kokemenjoki", "Vuoksi", "Motala strm", "Volkhov",
}

# 国名の置き場所。
# 「輪の中でいちばん内側」を機械で出すと、ポーランドの中心はワルシャワ、
# ラトビアの中心はリガの真横、というふうに街の名札とぶつかる。
# 地図を見て手で決めたほうが速いので、経度緯度で持つ。
# （投影はここで通すので、投影の設定を変えても勝手についてくる）
COUNTRY_LABELS = {
    "poland": (17.0, 52.1, 46),
    "lithuania": (22.0, 55.35, 30),
    "latvia": (26.9, 56.9, 28),
    "estonia": (26.2, 58.7, 26),
    "finland": (26.7, 60.95, 40),
    "sweden": (14.9, 59.9, 40),
}

# 海と湾の名前。地図の中で場所を指せるように、いくつかだけ置く。
# rot は文字を寝かせる角度。湾は斜めに伸びているので、水面の向きに沿わせないと
# 名前だけが地図の上に浮いて見える。
# リガ湾は入れない。リガの名札と 307km の札で、すでにあの辺りは混んでいる。
SEA_LABELS = [
    ("バルト海", 18.5, 56.3, 34, -14),
    ("ボスニア湾", 19.5, 60.9, 26, -22),
    ("フィンランド湾", 26.4, 59.75, 21, -4),
]

# 山なみ。標高データは持っていないので、実際の山脈の走りを経度緯度でなぞる。
# ここに無い山（スウェーデン内陸のなだらかな丘など）は描かない。嘘の起伏を置かない。
# (点の並び, 山の大きさ)
RANGES = [
    # 南ノルウェーの高原。画面の左上が緑一色になるのを、これで止める。
    ([(13.1, 62.1), (12.5, 61.5), (12.0, 61.0), (11.1, 60.7), (10.0, 60.9),
      (8.9, 60.8), (8.0, 60.4), (7.4, 59.9)], 11.0),
    ([(13.6, 61.6), (13.0, 61.1), (12.6, 60.6)], 8.5),
    # カルパチア（タトラ〜ビェシチャディ）。クラクフのすぐ南に壁がある、
    # というのはこの旅で実際に効いてくる地形なので必ず描く。
    ([(18.4, 49.55), (19.3, 49.3), (20.1, 49.22), (21.0, 49.35),
      (21.9, 49.25), (22.8, 48.85)], 10.5),
    # ズデーテン
    ([(15.1, 50.8), (16.1, 50.5), (16.9, 50.25)], 8.5),
]

# 陸の国境を越えるところ。ヒッチハイクでは、ここが1日の山場になる。
# （国が変わる区間は6つあるが、飛行機とフェリーの3つは陸の国境を通らない）
# (手前の街, 向こうの街, 経度, 緯度, 検問所の名前)
BORDERS = [
    ("bialystok", "vilnius", 23.44, 54.13, "オグロドニキ"),
    ("vilnius", "riga", 24.20, 56.40, "サローチャイ"),
    ("riga", "tallinn", 24.36, 57.87, "アイナジ"),
]

# 方位を置く場所。正角円錐なので、ここの真北の傾きも一緒に焼き込む。
# ロシア側の、何も描いていないところへ置く。海に置くと泡ときらめきに埋もれる。
NORTH_AT = (30.5, 61.55)

# 縮尺の目盛りを置く場所。ドイツ北部の、誰も通らない空き地。
SCALE_AT = (9.2, 49.4)


# ---------------------------------------------------------------- 投影
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


def haversine(a: tuple[float, float], b: tuple[float, float]) -> float:
    """2点間の距離(km)。縮尺の目盛りを正しく打つのに使う。

    Args:
        a: (経度, 緯度)
        b: (経度, 緯度)
    Returns:
        距離(km)
    """
    r = math.radians
    dlon, dlat = r(b[0] - a[0]), r(b[1] - a[1])
    h = (
        math.sin(dlat / 2) ** 2
        + math.cos(r(a[1])) * math.cos(r(b[1])) * math.sin(dlon / 2) ** 2
    )
    return 6371.0 * 2 * math.asin(math.sqrt(h))


# ---------------------------------------------------------------- TopoJSON
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


# ---------------------------------------------------------------- 幾何
def clip(pts: list, box: tuple[float, float, float, float]) -> list:
    """サザーランド・ホジマンで、見せる範囲の四角に切る（閉じた輪むけ）。

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


def clip_open(pts: list, box: tuple[float, float, float, float]) -> list[list]:
    """開いた線（川）を範囲で切る。範囲を出入りするぶん、何本かに割れる。

    Args:
        pts: 経度緯度の並び
        box: (lonMin, latMin, lonMax, latMax)
    Returns:
        切れ切れになった線の一覧
    """
    lo, la, hi, lb = box

    def ins(p):
        return lo <= p[0] <= hi and la <= p[1] <= lb

    out, cur = [], []
    for p in pts:
        if ins(p):
            cur.append(p)
        elif cur:
            out.append(cur)
            cur = []
    if cur:
        out.append(cur)
    return [s for s in out if len(s) > 1]


def rdp(pts: list, eps: float) -> list:
    """ダグラス・ポイカー。細かすぎる海岸線を落として、SVG を軽くする。

    再帰だと海岸線1本で数千段になって落ちるので、明示スタックで回す。

    Args:
        pts: 点の並び
        eps: 許容誤差
    Returns:
        間引いた点の並び
    """
    n = len(pts)
    if n < 3:
        return pts
    keep = [False] * n
    keep[0] = keep[n - 1] = True
    stack = [(0, n - 1)]
    while stack:
        i0, i1 = stack.pop()
        if i1 <= i0 + 1:
            continue
        ax, ay = pts[i0]
        bx, by = pts[i1]
        dx, dy = bx - ax, by - ay
        n2 = dx * dx + dy * dy
        worst, wi = -1.0, i0
        for i in range(i0 + 1, i1):
            px, py = pts[i]
            if n2 == 0:
                d = math.hypot(px - ax, py - ay)
            else:
                t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / n2))
                d = math.hypot(px - (ax + t * dx), py - (ay + t * dy))
            if d > worst:
                worst, wi = d, i
        if worst > eps:
            keep[wi] = True
            stack.append((i0, wi))
            stack.append((wi, i1))
    return [p for p, k in zip(pts, keep) if k]


def area(pts: list) -> float:
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


# ---------------------------------------------------------------- パス出力
class Pen:
    """SVG のパスを相対座標で書く。

    絶対座標（`M234 567Q231 572 ...`）だと数字が4桁ずつ並ぶ。
    相対にすると隣り合う点の差だけになって1〜2桁で済み、同じ形のまま
    ファイルが半分近くになる。ペンの位置は「丸めたあとの値」で持つので、
    足し込んでも誤差が積もらない。
    """

    def __init__(self) -> None:
        self.out: list[str] = []
        self.x = 0.0
        self.y = 0.0

    @staticmethod
    def _n(v: float) -> str:
        return str(int(round(v)))

    def _put(self, cmd: str, nums: list[str]) -> None:
        s = cmd
        for t in nums:
            if (s[-1].isdigit() or s[-1] == ".") and not t.startswith("-"):
                s += " "
            s += t
        self.out.append(s)

    def move(self, x: float, y: float) -> None:
        rx, ry = round(x - self.x), round(y - self.y)
        self._put("m", [self._n(rx), self._n(ry)])
        self.x += rx
        self.y += ry

    def quad(self, cx: float, cy: float, x: float, y: float) -> None:
        rcx, rcy = round(cx - self.x), round(cy - self.y)
        rx, ry = round(x - self.x), round(y - self.y)
        self._put("q", [self._n(rcx), self._n(rcy), self._n(rx), self._n(ry)])
        self.x += rx
        self.y += ry

    def line(self, x: float, y: float) -> None:
        rx, ry = round(x - self.x), round(y - self.y)
        self._put("l", [self._n(rx), self._n(ry)])
        self.x += rx
        self.y += ry

    def close(self) -> None:
        self.out.append("z")

    def text(self) -> str:
        return "".join(self.out)


def _mid(a, b):
    return ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)


def ring_to(pen: Pen, pts: list) -> None:
    """閉じた輪を、角のない曲線としてペンに書く。

    各頂点を制御点、隣り合う頂点の中点を通過点にした2次ベジェでつなぐ。
    点の数を増やさずに角が取れるので、島の絵と同じ「かたい角を作らない」を
    地図でも守れて、しかも SVG が太らない。

    Args:
        pen: 書き込み先
        pts: 閉じた輪の点の並び
    """
    n = len(pts)
    pen.move(*_mid(pts[0], pts[1]))
    for i in range(1, n + 1):
        c = pts[i % n]
        pen.quad(c[0], c[1], *_mid(c, pts[(i + 1) % n]))
    pen.close()


def tri_path(items: list, tall: float) -> str:
    """三角形をたくさん並べたパス。森の針葉樹と、山なみに使う。

    塗るだけなので輪は閉じない（`z` を書かない）。SVG は fill のとき
    subpath を勝手に閉じるし、`z` を書くとペンの現在地が始点に戻って、
    次の `m` の相対値が狂う。

    光と影は、画面側で**同じパスを少しずらして3枚重ねる**ことで出す。
    木1本ずつに明るい面と暗い面を持たせると、パスの文字数が倍になって
    JSON が太る（森だけで 800 本ある）。

    Args:
        items: (x, y, 半幅) の並び。y は三角形の底辺。
        tall: 高さ ÷ 半幅
    Returns:
        SVG のパス
    """
    pen = Pen()
    for x, y, r in items:
        pen.move(x - r, y)
        pen.line(x, y - r * tall)
        pen.line(x + r, y)
    return pen.text()


def line_to(pen: Pen, pts: list) -> None:
    """開いた線を、角のない曲線としてペンに書く。

    Args:
        pen: 書き込み先
        pts: 点の並び
    """
    n = len(pts)
    if n < 3:
        pen.move(*pts[0])
        for p in pts[1:]:
            pen.line(*p)
        return
    pen.move(*pts[0])
    pen.quad(pts[1][0], pts[1][1], *_mid(pts[1], pts[2]))
    for i in range(2, n - 1):
        pen.quad(pts[i][0], pts[i][1], *_mid(pts[i], pts[i + 1]))
    pen.line(*pts[-1])


# ---------------------------------------------------------------- 中身
def rnd(seed: str):
    """種から決まる乱数。焼き直すたびに森の位置が動くと差分が読めないので、
    名前から作った固定の種を使う。

    Args:
        seed: 種になる文字列
    Returns:
        0〜1 を返す関数
    """
    h = int(hashlib.md5(seed.encode()).hexdigest()[:8], 16)
    state = [h or 1]

    def nxt() -> float:
        state[0] = (1103515245 * state[0] + 12345) & 0x7FFFFFFF
        return state[0] / 0x7FFFFFFF

    return nxt


def dist_to_edges(p, segs) -> float:
    """点から輪の辺までのいちばん近い距離。

    Args:
        p: (x, y)
        segs: ((x1,y1),(x2,y2)) の並び
    Returns:
        距離
    """
    px, py = p
    best = 1e18
    for (ax, ay), (bx, by) in segs:
        dx, dy = bx - ax, by - ay
        n2 = dx * dx + dy * dy
        if n2 == 0:
            d = (px - ax) ** 2 + (py - ay) ** 2
        else:
            t = ((px - ax) * dx + (py - ay) * dy) / n2
            t = 0.0 if t < 0 else (1.0 if t > 1 else t)
            d = (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2
        if d < best:
            best = d
    return math.sqrt(best)


def inside_rings(p, rings) -> bool:
    """偶奇判定。穴あきの輪でもそのまま使える。

    Args:
        p: (x, y)
        rings: 輪の並び
    Returns:
        中なら True
    """
    px, py = p
    c = False
    for ring in rings:
        n = len(ring)
        j = n - 1
        for i in range(n):
            xi, yi = ring[i]
            xj, yj = ring[j]
            if (yi > py) != (yj > py):
                if px < (xj - xi) * (py - yi) / (yj - yi) + xi:
                    c = not c
            j = i
    return c


def main() -> None:
    topo = json.load(open(SRC, encoding="utf-8"))
    arcs = decode_arcs(topo)
    geoms = topo["objects"]["countries"]["geometries"]

    # 画面の外へ少しだけはみ出させる。ぴったり切ると、砂の縁が画面の端に
    # 沿って1本の線として出てしまう。
    pad = 1.2
    corners = [
        lcc(LON_MIN, LAT_MIN), lcc(LON_MAX, LAT_MAX),
        lcc(LON_MIN, LAT_MAX), lcc(LON_MAX, LAT_MIN),
        lcc((LON_MIN + LON_MAX) / 2, LAT_MAX),
    ]
    minx = min(c[0] for c in corners)
    maxx = max(c[0] for c in corners)
    miny = min(c[1] for c in corners)
    maxy = max(c[1] for c in corners)
    w = maxx - minx
    k = VIEW_W / w
    view_h = round((maxy - miny) * k)

    def project(lon: float, lat: float) -> tuple[float, float]:
        px, py = lcc(lon, lat)
        return (px - minx) * k, (py - miny) * k

    # 粗く切る用の範囲（度）。ユーラシアの輪はシベリアまで続いているので、
    # 投影する前にここでざっくり落とさないと点が数十万になる。広めに取る。
    box = (LON_MIN - 8, LAT_MIN - 8, LON_MAX + 8, LAT_MAX + 8)

    # 仕上げは投影したあとの座標で切る。度で切ると、正角円錐では
    # 経線が傾いているぶん切り口が画面の中に入ってきて、
    # **ノルウェーの真ん中に、まっすぐな砂浜のある嘘の海岸線**ができる。
    # 画面の外 MARGIN のところで切れば、浅瀬や砂の帯（いちばん太くて 38）を
    # 足しても切り口が画面に出てこない。
    MARGIN = 90.0
    vbox = (-MARGIN, -MARGIN, VIEW_W + MARGIN, view_h + MARGIN)

    def polys_of(geom: dict) -> list:
        if geom["type"] == "Polygon":
            return [geom["arcs"]]
        if geom["type"] == "MultiPolygon":
            return list(geom["arcs"])
        return []

    def rings_of(geom: dict, eps: float, min_area: float) -> list:
        """国のジオメトリを、投影して間引いた輪の並びにする。

        Args:
            geom: TopoJSON のジオメトリ
            eps: 間引きの許容誤差（画面の単位）
            min_area: これより小さい輪は捨てる（画面の単位の2乗）
        Returns:
            輪の並び
        """
        out = []
        for poly in polys_of(geom):
            for ring in poly:
                pts = clip(ring_points(arcs, ring), box)
                if len(pts) < 3:
                    continue
                pp = clip([project(x, y) for x, y in pts], vbox)
                if len(pp) < 3:
                    continue
                pp = rdp(pp, eps)
                if len(pp) < 3 or area(pp) < min_area:
                    continue
                out.append(pp)
        return out

    def rings_path(rings: list) -> str:
        pen = Pen()
        for r in rings:
            ring_to(pen, r)
        return pen.text()

    out: dict = {
        "view": {"w": VIEW_W, "h": view_h},
        "bounds": {
            "lonMin": LON_MIN, "lonMax": LON_MAX,
            "latMin": LAT_MIN, "latMax": LAT_MAX,
        },
    }

    # ---- 陸 --------------------------------------------------------
    # 通らない国どうしの境は描かない。描くと「政治の地図」になって、
    # 通る6カ国が主役だということが伝わらなくなる。
    # なので背景は国別ではなく、陸のかたまり（land）1枚で塗る。
    land = topo["objects"]["land"]["geometries"][0]
    # 間引きは 0.55。0.85 だとサーレマー島やボーンホルム島が消えて、
    # バルト海が「ただの空き地」になる。小さい輪の足切りも 1.5 まで下げる。
    land_rings = rings_of(land, 0.55, 1.5)
    out["land"] = rings_path(land_rings)

    country_rings: dict[str, list] = {}
    out["countries"] = {}
    for g in geoms:
        name = g["properties"]["name"]
        if name in ROUTE:
            slug = ROUTE[name]
            rs = rings_of(g, 0.55, 1.5)
            country_rings[slug] = rs
            out["countries"][slug] = rings_path(rs)

    # ---- 湖と川 ----------------------------------------------------
    out["lakes"] = ""
    if os.path.exists(SRC_LAKES):
        pen = Pen()
        gj = json.load(open(SRC_LAKES, encoding="utf-8"))
        for f in gj["features"]:
            if f["properties"].get("name") not in LAKES:
                continue
            geom = f["geometry"]
            polys = (
                [geom["coordinates"]]
                if geom["type"] == "Polygon"
                else geom["coordinates"]
            )
            for poly in polys:
                for ring in poly:
                    pts = clip([(c[0], c[1]) for c in ring], box)
                    if len(pts) < 3:
                        continue
                    pp = clip([project(x, y) for x, y in pts], vbox)
                    if len(pp) < 3:
                        continue
                    # 湖はサイマーのように輪が細かく分かれている。
                    # 形が分かればいいので、海岸線より粗く間引く。
                    pp = rdp(pp, 2.0)
                    if len(pp) < 3 or area(pp) < 18.0:
                        continue
                    ring_to(pen, pp)
        out["lakes"] = pen.text()

    out["rivers"] = ""
    if os.path.exists(SRC_RIVERS):
        pen = Pen()
        gj = json.load(open(SRC_RIVERS, encoding="utf-8"))
        for f in gj["features"]:
            nm = f["properties"].get("name")
            if nm not in RIVERS:
                continue
            geom = f["geometry"]
            if not geom:
                continue
            parts = (
                [geom["coordinates"]]
                if geom["type"] == "LineString"
                else geom["coordinates"]
            )
            for part in parts:
                for seg in clip_open([(c[0], c[1]) for c in part], box):
                    for sub in clip_open([project(x, y) for x, y in seg], vbox):
                        pp = rdp(sub, 1.4)
                        if len(pp) < 2:
                            continue
                        line_to(pen, pp)
        out["rivers"] = pen.text()

    # ---- 経緯線 ----------------------------------------------------
    # 5度ごと。うっすら出すだけで「地図を見ている」感じが出る。
    pen = Pen()
    lo0 = int(math.ceil(LON_MIN / 5.0)) * 5
    la0 = int(math.ceil(LAT_MIN / 5.0)) * 5
    for lon in range(lo0, int(LON_MAX) + 1, 5):
        pts = [project(lon, LAT_MIN + t * (LAT_MAX - LAT_MIN) / 24) for t in range(25)]
        line_to(pen, pts)
    for lat in range(la0, int(LAT_MAX) + 1, 5):
        pts = [project(LON_MIN + t * (LON_MAX - LON_MIN) / 24, lat) for t in range(25)]
        line_to(pen, pts)
    out["grid"] = pen.text()

    # ---- 街 --------------------------------------------------------
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
    # 首都は印を変える。全部おなじ丸だと、11個の点がただ並んでいるだけに見える。
    CAPITALS = {"warszawa", "vilnius", "riga", "tallinn", "helsinki", "stockholm"}
    at: dict[str, tuple[float, float]] = {}
    out["cities"] = []
    for i, (cid, nm, lon, lat, kind, country) in enumerate(cities):
        x, y = project(lon, lat)
        at[cid] = (x, y)
        out["cities"].append({
            "id": cid, "name": nm,
            "x": round(x, 1), "y": round(y, 1),
            "kind": kind, "country": country,
            "cap": cid in CAPITALS,
            # ルートの何番目か。ここまで来た／まだ、を塗り分けるのに使う。
            "seq": i,
        })

    # ---- 森 --------------------------------------------------------
    # 「ただの塗り」に見せないための地面の情報量（ac-reference 4章）。
    # 通る6カ国の中だけに置く。海岸から離れた場所を選ぶので、
    # 距離場（辺までの距離）をいちど作って使い回す。
    #
    # 前は 950 個の <ellipse> を並べていた。丸のまだら模様は「森」に見えないし、
    # DOM が 950 個ぶん重い。針葉樹の形にして、パス2本（影の面と光の面）に畳む。
    woods: list[list[float]] = []
    # 国ごとの森の濃さ。北へ行くほど森が深い、という実際の見た目に合わせる。
    DENSITY = {
        "poland": 0.19, "lithuania": 0.23, "latvia": 0.27,
        "estonia": 0.27, "finland": 0.42, "sweden": 0.38,
    }
    for slug, rings in country_rings.items():
        if not rings:
            continue
        segs = []
        for r in rings:
            step = max(1, len(r) // 260)
            rr = r[::step]
            segs += [(rr[i], rr[(i + 1) % len(rr)]) for i in range(len(rr))]
        # 探すのは画面に映っているところだけ。スウェーデンやフィンランドは
        # 輪が画面の上へ伸びているので、そこを外さないと国名が画面外に出る。
        xs = [p[0] for r in rings for p in r]
        ys = [p[1] for r in rings for p in r]
        x0, x1 = max(min(xs), 8.0), min(max(xs), VIEW_W - 8.0)
        y0, y1 = max(min(ys), 8.0), min(max(ys), view_h - 8.0)
        if x1 - x0 < 20 or y1 - y0 < 20:
            continue
        nx = max(8, min(52, int((x1 - x0) / 12)))
        ny = max(8, min(78, int((y1 - y0) / 12)))
        rng = rnd("woods-" + slug)
        for iy in range(ny):
            for ix in range(nx):
                px = x0 + (ix + 0.5) * (x1 - x0) / nx
                py = y0 + (iy + 0.5) * (y1 - y0) / ny
                if not inside_rings((px, py), rings):
                    continue
                d = dist_to_edges((px, py), segs)
                # 海岸から離れているところにだけ森を置く。
                if d > 13 and rng() < DENSITY[slug]:
                    jx = px + (rng() - 0.5) * (x1 - x0) / nx * 0.9
                    jy = py + (rng() - 0.5) * (y1 - y0) / ny * 0.9
                    r = 4.0 + rng() * 3.4 + min(3.2, d / 26)
                    woods.append([jx, jy, r])
    # 手前の木ほど下に来るように並べ替える。重なったときに奥行きが出る。
    woods.sort(key=lambda w: w[1])
    out["woods"] = tri_path(woods, 2.15)

    # ---- 山なみ ----------------------------------------------------
    hills: list[list[float]] = []
    for pts, size in RANGES:
        pp = [project(lon, lat) for lon, lat in pts]
        rng = rnd(f"hill-{pts[0]}")
        # 尾根に沿って、一定の間隔で山を置く。真横に並ぶと櫛に見えるので、
        # 尾根と直角の向きにも散らす。
        step = size * 1.55
        for i in range(len(pp) - 1):
            (ax, ay), (bx, by) = pp[i], pp[i + 1]
            seg = math.hypot(bx - ax, by - ay)
            n = max(1, int(seg / step))
            for j in range(n):
                t = (j + 0.5) / n
                cx, cy = ax + (bx - ax) * t, ay + (by - ay) * t
                nx_, ny_ = -(by - ay) / (seg or 1), (bx - ax) / (seg or 1)
                off = (rng() - 0.5) * size * 2.6
                hills.append([cx + nx_ * off, cy + ny_ * off + (rng() - 0.5) * size,
                              size * (0.62 + rng() * 0.62)])
    hills.sort(key=lambda h: h[1])
    out["hills"] = tri_path(hills, 1.30)

    # ---- 海のきらめき ----------------------------------------------
    # どうぶつの森の海は白い光が散っている（ac-reference 1章）。
    # 岸のそばに置くと泡と喧嘩するので、陸から離れた開いた海にだけ置く。
    land_segs = []
    for r in land_rings:
        step = max(1, len(r) // 90)
        rr = r[::step]
        land_segs += [(rr[i], rr[(i + 1) % len(rr)]) for i in range(len(rr))]
    glints: list[list[int]] = []
    rng = rnd("glint")
    gx, gy = 24, int(24 * view_h / VIEW_W)
    for iy in range(gy):
        for ix in range(gx):
            px = (ix + 0.15 + rng() * 0.7) * VIEW_W / gx
            py = (iy + 0.15 + rng() * 0.7) * view_h / gy
            if inside_rings((px, py), land_rings):
                continue
            if dist_to_edges((px, py), land_segs) < 30:
                continue
            if rng() > 0.62:
                continue
            glints.append([round(px), round(py), round(5 + rng() * 7)])
    out["glints"] = glints

    # ---- ルート ----------------------------------------------------
    def leg(a: str, b: str, move: str, bulge: float = 0.10, km_off: float | None = 30.0) -> dict:
        """区間の線。

        まっすぐだと図面くさいので少しふくらませ、さらに手描きのゆらぎを足す。
        ゆらぎは区間名から決まる固定の乱数なので、焼き直しても同じ形になる。

        Args:
            a: 出発地のID
            b: 到着地のID
            move: 移動のしかた
            bulge: ふくらみ具合（進行方向に対して左が正）
            km_off: 距離の札を線からどれだけ離すか（進行方向に対して左が正）。
                None なら札を出さない（寄り道のように、書くと混むだけの区間）
        Returns:
            線1本ぶんの定義。d のほかに、矢印と距離の札の位置を持つ
        """
        (ax, ay), (bx, by) = at[a], at[b]
        mx, my = (ax + bx) / 2, (ay + by) / 2
        dx, dy = bx - ax, by - ay
        cx, cy = mx - dy * bulge, my + dx * bulge
        span = math.hypot(dx, dy)
        rng = rnd(f"{a}-{b}")
        ph1, ph2 = rng() * 6.28, rng() * 6.28
        amp = min(3.4, span * 0.018)
        n = max(10, int(span / 12))
        pts = []
        for i in range(n + 1):
            t = i / n
            u = 1 - t
            px = u * u * ax + 2 * u * t * cx + t * t * bx
            py = u * u * ay + 2 * u * t * cy + t * t * by
            tx = 2 * u * (cx - ax) + 2 * t * (bx - cx)
            ty = 2 * u * (cy - ay) + 2 * t * (by - cy)
            tl = math.hypot(tx, ty) or 1.0
            # 端は動かさない。街のピンから線が浮くとみっともないので。
            fade = math.sin(math.pi * t)
            wob = (math.sin(t * 9.1 + ph1) + 0.6 * math.sin(t * 21.7 + ph2)) * amp * fade
            pts.append((px - ty / tl * wob, py + tx / tl * wob))
        pen = Pen()
        line_to(pen, pts)
        # 進む向きの矢印。長い区間ほど数を増やす。
        marks = []
        for f in ([0.5] if span < 130 else [0.3, 0.72]):
            i = int(f * n)
            j = min(n, i + 1)
            ang = math.degrees(math.atan2(pts[j][1] - pts[i][1], pts[j][0] - pts[i][0]))
            marks.append([round(pts[i][0]), round(pts[i][1]), round(ang)])
        # 距離の札を置く場所。線の真ん中から、線と直角に少しずらす。
        # どちら側にずらすかは、線が混んでいない側を手で選ぶ（km_side）。
        km_at = None
        if km_off is not None:
            i = n // 2
            j = min(n, i + 1)
            tx, ty = pts[j][0] - pts[i][0], pts[j][1] - pts[i][1]
            tl = math.hypot(tx, ty) or 1.0
            km_at = [round(pts[i][0] - ty / tl * km_off), round(pts[i][1] + tx / tl * km_off)]
        # 線のまんなか。移動手段の絵を置く場所（進行方向つき）。
        i = n // 2
        j = min(n, i + 1)
        mid_ang = math.degrees(math.atan2(pts[j][1] - pts[i][1], pts[j][0] - pts[i][0]))
        return {
            "from": a, "to": b, "move": move, "d": pen.text(), "marks": marks,
            "kmAt": km_at,
            "mid": [round(pts[i][0]), round(pts[i][1]), round(mid_ang)],
        }

    out["legs"] = [
        leg("katowice", "krakow", "hitch", 0.12, 92),
        leg("krakow", "oswiecim", "side", -0.20, None),
        leg("krakow", "warszawa", "hitch", 0.10, 44),
        leg("warszawa", "bialystok", "hitch", 0.10, 40),
        leg("bialystok", "vilnius", "hitch", 0.08, 40),
        leg("vilnius", "siauliai", "side", 0.14, None),
        leg("vilnius", "riga", "hitch", -0.10, 46),
        leg("riga", "tallinn", "hitch", -0.10, 44),
        leg("tallinn", "helsinki", "ferry", 0.20, -40),
        leg("helsinki", "stockholm", "ferry", 0.14, 40),
    ]

    # ---- 陸の国境 --------------------------------------------------
    # 越える向きに直角な棒を置く。ヒッチハイクで国境を歩いて越えるのは
    # この旅でいちばん絵になるところなので、地図の上でも印を分ける。
    out["borders"] = []
    for a, b, lon, lat, nm in BORDERS:
        bx, by = project(lon, lat)
        (ax, ay), (cx2, cy2) = at[a], at[b]
        ang = math.degrees(math.atan2(cy2 - ay, cx2 - ax))
        out["borders"].append({
            "x": round(bx), "y": round(by), "deg": round(ang, 1), "name": nm,
        })

    # ジョージアからの飛行機。画面の外（南東）から入ってくる。
    kx, ky = at["katowice"]
    fx, fy = VIEW_W + 60, view_h * 0.80
    out["fly"] = {
        "d": f"M{fx:.0f} {fy:.0f}Q{VIEW_W * 0.66:.0f} {view_h * 0.99:.0f} {kx:.0f} {ky:.0f}",
        "chip": [round(VIEW_W * 0.70), round(view_h * 0.955)],
    }

    # ---- 名前 ------------------------------------------------------
    # 国名は「輪の中でいちばん内側」に置く。重心だとスウェーデンのように
    # 海に出てしまう国がある。文字の大きさも、置ける余白から決める。
    out["labels"] = {
        slug: {"x": round(project(lon, lat)[0]), "y": round(project(lon, lat)[1]), "size": size}
        for slug, (lon, lat, size) in COUNTRY_LABELS.items()
    }
    out["seas"] = [
        {"name": nm, "x": round(project(lon, lat)[0]), "y": round(project(lon, lat)[1]),
         "size": size, "rot": rot}
        for nm, lon, lat, size, rot in SEA_LABELS
    ]

    # ---- 縮尺と方位 ------------------------------------------------
    # 縮尺は「画面の 200 単位が何 km か」から、きりのいい数字を選ぶ。
    lon_a, lat_s = SCALE_AT
    xa, _ = project(lon_a, lat_s)
    xb, _ = project(lon_a + 2.0, lat_s)
    km_per_unit = haversine((lon_a, lat_s), (lon_a + 2.0, lat_s)) / abs(xb - xa)
    for cand in (100, 200, 250, 300, 400, 500):
        if cand / km_per_unit >= 150:
            bar_km = cand
            break
    else:
        bar_km = 500
    sx, sy = project(*SCALE_AT)
    out["scale"] = {
        "km": bar_km, "len": round(bar_km / km_per_unit),
        "kmPerUnit": round(km_per_unit, 4),
        "x": round(sx), "y": round(sy),
    }

    # 方位。正角円錐なので、真北は場所によって傾く。傾きをここで出しておく。
    nlon, nlat = NORTH_AT
    n0 = project(nlon, nlat)
    n1 = project(nlon, nlat + 0.6)
    out["north"] = {
        "x": round(n0[0]), "y": round(n0[1]),
        "deg": round(math.degrees(math.atan2(n1[0] - n0[0], n0[1] - n1[1])), 1),
    }

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    size = os.path.getsize(OUT)
    print(f"view {out['view']}  -> {OUT}  ({size / 1024:.1f} KB)")
    for key in ("land", "lakes", "rivers", "grid"):
        print(f"  {key:10} {len(out[key]) / 1024:6.1f} KB")
    for k2, v in out["countries"].items():
        print(f"  {k2:10} {len(v) / 1024:6.1f} KB")
    print(f"  woods      {len(woods)} 個 / glints {len(glints)} 個")
    print(f"  scale      {bar_km}km = {out['scale']['len']}u   north {out['north']['deg']}deg")
    print(f"  hills      {len(hills)} 個 / woods path {len(out['woods']) / 1024:.1f} KB")
    for slug, v in out["labels"].items():
        print(f"  label {slug:10} {v}")
    for c in out["cities"]:
        print(f"  city  {c['id']:11} {c['x']:6.1f} {c['y']:6.1f} {c['kind']}")



if __name__ == "__main__":
    main()
