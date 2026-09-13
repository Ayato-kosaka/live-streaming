#!/usr/bin/env python3
"""道すじの寄り道（`site/content/nordic.ts` の `Leg.stops`）の `off` を測る。

## なぜ要るか

`off` は「幹線から何km外れるか」で、**寄るか寄らないかはこの数字で決まる。**
だから目分量で書いてはいけない。ここで測った値だけを `nordic.ts` に書く。

## 測りかた

1. **その区間の道すじを引く**（OSRM の公開サーバ）。
   ヒッチハイクの5区間は `nordic.ts` の `hitch.road` に「どの道を走るか」が
   書いてあるので、そのとおりに通るよう経由地を置く。
   置かないと最短だけで引かれて、**別の道の上で測ることになる**
   （ビャウィストク→ヴィリニュスは、置かないとブジスコ／カルヴァリヤ側の
   Via Baltica へ回る。`nordic.ts` はオグロドニキ—ラズディヤイと言っている）。
2. **場所の座標を引く**（OpenStreetMap。Nominatim か Overpass）。
   座標は下の表に焼いてある。**引き直したら表を直す。**
3. 道すじの線（数千点の折れ線）と場所のあいだの**いちばん短い距離**を出す。
   ついでに、そこを経由したときに走行距離が何km伸びるかも出す
   （十字架の丘だけはこちらが効く。片道58kmでも往復すると86km）。

   **「寄ると +◯km」は、車で行ける道までの寄せ（snap）が入る。**
   カミエンスク山は掘り出したかすの山の頂上で、頂上まで車道が無い。
   OSRM はいちばん近い車道へ寄せるので、off 3.10km に対して +31.9km と出る。
   `off`（横に何km外れるか）と、この数字は**別のものとして読む。**

    python3 tools/nordic/roadstops.py

## 使っている外のサーバ

- `https://router.project-osrm.org` … 道すじ
- `https://nominatim.openstreetmap.org` … 座標（このスクリプトでは使わない。
  表に焼いてある値の出どころ）

どちらもこの箱から届く。Overpass の本家（`overpass-api.de`）は届かないが、
ミラー（`overpass.kumi.systems`）は生きている（`tools/nordic/osmfetch.py`）。
"""

import json
import math
import os
import time
import urllib.request

OSRM = "https://router.project-osrm.org/route/v1/driving/"
# 引いた道すじの置き場。**`.osmcache/` の中に置く。** あそこは `.gitignore` に
# 入っているので、生データをリポジトリへ持ち込まずに済む。
CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".osmcache", "routes.json")
os.makedirs(os.path.dirname(CACHE), exist_ok=True)

# ヒッチハイクの5区間の道すじ。**経由地は `nordic.ts` の `hitch.road` に合わせる。**
# (緯度, 経度)
LEGS = {
    "katowice-warszawa": [
        (50.2649, 19.0238),   # カトヴィツェ
        (52.2297, 21.0122),   # ワルシャワ（A1 →ピョトルクフ→ S8 が最短なので経由地は要らない）
    ],
    "warszawa-bialystok": [
        (52.2297, 21.0122),
        (53.1325, 23.1688),   # ビャウィストク（S8 一本）
    ],
    "bialystok-vilnius": [
        (53.1325, 23.1688),
        (53.8435, 22.9789),   # アウグストゥフ（DK8）
        (54.1017, 22.9310),   # スヴァウキ
        (54.1089, 23.3456),   # セイニィ（653号）
        (54.1735, 23.4780),   # オグロドニキの国境
        (54.2340, 23.5162),   # ラズディヤイ
        (54.3963, 24.0458),   # アリートゥス
        (54.6872, 25.2797),   # ヴィリニュス
    ],
    "vilnius-riga": [
        (54.6872, 25.2797),
        (55.7333, 24.3500),   # パネヴェジース（A2 → A10 の乗り換え）
        (56.4080, 24.1900),   # バウスカ
        (56.9496, 24.1052),   # リガ
    ],
    "riga-tallinn": [
        (56.9496, 24.1052),
        (58.3859, 24.4971),   # パルヌ（A1 → E67、ずっと海沿い）
        (59.4370, 24.7536),   # タリン
    ],
}

# 寄り道の候補。座標は OpenStreetMap（Nominatim の1件目をそのまま信じず、
# 種類（class/type）と街からの距離で確かめたもの。`geocode.py` と同じ用心）。
STOPS = {
    "katowice-warszawa": [
        ("Jasna Góra",                   50.81276, 19.09712, "nominatim historic/castle"),
        ("Góra Kamieńska",               51.20784, 19.43431, "nominatim natural/peak"),
        ("Niebieskie Źródła",            51.52434, 20.04320, "nominatim waterway/stream"),
        ("Zamek Książąt Mazowieckich",   51.76827, 20.25303, "nominatim historic/castle"),
    ],
    "warszawa-bialystok": [
        ("Waniewo",                      53.07627, 22.81434, "nominatim boundary/administrative"),
        ("Tykocin（Wielka Synagoga）",    53.20670, 22.76721, "nominatim building/synagogue"),
        ("Choroszcz（Muzeum Wnętrz）",    53.15238, 22.97940, "nominatim tourism/museum"),
    ],
    "bialystok-vilnius": [
        ("Kanał Augustowski（閘門）",      53.84600, 22.98800, "OSM 町なかの閘門"),
        ("Klasztor w Wigrach",           54.06890, 23.08678, "overpass way Zespół klasztorny Kamedułów"),
        ("Biała Synagoga（Sejny）",       54.10565, 23.35091, "nominatim amenity/community_centre"),
        ("Baltosios rožės tiltas",       54.39323, 24.08132, "overpass way Baltosios rožės tiltas"),
    ],
    "vilnius-riga": [
        ("Kernavė（piliakalniai）",       54.88327, 24.85091, "nominatim information/board"),
        ("Aukštaitijos siaurasis gel.",  55.74578, 24.35534, "nominatim tourism/attraction"),
        ("Rundāles pils",                56.41365, 24.02443, "nominatim historic/castle"),
        ("Kryžių kalnas",                56.01503, 23.41568, "nominatim tourism/attraction"),
    ],
    "riga-tallinn": [
        ("Carnikava",                    57.12970, 24.27081, "nominatim place/town"),
        ("Baltā kāpa（Saulkrasti）",      57.23365, 24.39309, "nominatim information/board"),
        ("Veczemju klintis",             57.58370, 24.36873, "nominatim natural/cliff"),
        ("Rannametsa-Tolkuse（塔）",      58.13920, 24.51081, "overpass node man_made=tower"),
    ],
}

_cache = json.load(open(CACHE)) if os.path.exists(CACHE) else {}


def route(pts, geom=True):
    key = ";".join(f"{a:.5f},{b:.5f}" for a, b in pts) + ("|g" if geom else "")
    if key in _cache:
        return _cache[key]
    s = ";".join(f"{b:.6f},{a:.6f}" for a, b in pts)
    url = OSRM + s + ("?overview=full&geometries=geojson" if geom else "?overview=false")
    err = None
    for _ in range(5):
        try:
            d = json.loads(urllib.request.urlopen(url, timeout=120).read().decode())
            break
        except Exception as e:  # 公開サーバなので、混んでいたら待って掛け直す
            err = e
            time.sleep(5)
    else:
        raise SystemExit(f"OSRM に届きませんでした: {err}")
    if d.get("code") != "Ok":
        raise SystemExit(f"OSRM が返した: {d.get('code')}")
    r = d["routes"][0]
    out = {
        "km": r["distance"] / 1000.0,
        "line": [(c[1], c[0]) for c in r["geometry"]["coordinates"]] if geom else None,
    }
    _cache[key] = out
    json.dump(_cache, open(CACHE, "w"))
    return out


def seg_dist(p, a, b):
    """点と線分の距離(km)。その緯度で経度を縮めた平面で測る（数kmなら誤差は無視できる）。"""
    kx = 111.320 * math.cos(math.radians(p[0]))
    ky = 110.574
    px, py = p[1] * kx, p[0] * ky
    ax, ay = a[1] * kx, a[0] * ky
    bx, by = b[1] * kx, b[0] * ky
    dx, dy = bx - ax, by - ay
    L = dx * dx + dy * dy
    t = 0.0 if L == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / L))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def hav(a, b):
    R = 6371.0088
    la1, lo1 = map(math.radians, a)
    la2, lo2 = map(math.radians, b)
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


def along(p, line):
    """道すじの線の、出発から何kmのところがいちばん近いか。"""
    best = (1e9, 0.0)
    acc = 0.0
    for i in range(len(line) - 1):
        d = seg_dist(p, line[i], line[i + 1])
        if d < best[0]:
            best = (d, acc)
        acc += hav(line[i], line[i + 1])
    return best[1]


def off_and_dir(p, line):
    """道すじの線までの最短距離(km)と、道から見てどっちにあるか。"""
    best = (1e9, None)
    for i in range(len(line) - 1):
        d = seg_dist(p, line[i], line[i + 1])
        if d < best[0]:
            best = (d, line[i])
    a = best[1]
    dy = p[0] - a[0]
    dx = (p[1] - a[1]) * math.cos(math.radians(a[0]))
    ang = math.degrees(math.atan2(dx, dy)) % 360
    d8 = ["北", "北東", "東", "南東", "南", "南西", "西", "北西"][int(((ang + 22.5) % 360) // 45)]
    return best[0], d8, a


def main():
    for leg, waypoints in LEGS.items():
        base = route(waypoints)
        print(f"\n== {leg}   道すじ {base['km']:.1f}km（点 {len(base['line'])}）")
        for name, lat, lon, src in STOPS[leg]:
            off, d8, near = off_and_dir((lat, lon), base["line"])
            # 寄って本線に戻ったときに伸びる走行距離。**片道の距離とは別もの。**
            # **どこに差し込むかは、道すじの上の位置で決める。** 経由地どうしを
            # 直線で結んで近さを見ると、道が曲がっている区間で1つ手前に入って
            # 「+31.9km」のような嘘が出る（カミエンスク山で実際に出た）。
            here = along((lat, lon), base["line"])
            w = list(waypoints)
            ins = next((i for i in range(1, len(w))
                        if along(w[i], base["line"]) >= here), len(w) - 1)
            w.insert(ins, (lat, lon))
            via = route(w, geom=False)["km"]
            print(f"   {name:30s} off {off:6.2f}km {d8:2s}  寄ると +{via - base['km']:5.1f}km"
                  f"   道の最寄り {near[0]:.4f},{near[1]:.4f}   [{src}]")

    # 十字架の丘だけは、本線に戻らず A12 へ乗り換えて西回りにする手もある。
    # **どちらも高い**ことを、数で言えるようにしておく。
    base = route(LEGS["vilnius-riga"], geom=False)["km"]
    alt = route([(54.6872, 25.2797), (55.7333, 24.3500),
                 (56.01503, 23.41568), (56.9496, 24.1052)], geom=False)["km"]
    print(f"\n-- 十字架の丘: A12 へ乗り換えて西回りにすると {alt:.1f}km（本線 {base:.1f}km / {alt - base:+.1f}km）")


if __name__ == "__main__":
    main()
