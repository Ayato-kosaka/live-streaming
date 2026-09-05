"""
パリからジョージアまで、これまでに歩いた17カ国の地図を作る。

実際の地形（Natural Earth 10m）から、旅がぜんぶ入る範囲
（西はスコットランド、南はアブ・シンベル、東はアブダビ）を切り出して、
SVG のパスに焼く。北欧の地図（`python/build_nordic_map.py`）と同じ作り方で、
違うのは範囲と投影と、旅の中身だけ。

## なぜメルカトルか

北欧はランベルト正角円錐にしてある。あちらは南北に細長いので円錐が効く。
こちらは経度が 66 度（スコットランド -9E からアブダビ 56E）ある。
円錐で投影すると端の国が 20 度近く傾いて、イギリスとUAEが逆向きに寝てしまう。
メルカトルなら経線が垂直のまま、形もその場その場では正しい。
高緯度が大きく写るのは承知のうえ。見る人が知っている「世界地図の形」に合う。

## 座標をここで焼き込む理由

街・ルート・凡例・方位・縮尺、画面に出る座標はぜんぶこのスクリプトが計算する。
経度緯度から座標を出す式を TypeScript 側にもう一度書くと、投影のパラメータが
片方だけ変わったときに黙ってズレる。**TS 側で座標を計算しないこと。**

## 出すもの

- `site/content/atlas/route.json` … 世界1枚（/map の主役）
- `site/content/atlas/c/<slug>.json` … 国ごとの寄りの地図（/map/<slug> の頭）

国ごとの地図は世界地図を拡大したものではなく、その国の範囲で投影し直して
間引きも細かくやり直したもの。世界の粗さのまま寄ると、キプロスやオランダが
ただの多角形になってしまう。

## 元データ

```bash
curl -sL https://cdn.jsdelivr.net/npm/world-atlas@2/countries-10m.json -o /tmp/world10m.json
NE=https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson
curl -sL $NE/ne_10m_lakes.geojson                   -o /tmp/ne_lakes.geojson
curl -sL $NE/ne_10m_rivers_lake_centerlines.geojson -o /tmp/ne_rivers.geojson
python3 python/build_world_route.py
```
"""

import hashlib
import json
import math
import os

SRC = "/tmp/world10m.json"
SRC_LAKES = "/tmp/ne_lakes.geojson"
SRC_RIVERS = "/tmp/ne_rivers.geojson"
OUT = "site/content/atlas/route.json"
OUT_DIR_C = "site/content/atlas/c"

# 描く範囲（度）。旅の四隅がぜんぶ入って、まわりの陸が少しだけ見えるところ。
#   西 グラスゴー -4.25 / 東 アブダビ 54.38 / 南 アブ・シンベル 22.34 / 北 エディンバラ 55.95
LON_MIN, LON_MAX = -11.0, 57.5
LAT_MIN, LAT_MAX = 20.0, 60.5

VIEW_W = 1400.0

# 通った国。TopoJSON の名前 → このサイトの slug。
# キプロスは北キプロスと国連緩衝地帯に分かれているので、3つを1つに寄せる。
ROUTE = {
    "France": "france",
    "Netherlands": "netherlands",
    "Belgium": "belgium",
    "Hungary": "hungary",
    "Austria": "austria",
    "Slovakia": "slovakia",
    "Czechia": "czech",
    "Germany": "germany",
    "United Kingdom": "uk",
    "Turkey": "turkey",
    "Cyprus": "cyprus",
    "N. Cyprus": "cyprus",
    "Cyprus U.N. Buffer Zone": "cyprus",
    "Egypt": "egypt",
    "Jordan": "jordan",
    "United Arab Emirates": "uae",
    "Azerbaijan": "azerbaijan",
    "Georgia": "georgia",
    "Armenia": "armenia",
    "Iran": "iran-border",
}

LAKES = {
    "Lake Nasser", "Dead Sea", "Lake Sevan", "Lake Van", "Lake Urmia", "Lake Tuz",
    "Lake Balaton", "Lake Geneva", "Bodensee", "IJsselmeer", "Markermeer",
    "Lake Ladoga", "Lake Onega", "Vänern", "Vättern", "Lake Peipus", "Neusiedler See",
    "Lough Neagh", "Loch Ness", "Lake Kremenchuk", "Kakhovka Reservoir",
    "Lago di Garda", "Lago Maggiore", "Lago di Como", "Mjøsa", "Saimaa", "Päijänne",
}

# 川。ルートが渡る川と、地形の骨になる川。
# ナイルは「エジプトの1ヶ月」がぜんぶこの線の上で起きているので、いちばん大事。
RIVERS = {
    "Nile", "Danube", "Rhine", "Thames", "Seine", "Loire", "Rhône", "Elbe",
    "Vistula", "Oder", "Euphrates", "Tigris", "Kura", "Aras", "Jordan",
    "Volga", "Dniester", "Dnieper", "Po", "Ebro", "Tagus", "Sava", "Severn",
    "Don", "Ural", "Dniepr", "Douro", "Guadalquivir", "Meuse", "Weser", "Tisza",
}

# 海の名前。場所が指せる程度に、大きいものだけ。
SEA_LABELS = [
    ("大西洋", -8.6, 45.6, 30, 0),
    ("北海", 3.4, 56.4, 24, 0),
    ("バルト海", 19.4, 57.4, 22, 0),
    ("地中海", 17.0, 34.6, 34, 0),
    ("黒海", 34.4, 43.4, 26, 0),
    ("カスピ海", 51.0, 41.6, 22, 90),
    ("紅海", 37.4, 22.6, 20, 62),
    ("ペルシャ湾", 51.0, 27.4, 20, 40),
]

# 山脈。実在の稜線をなぞった折れ線。ここに沿って山の印を置く。
# データを落とさずに済ませたいので、地図から読んだ点を直に持っている。
RANGES = [
    ("alps", [(6.0, 45.9), (7.6, 45.9), (9.6, 46.5), (11.4, 46.9), (13.4, 46.9), (15.0, 47.2)]),
    ("pyrenees", [(-1.5, 43.1), (0.6, 42.7), (2.6, 42.4)]),
    ("carpathian", [(19.0, 49.4), (21.4, 49.2), (23.6, 48.2), (25.2, 47.3), (25.4, 45.9), (24.0, 45.4), (22.6, 45.3)]),
    ("balkan", [(20.0, 42.6), (21.6, 42.2), (23.4, 42.7), (25.4, 42.8)]),
    ("caucasus", [(40.4, 43.4), (42.4, 43.3), (44.6, 42.7), (46.6, 41.9), (48.4, 41.3)]),
    ("lesser-caucasus", [(43.4, 41.4), (44.6, 40.6), (45.8, 40.2), (46.4, 39.4)]),
    ("taurus", [(29.6, 37.0), (32.4, 37.2), (35.4, 37.4), (37.6, 37.6)]),
    ("zagros", [(45.6, 36.4), (47.4, 34.4), (49.4, 32.4), (51.4, 30.4), (53.6, 29.0)]),
    ("elburz", [(48.8, 36.6), (51.4, 36.2), (54.4, 36.4)]),
    ("atlas", [(-5.4, 32.0), (-3.0, 32.4), (-0.4, 33.6), (2.6, 35.4), (6.0, 36.2), (8.6, 36.4)]),
    ("scotland", [(-5.4, 56.6), (-4.2, 57.2), (-3.4, 57.0)]),
    ("apennine", [(10.4, 44.2), (12.4, 43.2), (14.4, 41.6), (16.0, 40.4)]),
    ("sinai", [(33.8, 28.6), (34.4, 29.4)]),
]


# ---------------------------------------------------------------- 投影
def merc(lon: float, lat: float) -> tuple[float, float]:
    """メルカトル。経線が垂直に立ち、その場その場の形が正しい。

    Args:
        lon: 経度(度)
        lat: 緯度(度)
    Returns:
        投影後の (x, y)。y は南が大きい向きに直してある。
    """
    lat = max(-84.0, min(84.0, lat))
    x = math.radians(lon)
    y = math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))
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

    ユーラシアの輪は1本でシベリアまで続いている。輪ごと残すと SVG が
    数MBになるので、範囲で切ってから投影する。

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
    """開いた線（川・ルート）を範囲で切る。出入りするぶん何本かに割れる。

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

    絶対座標だと数字が4桁ずつ並ぶ。相対にすると隣り合う点の差だけになって
    1〜2桁で済み、同じ形のままファイルが半分近くになる。
    ペンの位置は「丸めたあとの値」で持つので、足し込んでも誤差が積もらない。
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


# ---------------------------------------------------------------- 旅の中身
# 街。(id, 表示名, 経度, 緯度, 国, 種類)
#   hub  … その国の顔になる街。国のピンはここに立つ
#   stop … 泊まった街
#   side … 寄り道の行き先
CITIES = [
    ("paris", "パリ", 2.3522, 48.8566, "france", "hub"),
    ("rouen", "ルーアン", 1.0993, 49.4432, "france", "stop"),
    ("mont-saint-michel", "モン・サン・ミシェル", -1.5115, 48.6361, "france", "side"),
    ("les-baux", "南フランス", 4.7950, 43.7440, "france", "stop"),
    ("amsterdam", "アムステルダム", 4.9041, 52.3676, "netherlands", "hub"),
    ("brussels", "ブリュッセル", 4.3517, 50.8503, "belgium", "hub"),
    ("liege", "リエージュ", 5.5797, 50.6326, "belgium", "stop"),
    ("budapest", "ブダペスト", 19.0402, 47.4979, "hungary", "hub"),
    ("vienna", "ウィーン", 16.3738, 48.2082, "austria", "hub"),
    ("bratislava", "ブラチスラバ", 17.1077, 48.1486, "slovakia", "hub"),
    ("prague", "プラハ", 14.4378, 50.0755, "czech", "hub"),
    ("berlin", "ベルリン", 13.4050, 52.5200, "germany", "hub"),
    ("cologne", "ケルン", 6.9603, 50.9375, "germany", "stop"),
    ("london", "ロンドン", -0.1276, 51.5072, "uk", "hub"),
    ("edinburgh", "エディンバラ", -3.1883, 55.9533, "uk", "stop"),
    ("glasgow", "グラスゴー", -4.2518, 55.8642, "uk", "stop"),
    ("liverpool", "リバプール", -2.9916, 53.4084, "uk", "stop"),
    ("bristol", "ブリストル", -2.5879, 51.4545, "uk", "stop"),
    ("istanbul", "イスタンブール", 28.9784, 41.0082, "turkey", "hub"),
    ("nicosia", "ニコシア", 33.3823, 35.1856, "cyprus", "hub"),
    ("larnaca", "ラルナカ", 33.6233, 34.9182, "cyprus", "stop"),
    ("paphos", "パフォス", 32.4297, 34.7754, "cyprus", "side"),
    ("cairo", "カイロ", 31.2357, 30.0444, "egypt", "hub"),
    ("siwa", "シワ", 25.5195, 29.2032, "egypt", "side"),
    ("luxor", "ルクソール", 32.6396, 25.6872, "egypt", "stop"),
    ("aswan", "アスワン", 32.8998, 24.0889, "egypt", "stop"),
    ("abu-simbel", "アブ・シンベル", 31.6258, 22.3372, "egypt", "stop"),
    ("amman", "アンマン", 35.9284, 31.9539, "jordan", "hub"),
    ("dead-sea", "死海", 35.5000, 31.5000, "jordan", "side"),
    ("petra", "ペトラ", 35.4444, 30.3285, "jordan", "stop"),
    ("abu-dhabi", "アブダビ", 54.3773, 24.4539, "uae", "hub"),
    ("baku", "バクー", 49.8671, 40.4093, "azerbaijan", "hub"),
    ("tbilisi", "トビリシ", 44.7930, 41.7151, "georgia", "hub"),
    ("kazbegi", "カズベキ", 44.6425, 42.6572, "georgia", "side"),
    ("borjomi", "ボルジョミ", 43.3833, 41.8408, "georgia", "side"),
    ("kutaisi", "クタイシ", 42.6954, 42.2679, "georgia", "stop"),
    ("zugdidi", "ズグディディ", 41.8709, 42.5088, "georgia", "stop"),
    ("mestia", "メスティア", 42.7280, 43.0450, "georgia", "side"),
    ("batumi", "バトゥミ", 41.6168, 41.6168, "georgia", "stop"),
    ("yerevan", "エレバン", 44.5152, 40.1872, "armenia", "hub"),
    ("sevan", "セヴァン湖", 45.0000, 40.5500, "armenia", "side"),
    ("artashat", "アルタシャト", 44.5500, 39.9530, "armenia", "stop"),
    ("goris", "ゴリス", 46.3400, 39.5100, "armenia", "stop"),
    ("tatev", "タテフ", 46.2500, 39.3800, "armenia", "stop"),
    ("kapan", "カパン", 46.4050, 39.2010, "armenia", "stop"),
    ("meghri", "メグリ（国境）", 46.2400, 38.9000, "iran-border", "hub"),
]

# ルート。(出発, 到着, 移動のしかた, ふくらみ)
#   land … 電車とバス。旅のふつうの線
#   air  … 飛行機
#   sea  … 船
#   walk … 歩いた。イランへの10日間だけ
#   hitch… ヒッチハイクで戻った
#   side … 寄り道。行って帰ってくるので細い点線1本で描く
LEGS = [
    ("paris", "amsterdam", "land", 0.10),
    ("amsterdam", "brussels", "land", 0.10),
    ("brussels", "budapest", "air", 0.11),
    ("budapest", "vienna", "land", -0.12),
    ("vienna", "bratislava", "land", 0.14),
    ("bratislava", "prague", "land", 0.12),
    ("prague", "berlin", "land", -0.10),
    ("berlin", "london", "air", 0.10),
    ("london", "edinburgh", "land", -0.10),
    ("edinburgh", "glasgow", "land", 0.18),
    ("glasgow", "liverpool", "land", -0.09),
    ("liverpool", "bristol", "land", 0.10),
    ("bristol", "london", "land", 0.10),
    ("london", "rouen", "sea", 0.12),
    ("rouen", "mont-saint-michel", "side", 0.16),
    ("rouen", "les-baux", "land", -0.10),
    ("les-baux", "paris", "land", -0.12),
    ("paris", "liege", "land", 0.09),
    ("liege", "cologne", "land", 0.12),
    ("cologne", "istanbul", "air", 0.10),
    ("istanbul", "nicosia", "air", -0.10),
    ("nicosia", "larnaca", "land", 0.18),
    ("larnaca", "cairo", "air", 0.12),
    ("cairo", "siwa", "side", 0.14),
    ("cairo", "luxor", "land", -0.07),
    ("luxor", "aswan", "land", -0.07),
    ("aswan", "abu-simbel", "land", 0.10),
    ("abu-simbel", "larnaca", "air", -0.09),
    ("larnaca", "paphos", "side", 0.16),
    ("larnaca", "amman", "air", 0.10),
    ("amman", "dead-sea", "side", 0.18),
    ("amman", "petra", "land", 0.11),
    ("petra", "abu-dhabi", "air", -0.08),
    ("abu-dhabi", "baku", "air", 0.09),
    ("baku", "tbilisi", "land", -0.09),
    ("tbilisi", "kazbegi", "side", 0.14),
    ("tbilisi", "borjomi", "side", -0.14),
    ("tbilisi", "kutaisi", "land", 0.10),
    ("kutaisi", "zugdidi", "land", 0.10),
    ("zugdidi", "mestia", "side", 0.14),
    ("kutaisi", "batumi", "side", -0.14),
    ("tbilisi", "yerevan", "land", 0.10),
    ("yerevan", "sevan", "side", 0.16),
    ("yerevan", "artashat", "walk", 0.06),
    ("artashat", "goris", "walk", -0.10),
    ("goris", "tatev", "walk", 0.14),
    ("tatev", "kapan", "walk", -0.12),
    ("kapan", "meghri", "walk", 0.12),
    ("meghri", "yerevan", "hitch", 0.24),
]

# 国のピンに出す通し番号と、その国に着いた日。
# 2度目に寄った国（フランス・ベルギー・ドイツ・キプロス・ジョージア）は
# 最初に着いた順で数える。
ORDER = [
    "france", "netherlands", "belgium", "hungary", "austria", "slovakia",
    "czech", "germany", "uk", "turkey", "cyprus", "egypt", "jordan",
    "uae", "azerbaijan", "georgia", "armenia", "iran-border",
]

# 章。地図を寄せるときの範囲（経度緯度）。
CHAPTERS = [
    ("all", "ぜんぶ", LON_MIN, LON_MAX, LAT_MIN, LAT_MAX),
    ("europe", "ヨーロッパ編", -8.0, 22.5, 41.0, 58.6),
    ("mideast", "中東・アフリカ編", 23.0, 56.0, 21.0, 43.0),
    ("caucasus", "コーカサス編", 38.0, 51.5, 37.6, 44.4),
]

# 国ごとの寄り地図。(slug, 経度min, 経度max, 緯度min, 緯度max)
# 国の輪から自動で出すと、フランスの海外県やイギリスの島まで入って
# 画面がとんでもなく広くなる。旅の中身が見える範囲を手で決める。
ZOOM = {
    "france": (-3.4, 8.6, 42.0, 51.6),
    "netherlands": (2.7, 7.6, 50.5, 53.8),
    "belgium": (2.0, 7.4, 49.3, 51.8),
    "hungary": (15.6, 23.2, 45.4, 49.0),
    "austria": (9.0, 17.6, 46.2, 49.3),
    "slovakia": (16.0, 22.8, 47.5, 49.8),
    "czech": (11.6, 19.2, 48.4, 51.2),
    "germany": (5.2, 15.6, 47.1, 55.2),
    "uk": (-8.6, 2.4, 49.8, 59.0),
    "turkey": (25.4, 45.2, 35.6, 42.6),
    "cyprus": (32.0, 34.8, 34.4, 35.8),
    "egypt": (24.0, 36.6, 21.4, 32.0),
    "jordan": (34.2, 39.4, 29.0, 33.5),
    "uae": (51.0, 56.6, 22.4, 26.4),
    "azerbaijan": (44.4, 51.0, 38.2, 42.2),
    "georgia": (39.8, 47.0, 40.8, 43.8),
    "armenia": (43.2, 47.2, 38.6, 41.4),
    "iran-border": (44.4, 48.6, 38.0, 40.4),
}


def fit_aspect(
    lon_min: float, lon_max: float, lat_min: float, lat_max: float, want: float
) -> tuple[float, float, float, float]:
    """範囲を、狙った横長さに広げる。

    国の形そのままだとフランスやイギリスが縦長になり、ページの頭に置く帯として
    背が高すぎる。足りない方向にまわりの陸を足して広げる（切らない）ので、
    国が画面から欠けることはなく、まわりの地形が見えるぶん場所が分かりやすくなる。

    Args:
        lon_min: 西の端
        lon_max: 東の端
        lat_min: 南の端
        lat_max: 北の端
        want: 狙う 横/縦
    Returns:
        広げたあとの (西, 東, 南, 北)
    """
    x0, y0 = merc(lon_min, lat_max)
    x1, y1 = merc(lon_max, lat_min)
    w, h = x1 - x0, y1 - y0
    if w / h < want:
        # 横が足りない。経度を広げる。
        need = h * want
        d = (need - w) / 2
        lon_min -= math.degrees(d / 1000.0)
        lon_max += math.degrees(d / 1000.0)
    else:
        # 縦が足りない。緯度を広げる。メルカトルなので南北へ同じ量ずつ y を伸ばし、
        # そのあと緯度に戻す。
        need = w / want
        d = (need - h) / 2
        lat_max = math.degrees(2 * math.atan(math.exp(-(y0 - d) / 1000.0)) - math.pi / 2)
        lat_min = math.degrees(2 * math.atan(math.exp(-(y1 + d) / 1000.0)) - math.pi / 2)
    return lon_min, lon_max, lat_min, lat_max


def build(
    topo: dict,
    arcs: list,
    lon_min: float,
    lon_max: float,
    lat_min: float,
    lat_max: float,
    view_w: float,
    eps: float,
    min_area: float,
    detail: bool,
) -> tuple[dict, callable]:
    """指定した範囲の地形を焼く。世界1枚も国ごとの寄りも、これ1つで作る。

    Args:
        topo: TopoJSON 全体
        arcs: 復号ずみ arc
        lon_min: 西の端(度)
        lon_max: 東の端(度)
        lat_min: 南の端(度)
        lat_max: 北の端(度)
        view_w: SVG の横幅
        eps: 海岸線の間引きの許容誤差（画面の単位）
        min_area: これより小さい輪は捨てる
        detail: 森・きらめきなどの飾りを入れるか
    Returns:
        (焼いた中身, 経度緯度→座標に直す関数)
    """
    x0, y0 = merc(lon_min, lat_max)
    x1, y1 = merc(lon_max, lat_min)
    k = view_w / (x1 - x0)
    view_h = round((y1 - y0) * k)

    def project(lon: float, lat: float) -> tuple[float, float]:
        px, py = merc(lon, lat)
        return (px - x0) * k, (py - y0) * k

    # 画面の外へ少しだけはみ出させる。ぴったり切ると、砂の縁が画面の端に
    # 沿って1本の線として出てしまう。
    pad = (lon_max - lon_min) * 0.06
    box = (lon_min - pad, lat_min - pad, lon_max + pad, lat_max + pad)

    def polys_of(geom: dict) -> list:
        if geom["type"] == "Polygon":
            return [geom["arcs"]]
        if geom["type"] == "MultiPolygon":
            return list(geom["arcs"])
        return []

    def rings_of(geom: dict) -> list:
        out = []
        for poly in polys_of(geom):
            for ring in poly:
                pts = clip(ring_points(arcs, ring), box)
                if len(pts) < 3:
                    continue
                pp = rdp([project(lo, la) for lo, la in pts], eps)
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
        "view": {"w": round(view_w), "h": view_h},
        "bounds": {
            "lonMin": lon_min, "lonMax": lon_max,
            "latMin": lat_min, "latMax": lat_max,
        },
    }

    land = topo["objects"]["land"]["geometries"][0]
    land_rings = rings_of(land)
    out["land"] = rings_path(land_rings)

    country_rings: dict[str, list] = {}
    for g in topo["objects"]["countries"]["geometries"]:
        slug = ROUTE.get(g["properties"]["name"])
        if not slug:
            continue
        rs = rings_of(g)
        if rs:
            country_rings.setdefault(slug, []).extend(rs)
    out["countries"] = {s: rings_path(r) for s, r in country_rings.items()}

    # ---- 湖 --------------------------------------------------------
    out["lakes"] = ""
    if os.path.exists(SRC_LAKES):
        pen = Pen()
        gj = json.load(open(SRC_LAKES, encoding="utf-8"))
        for f in gj["features"]:
            if f["properties"].get("name") not in LAKES:
                continue
            geom = f["geometry"]
            polys = [geom["coordinates"]] if geom["type"] == "Polygon" else geom["coordinates"]
            for poly in polys:
                for ring in poly:
                    pts = clip([(c[0], c[1]) for c in ring], box)
                    if len(pts) < 3:
                        continue
                    pp = rdp([project(lo, la) for lo, la in pts], eps * 1.6)
                    if len(pp) < 3 or area(pp) < min_area * 3:
                        continue
                    ring_to(pen, pp)
        out["lakes"] = pen.text()

    # ---- 川 --------------------------------------------------------
    out["rivers"] = ""
    if os.path.exists(SRC_RIVERS):
        pen = Pen()
        gj = json.load(open(SRC_RIVERS, encoding="utf-8"))
        for f in gj["features"]:
            if f["properties"].get("name") not in RIVERS:
                continue
            geom = f["geometry"]
            if not geom:
                continue
            parts = [geom["coordinates"]] if geom["type"] == "LineString" else geom["coordinates"]
            for part in parts:
                for seg in clip_open([(c[0], c[1]) for c in part], box):
                    pp = rdp([project(lo, la) for lo, la in seg], eps * 1.4)
                    if len(pp) < 2:
                        continue
                    line_to(pen, pp)
        out["rivers"] = pen.text()

    # ---- 経緯線 ----------------------------------------------------
    step = 10 if (lon_max - lon_min) > 30 else (5 if (lon_max - lon_min) > 12 else 2)
    pen = Pen()
    lo0 = int(math.ceil(lon_min / step)) * step
    la0 = int(math.ceil(lat_min / step)) * step
    for lon in range(lo0, int(lon_max) + 1, step):
        line_to(pen, [project(lon, lat_min + t * (lat_max - lat_min) / 12) for t in range(13)])
    for lat in range(la0, int(lat_max) + 1, step):
        line_to(pen, [project(lon_min + t * (lon_max - lon_min) / 12, lat) for t in range(13)])
    out["grid"] = pen.text()

    # ---- 山 --------------------------------------------------------
    # 稜線をやわらかい帯として敷き、その上に山の印を置く。
    # 地面が更地に見えないように（ac-reference 4章）。
    pen = Pen()
    for _name, pts in RANGES:
        for seg in clip_open(pts, (lon_min, lat_min, lon_max, lat_max)):
            line_to(pen, [project(lo, la) for lo, la in seg])
    out["ridges"] = pen.text()

    peaks: list[list[int]] = []
    for name, pts in RANGES:
        rng = rnd("peak-" + name)
        for i in range(len(pts) - 1):
            a, b = pts[i], pts[i + 1]
            n = max(2, int(math.hypot(b[0] - a[0], b[1] - a[1]) * 2.2))
            for j in range(n):
                t = (j + 0.5) / n
                lo = a[0] + (b[0] - a[0]) * t + (rng() - 0.5) * 0.5
                la = a[1] + (b[1] - a[1]) * t + (rng() - 0.5) * 0.35
                if not (lon_min < lo < lon_max and lat_min < la < lat_max):
                    continue
                px, py = project(lo, la)
                peaks.append([round(px), round(py), round(6 + rng() * 7)])
    out["peaks"] = peaks

    if not detail:
        out["woods"] = []
        out["dunes"] = []
        out["glints"] = []
        return out, project

    # ---- 森と砂丘 --------------------------------------------------
    # 北は森、南は砂丘。緯度で描き分けると、地図を見るだけで
    # 「ヨーロッパから砂漠へ降りていった旅」が伝わる。
    land_segs = []
    for r in land_rings:
        st = max(1, len(r) // 120)
        rr = r[::st]
        land_segs += [(rr[i], rr[(i + 1) % len(rr)]) for i in range(len(rr))]

    woods: list[list[int]] = []
    dunes: list[list[int]] = []
    rng = rnd("ground")
    gx = 78
    gy = max(8, int(gx * view_h / view_w))
    for iy in range(gy):
        for ix in range(gx):
            px = (ix + 0.12 + rng() * 0.76) * view_w / gx
            py = (iy + 0.12 + rng() * 0.76) * view_h / gy
            if not inside_rings((px, py), land_rings):
                continue
            if dist_to_edges((px, py), land_segs) < 7:
                continue
            # メルカトルは緯度が線形ではないので、逆に解いて本当の緯度を出す。
            # 「北は森、南は砂丘」を画面の上下ではなく本当の緯度で決めるため。
            lat = math.degrees(2 * math.atan(math.exp(-(py / k + y0) / 1000.0)) - math.pi / 2)
            if lat > 36.5:
                if rng() < 0.44:
                    woods.append([round(px), round(py), round(4 + rng() * 5)])
            elif lat < 33.0:
                if rng() < 0.34:
                    dunes.append([round(px), round(py), round(5 + rng() * 6)])
    out["woods"] = woods
    out["dunes"] = dunes

    # ---- 海のきらめき ----------------------------------------------
    glints: list[list[int]] = []
    rng = rnd("glint")
    gx = 26
    gy = max(6, int(gx * view_h / view_w))
    for iy in range(gy):
        for ix in range(gx):
            px = (ix + 0.15 + rng() * 0.7) * view_w / gx
            py = (iy + 0.15 + rng() * 0.7) * view_h / gy
            if inside_rings((px, py), land_rings):
                continue
            if dist_to_edges((px, py), land_segs) < 26:
                continue
            if rng() > 0.6:
                continue
            glints.append([round(px), round(py), round(5 + rng() * 8)])
    out["glints"] = glints

    return out, project


def make_legs(project, ids: set[str] | None, view_w: float, view_h: float) -> list[dict]:
    """ルートの線を焼く。

    まっすぐだと図面くさいので少しふくらませ、さらに手描きのゆらぎを足す。
    ゆらぎは区間名から決まる固定の乱数なので、焼き直しても同じ形になる。

    Args:
        project: 経度緯度→座標
        ids: この街だけ通る線を出す。None ならぜんぶ
        view_w: 画面の幅
        view_h: 画面の高さ
    Returns:
        線の一覧
    """
    at = {cid: project(lon, lat) for cid, _n, lon, lat, _c, _k in CITIES}
    out = []
    for a, b, move, bulge in LEGS:
        if ids is not None and a not in ids and b not in ids:
            continue
        (ax, ay), (bx, by) = at[a], at[b]
        mx, my = (ax + bx) / 2, (ay + by) / 2
        dx, dy = bx - ax, by - ay
        span = math.hypot(dx, dy)
        if span < 0.5:
            continue
        # 飛行機は大きく弧を描かせる。地上の線と見分けがつくように。
        bl = bulge * (1.7 if move == "air" else 1.0)
        cx, cy = mx - dy * bl, my + dx * bl
        rng = rnd(f"{a}-{b}")
        ph1, ph2 = rng() * 6.28, rng() * 6.28
        # 飛行機と船はまっすぐ飛ぶ。ゆらすのは地面を進んだ線だけ。
        amp = 0.0 if move in ("air", "sea") else min(view_w * 0.005, span * 0.02)
        n = max(12, int(span / 9))
        pts = []
        for i in range(n + 1):
            t = i / n
            u = 1 - t
            px = u * u * ax + 2 * u * t * cx + t * t * bx
            py = u * u * ay + 2 * u * t * cy + t * t * by
            tx = 2 * u * (cx - ax) + 2 * t * (bx - cx)
            ty = 2 * u * (cy - ay) + 2 * t * (by - cy)
            tl = math.hypot(tx, ty) or 1.0
            fade = math.sin(math.pi * t)
            wob = (math.sin(t * 8.3 + ph1) + 0.55 * math.sin(t * 19.4 + ph2)) * amp * fade
            pts.append((px - ty / tl * wob, py + tx / tl * wob))
        pen = Pen()
        line_to(pen, pts)
        marks = []
        for f in ([0.5] if span < view_w * 0.13 else [0.34, 0.7]):
            i = int(f * n)
            j = min(n, i + 1)
            ang = math.degrees(math.atan2(pts[j][1] - pts[i][1], pts[j][0] - pts[i][0]))
            marks.append([round(pts[i][0]), round(pts[i][1]), round(ang)])
        out.append({"from": a, "to": b, "move": move, "d": pen.text(), "marks": marks})
    return out


def scale_of(project, lon_min: float, lon_max: float, lat_min: float, lat_max: float) -> dict:
    """縮尺の目盛り。画面の 1 単位が何 km かから、きりのいい長さを選ぶ。

    Args:
        project: 経度緯度→座標
        lon_min: 西の端
        lon_max: 東の端
        lat_min: 南の端
        lat_max: 北の端
    Returns:
        {km, len}
    """
    lat_s = lat_min + (lat_max - lat_min) * 0.12
    lon_a = lon_min + (lon_max - lon_min) * 0.08
    d = (lon_max - lon_min) * 0.1
    xa, _ = project(lon_a, lat_s)
    xb, _ = project(lon_a + d, lat_s)
    per = haversine((lon_a, lat_s), (lon_a + d, lat_s)) / abs(xb - xa)
    for cand in (10, 25, 50, 100, 200, 250, 500, 1000, 2000):
        if cand / per >= 130:
            km = cand
            break
    else:
        km = 2000
    return {"km": km, "len": round(km / per), "kmPerUnit": round(per, 4)}


def main() -> None:
    topo = json.load(open(SRC, encoding="utf-8"))
    arcs = decode_arcs(topo)

    # ---- 世界1枚 ----------------------------------------------------
    out, project = build(
        topo, arcs, LON_MIN, LON_MAX, LAT_MIN, LAT_MAX, VIEW_W,
        eps=0.9, min_area=3.2, detail=True,
    )
    view_w, view_h = out["view"]["w"], out["view"]["h"]

    out["cities"] = [
        {
            "id": cid, "name": nm, "country": country, "kind": kind,
            "x": round(project(lon, lat)[0], 1), "y": round(project(lon, lat)[1], 1),
        }
        for cid, nm, lon, lat, country, kind in CITIES
    ]
    out["legs"] = make_legs(project, None, view_w, view_h)

    # 国のピンは hub の街の上に立てる。国の重心だと、フランスなら中央高地、
    # ジョージアなら山の中に出てしまって、旅と関係のない場所を指す。
    hub = {c[4]: c[0] for c in CITIES if c[5] == "hub"}
    at = {c[0]: project(c[2], c[3]) for c in CITIES}
    out["anchors"] = {
        slug: {
            "x": round(at[hub[slug]][0], 1), "y": round(at[hub[slug]][1], 1),
            "order": i + 1, "city": hub[slug],
        }
        for i, slug in enumerate(ORDER)
        if slug in hub
    }

    out["seas"] = [
        {
            "name": nm, "size": size, "rot": rot,
            "x": round(project(lon, lat)[0]), "y": round(project(lon, lat)[1]),
        }
        for nm, lon, lat, size, rot in SEA_LABELS
    ]

    # 章。画面はひとつの SVG を CSS で寄せて見せるので、
    # どの章も世界1枚と同じ縦横比に揃えておく必要がある。
    # 揃っていないと、寄せたときに上下か左右がはみ出して切れる。
    want = view_w / view_h
    out["chapters"] = []
    for cid, label, a, b, c, d in CHAPTERS:
        px0, py0 = project(a, d)
        px1, py1 = project(b, c)
        w, h = px1 - px0, py1 - py0
        if w / h < want:
            nw = h * want
            px0 -= (nw - w) / 2
            w = nw
        else:
            nh = w / want
            py0 -= (nh - h) / 2
            h = nh
        # 画面の外へはみ出したぶんは中へ押し戻す。海しかない余白を見せない。
        px0 = max(0.0, min(view_w - w, px0))
        py0 = max(0.0, min(view_h - h, py0))
        out["chapters"].append({
            "id": cid, "label": label,
            "box": [round(px0), round(py0), round(w), round(h)],
        })

    out["scale"] = scale_of(project, LON_MIN, LON_MAX, LAT_MIN, LAT_MAX)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"world {out['view']}  -> {OUT}  ({os.path.getsize(OUT) / 1024:.1f} KB)")
    for key in ("land", "lakes", "rivers", "grid"):
        print(f"  {key:9} {len(out[key]) / 1024:6.1f} KB")
    print(f"  countries {sum(len(v) for v in out['countries'].values()) / 1024:6.1f} KB")
    print(f"  woods {len(out['woods'])} / dunes {len(out['dunes'])} / peaks {len(out['peaks'])} / glints {len(out['glints'])}")

    # ---- 国ごとの寄り ----------------------------------------------
    os.makedirs(OUT_DIR_C, exist_ok=True)
    total = 0
    for slug, (a, b, c, d) in ZOOM.items():
        a, b, c, d = fit_aspect(a, b, c, d, 1.5)
        # 小さい国ほど細かく。画面いっぱいに写るので、粗いと角が見える。
        span = max(b - a, d - c)
        eps = 0.34 if span < 5 else (0.5 if span < 11 else 0.8)
        co, cproj = build(
            topo, arcs, a, b, c, d, 900.0,
            eps=eps, min_area=2.5, detail=False,
        )
        mine = {x[0] for x in CITIES if x[4] == slug}
        co["cities"] = [
            {
                "id": cid, "name": nm, "country": country, "kind": kind,
                "x": round(cproj(lon, lat)[0], 1), "y": round(cproj(lon, lat)[1], 1),
            }
            for cid, nm, lon, lat, country, kind in CITIES
            if a - 0.6 < lon < b + 0.6 and c - 0.6 < lat < d + 0.6
        ]
        co["legs"] = make_legs(cproj, mine, co["view"]["w"], co["view"]["h"])
        co["scale"] = scale_of(cproj, a, b, c, d)
        co["slug"] = slug
        p = f"{OUT_DIR_C}/{slug}.json"
        json.dump(co, open(p, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
        n = os.path.getsize(p)
        total += n
        print(f"  {slug:14} {co['view']['w']}x{co['view']['h']}  {n / 1024:6.1f} KB  "
              f"cities {len(co['cities'])} legs {len(co['legs'])}")
    print(f"  国ぜんぶで {total / 1024:.1f} KB")


if __name__ == "__main__":
    main()
