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
MIN_KM, MAX_KM = 2.0, 3.4
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
ROAD_DROP = ["r5", "r4", "r3", "r2", "r1", "r0"]
# 1つの街に使ってよい点の数。
#
# 土台（道・川・緑）は `site/public/nordic/city/<街>.svg` に**外だしする。**
# 日ページの中に直に描くと、Next が同じものを HTML と RSC の積み荷に2度書くので、
# 17KB の地図が 54KB になった（実測）。外に出せば1度で済み、
# 同じ街に何日か滞在する日程でも**2日目からは取りに行かない**（キャッシュ）。
POINT_BUDGET = 5200


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
PLAZA = {"place": {"square"}}


def kind_of(tags):
    """その形を、地図のどの層に置くか。**上から順に当てる。**"""
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
}
GLYPH_OF = {v: k for k, vs in GLYPH.items() for v in vs}


def glyph(t):
    return GLYPH_OF.get(t, "spot")


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
    "Białystok": "ビャウィストク", "Rynek Kościuszki": "コシチュシュコ広場",
    "Planty": "プランティ公園", "Biała": "ビャワ川",
    "Park Branickich": "ブラニツキ庭園", "Centrum": "中心街",
    "Bojary": "ボヤルィ", "Ogród Branickich": "ブラニツキ庭園",
    # リトアニア
    "Neris": "ネリス川", "Vilnia": "ヴィルニャ川", "Vilnelė": "ヴィルニャ川",
    "Senamiestis": "旧市街", "Užupis": "ウジュピス", "Naujamiestis": "新市街",
    "Žvėrynas": "ジュヴェリナス", "Šnipiškės": "シュニピシュケス",
    "Bernardinų sodas": "ベルナルディン庭園", "Sereikiškių parkas": "ベルナルディン庭園",
    "Kalnų parkas": "三十字架の丘", "Vingio parkas": "ヴィンギス公園",
    "Katedros aikštė": "大聖堂広場", "Rotušės aikštė": "市庁舎広場",
    "Antakalnis": "アンタカルニス",
    # ラトビア
    "Daugava": "ダウガヴァ川", "Vecrīga": "旧市街", "Centrs": "中心街",
    "Rīgas kanāls": "運河", "Pilsētas kanāls": "運河",
    "Bastejkalna parks": "バスティオン公園", "Kronvalda parks": "クロンヴァルド公園",
    "Esplanāde": "エスプラナーデ公園", "Vērmanes dārzs": "ヴェールマネ公園",
    "Āgenskalns": "アーゲンスカルンス", "Klusais centrs": "静かな中心街",
    "Maskavas forštate": "モスクワ地区", "Centrāltirgus": "中央市場",
    "Doma laukums": "ドーム広場",
    # エストニア
    "Vanalinn": "旧市街", "Tallinna laht": "タリン湾", "Kadriorg": "カドリオルグ",
    "Kesklinn": "中心街", "Kalamaja": "カラマヤ", "Põhja-Tallinn": "北タリン",
    "Kadrioru park": "カドリオルグ公園", "Toompea": "トームペア（丘の街）",
    "Raekoja plats": "ラエコヤ広場", "Vabaduse väljak": "自由広場",
    "Tammsaare park": "タムサーレ公園", "Hirvepark": "鹿公園",
    "Snelli tiik": "スネッリ池", "Ülemiste järv": "ユレミステ湖",
    "Pirita": "ピリタ", "Lasnamäe": "ラスナメエ",
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
    "Eläintarhanlahti": "エラインタルハ湾",
    # スウェーデン
    "Gamla stan": "旧市街（ガムラスタン）", "Riddarfjärden": "リッダー湾",
    "Djurgården": "ユールゴーデン", "Södermalm": "セーデルマルム",
    "Norrmalm": "ノルマルム", "Östermalm": "エステルマルム",
    "Kungsholmen": "クングスホルメン", "Skeppsholmen": "シェップスホルメン",
    "Vasastan": "ヴァーサスタン", "Saltsjön": "ソルト湾",
    "Kungsträdgården": "王の庭", "Humlegården": "フムレゴーデン公園",
    "Stortorget": "大広場", "Slussen": "スルッセン", "Strömmen": "ストロンメン",
    "Nybroviken": "ニーブロ湾", "Vasaparken": "ヴァーサ公園",
    "Tantolunden": "タント公園", "Rålambshovsparken": "ロラムブスホフ公園",
}

# 名前を出す層と、その優先度（多いと地図が字で埋まるので、上から数個だけ）
LABEL_MAX = {"water": 2, "district": 4, "park": 2, "square": 1}


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
    pts = [(geo[s["id"]]["lat"], geo[s["id"]]["lon"]) for s in here]
    near_km = NEAR_KM
    while True:
        near = [s for s in here
                if G.km(clat, clon, geo[s["id"]]["lat"], geo[s["id"]]["lon"]) <= near_km]
        lats = [clat] + [geo[s["id"]]["lat"] for s in near]
        lons = [clon] + [geo[s["id"]]["lon"] for s in near]
        hkm = G.km(min(lats), clon, max(lats), clon) * (1 + 2 * PAD)
        wkm = G.km(clat, min(lons), clat, max(lons)) * (1 + 2 * PAD)
        if max(hkm, wkm) <= MAX_KM or near_km <= 0.6:
            break
        near_km -= 0.25
    wkm, hkm = max(wkm, MIN_KM), max(hkm, MIN_KM)
    # 縦横の比をそろえる。細長い窓は、スマホの1画面に置けない
    if hkm / wkm < ASPECT[0]:
        hkm = wkm * ASPECT[0]
    if hkm / wkm > ASPECT[1]:
        wkm = hkm / ASPECT[1]
    mlat = (min(lats) + max(lats)) / 2
    mlon = (min(lons) + max(lons)) / 2
    dlat = hkm / 2 / 111.32
    dlon = wkm / 2 / (111.32 * math.cos(math.radians(mlat)))
    far = [s for s in here if s not in near]
    return {
        "bbox": (mlat - dlat, mlon - dlon, mlat + dlat, mlon + dlon),
        "wkm": wkm, "hkm": hkm, "center": (clat, clon), "cq": cq,
        "near": near, "far": far, "all": here,
    }


def build(city, win, raw, spots_all):
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

    polys = {}      # 層 → [(面積, [点…])]
    lines = {}      # 層 → [(長さ, [点…])]
    els = raw["elements"]

    def add_ring(layer, ring_ll):
        mr = [merc(la, lo) for la, lo in ring_ll]
        cl = clip_poly(mr, box)
        if len(cl) < 3:
            return
        sm = simplify(cl, tol)
        if len(sm) < 3:
            return
        a = area(sm)
        if a < (mw / W) ** 2 * 900:      # 30x30 単位より小さい面は描かない
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
                cls = road_class(hw)
                if cls:
                    add_line(cls, g)
                continue
            if t.get("railway"):
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
    for layer in ("block", "sand", "green", "grave", "water", "plaza"):
        rows = sorted(polys.get(layer, []), key=lambda r: -r[0])
        cap = {"block": 150, "green": 60, "water": 30, "grave": 10,
               "sand": 10, "plaza": 22}[layer]
        d = []
        for _, pts in rows[:cap]:
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

    return layers, H, to, box, used


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
    """その要素を、**窓の中のどこに置くか。**

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
            return c["lat"], c["lon"]
        return None
    inside.sort()
    return inside[len(inside) // 2]


def _name(t):
    """OSM の名前を1つに寄せる。`Neris / Вілія` のような並記を落とす。"""
    return (t.get("name") or "").split(" / ")[0].split("/")[0].strip()


def pick_marks_labels(raw, win, to, H, pins):
    """名前の無い目印と、地図に書く名前を選ぶ。"""
    bbox = win["bbox"]
    marks, cand = [], []
    labels = {"water": [], "district": [], "park": [], "square": []}
    for x in raw["elements"]:
        t = x.get("tags") or {}
        sp = _spot(x, bbox)
        if not sp:
            continue
        px, py = to(*merc(*sp))
        name = _name(t)
        ja = t.get("name:ja") or JA.get(name)

        # 名前（日本語で書けるものだけ）
        if ja:
            if t.get("natural") == "water" or t.get("waterway") in ("river", "canal"):
                labels["water"].append((_score(t), px, py, ja))
            elif t.get("place") in ("suburb", "quarter", "neighbourhood", "island"):
                labels["district"].append((_score(t), px, py, ja))
            elif t.get("leisure") == "park":
                labels["park"].append((_score(t), px, py, ja))
            elif t.get("place") == "square" or t.get("historic") == "square":
                labels["square"].append((_score(t), px, py, ja))

        gl = poi_glyph(t)
        if gl and t.get("place") not in ("suburb", "quarter", "neighbourhood"):
            cand.append((_score(t), px, py, gl))

    # 目印。**濃いところで間引く。** 教会が5つ固まっても地図は読めない。
    # 種類ごとにも上限を置く。点を評点だけで選ぶと、街じゅうが博物館の印に
    # なった（ヴィリニュスで 22個中 14個が博物館だった）。
    cand.sort(key=lambda r: -r[0])
    per = {"castle": 3, "church": 5, "museum": 4, "market": 3, "station": 2,
           "tower": 3, "arena": 2, "sauna": 2, "ship": 2, "park": 1}
    got = {}
    for sc, px, py, gl in cand:
        if sc < 2 or gl not in per or got.get(gl, 0) >= per[gl]:
            continue
        if any(math.hypot(px - p["x"], py - p["y"]) < 54 for p in pins):
            continue
        if any(math.hypot(px - m["x"], py - m["y"]) < 66 for m in marks):
            continue
        if not (30 <= px <= W - 30 and 30 <= py <= H - 30):
            continue
        got[gl] = got.get(gl, 0) + 1
        marks.append({"x": int(round(px)), "y": int(round(py)), "k": gl})
        if len(marks) >= 20:
            break

    out = []
    for kind, rows in labels.items():
        rows.sort(key=lambda r: -r[0])
        seen = []
        for sc, px, py, ja in rows:
            if any(t == ja for _, _, t in seen):
                continue
            if any(math.hypot(px - a, py - b) < 150 for a, b, _ in seen):
                continue
            if not (60 <= px <= W - 60 and 30 <= py <= H - 30):
                continue
            seen.append((px, py, ja))
            out.append({"x": int(round(px)), "y": int(round(py)), "t": ja, "k": kind})
            if len(seen) >= LABEL_MAX[kind]:
                break
    return marks, out


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
    """
    t = {}
    for m in re.finditer(r"(--[a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8})\s*;",
                         open(TOKENS, encoding="utf-8").read()):
        t.setdefault(m.group(1), m.group(2))
    return t


# 土台の描き方。`(CSSの規則, トークン名で書いた値)`。
# **画面側（nordic.css）の `.cm-*` と同じ値にする。** 片方だけ変えない。
BASE_CSS = """
.pp{fill:%(--paper-2)s}
.block{fill:%(--sand)s;opacity:.34}
.sand{fill:%(--sand-wet)s;opacity:.55}
.green{fill:%(--grass2)s;opacity:.5}
.grave{fill:%(--grass-lo)s;opacity:.34}
.plaza{fill:%(--sand-wet)s;opacity:.75}
.water{fill:%(--sea-shallow)s;opacity:.62;stroke:%(--sea-mid)s;stroke-width:2.5}
.river{fill:none;stroke:%(--sea-shallow)s;stroke-width:9;stroke-linecap:round;opacity:.75}
.cs,.rd{fill:none;stroke-linecap:round;stroke-linejoin:round}
.cs{stroke:%(--sand-edge)s}
.cs .r0{stroke-width:13}.cs .r1{stroke-width:11}.cs .r2{stroke-width:9}
.cs .r3{stroke-width:7}.cs .r4{stroke-width:5}.cs .r5{stroke-width:4.5}
.rd .r0{stroke:%(--roof-gold)s;stroke-width:9}
.rd .r1{stroke:%(--roof-gold)s;stroke-width:7.5}
.rd .r2{stroke:%(--window)s;stroke-width:6}
.rd .r3{stroke:%(--wall)s;stroke-width:4.4}
.rd .r4{stroke:%(--wall)s;stroke-width:2.8}
.rd .r5{stroke:%(--wall)s;stroke-width:2.6;stroke-dasharray:9 5}
.rail{fill:none;stroke:%(--ink-3)s;stroke-width:4}
.tie{fill:none;stroke:%(--wall)s;stroke-width:2.2;stroke-dasharray:7 7}
.wall{fill:none;stroke:%(--frame-deep)s;stroke-width:6;stroke-linecap:round}
"""


def write_base(slug, w, h, layers, tokens):
    """土台（紙・水・緑・街区・道・鉄道・城壁）を1枚の SVG にする。

    点・目印・名前は**入れない。** あちらはページの中に描いて、字として
    読める形にしておく（`<img>` の中の字は選べないし、濃さも測れない）。
    """
    os.makedirs(SVGDIR, exist_ok=True)
    roads = [r for r, _ in ROAD_CLASS if layers.get(r)]
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {int(w)} {int(h)}" '
           f'width="{int(w)}" height="{int(h)}">',
           "<style>" + (BASE_CSS % tokens).replace("\n", "") + "</style>"]
    if roads:
        out.append("<defs>"
                   + "".join(f'<path id="{r}" d="{layers[r]}"/>' for r in roads)
                   + "</defs>")
    out.append(f'<rect class="pp" width="{int(w)}" height="{int(h)}"/>')
    for a in ("block", "sand", "green", "grave", "water", "plaza"):
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


def compass(a, b):
    dy, dx = b[0] - a[0], b[1] - a[1]
    ang = (math.degrees(math.atan2(dx, dy)) + 360) % 360
    return ["北", "北東", "東", "南東", "南", "南西", "西", "北西"][round(ang / 45) % 8]


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

        layers, H, to, box, used = build(city, win, raw, spots)

        pins = []
        for i, s in enumerate(win["near"], 1):
            g = geo[s["id"]]
            x, y = to(*merc(g["lat"], g["lon"]))
            pins.append({"id": s["id"], "n": i, "x": x, "y": y, "ax": x, "ay": y,
                         "cat": s.get("cat", "see"), "t": s.get("title", ""),
                         "k": glyph(g.get("type", ""))})
        spread(pins, H)
        marks, labels = pick_marks_labels(raw, win, to, H, pins)

        clat, clon = win["center"]
        svg_bytes = write_base(slug, W, H, layers, tokens)
        out[city] = {
            "slug": slug, "w": int(W), "h": int(H),
            "km": round(win["wkm"], 2),
            "pins": pins, "marks": marks, "labels": labels,
            "far": [{"id": s["id"], "cat": s.get("cat", "see"),
                     "t": s.get("title", ""),
                     "km": round(G.km(clat, clon, geo[s["id"]]["lat"],
                                      geo[s["id"]]["lon"]), 1),
                     "dir": compass((clat, clon),
                                    (geo[s["id"]]["lat"], geo[s["id"]]["lon"]))}
                    for s in win["far"]],
        }
        road = sum(layers.get(c, "").count("M") for c, _ in ROAD_CLASS)
        face = sum(v.count("M") for k, v in layers.items()
                   if k in ("block", "green", "water", "grave", "sand", "plaza"))
        size = len(json.dumps(out[city], ensure_ascii=False, separators=(",", ":")))
        print(f"   道 {road}本 / 面 {face}枚 / 点 {used} / 目印 {len(marks)} "
              f"/ 名前 {len(labels)} / 土台 {svg_bytes/1024:.1f}KB "
              f"+ 点と名前 {size/1024:.1f}KB")

    json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False,
              separators=(",", ":"))
    print(f"\n書いた: {OUT}  {os.path.getsize(OUT)//1024}KB")


if __name__ == "__main__":
    main()
