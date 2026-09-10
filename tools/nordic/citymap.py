#!/usr/bin/env python3
"""街を拡大した地図を、OpenStreetMap の実データから焼く。

前の版はベージュの四角に丸が4つ乗っただけのもので、道路が1本も無かった。
あやとの言葉（2026-09-09）:

> なにこのカスみたいな地図。作り途中でデプロイしたら？
> こんなカスみたいな地図で誰がワクワクするねん？誰がワルシャワってわかるねん？

**道路が無いものは地図ではない。** ここは Overpass（`osmfetch.py`）から
道・鉄道・川・公園・街区を全部取って、るるぶの街地図と同じ層で描く。

## 焼く街は、旅程から出す

`nordic.ts` の `VISIT_CITIES` と同じ導出（`geocode.visit_cities()`）。
**街の名簿を手で作らない。** 寄るか決まっていない街（シャウレイ・ルンダーレ・
パルヌ・トラカイ）は焼かない（`docs/island-misses.md` #4）。

## 窓の決め方

見どころ（`geo.json`）のうち中心近くのものと、街の中心が全部入る四角。
2.0km を下限、4.8km を上限にする。上限を超えたら遠いものから外して、
外れたものは「ひと足のばして」に距離と方角つきで回す。

## 出す形

道は**種類ごとに1本の `<path>` にまとめる**（`M…L… M…L…`）。
ワルシャワは道が1,900本あるので、要素を1本ずつ置くと DOM が 2,000 を超える。
まとめると 12 本の path で済む。`docs/island-design.md` の
「動かすものは小さく」にも合う（この地図は動かないが、DOM は軽いほうがいい）。

出すもの: `site/content/nordic/citymaps.json`
"""

import json
import math
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
SRC = os.path.join(ROOT, "site", "content", "nordic")
OUT = os.path.join(SRC, "citymaps.json")

sys.path.insert(0, HERE)
import geocode as G  # noqa: E402  行く街の導出と距離計算を借りる
import osmfetch  # noqa: E402

# 窓（km）。下限より狭いと街に見えず、上限より広いと道が毛のようになる。
MIN_KM, MAX_KM = 2.0, 4.2
NEAR_KM = 3.5          # これより遠い見どころは「ひと足のばして」へ
PAD = 0.13             # 窓の余白（見どころのひろがりに対する割合）
W = 1200.0             # viewBox の幅。1200 で、スマホ 358px なら 1単位 ≒ 0.3px
ASPECT = (0.80, 1.30)  # 縦横の比。これを外れたら短いほうを広げる

# 道の種類 → 層。**この順に描く**（下から上へ）
ROAD_CLASS = [
    ("r5", {"pedestrian", "living_street"}),
    ("r4", {"residential", "unclassified"}),
    ("r3", {"tertiary", "tertiary_link"}),
    ("r2", {"secondary", "secondary_link"}),
    ("r1", {"primary", "primary_link"}),
    ("r0", {"motorway", "motorway_link", "trunk", "trunk_link"}),
]
# 点が足りなくなったとき、**細い道から捨てる。**
ROAD_DROP = ["r4", "r5", "r3", "r2", "r1", "r0"]
# 1つの街に使ってよい点の数。
#
# 土台（道・川・緑）は `site/public/nordic/city/<街>.svg` に**外だしする。**
# 日ページの中に直に描くと、Next が同じものを HTML と RSC の積み荷に2度書くので、
# 17KB の地図が 54KB になった（実測）。外に出せば1度で済み、
# 同じ街に何日か滞在する日程でも**2日目からは取りに行かない**（キャッシュ）。
POINT_BUDGET = 5200
# そのうち、面（水・緑・街区）に使ってよいぶん。**ここで区切らないと道が消える。**
# ヘルシンキは島と入り江だらけで、海岸線だけで 3,600点を使い切り、
# 道が2本しか残らなかった（実測）。面は地の色でしかないので、先に頭を打つ。
AREA_BUDGET = 2200


# ─────────────────────────────────────────────────────────────
# 幾何
# ─────────────────────────────────────────────────────────────
def merc(lat, lon):
    """Web メルカトル。緯度が高いほど横が縮むぶんを吸収する（タリンは60度）。"""
    return (lon,
            math.degrees(math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))))


def simplify(pts, tol):
    """Douglas–Peucker。**曲がっていないところの点を落とす。**

    道は1本あたり 20〜60点あるが、1200 幅の地図では 4〜6点で同じ形に見える。
    ここが効かないと、ワルシャワ1枚で 60,000点になる。
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
    if worst <= tol:
        return [pts[0], pts[-1]]
    return simplify(pts[:wi + 1], tol)[:-1] + simplify(pts[wi:], tol)


def clip_line(pts, box):
    """折れ線を窓で切って、**窓の中に残る何本か**を返す（Liang–Barsky）。"""
    x0, y0, x1, y1 = box
    runs, cur = [], []
    for i in range(len(pts) - 1):
        ax, ay = pts[i]
        bx, by = pts[i + 1]
        t0, t1 = 0.0, 1.0
        dx, dy = bx - ax, by - ay
        ok = True
        for p, q in ((-dx, ax - x0), (dx, x1 - ax), (-dy, ay - y0), (dy, y1 - ay)):
            if p == 0:
                if q < 0:
                    ok = False
                    break
                continue
            r = q / p
            if p < 0:
                if r > t1:
                    ok = False
                    break
                t0 = max(t0, r)
            else:
                if r < t0:
                    ok = False
                    break
                t1 = min(t1, r)
        if not ok:
            if cur:
                runs.append(cur)
                cur = []
            continue
        s = (ax + t0 * dx, ay + t0 * dy)
        e = (ax + t1 * dx, ay + t1 * dy)
        if not cur:
            cur = [s, e]
        else:
            if abs(cur[-1][0] - s[0]) > 1e-9 or abs(cur[-1][1] - s[1]) > 1e-9:
                runs.append(cur)
                cur = [s, e]
            else:
                cur.append(e)
        if t1 < 1.0:
            runs.append(cur)
            cur = []
    if cur:
        runs.append(cur)
    return [r for r in runs if len(r) >= 2]


def clip_poly(pts, box):
    """多角形を窓で切る（Sutherland–Hodgman）。窓のふちに沿って畳む。"""
    x0, y0, x1, y1 = box
    edges = (
        (lambda p: p[0] >= x0, lambda a, b: (x0, a[1] + (b[1] - a[1]) * (x0 - a[0]) / (b[0] - a[0]))),
        (lambda p: p[0] <= x1, lambda a, b: (x1, a[1] + (b[1] - a[1]) * (x1 - a[0]) / (b[0] - a[0]))),
        (lambda p: p[1] >= y0, lambda a, b: (a[0] + (b[0] - a[0]) * (y0 - a[1]) / (b[1] - a[1]), y0)),
        (lambda p: p[1] <= y1, lambda a, b: (a[0] + (b[0] - a[0]) * (y1 - a[1]) / (b[1] - a[1]), y1)),
    )
    out = pts
    for inside, cut in edges:
        if not out:
            return []
        src, out = out, []
        prev = src[-1]
        for cur in src:
            if inside(cur):
                if not inside(prev):
                    out.append(cut(prev, cur))
                out.append(cur)
            elif inside(prev):
                out.append(cut(prev, cur))
            prev = cur
    return out


def area(pts):
    """多角形の面積（座標系のまま。大小の比べにだけ使う）。"""
    s = 0.0
    for i in range(len(pts)):
        ax, ay = pts[i]
        bx, by = pts[(i + 1) % len(pts)]
        s += ax * by - bx * ay
    return abs(s) / 2


def stitch(members):
    """関係（multipolygon）の外側の輪を、**メンバーをつないで**作る。

    Overpass の `out geom` は関係の中身をバラバラの線で返す。1本ずつ閉じると
    細長い三角がたくさんできる（実際にヘルシンキの海がそうなった）。
    端どうしがくっつくものをつなぐ。
    """
    segs = [list(map(lambda g: (g["lat"], g["lon"]), m.get("geometry") or []))
            for m in members if m.get("role") in ("outer", "") and m.get("geometry")]
    segs = [s for s in segs if len(s) >= 2]
    rings = []
    while segs:
        cur = segs.pop(0)
        changed = True
        while changed:
            changed = False
            for i, s in enumerate(segs):
                if _near(cur[-1], s[0]):
                    cur += s[1:]
                elif _near(cur[-1], s[-1]):
                    cur += s[::-1][1:]
                elif _near(cur[0], s[-1]):
                    cur = s[:-1] + cur
                elif _near(cur[0], s[0]):
                    cur = s[::-1][:-1] + cur
                else:
                    continue
                segs.pop(i)
                changed = True
                break
        if len(cur) >= 4:
            rings.append(cur)
    return rings


def _near(a, b):
    return abs(a[0] - b[0]) < 1e-7 and abs(a[1] - b[1]) < 1e-7



# ─────────────────────────────────────────────────────────────
# 海（海岸線から面を組み立てる）
# ─────────────────────────────────────────────────────────────
def _perim(p, box):
    """窓のふちの上の点を、**時計回り**の 0〜4 の目盛りに直す（y は上が正）。

    0=左上 → 1=右上 → 2=右下 → 3=左下 → 4(=0)。
    海岸線は「進行方向の**右が海**」と決まっているので、ふちを時計回りに
    たどれば、海のほうを内側に囲える。
    """
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    ex, ey = w * 1e-7, h * 1e-7
    if abs(p[1] - y1) <= ey:
        return (p[0] - x0) / w
    if abs(p[0] - x1) <= ex:
        return 1 + (y1 - p[1]) / h
    if abs(p[1] - y0) <= ey:
        return 2 + (x1 - p[0]) / w
    if abs(p[0] - x0) <= ex:
        return 3 + (p[1] - y0) / h
    return None


def _corners(box):
    x0, y0, x1, y1 = box
    return [(x0, y1), (x1, y1), (x1, y0), (x0, y0)]


def sea_polys(chains, box):
    """海岸線の線から、**海の面**を作る。

    OSM の海は面ではなく `natural=coastline` の線で置かれている（面は世界を
    1枚にしたものが別に配られていて、Overpass からは取れない）。
    そのままだと、タリンもヘルシンキも湾が1つも出ない。

    やること:
      1. 窓で切る。ふちからふちへ抜ける線（run）と、窓の中で閉じる輪（島）に分ける
      2. run の終わりから、ふちを**時計回り**にたどって次の run の始まりへ渡る。
         右が海なので、これで海だけを囲める
      3. 島はそのまま「陸」として、海の上に重ねて描く

    つじつまが合わなければ**何も返さない。** 海の形を間違えて塗ると、
    陸と海が入れ替わった地図になる（それは無いよりずっと悪い）。
    """
    runs, isles = [], []
    for ch in chains:
        closed = _near2(ch[0], ch[-1])
        if closed:
            r = clip_poly(ch, box)
            if len(r) >= 3:
                isles.append(r)
            continue
        for run in clip_line(ch, box):
            ta, tb = _perim(run[0], box), _perim(run[-1], box)
            if ta is None or tb is None:
                continue
            runs.append((ta, tb, run))
    if not runs:
        return [], isles

    ends = sorted([(t, "a", i) for i, (t, _, _) in enumerate(runs)]
                  + [(t, "b", i) for i, (_, t, _) in enumerate(runs)])
    corners = _corners(box)
    out, seen = [], set()
    for start in range(len(runs)):
        if start in seen:
            continue
        poly, cur, guard = [], start, 0
        while True:
            guard += 1
            if guard > len(runs) * 2 + 4:
                return [], isles       # つじつまが合わない。海は描かない
            seen.add(cur)
            poly += runs[cur][2]
            t = runs[cur][1]
            nxt = next((e for e in ends if e[0] > t + 1e-9), ends[0])
            # 通り過ぎるふちの角を足す
            t2 = nxt[0] if nxt[0] > t else nxt[0] + 4
            c = math.ceil(t + 1e-9)
            while c < t2:
                poly.append(corners[int(c) % 4])
                c += 1
            if nxt[1] != "a":
                return [], isles       # 終わりの次が終わり。組み立てられない
            if nxt[2] == start:
                break
            cur = nxt[2]
        if len(poly) >= 3:
            out.append(poly)
    return out, isles


def _near2(a, b):
    return abs(a[0] - b[0]) < 1e-9 and abs(a[1] - b[1]) < 1e-9


def chain_ways(els):
    """`natural=coastline` の線を、端どうしでつなぐ。"""
    segs = [[(g["lat"], g["lon"]) for g in (x.get("geometry") or [])]
            for x in els if (x.get("tags") or {}).get("natural") == "coastline"]
    segs = [s for s in segs if len(s) >= 2]
    out = []
    while segs:
        cur = segs.pop(0)
        changed = True
        while changed:
            changed = False
            for i, s in enumerate(segs):
                if _near(cur[-1], s[0]):
                    cur += s[1:]
                elif _near(cur[0], s[-1]):
                    cur = s[:-1] + cur
                else:
                    continue
                segs.pop(i)
                changed = True
                break
        out.append(cur)
    return out


# ─────────────────────────────────────────────────────────────
# 種類の割り当て
# ─────────────────────────────────────────────────────────────
GREEN = {
    "leisure": {"park", "nature_reserve", "golf_course"},
    "landuse": {"forest", "recreation_ground", "village_green", "allotments"},
    "natural": {"wood"},
}
GRAVE = {"landuse": {"cemetery"}, "amenity": {"grave_yard"}}
WATER = {"natural": {"water"}, "waterway": {"riverbank", "dock"}}
SANDY = {"natural": {"beach", "sand"}}
BLOCK = {"landuse": {"residential", "retail", "commercial", "industrial",
                     "railway", "military", "education"},
         "amenity": {"university", "hospital"}}
# 広場。**`place=square` だけを見ない。**
# OSM で広場をどう置くかは街によってばらばらで、`place=square` は少数派。
# 歩行者専用の面（`highway=pedestrian` + `area=yes`）と市場も同じ「広場」。
# ここを狭く見ていたので、カトヴィツェの中央広場（Rynek）が1つも拾えず、
# 地図に出る名前が「ラヴァ川」だけになった。
PLAZA = {"place": {"square"}, "amenity": {"marketplace"}}
# 地区の面。**そのうち「旧市街」だけ**を別の層にして、地の色を変える。
# ガイドブックの街地図は必ずここを塗り分けている。どこが目当ての場所かが
# 一目で分かるのは、点でも名前でもなく**面の色**だから。
QUARTER = {"place": {"quarter", "suburb", "neighbourhood"}}


def kind_of(tags):
    """その形を、地図のどの層に置くか。**上から順に当てる。**"""
    if tags.get("place") in QUARTER["place"] or tags.get("boundary") == "administrative":
        # 旧市街だけ拾う。ほかの地区は、面を塗ると街区が読めなくなる
        return "old" if JA.get(_name(tags)) == "旧市街" else None
    for layer, table in (("water", WATER), ("green", GREEN), ("grave", GRAVE),
                         ("sand", SANDY), ("plaza", PLAZA), ("block", BLOCK)):
        for k, vals in table.items():
            if tags.get(k) in vals:
                return layer
    return None


def road_class(hw):
    for cls, vals in ROAD_CLASS:
        if hw in vals:
            return cls
    return None


# ─────────────────────────────────────────────────────────────
# 目印の絵
# ─────────────────────────────────────────────────────────────
# 見どころの `type`（geo.json）と OSM のタグから、どの絵を出すか。
# **絵文字は使わない**（`island-design.md` 1章）。SVG の記号を出す。
GLYPH = {
    "castle": {"castle", "palace", "fort", "fortress", "citywalls", "city_gate", "ruins"},
    "church": {"place_of_worship", "church", "cathedral", "chapel", "monastery"},
    "museum": {"museum", "gallery", "library", "theatre", "opera", "arts_centre",
               "townhall", "university", "planetarium", "aquarium"},
    "market": {"marketplace", "supermarket", "mall", "department_store", "retail",
               "shop", "gift", "books", "clothes", "boutique", "jewelry",
               "interior_decoration", "furniture", "houseware", "antiques",
               "second_hand", "variety_store", "convenience", "greengrocer"},
    "food": {"restaurant", "cafe", "bar", "pub", "biergarten", "bakery",
             "fast_food", "ice_cream", "confectionery", "deli", "brewery", "winery",
             "food_court"},
    "park": {"park", "garden", "nature_reserve", "forest", "zoo", "theme_park"},
    "tower": {"viewpoint", "tower", "monument", "memorial", "artwork", "lighthouse",
              "windmill", "observatory"},
    "arena": {"stadium", "arena", "sports_centre"},
    "station": {"station", "ferry_terminal", "harbour", "pier", "halt"},
    "sauna": {"sauna", "swimming_pool", "spa", "water_park"},
    "ship": {"museum_ship", "boat", "archipelago", "marina"},
    "house": {"attraction", "yes", "house", "building", "public_building", "civic",
              "commercial", "company", "hotel", "hostel", "casino"},
    # 広場・通り・地区。**建物ではなく「まち」そのもの**を指しているもの
    "town": {"pedestrian", "square", "living_street", "quarter", "suburb",
             "neighbourhood", "administrative", "residential", "city_block",
             "island", "islet"},
}
GLYPH_OF = {v: k for k, vs in GLYPH.items() for v in vs}


# 種類から絵が決まらないときの逃げ先。**「その他」の丸を出さない。**
# `pedestrian` のような種類は場所の形しか言っていないので、
# 何をしに行くのか（`cat`）で決めるほうが、見て分かる。
BY_CAT = {"see": "house", "eat": "food", "do": "park", "buy": "market"}


def glyph(t, cat="see"):
    return GLYPH_OF.get(t) or BY_CAT.get(cat, "spot")


def poi_glyph(tags):
    for k in ("historic", "tourism", "amenity", "railway", "building", "leisure", "shop"):
        v = tags.get(k)
        if v and v in GLYPH_OF:
            return GLYPH_OF[v]
    if tags.get("railway") == "station":
        return "station"
    return None


# ─────────────────────────────────────────────────────────────
# 地図に書く名前
# ─────────────────────────────────────────────────────────────
# **日本語で書く。** 「誰がワルシャワってわかるねん」と言われたのは、
# 地図の上に読める名前が1つも無かったから。OSM の `name:ja` があればそれを、
# 無ければここを使う。ここに無い名前は**書かない**（現地語のまま並べると読めない）。
JA = {
    # ポーランド
    "Wisła": "ヴィスワ川", "Stare Miasto": "旧市街", "Nowe Miasto": "新市街",
    "Śródmieście": "中心街", "Powiśle": "ポヴィシレ", "Muranów": "ムラヌフ",
    "Łazienki Królewskie": "ワジェンキ公園", "Park Łazienkowski": "ワジェンキ公園",
    "Ogród Saski": "サスキ公園", "Pole Mokotowskie": "モコトフ原っぱ",
    "Rynek Starego Miasta": "旧市街広場", "Plac Zamkowy": "王宮広場",
    "Krakowskie Przedmieście": "王の道",
    "Śródmieście Południowe": "中心街南", "Śródmieście Północne": "中心街北",
    "Praga-Północ": "プラガ", "Solec": "ソレツ", "Ujazdów": "ウヤズドフ",
    "Park Kościuszki": "コシチュシュコ公園", "Rynek": "中央広場",
    "Katowice": "カトヴィツェ", "Osiedle Paderewskiego": "パデレフスキ団地",
    "Dolina Trzech Stawów": "三つ池の谷", "Rawa": "ラヴァ川",
    "Strefa Kultury": "文化地区", "Koszutka": "コシュトカ",
    "Spodek": "スポデック",
    "Narodowa Orkiestra Symfoniczna Polskiego Radia": "NOSPR",
    "Muzeum Śląskie": "シレジア博物館", "Plac Wolności": "自由広場",
    "Park Bogucki": "ボグツキ公園",
    "Teatr Śląski im. Stanisława Wyspiańskiego": "シレジア劇場",
    "Pomnik Powstańców Śląskich": "蜂起者の碑",
    "Białystok": "ビャウィストク", "Rynek Kościuszki": "コシチュシュコ広場",
    "Planty": "プランティ公園", "Park Planty": "プランティ公園",
    "Park Centralny": "中央公園", "Biała": "ビャワ川",
    "Park Branickich": "ブラニツキ庭園", "Centrum": "中心街",
    "Bojary": "ボヤルィ", "Ogród Branickich": "ブラニツキ庭園",
    "Cerkiew Świętego Mikołaja": "聖ニコライ教会",
    "Bazylika Archikatedralna Wniebowzięcia Najświętszej Maryi Panny": "大聖堂",
    "Muzeum Podlaskie w Białymstoku - Ratusz": "旧市庁舎",
    "Warszawa": "ワルシャワ",
    # リトアニア
    "Neris": "ネリス川", "Vilnia": "ヴィルニャ川", "Vilnelė": "ヴィルニャ川",
    "Senamiestis": "旧市街", "Užupis": "ウジュピス", "Naujamiestis": "新市街",
    # ヴィリニュスの旧市街は OSM に**点でしか置かれていない。** 面は行政区
    # （seniūnija）のほうにある。同じところを指しているので、これを面に使う
    "Senamiesčio seniūnija": "旧市街", "Užupio seniūnija": "ウジュピス",
    "Žvėrynas": "ジュヴェリナス", "Šnipiškės": "シュニピシュケス",
    "Bernardinų sodas": "ベルナルディン庭園", "Sereikiškių parkas": "ベルナルディン庭園",
    "Kalnų parkas": "三十字架の丘", "Vingio parkas": "ヴィンギス公園",
    "Katedros aikštė": "大聖堂広場", "Rotušės aikštė": "市庁舎広場",
    "Antakalnis": "アンタカルニス", "Vilnius": "ヴィリニュス",
    # ラトビア
    "Daugava": "ダウガヴァ川", "Vecrīga": "旧市街", "Centrs": "中心街",
    "Rīgas kanāls": "運河", "Pilsētas kanāls": "運河",
    "Bastejkalna parks": "バスティオン公園", "Kronvalda parks": "クロンヴァルド公園",
    "Esplanāde": "エスプラナーデ公園", "Vērmanes dārzs": "ヴェールマネ公園",
    "Āgenskalns": "アーゲンスカルンス", "Klusais centrs": "静かな中心街",
    "Maskavas forštate": "モスクワ地区", "Centrāltirgus": "中央市場",
    "Doma laukums": "ドーム広場", "Rīga": "リガ", "Ķīpsala": "キープサラ",
    "Rīgas Pils": "リガ城", "Rīgas Doms": "大聖堂",
    "Melngalvju nams": "ブラックヘッドの家", "Trīs brāļi": "三人兄弟",
    "Svētā Pētera baznīca": "聖ペテロ教会",
    "Brīvības piemineklis": "自由の記念碑",
    "Rīgas Centrālā stacija": "リガ中央駅",
    "Latvijas Nacionālais Mākslas muzejs": "国立美術館",
    "Latvijas Nacionālā opera un balets": "国立オペラ座",
    "Līvu laukums": "リーヴ広場",
    # エストニア
    "Vanalinn": "旧市街", "Tallinna laht": "タリン湾",
    "Soome laht": "フィンランド湾", "Suomenlahti": "フィンランド湾",
    "Finska viken": "フィンランド湾", "Läänemeri": "バルト海",
    "Itämeri": "バルト海", "Östersjön": "バルト海", "Bałtyk": "バルト海",
    "Kopli laht": "コプリ湾", "Paljassaare laht": "パリヤサーレ湾", "Kadriorg": "カドリオルグ",
    "Kesklinn": "中心街", "Kalamaja": "カラマヤ", "Põhja-Tallinn": "北タリン",
    "Kadrioru park": "カドリオルグ公園", "Toompea": "トームペア（丘の街）",
    "Raekoja plats": "ラエコヤ広場", "Vabaduse väljak": "自由広場",
    "Tammsaare park": "タムサーレ公園", "Hirvepark": "鹿公園",
    "Snelli tiik": "スネッリ池", "Ülemiste järv": "ユレミステ湖",
    "Pirita": "ピリタ", "Lasnamäe": "ラスナメエ", "Tallinn": "タリン",
    "Maakri": "マークリ", "Toompark": "トーム公園",
    "Toompea loss": "トームペア城", "Kadrioru loss": "カドリオルグ宮殿",
    "Aleksander Nevski katedraal": "ネフスキー聖堂",
    "Oleviste kirik": "聖オレフ教会", "Niguliste kirik": "聖ニコラス教会",
    "Raekoda": "市庁舎", "Viru värav": "ヴィル門",
    "Lennusadam": "水上飛行機港", "Patarei merekindlus": "パタレイ要塞",
    "Estonia teatrihoone": "エストニア劇場",
    # フィンランド
    "Töölönlahti": "トーロ湾", "Kruununhaka": "クルーヌンハカ",
    "Kaivopuisto": "カイヴォプイスト公園", "Esplanadin puisto": "エスプラナーディ公園",
    "Kaisaniemenpuisto": "カイサニエミ公園", "Suomenlinna": "スオメンリンナ",
    "Kluuvi": "クルーヴィ", "Kamppi": "カンッピ", "Punavuori": "プナヴオリ",
    "Katajanokka": "カタヤノッカ", "Eira": "エイラ", "Ullanlinna": "ウッランリンナ",
    "Etu-Töölö": "トーロ", "Taka-Töölö": "奥トーロ", "Hietalahti": "ヒエタラハティ",
    "Kauppatori": "マーケット広場", "Senaatintori": "元老院広場",
    "Sibeliuksen puisto": "シベリウス公園", "Tähtitorninvuoren puisto": "天文台の丘",
    "Suomenlahti": "フィンランド湾", "Kruunuvuorenselkä": "クルーヌヴオリ湾",
    "Eläintarhanlahti": "エラインタルハ湾", "Helsinki": "ヘルシンキ",
    # スウェーデン
    "Gamla stan": "旧市街", "Riddarfjärden": "リッダー湾",
    "Djurgården": "ユールゴーデン", "Södermalm": "セーデルマルム",
    "Norrmalm": "ノルマルム", "Östermalm": "エステルマルム",
    "Kungsholmen": "クングスホルメン", "Skeppsholmen": "シェップスホルメン",
    "Vasastan": "ヴァーサスタン", "Saltsjön": "ソルト湾",
    "Kungsträdgården": "王の庭", "Humlegården": "フムレゴーデン公園",
    "Stortorget": "大広場", "Slussen": "スルッセン", "Strömmen": "ストロンメン",
    "Nybroviken": "ニーブロ湾", "Vasaparken": "ヴァーサ公園",
    "Tantolunden": "タント公園", "Rålambshovsparken": "ロラムブスホフ公園",
    "Stockholm": "ストックホルム",
}

# 名前を出す層と、その数（多いと地図が字で埋まるので、上から数個だけ）
LABEL_MAX = {"water": 2, "district": 3, "park": 2, "square": 2, "spot": 4}

# **地図に書かない名前。** 「中心街」は、この地図そのものが中心街なので、
# 書いても何も分からない（ワルシャワで「中心街」「中心街北」が2枚出て、
# そのぶん旧市街まわりの名前が置けなかった）。
NO_LABEL = {"中心街", "中心街北", "中心街南"}


# ─────────────────────────────────────────────────────────────
# 本体
# ─────────────────────────────────────────────────────────────
def slugify(city, cq):
    """英語名からファイル向けの短い名前。ラベルの id 接頭に使う。"""
    s = cq.split(",")[0].strip().lower()
    s = (s.replace("ā", "a").replace("ī", "i").replace("ū", "u").replace("š", "s")
          .replace("ž", "z").replace("ē", "e").replace("ķ", "k").replace("ļ", "l")
          .replace("ņ", "n").replace("ā", "a").replace("ó", "o").replace("ł", "l")
          .replace("ą", "a").replace("ę", "e").replace("ć", "c").replace("ń", "n")
          .replace("ś", "s").replace("ź", "z").replace("ż", "z").replace("ö", "o")
          .replace("ä", "a").replace("å", "a").replace("ė", "e").replace("į", "i")
          .replace("ų", "u"))
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def window(city, spots, geo):
    """その街の窓を決める。**街の中心と、近い見どころが全部入る四角。**"""
    cq, clat, clon = G.CENTER[city]
    here = [s for s in spots if s.get("city") == city and s["id"] in geo]
    near = [s for s in here
            if G.km(clat, clon, geo[s["id"]]["lat"], geo[s["id"]]["lon"]) <= NEAR_KM]
    lats = [clat] + [geo[s["id"]]["lat"] for s in near]
    lons = [clon] + [geo[s["id"]]["lon"] for s in near]
    # **見どころを落として窓を縮めない。** 前はそうしていて、ワルシャワが
    # 旧市街もヴィスワ川も入らない窓になった（蜂起博物館に西へ引っぱられて、
    # 川の手前で切れた）。ここは「街の中心と近い見どころが全部入る四角」を
    # 作って、上限で切るだけにする。切って外に出たものは「ひと足のばして」へ。
    hkm = G.km(min(lats), clon, max(lats), clon) * (1 + 2 * PAD)
    wkm = G.km(clat, min(lons), clat, max(lons)) * (1 + 2 * PAD)
    wkm = min(max(wkm, MIN_KM), MAX_KM)
    hkm = min(max(hkm, MIN_KM), MAX_KM)
    # 縦横の比をそろえる。細長い窓は、スマホの1画面に置けない
    if hkm / wkm < ASPECT[0]:
        hkm = wkm * ASPECT[0]
    if hkm / wkm > ASPECT[1]:
        wkm = hkm / ASPECT[1]
    mlat = (min(lats) + max(lats)) / 2
    mlon = (min(lons) + max(lons)) / 2
    dlat = hkm / 2 / 111.32
    dlon = wkm / 2 / (111.32 * math.cos(math.radians(mlat)))
    # 窓から出てしまったものも「ひと足のばして」へ回す（点が枠の外に出ない）
    far = [s for s in here
           if s not in near
           or not (mlat - dlat <= geo[s["id"]]["lat"] <= mlat + dlat
                   and mlon - dlon <= geo[s["id"]]["lon"] <= mlon + dlon)]
    near = [s for s in near if s not in far]
    return {
        "bbox": (mlat - dlat, mlon - dlon, mlat + dlat, mlon + dlon),
        "wkm": wkm, "hkm": hkm, "center": (clat, clon), "cq": cq,
        "near": near, "far": far, "all": here,
    }


def build(city, win, raw, coast, spots_all):
    """落としてきたものを、SVG が描ける形にたたむ。"""
    s, w, n, e = win["bbox"]
    (bx0, by0), (bx1, by1) = merc(s, w), merc(n, e)
    box = (bx0, by0, bx1, by1)
    mw, mh = bx1 - bx0, by1 - by0
    H = round(W * (mh / mw), 1)

    def to(mx, my):
        return ((mx - bx0) / mw * W, (by1 - my) / mh * H)

    # 1200 幅で 0.9単位（≒ 実寸 3.5m）より細かい曲がりは見えない
    tol = 0.9 * mw / W

    # 海。**いちばん下に敷く。** 陸(.pp)を敷いてから海を重ね、島でまた陸へ戻す
    sea, isles = sea_polys([[merc(la, lo) for la, lo in ch]
                            for ch in chain_ways(coast)], box)

    polys = {}      # 層 → [(面積, [点…])]
    lines = {}      # 層 → [(長さ, [点…])]
    els = raw["elements"]

    def add_ring(layer, ring_ll):
        mr = [merc(la, lo) for la, lo in ring_ll]
        cl = clip_poly(mr, box)
        if len(cl) < 3:
            return
        # 面は地の色でしかないので、線より粗くたたんでよい。
        # 海岸線をそのまま持つと、それだけで点の予算を使い切る
        sm = simplify(cl, tol * 2.0)
        if len(sm) < 3:
            return
        a = area(sm)
        if a < (mw / W) ** 2 * 600:      # 25x25 単位より小さい面は描かない
            return
        # **窓の半分を覆う「旧市街」は、旧市街ではない。**
        # 行政区の面を借りている街があるので、広すぎるものはここで落とす。
        # 地図の半分を塗っても「ここが目当ての場所」とは言えない
        if layer == "old" and a > mw * mh * 0.45:
            return
        polys.setdefault(layer, []).append((a, [to(*p) for p in sm]))

    def add_line(layer, pts_ll):
        mr = [merc(la, lo) for la, lo in pts_ll]
        sm = simplify(mr, tol)
        for run in clip_line(sm, box):
            ln = sum(math.dist(run[i], run[i + 1]) for i in range(len(run) - 1))
            if ln < (mw / W) * 18:       # 18単位より短い切れ端は捨てる
                continue
            lines.setdefault(layer, []).append((ln, [to(*p) for p in run]))

    for x in els:
        t = x.get("tags") or {}
        if x["type"] == "way" and x.get("geometry"):
            g = [(p["lat"], p["lon"]) for p in x["geometry"]]
            hw = t.get("highway")
            if hw:
                # 歩行者の道でも、**閉じた面（`area=yes`）は道ではなく広場。**
                # 線としてなぞると、広場のまん中を1本の道が横切るだけになって、
                # 広場そのものが地図から消える
                if (hw == "pedestrian" and t.get("area") == "yes"
                        and len(g) >= 4 and _near(g[0], g[-1])):
                    add_ring("plaza", g)
                    continue
                cls = road_class(hw)
                if cls:
                    add_line(cls, g)
                continue
            rw = t.get("railway")
            if rw:
                # **路面電車と地下鉄は描かない。** 路面電車は道の上を走るので、
                # 道と同じ線をもう一度、濃い破線でなぞることになる。
                # ワルシャワは 2.2km 四方に 91本あって、地図が有刺鉄線に見えた。
                # 地下鉄は地上に無い。
                if rw in ("rail", "light_rail", "narrow_gauge"):
                    add_line("rail", g)
                continue
            if t.get("waterway") in ("river", "canal", "stream"):
                add_line("river", g)
                continue
            if t.get("historic") == "citywalls" or t.get("barrier") == "city_wall":
                add_line("wall", g)
                continue
            k = kind_of(t)
            if k and len(g) >= 4 and _near(g[0], g[-1]):
                add_ring(k, g)
        elif x["type"] == "relation" and x.get("members"):
            k = kind_of(t)
            if not k:
                continue
            for ring in stitch(x["members"]):
                add_ring(k, ring)

    # ── 面。大きいものから、層ごとに1本の path にまとめる
    layers = {}
    used = 0
    old_shape = []
    if polys.get("old"):
        # 旧市街の面。**名前を面の中に置く**ために、あとで使う
        # `polys` の中身はもう地図の座標（`add_ring` が直してある）。
        # ここでもう一度 `to()` を掛けると、窓の外へ飛んでいく
        old_shape = max(polys["old"], key=lambda r: r[0])[1]
    for name, rings in (("sea", sea), ("isle", isles)):
        d = []
        for r in rings:
            sm = simplify(r, tol * 2.0)
            if len(sm) < 3:
                continue
            d.append(dpath([to(*p) for p in sm], close=True))
            used += len(sm)
        if d:
            layers[name] = "".join(d)
    cap = {"block": 150, "old": 3, "green": 60, "water": 30, "grave": 10,
           "sand": 10, "plaza": 22}
    # **どの層も、大きい面から。** 小さい面は地図の色を変えないので、
    # 予算が尽きたところで切ってよい。旧市街と水と緑を先に置く
    for layer in ("old", "water", "green", "block", "grave", "sand", "plaza"):
        rows = sorted(polys.get(layer, []), key=lambda r: -r[0])
        d = []
        for _, pts in rows[:cap[layer]]:
            if used + len(pts) > AREA_BUDGET:
                continue
            d.append(dpath(pts, close=True))
            used += len(pts)
        if d:
            layers[layer] = "".join(d)

    # ── 線。**細い道から捨てて**、点の予算に収める
    keep = {}
    for layer in ("rail", "river", "wall") + tuple(c for c, _ in ROAD_CLASS):
        keep[layer] = sorted(lines.get(layer, []), key=lambda r: -r[0])
    drop_i = 0
    while used + sum(sum(len(p) for _, p in v) for v in keep.values()) > POINT_BUDGET:
        if drop_i >= len(ROAD_DROP):
            break
        cls = ROAD_DROP[drop_i]
        if keep.get(cls):
            # まず短いものから半分に減らし、それでも足りなければ層ごと落とす
            keep[cls] = keep[cls][:max(0, len(keep[cls]) // 2)]
            if not keep[cls]:
                drop_i += 1
        else:
            drop_i += 1
    for layer, rows in keep.items():
        if not rows:
            continue
        layers[layer] = "".join(dpath(pts) for _, pts in rows)
        used += sum(len(p) for _, p in rows)

    return layers, H, to, box, used, old_shape


def dpath(pts, close=False):
    """`M12 34l5 6-7 8` の形。**差分で書く。**

    絶対値で書くと1点9文字（`1043 214 `）になる。差分なら3〜5文字で済む。
    ワルシャワ1枚で 12KB 減った。負の数の前には区切りが要らないので、
    そこも詰める。座標は整数（1200幅で1単位 ≒ 実寸 2〜4m。それ以下は見えない）。
    """
    px, py = int(round(pts[0][0])), int(round(pts[0][1]))
    out = [f"M{px} {py}l"]
    n = 0
    for q in pts[1:]:
        qx, qy = int(round(q[0])), int(round(q[1]))
        dx, dy = qx - px, qy - py
        if dx == 0 and dy == 0:
            continue
        out.append(("" if (n == 0 or dx < 0) else " ") + str(dx)
                   + ("" if dy < 0 else " ") + str(dy))
        px, py, n = qx, qy, n + 1
    if n == 0:
        return ""
    if close:
        out.append("Z")
    return "".join(out)


def _spot(x, bbox):
    """その要素を、**窓の中のどこに置くか。** `(緯度, 経度, その形の広がり)`。

    `out center` で来たものは center を持つが、`out geom` で来たものは持たない。
    しかも川は窓の外まで続いているので、全体の真ん中を取ると窓の外に出る。
    **窓の中に入っている点だけの真ん中**を返す。
    """
    s, w, n, e = bbox
    pts = []
    if x.get("lat") is not None:
        pts = [(x["lat"], x["lon"])]
    elif x.get("geometry"):
        pts = [(g["lat"], g["lon"]) for g in x["geometry"] if g.get("lat") is not None]
    elif x.get("members"):
        for m in x["members"]:
            pts += [(g["lat"], g["lon"]) for g in (m.get("geometry") or [])]
    elif x.get("center"):
        pts = [(x["center"]["lat"], x["center"]["lon"])]
    inside = [p for p in pts if s <= p[0] <= n and w <= p[1] <= e]
    if not inside:
        c = x.get("center")
        if c and s <= c["lat"] <= n and w <= c["lon"] <= e:
            return c["lat"], c["lon"], (c["lat"], c["lon"], c["lat"], c["lon"])
        return None
    inside.sort()
    mid = inside[len(inside) // 2]
    # 形の広がりも返す。**公園や地区は「真ん中」から遠いところに点がある。**
    # 中心からの距離だけで「その点の名前か」を見ると、ブラニツキ庭園のように
    # 庭ぜんぶが見どころの場所を取りこぼす
    return mid[0], mid[1], (min(p[0] for p in inside), min(p[1] for p in inside),
                            max(p[0] for p in inside), max(p[1] for p in inside))


def _name(t):
    """OSM の名前を1つに寄せる。`Neris / Вілія` のような並記を落とす。"""
    return (t.get("name") or "").split(" / ")[0].split("/")[0].strip()


def is_square(t):
    """広場（または歩行者に開かれた通り）か。**`place=square` だけを見ない。**

    どの街も中心に広場があるのに、`place=square` で置かれているのは一部だけ。
    カトヴィツェの Rynek は `highway=pedestrian` + `area=yes`、
    リガの中央市場は `amenity=marketplace`。ここを広げないと、
    **街でいちばん有名な場所が地図に出ない。**
    """
    return (t.get("place") == "square" or t.get("historic") == "square"
            or t.get("amenity") == "marketplace"
            or (t.get("highway") == "pedestrian" and t.get("name")))


# 札に入る字数。これより長い名前は書かない。**札が地図の1/3を覆う。**
# 「フレデリック・ショパン博物館」（14字）で、ワルシャワの真ん中が消えた。
LABEL_CHARS = 10


def inside_poly(p, poly):
    """点が多角形の中か（射線法）。"""
    x, y = p
    ok = False
    for i in range(len(poly)):
        ax, ay = poly[i]
        bx, by = poly[i - 1]
        if (ay > y) != (by > y) and x < (bx - ax) * (y - ay) / (by - ay) + ax:
            ok = not ok
    return ok


def in_shape_spots(poly, n=7):
    """多角形の中に、名前を置ける場所の候補を並べる（真ん中に近い順）。"""
    if len(poly) < 3:
        return []
    xs = [p[0] for p in poly]
    ys = [p[1] for p in poly]
    cx, cy = sum(xs) / len(xs), sum(ys) / len(ys)
    out = []
    for i in range(n):
        for j in range(n):
            x = min(xs) + (max(xs) - min(xs)) * (i + 0.5) / n
            y = min(ys) + (max(ys) - min(ys)) * (j + 0.5) / n
            if inside_poly((x, y), poly):
                out.append((x, y))
    out.sort(key=lambda p: math.hypot(p[0] - cx, p[1] - cy))
    return out


def pick_marks_labels(raw, win, to, H, pins, city="", old_shape=(), avoid=(),
                      blocks=(), label_blocks=()):
    """名前の無い目印と、地図に書く名前を選ぶ。

    `avoid` は**もう別の紙に書いた名前。** 本図と拡大図に同じ名前を2度
    書くと、2枚が同じ場所の別の街に見える。
    """
    bbox = win["bbox"]
    marks, cand = [], []
    labels = {"water": [], "district": [], "park": [], "square": [], "spot": []}
    for x in raw["elements"]:
        t = x.get("tags") or {}
        sp = _spot(x, bbox)
        if not sp:
            continue
        px, py = to(*merc(sp[0], sp[1]))
        name = _name(t)
        # **こちらの訳を先に見る。** OSM の `name:ja` は付け方がばらばらで、
        # 同じものが街ごとに違う書き方になる（`スポデク` と `スポデック`）。
        # 地図と本文で書き方が割れると、同じ場所だと分からない
        ja = JA.get(name) or t.get("name:ja")
        # 中央駅は、街と同じ名前で置かれていることがある（`Katowice`）。
        # そのままだと「街の名前と同じ」で落とされて、**駅が地図から消える。**
        if ja and ja == city and t.get("railway") == "station":
            ja = f"{ja}駅"

        # **番号を振った見どころは、名前も出す。** 旅程に入れて番号まで
        # 打ったのに、地図の上では名無しの丸だった（カトヴィツェのスポデックと
        # NOSPR、ビャウィストクのブラニツキ庭園がそうだった）。
        # 点と同じ場所にあるものを、ただの劇場や近所の公園より上に出す
        sc = _score(t)
        (gs, gw, gn, ge) = sp[2]
        (ex0, ey0), (ex1, ey1) = to(*merc(gn, gw)), to(*merc(gs, ge))
        if any(ex0 - 70 <= q["ax"] <= ex1 + 70 and ey0 - 70 <= q["ay"] <= ey1 + 70
               for q in pins):
            sc += 6

        # 名前（日本語で書けるものだけ）
        if ja and ja not in NO_LABEL and ja != city and len(ja) <= LABEL_CHARS:
            if (t.get("natural") in ("water", "bay") or t.get("place") == "sea"
                    or t.get("waterway") in ("river", "canal")):
                labels["water"].append((sc, px, py, ja))
            elif t.get("place") in ("suburb", "quarter", "neighbourhood", "island"):
                labels["district"].append((sc, px, py, ja))
            elif t.get("leisure") == "park":
                labels["park"].append((sc, px, py, ja))
            elif is_square(t):
                labels["square"].append((sc, px, py, ja))
            elif not t.get("highway") and poi_glyph(t):
                # **建物や駅の名前も出す。** 前は「OSM が `name:ja` を持って
                # いるものだけ」に絞っていたが、`name:ja` が付いているのは
                # 有名な首都の有名な建物だけで、カトヴィツェには1つも無い。
                # そのせいで、駅もスポデックも NOSPR も地図に出ず、
                # 番号の点が2つ浮いているだけの地図になった。
                # 訳語は `JA` に置いてあるものだけ使う（訳を無限に増やさない）
                labels["spot"].append((sc, px, py, ja))

        gl = poi_glyph(t)
        if gl and t.get("place") not in ("suburb", "quarter", "neighbourhood"):
            cand.append((_score(t), px, py, gl))

    # ── 名前。**札（紙）を敷くので、重なると下の名前が読めなくなる。**
    # 点・目印・すでに置いた札・縮尺・方位のどれとも重ならない場所を探す。
    # 見つからなければ、その名前は**書かない**（重ねて出すより、無いほうがいい）。
    hard = [(p["x"] - 44, p["y"] - 44, 88, 88) for p in pins]
    hard.append((0, H - 92, 300, 92))           # 縮尺の棒
    hard.append((W - 108, 0, 108, 108))         # 方位
    hard += list(blocks)                        # 拡大の四角に付ける札など
    # **名前だけが避けるもの。** 拡大した四角の中がこれ。名前を敷き詰めると
    # 同じ場所を2枚で言うことになるが、**目印（絵）まで消すと穴があく。**
    # 一度そうしてみたら、本図の真ん中だけ何も無い四角になって、
    # 8街に並べたとき、そこだけ作りかけに見えた
    lonly = list(label_blocks)
    out = []
    for kind in ("water", "district", "park", "square", "spot"):
        rows = labels[kind]
        rows.sort(key=lambda r: -r[0])
        n = 0
        for sc, px, py, ja in rows:
            if any(ja in l["t"] or l["t"] in ja for l in out):
                continue
            if any(ja in a or a in ja for a in avoid):
                continue
            # 番号の点のそばでも名前を出す。**番号は名前を言っていない。**
            # 前は「同じ場所を2回言うことになる」として避けていたが、
            # そのせいで、番号を振ってある見どころ（スポデック・NOSPR）が
            # 地図の上では名無しの丸になっていた。点の四角は `hard` に
            # 入っているので、重なりはそこで避けられる
            fs = 38 if kind == "district" else 32 if kind == "spot" else 34
            lw = chip_width(ja, fs)
            lh = fs * 1.5
            spot = None
            # 少しだけ避ける。**遠くへは逃がさない。**
            # 一度、点が15個も固まる旧市街のために3段ぶん探すようにしたら、
            # タリンの「旧市街」が旧市街の外へ、リガの「ドーム広場」が川の
            # 向こう岸へ出た。**間違った場所の名前は、無い名前より悪い。**
            # 1段で置けなければ書かない。
            # 横にどける幅は、**札の長さに比例させない。** 比例させると
            # 長い名前ほど遠くへ飛ぶ（「トームペア（丘の街）」が 1.7km ずれて、
            # 丘とは別の地区の上に出た）。上限を付ける。
            step = min(lw * 0.55, 110)
            spots_try = [(px, py)]
            # 地区の名前は「面」に付くものなので、2段ぶんまで避けてよい
            # （200〜400m ずれても、まだその地区の中にいる）。
            # 川・公園・建物は1段まで。**遠くへ逃がすと嘘になる。**
            for ring in (1, 2) if kind == "district" else (1,):
                for ux, uy in ((0, -1), (0, 1), (-1, 0), (1, 0),
                               (-1, -1), (1, -1), (-1, 1), (1, 1)):
                    spots_try.append((px + ux * step * ring, py + uy * 52 * ring))
            # **紙のふちに寄った名前を、そのまま捨てない。**
            # ふちの近くにあるものは、8方向のどれに逃がしても札が紙から
            # はみ出して、そこで「書かない」に落ちていた。タリンの
            # カドリオルグ宮殿とリガのいくつかがこれで消えていた。
            # 横だけ紙の中へ寄せる。**寄せてよいのは 160 まで**
            # （4.2km の窓で 560m。それ以上動かすと別の場所を指す）
            cx = min(max(px, lw / 2 + 10), W - lw / 2 - 10)
            if 1 < abs(cx - px) <= 160:
                spots_try += [(cx, py), (cx, py - 52), (cx, py + 52)]
            # **旧市街だけは、面の中ならどこに置いてもよい。**
            # そこは面ぜんぶが旧市街なので、真ん中から少しずれても嘘にならない。
            # 点が15個も固まる街（タリン）は、これが無いと旧市街の名前が
            # 1つも出せない。名前が出ないと、そこが旧市街だと分からない。
            block = hard + lonly
            if ja == "旧市街":
                block = hard          # 目印には譲ってもらう
                if len(old_shape) >= 3:
                    # **面の中ならどこでもよい。** そこは全部が旧市街なので、
                    # 真ん中から少しずれても嘘にならない
                    spots_try = in_shape_spots(old_shape) or spots_try
            for bx, by in spots_try:
                r = (bx - lw / 2, by - fs * 0.78, lw, lh)
                if r[0] < 8 or r[1] < 8 or r[0] + lw > W - 8 or r[1] + lh > H - 8:
                    continue
                if any(_hit(r, q) for q in block):
                    continue
                spot = (bx, by, r)
                break
            if not spot:
                continue
            hard.append(spot[2])
            out.append({"x": int(round(spot[0])), "y": int(round(spot[1])),
                        "t": ja, "k": kind, "w": int(round(lw)), "fs": fs})
            n += 1
            if n >= LABEL_MAX[kind]:
                break
    # ── 名前の無い目印。**名前を置いたあとで選ぶ。**
    # 前は先に目印を置いていて、そのぶんの四角が名前の置き場所をふさいで
    # いた。目印は「ここに教会がある」しか言わないが、名前は「どこか」を
    # 言う。**同じ場所を取り合ったら、名前のほうが強い。**
    # 濃いところでは間引く（教会が5つ固まっても地図は読めない）。種類ごとの
    # 上限も置く。評点だけで選ぶと街じゅうが博物館の印になった（ヴィリニュス）。
    cand.sort(key=lambda r: -r[0])
    per = {"castle": 2, "church": 2, "museum": 2, "market": 2, "station": 1,
           "tower": 1, "arena": 1, "sauna": 1, "ship": 1}
    got = {}
    for sc, px, py, gl in cand:
        if sc < 2 or gl not in per or got.get(gl, 0) >= per[gl]:
            continue
        if any(math.hypot(px - p["x"], py - p["y"]) < 66 for p in pins):
            continue
        if any(math.hypot(px - m["x"], py - m["y"]) < 118 for m in marks):
            continue
        if not (40 <= px <= W - 40 and 40 <= py <= H - 40):
            continue
        if any(_hit((px - 32, py - 32, 64, 64), q) for q in hard):
            continue
        got[gl] = got.get(gl, 0) + 1
        marks.append({"x": int(round(px)), "y": int(round(py)), "k": gl})
        if len(marks) >= 9:
            break

    return marks, out


def _hit(a, b):
    """2つの四角が重なるか。札を置く場所を探すのに使う。"""
    return (a[0] < b[0] + b[2] and b[0] < a[0] + a[2]
            and a[1] < b[1] + b[3] and b[1] < a[1] + a[3])


def chip_width(t, fs):
    """名前の札の幅。**全角は1文字ぶん、半角は 0.55。**

    画面側（`CityMap.tsx`）で同じ計算をすると、片方だけ直したときに
    札の幅と重なりの判定がずれる。**ここで決めて、そのまま渡す。**
    """
    n = 0.0
    for ch in t:
        n += 0.55 if ord(ch) < 0x2E80 else 1.0
    return n * fs + fs * 1.1


def _score(t):
    """どれくらい「地図に出す価値がある」か。"""
    s = 0
    if t.get("wikidata"):
        s += 3
    if t.get("wikipedia"):
        s += 1
    if t.get("historic") in ("castle", "palace", "city_gate", "fort"):
        s += 3
    if t.get("building") in ("cathedral", "castle", "palace"):
        s += 3
    if t.get("tourism") in ("museum", "gallery", "attraction"):
        s += 2
    if t.get("amenity") in ("marketplace", "townhall", "theatre"):
        s += 2
    if t.get("railway") == "station":
        s += 2
    if t.get("amenity") == "place_of_worship":
        s += 1
    if t.get("place") in ("suburb", "quarter"):
        s += 2
    if t.get("name"):
        s += 1
    return s


# ─────────────────────────────────────────────────────────────
# 土台の SVG を書き出す
# ─────────────────────────────────────────────────────────────
SVGDIR = os.path.join(ROOT, "site", "public", "nordic", "city")
TOKENS = os.path.join(ROOT, "site", "app", "css", "tokens.css")


def read_tokens():
    """島の色を `tokens.css` から読む。

    土台は `<img>` で読み込む別ファイルなので、ページの CSS 変数が届かない。
    **だからといって色を手で写さない。** 写すと、島の色を直したときに
    地図だけ古い色のまま残る。ここで読んで、書き出しに焼く。

    **拾うのは素の `:root` の値だけ**（同じ名前が出てきても上書きしない）。
    あとに出てくる `[data-time]` `[data-theme]` は、島の空を朝・昼・夜で
    持ち替えるためのもの。**地図は時刻で色を変えない。** 焼いたものは
    変わりようがないので、画面側（`nordic.css`）でも地図に海の色を使わない。
    """
    t = {}
    for m in re.finditer(r"(--[a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8})\s*;",
                         open(TOKENS, encoding="utf-8").read()):
        t.setdefault(m.group(1), m.group(2))
    return t


# 土台の描き方。`(CSSの規則, トークン名で書いた値)`。
# **画面側（nordic.css）の `.cm-*` と同じ値にする。** 片方だけ変えない。
BASE_CSS = """
.pp{fill:%(--sand)s}
.sea{fill:%(--sea-shallow)s;opacity:.62;stroke:%(--sea-mid)s;stroke-width:3}
.isle{fill:%(--sand)s}
.block{fill:%(--sand-wet)s;opacity:.34}
.old{fill:%(--sand-wet)s;opacity:.62;stroke:%(--frame-dark)s;stroke-width:4;stroke-dasharray:14 8}
.sand{fill:%(--sand-wet)s;opacity:.55}
.green{fill:%(--grass2)s;opacity:.5}
.grave{fill:%(--grass-lo)s;opacity:.34}
.plaza{fill:%(--sand-wet)s;opacity:.75}
.water{fill:%(--sea-shallow)s;opacity:.62;stroke:%(--sea-mid)s;stroke-width:2.5}
.river{fill:none;stroke:%(--sea-shallow)s;stroke-width:9;stroke-linecap:round;opacity:.75}
.cs,.rd{fill:none;stroke-linecap:round;stroke-linejoin:round}
.cs{stroke:%(--frame-dark)s;opacity:.5}
.cs .r0{stroke-width:%(w0c)s}.cs .r1{stroke-width:%(w1c)s}.cs .r2{stroke-width:%(w2c)s}
.cs .r3{stroke-width:%(w3c)s}.cs .r4{stroke-width:%(w4c)s}.cs .r5{stroke-width:%(w5c)s}
.rd .r0{stroke:%(--roof-gold)s;stroke-width:%(w0)s}
.rd .r1{stroke:%(--roof-gold)s;stroke-width:%(w1)s}
.rd .r2{stroke:%(--window)s;stroke-width:%(w2)s}
.rd .r3{stroke:%(--wall)s;stroke-width:%(w3)s}
.rd .r4{stroke:%(--wall)s;stroke-width:%(w4)s}
.rd .r5{stroke:%(--wall)s;stroke-width:%(w5)s}
.rail{fill:none;stroke:%(--ink-3)s;stroke-width:%(wrail)s}
.tie{fill:none;stroke:%(--wall)s;stroke-width:%(wtie)s;stroke-dasharray:7 7}
.wall{fill:none;stroke:%(--frame-deep)s;stroke-width:6;stroke-linecap:round}
"""

# 道の太さ（2.4km 四方の窓のときの値）。窓が広い街ではここを細める。
# **画面での太さを一定にすると、広い窓では道が地面を埋めてしまう**
# （ワルシャワ 4.2km で、住宅街が1枚の白い面になった）。
# かといって実寸に比例させると毛のように消えるので、平方根で中を取る。
ROAD_W = {"r0": (11, 16), "r1": (9.5, 14), "r2": (7.5, 11.5),
          "r3": (5.6, 9), "r4": (3.8, 6.6), "r5": (3.4, 6)}


def road_widths(km):
    f = max(0.62, min(1.12, (2.4 / max(km, 0.5)) ** 0.5))
    out = {}
    for i in range(6):
        a, b = ROAD_W[f"r{i}"]
        out[f"w{i}"] = round(a * f, 2)
        out[f"w{i}c"] = round(b * f, 2)
    out["wrail"] = round(4 * f, 2)
    out["wtie"] = round(2.2 * f, 2)
    return out


def write_base(slug, w, h, km, layers, tokens):
    """土台（紙・水・緑・街区・道・鉄道・城壁）を1枚の SVG にする。

    点・目印・名前は**入れない。** あちらはページの中に描いて、字として
    読める形にしておく（`<img>` の中の字は選べないし、濃さも測れない）。
    """
    os.makedirs(SVGDIR, exist_ok=True)
    roads = [r for r, _ in ROAD_CLASS if layers.get(r)]
    css = dict(tokens)
    css.update(road_widths(km))
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {int(w)} {int(h)}" '
           f'width="{int(w)}" height="{int(h)}">',
           "<style>" + (BASE_CSS % css).replace("\n", "") + "</style>"]
    if roads:
        out.append("<defs>"
                   + "".join(f'<path id="{r}" d="{layers[r]}"/>' for r in roads)
                   + "</defs>")
    out.append(f'<rect class="pp" width="{int(w)}" height="{int(h)}"/>')
    # 海 → 島（陸に戻す）→ そのほかの面、の順。海はいちばん下
    for a in ("sea", "isle"):
        if layers.get(a):
            out.append(f'<path class="{a}" d="{layers[a]}"/>')
    for a in ("block", "old", "sand", "green", "grave", "water", "plaza"):
        if layers.get(a):
            out.append(f'<path class="{a}" d="{layers[a]}"/>')
    if layers.get("river"):
        out.append(f'<path class="river" d="{layers["river"]}"/>')
    if roads:
        for g in ("cs", "rd"):
            out.append(f'<g class="{g}">'
                       + "".join(f'<use href="#{r}" class="{r}"/>' for r in roads)
                       + "</g>")
    if layers.get("rail"):
        out.append(f'<path class="rail" d="{layers["rail"]}"/>'
                   f'<path class="tie" d="{layers["rail"]}"/>')
    if layers.get("wall"):
        out.append(f'<path class="wall" d="{layers["wall"]}"/>')
    out.append("</svg>")
    path = os.path.join(SVGDIR, f"{slug}.svg")
    open(path, "w", encoding="utf-8").write("".join(out))
    return os.path.getsize(path)


PIN_R = 34.0


def spread(pins, H, rounds=180):
    """重なった丸を押しのける。**本当の場所（ax, ay）は動かさない。**

    旧市街は 300m 四方に見どころが5つ6つ入る。そのまま置くと番号が読めない。
    どけたぶんは細い線で本当の場所へ結ぶ（ガイドブックの逃がし方）。
    """
    d = PIN_R * 2.1
    for _ in range(rounds):
        moved = False
        for i, a in enumerate(pins):
            for b in pins[i + 1:]:
                dx, dy = b["x"] - a["x"], b["y"] - a["y"]
                dist = math.hypot(dx, dy)
                if dist >= d:
                    continue
                if dist < 1e-6:
                    dx, dy, dist = 1.0, 0.0, 1.0
                push = (d - dist) / 2
                ux, uy = dx / dist, dy / dist
                a["x"] -= ux * push
                a["y"] -= uy * push
                b["x"] += ux * push
                b["y"] += uy * push
                moved = True
        for q in pins:
            dx, dy = q["x"] - q["ax"], q["y"] - q["ay"]
            far = math.hypot(dx, dy)
            cap = PIN_R * 3.0
            if far > cap:
                q["x"] = q["ax"] + dx / far * cap
                q["y"] = q["ay"] + dy / far * cap
            q["x"] = min(max(q["x"], PIN_R + 6), W - PIN_R - 6)
            q["y"] = min(max(q["y"], PIN_R + 6), H - PIN_R - 6)
        if not moved:
            break
    for q in pins:
        q["x"], q["y"] = int(round(q["x"])), int(round(q["y"]))
        q["ax"], q["ay"] = int(round(q["ax"])), int(round(q["ay"]))


def bearing(a, b):
    """a から b を見た方位（真北が 0、時計回り）。

    **経度の縮みを入れる。** 北緯60度（タリン・ヘルシンキ）では経度1度の
    幅が緯度1度の半分しかない。生の差で角度を出すと、東寄りに振れて出る。
    """
    dy = b[0] - a[0]
    dx = (b[1] - a[1]) * math.cos(math.radians((a[0] + b[0]) / 2))
    return (math.degrees(math.atan2(dx, dy)) + 360) % 360


def compass(a, b):
    ang = bearing(a, b)
    return ["北", "北東", "東", "南東", "南", "南西", "西", "北西"][round(ang / 45) % 8]


# ── 拡大（インセット）─────────────────────────────────────
# 旧市街に見どころが15個も固まる街がある（タリン）。押しのけ（`spread`）だけ
# では、390px で番号が読めない。ガイドブックと同じで、**そこだけをもう一枚
# に拡大して出す。** 本図には四角で「ここを拡大した」と示す。
#
# **点をどけるのではなく、紙を増やす。** どけると本当の場所から離れるし、
# 引き出し線が15本かかると地図が糸くずに埋まる。
INSET_MIN = 8          # これだけ固まっていたら拡大する
INSET_FRAC = 0.55      # かつ、その街の見どころの何割がそこに居るか
INSET_R_KM = 0.55      # かたまりと見なす半径
INSET_MIN_KM = 0.85    # 拡大の窓の下限。これより狭いと道しか写らない
INSET_MAX_FRAC = 0.62  # 本図の何割まで。これを超えると「拡大」にならない


def plan_inset(win, pins):
    """点が固まりすぎているところの、拡大窓を決める。無ければ None。"""
    if len(pins) < INSET_MIN:
        return None
    best = []
    for a in pins:
        grp = [b for b in pins
               if G.km(a["lat"], a["lon"], b["lat"], b["lon"]) <= INSET_R_KM]
        if len(grp) > len(best):
            best = grp
    # **数だけで決めない。** ヘルシンキは13個あって、そのうち6〜7個が
    # 港のまわりに寄っているが、残りが街じゅうに散っている。あそこを拡大
    # しても、本図から点が半分しか減らない（2枚とも混んだままになる）。
    # 「街の見どころのほとんどが1か所にある」ときだけ、紙を分ける
    if len(best) < INSET_MIN or len(best) < len(pins) * INSET_FRAC:
        return None
    lats = [p["lat"] for p in best]
    lons = [p["lon"] for p in best]
    mlat, mlon = (min(lats) + max(lats)) / 2, (min(lons) + max(lons)) / 2
    hkm = max(G.km(min(lats), mlon, max(lats), mlon) * (1 + 2 * PAD), INSET_MIN_KM)
    wkm = max(G.km(mlat, min(lons), mlat, max(lons)) * (1 + 2 * PAD), INSET_MIN_KM)
    if hkm / wkm < ASPECT[0]:
        hkm = wkm * ASPECT[0]
    if hkm / wkm > ASPECT[1]:
        wkm = hkm / ASPECT[1]
    if wkm > win["wkm"] * INSET_MAX_FRAC:
        return None
    dlat = hkm / 2 / 111.32
    dlon = wkm / 2 / (111.32 * math.cos(math.radians(mlat)))
    bbox = (mlat - dlat, mlon - dlon, mlat + dlat, mlon + dlon)
    ids = {p["id"] for p in pins
           if bbox[0] <= p["lat"] <= bbox[2] and bbox[1] <= p["lon"] <= bbox[3]}
    if len(ids) < INSET_MIN:
        return None
    return {"bbox": bbox, "wkm": wkm, "hkm": hkm, "ids": ids,
            "center": win["center"], "cq": win["cq"]}


def inset_title(raw, bbox, city):
    """拡大した場所の名前。**「拡大図」とは書かない。**

    どこを拡大したのかが分からない拡大図は、ただの2枚目。旧市街を拡大した
    なら「旧市街」と書く。名前が見つからなければ拡大そのものをやめる
    （名前の無い四角を本図に置いても、読む人には何も伝わらない）。
    """
    got = []
    for x in raw["elements"]:
        t = x.get("tags") or {}
        if t.get("place") not in ("quarter", "suburb", "neighbourhood") \
                and t.get("boundary") != "administrative":
            continue
        ja = t.get("name:ja") or JA.get(_name(t))
        if not ja or ja in NO_LABEL or ja == city:
            continue
        if _spot(x, bbox):
            got.append(ja)
    if "旧市街" in got:
        return "旧市街"
    return got[0] if got else None


def main():
    only = [a for a in sys.argv[1:] if not a.startswith("-")]
    force = "--force" in sys.argv
    geo = json.load(open(os.path.join(SRC, "geo.json"), encoding="utf-8"))
    spots = []
    for f in sorted(os.listdir(SRC)):
        if not f.endswith(".json") or f in ("index.json", "map.json", "geo.json",
                                            "citymaps.json"):
            continue
        spots += json.load(open(os.path.join(SRC, f), encoding="utf-8")).get("spots", [])

    tokens = read_tokens()
    go, maybe = G.visit_cities()
    cities = [c for c in G.CENTER if c in go]
    print(f"焼く街 {len(cities)}: {'・'.join(cities)}")
    print(f"焼かない（寄るか決まっていない）: "
          f"{'・'.join(c for c in G.CENTER if c not in go)}")
    if only:
        cities = [c for c in cities if c in only]

    out = {}
    if os.path.exists(OUT):
        try:
            out = json.load(open(OUT, encoding="utf-8"))
        except Exception:
            out = {}

    for city in cities:
        win = window(city, spots, geo)
        slug = slugify(city, win["cq"])
        print(f"\n== {city}（{slug}）窓 {win['wkm']:.2f}x{win['hkm']:.2f}km "
              f"見どころ {len(win['near'])}／ひと足 {len(win['far'])}")
        raw = osmfetch.fetch_city(slug, win["bbox"], force=force)
        # 旧市街の面。あとから足した問い合わせなので、別口で取って混ぜる
        raw = {"bbox": raw["bbox"],
               "elements": raw["elements"] + osmfetch.fetch_old(slug, win["bbox"])}

        coast = osmfetch.fetch_sea(slug, win["bbox"])
        layers, H, to, box, used, old_shape = build(city, win, raw, coast, spots)
        # 湾の名前は海の問い合わせのほうに入っている。名前を選ぶときに混ぜる
        raw = {"bbox": raw["bbox"], "elements": raw["elements"] + coast}

        all_pins = []
        for i, s in enumerate(win["near"], 1):
            g = geo[s["id"]]
            all_pins.append({"id": s["id"], "n": i,
                             "lat": g["lat"], "lon": g["lon"],
                             "cat": s.get("cat", "see"), "t": s.get("title", ""),
                             "k": glyph(g.get("type", ""), s.get("cat", "see"))})

        # 点が固まりすぎていたら、そこだけの拡大をもう一枚作る
        ins = plan_inset(win, all_pins)
        ins_t = inset_title(raw, ins["bbox"], city) if ins else None
        if ins and not ins_t:
            ins = None          # 名前の付けられない拡大は出さない

        def place(ps, conv, hh):
            """点を、その紙の座標に置いて、重なりを押しのける。"""
            got = []
            for q in ps:
                x, y = conv(*merc(q["lat"], q["lon"]))
                got.append({k: v for k, v in q.items() if k not in ("lat", "lon")}
                           | {"x": x, "y": y, "ax": x, "ay": y})
            spread(got, hh)
            return got

        svg_bytes = write_base(slug, W, H, win["wkm"], layers, tokens)
        inset = None
        if ins:
            ilayers, iH, ito, _ibox, _iu, iold = build(city, ins, raw, coast, spots)
            svg_bytes += write_base(f"{slug}-in", W, iH, ins["wkm"], ilayers, tokens)
            ipins = place([p for p in all_pins if p["id"] in ins["ids"]], ito, iH)
            imarks, ilabels = pick_marks_labels(raw, ins, ito, iH, ipins, city, iold)
            s0, w0, n0, e0 = ins["bbox"]
            (rx0, ry0) = to(*merc(n0, w0))
            (rx1, ry1) = to(*merc(s0, e0))
            # 四角に付ける名前の札。**幅も置き場所もここで決める。**
            # 画面側で同じ計算をすると、片方だけ直したときにずれる
            # （`chip_width` の注と同じ理由）
            tfs = 36
            tw = chip_width(ins_t, tfs)
            tx = min(max((rx0 + rx1) / 2, tw / 2 + 8), W - tw / 2 - 8)
            ty = ry0 - 14 if ry0 > 66 else ry0 + 52
            tab = {"x": int(round(tx)), "y": int(round(ty)),
                   "w": int(round(tw)), "fs": tfs}
            inset = {"slug": f"{slug}-in", "w": int(W), "h": int(iH),
                     "km": round(ins["wkm"], 2), "t": ins_t,
                     "rect": [int(rx0), int(ry0), int(rx1 - rx0), int(ry1 - ry0)],
                     "tab": tab,
                     "pins": ipins, "marks": imarks, "labels": ilabels}

        pins = place([p for p in all_pins if not ins or p["id"] not in ins["ids"]],
                     to, H)
        used_names = [l["t"] for l in (inset["labels"] if inset else [])]
        blocks, label_blocks = [], []
        if inset:
            used_names.append(inset["t"])
            t2 = inset["tab"]
            blocks.append((t2["x"] - t2["w"] / 2, t2["y"] - t2["fs"] * 1.16,
                           t2["w"], t2["fs"] * 1.5))
            # **拡大した四角の中には、本図の名前を置かない。**
            # そこは「拡大図を見て」と言っている場所なので、本図に細かい
            # 名前を敷き詰めると、同じ場所を2枚で言うことになる。
            # 空けたぶんは、四角の外の名前に回る
            label_blocks.append(tuple(inset["rect"]))
        marks, labels = pick_marks_labels(raw, win, to, H, pins, city, old_shape,
                                          avoid=used_names, blocks=blocks,
                                          label_blocks=label_blocks)

        clat, clon = win["center"]
        out[city] = {
            "slug": slug, "w": int(W), "h": int(H),
            "km": round(win["wkm"], 2),
            "pins": pins, "marks": marks, "labels": labels,
            "far": [{"id": s["id"], "cat": s.get("cat", "see"),
                     "t": s.get("title", ""),
                     "km": round(G.km(clat, clon, geo[s["id"]]["lat"],
                                      geo[s["id"]]["lon"]), 1),
                     "dir": compass((clat, clon),
                                    (geo[s["id"]]["lat"], geo[s["id"]]["lon"])),
                     # 矢印で指すので、8方位の字とは別に角度も渡す
                     "deg": int(round(bearing((clat, clon),
                                              (geo[s["id"]]["lat"],
                                               geo[s["id"]]["lon"])))),
                     }
                    for s in win["far"]],
        }
        if inset:
            out[city]["inset"] = inset
        road = sum(layers.get(c, "").count("M") for c, _ in ROAD_CLASS)
        face = sum(v.count("M") for k, v in layers.items()
                   if k in ("block", "old", "green", "water", "grave", "sand", "plaza"))
        size = len(json.dumps(out[city], ensure_ascii=False, separators=(",", ":")))
        print(f"   道 {road}本 / 面 {face}枚 / 点 {used} / 目印 {len(marks)} "
              f"/ 名前 {len(labels)}{'・'.join([''] + [l['t'] for l in labels])} "
              f"/ 土台 {svg_bytes/1024:.1f}KB + 点と名前 {size/1024:.1f}KB"
              + (f"\n   拡大『{inset['t']}』{inset['km']}km  点 {len(inset['pins'])}"
                 f" / 名前 {len(inset['labels'])}"
                 f"{'・'.join([''] + [l['t'] for l in inset['labels']])}"
                 if inset else ""))

    json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False,
              separators=(",", ":"))
    print(f"\n書いた: {OUT}  {os.path.getsize(OUT)//1024}KB")


if __name__ == "__main__":
    main()
