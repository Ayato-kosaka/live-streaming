#!/usr/bin/env python3
"""街を拡大した地図を焼く。

`geocode.py` が付けた緯度経度（`nordic/geo.json`）を、街ごとの窓に落として
SVG が描ける形にする。土台の絵（川・海・公園・旧市街）も OpenStreetMap から
取って、同じ窓に重ねる。

## なぜ土台が要るか

点だけ置いても、どこがどこだか分からない。**川と旧市街があれば、人は
一気に読める。** ガイドブックの街地図が必ず川と旧市街を描いているのと同じ。

道路までは描かない。この箱から Overpass に届かないので1本ずつ取れないし、
島の絵は元から線が少ない。**川・水辺・緑・旧市街の4層で足りる。**

## 窓の決め方

**全部の点が入るように広げない。** ワルシャワはヴィラヌフ宮殿が中心から
8.9km 南にあるので、そこまで入れると旧市街が豆粒になる。

中心に寄っている点（既定 3.5km 以内）だけで窓を決めて、外に出たものは
「ひと足のばして」として**距離と方角**を出す。ガイドブックと同じ扱い。

出すもの: `site/content/nordic/citymaps.json`
"""

import json
import math
import os
import sys
import time
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, "site", "content", "nordic")
OUT = os.path.join(SRC, "citymaps.json")
SHAPES = os.path.join(os.path.dirname(os.path.abspath(__file__)), "shapes.json")

UA = "ayato-island/1.0 (https://live-streaming-d3cac.web.app; nordic city maps)"
API = "https://nominatim.openstreetmap.org/search"

# 窓に入れる点の範囲(km)。ここを外れたものは「ひと足のばして」に回す。
NEAR_KM = 3.5
# 窓の余白（窓の短辺に対する割合）
PAD = 0.16

# 街ごとの土台。**引く言葉をこちらで決める。** 名前だけで投げると、
# 同じ名前の映画館や店に当たる（geocode.py の Wisła の件）。
#   water … 川・湖・海。いちばん効く
#   green … 大きな公園
#   old   … 旧市街（面で塗る）
BASE = {
    "カトヴィツェ": {"green": ["Park Kościuszki, Katowice"], "old": ["Rynek, Katowice"]},
    "ワルシャワ": {
        "water": ["Wisła river Poland"],
        "green": ["Łazienki Królewskie, Warszawa", "Ogród Saski, Warszawa"],
        "old": ["Stare Miasto, Warszawa"],
    },
    "ビャウィストク": {
        "green": ["Planty, Białystok"],
        "old": ["Rynek Kościuszki, Białystok"],
    },
    "ヴィリニュス": {
        "water": ["Neris river Lithuania"],
        "green": ["Bernardinų sodas, Vilnius"],
        "old": ["Senamiestis, Vilniaus miesto savivaldybė"],
    },
    "トラカイ": {"water": ["Galvė, Trakai, Lithuania"]},
    "シャウレイ": {"green": ["Talkšos ežeras, Šiauliai"]},
    "リガ": {
        "water": ["Daugava river Latvia"],
        "green": ["Bastejkalna parks, Rīga"],
        "old": ["Vecrīga, Rīga"],
    },
    "ルンダーレ": {"green": ["Rundāles pils parks, Latvia"]},
    "タリン": {
        "water": ["Tallinna laht, Estonia"],
        "green": ["Kadrioru park, Tallinn"],
        "old": ["Vanalinn, Tallinn"],
    },
    "パルヌ": {"water": ["Pärnu river Estonia"], "green": ["Rannapark, Pärnu"]},
    "ヘルシンキ": {
        "water": ["Töölönlahti, Helsinki"],
        "green": ["Kaivopuisto, Helsinki", "Esplanadin puisto, Helsinki"],
        "old": ["Kruununhaka, Helsinki"],
    },
    "ストックホルム": {
        "water": ["Riddarfjärden, Stockholm"],
        "green": ["Djurgården, Stockholm"],
        "old": ["Gamla stan, Stockholm"],
    },
}


def km(a, b):
    """(lat, lon) 2点の距離(km)。"""
    r, p = 6371.0, math.pi / 180
    dla, dlo = (b[0] - a[0]) * p, (b[1] - a[1]) * p
    x = (math.sin(dla / 2) ** 2
         + math.cos(a[0] * p) * math.cos(b[0] * p) * math.sin(dlo / 2) ** 2)
    return 2 * r * math.asin(math.sqrt(x))


def merc(lat, lon):
    """Web メルカトル。**緯度で横が縮むのを、これで正しく吸収する。**

    北欧は緯度が高い（ヘルシンキ 60度）ので、緯度経度をそのまま x,y に
    使うと街が横に2倍伸びる。
    """
    x = lon
    y = math.degrees(math.log(math.tan(math.pi / 4 + math.radians(lat) / 2)))
    return x, y


def ask(q, poly=False, limit=1):
    args = {"q": q, "format": "jsonv2", "limit": str(limit), "accept-language": "en"}
    if poly:
        args["polygon_geojson"] = "1"
    req = urllib.request.Request(API + "?" + urllib.parse.urlencode(args),
                                 headers={"User-Agent": UA})
    for a in range(3):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read().decode())
        except Exception as e:
            if a == 2:
                print(f"    取れない {q}: {e}", file=sys.stderr)
                return []
            time.sleep(3 * (a + 1))
    return []


def rings(geo):
    """GeoJSON から、輪（座標の並び）を取り出す。"""
    if not geo:
        return []
    t, c = geo.get("type"), geo.get("coordinates")
    if t == "Polygon":
        return [c[0]] if c else []
    if t == "MultiPolygon":
        return [p[0] for p in c if p]
    if t == "LineString":
        return [c]
    if t == "MultiLineString":
        return list(c)
    return []


# 層ごとに「これなら本物」と言える種類。**ここで絞らないと別物が来る。**
#   Wisła（ヴィスワ川）→ 同じ名前の映画館
#   Daugava（ダウガヴァ川）→ 彫刻・画廊・競技場（本物は4件目）
#   Gamla stan（旧市街）→ 地下鉄の駅（本物は2件目）
# 1件目を採ると、この3つとも間違える。
KIND_OK = {
    "water": {"river", "water", "riverbank", "bay", "strait", "lake", "canal",
              "reservoir", "pond", "stream", "coastline"},
    "green": {"park", "garden", "forest", "wood", "grass", "nature_reserve",
              "recreation_ground", "village_green", "island", "water"},
    "old": {"administrative", "suburb", "quarter", "neighbourhood", "borough",
            "city_block", "square", "pedestrian", "historic", "town"},
}


def usable(geo):
    """点だけの結果は土台にならない。面か線があるものだけ。"""
    return bool(rings(geo))


def fetch_shapes():
    """土台の形を取って、生のまま控える。**1回取ったら使い回す。**"""
    have = {}
    if os.path.exists(SHAPES):
        have = json.load(open(SHAPES, encoding="utf-8"))
    n = 0
    for city, kinds in BASE.items():
        for kind, qs in kinds.items():
            for q in qs:
                key = f"{kind}|{q}"
                if key in have:
                    continue
                rows = ask(q, poly=True, limit=20)
                time.sleep(1.1)
                ok = KIND_OK.get(kind, set())
                # 種類が合っていて、面か線を持つものの中から、いちばん詳しいもの
                cand = [x for x in rows
                        if (x.get("type") in ok or x.get("category") in ("waterway", "natural"))
                        and usable(x.get("geojson"))]
                if not cand:
                    cand = [x for x in rows if usable(x.get("geojson"))]
                pickd = max(cand, key=lambda x: sum(len(r) for r in rings(x["geojson"]))) if cand else None
                r = rings(pickd.get("geojson")) if pickd else []
                have[key] = r
                n += 1
                why = f'{pickd.get("category")}/{pickd.get("type")}' if pickd else "—"
                print(f'  {"○" if r else "×"} {city:8s} {kind:6s} {q[:34]:36s} {why:22s} 輪{len(r)}')
    if n:
        json.dump(have, open(SHAPES, "w", encoding="utf-8"), ensure_ascii=False)
    return have


def crop(ring, box):
    """窓の外を、**窓のふちに沿わせて**畳む。

    川は 40,000点あることがある（ヴィスワ川は源流から河口まで1本）。
    窓の中は1点も動かさず、外に出ているあいだは「出た点」と「戻る点」だけを
    残す。これで点の数が3桁減る。
    """
    x0, y0, x1, y1 = box
    def inside(p):
        return x0 <= p[0] <= x1 and y0 <= p[1] <= y1
    out, prev_in = [], False
    for p in ring:
        now = inside(p)
        if now or prev_in or not out:
            out.append(p)
        else:
            out[-1] = p          # 外にいるあいだは、最後の1点だけ動かす
        prev_in = now
    return out


# 丸の半径（1000 幅の中での大きさ）。スマホで 358px に出るので、
# 32 ≒ 11.5px。**これ以上小さいと番号が読めない。**
PIN_R = 32.0


def spread(pins, h, rounds=140):
    """重なった丸を、**押しのけて**離す。

    旧市街は 300m 四方に見どころが5つ6つ入る。そのまま置くと丸が団子になって
    番号が1つも読めない（タリンで実際にそうなった）。

    丸だけを動かして、**本当の場所（ax, ay）は動かさない。** 画面側が
    そこへ細い線を引くので、どの点のことかは分かる。
    ガイドブックが吹き出しを引いているのと同じ逃がし方。
    """
    d = PIN_R * 2.05          # これより近いと重なって見える
    for _ in range(rounds):
        moved = False
        for i, a in enumerate(pins):
            for b in pins[i + 1:]:
                dx, dy = b["x"] - a["x"], b["y"] - a["y"]
                dist = math.hypot(dx, dy)
                if dist >= d:
                    continue
                if dist < 1e-6:      # 完全に同じ場所。とりあえず横へ
                    dx, dy, dist = 1.0, 0.0, 1.0
                push = (d - dist) / 2
                ux, uy = dx / dist, dy / dist
                a["x"] -= ux * push; a["y"] -= uy * push
                b["x"] += ux * push; b["y"] += uy * push
                moved = True
        # 本当の場所から離れすぎない（離すと、どの点か分からなくなる）
        for q in pins:
            dx, dy = q["x"] - q["ax"], q["y"] - q["ay"]
            far = math.hypot(dx, dy)
            cap = PIN_R * 3.2
            if far > cap:
                q["x"] = q["ax"] + dx / far * cap
                q["y"] = q["ay"] + dy / far * cap
            # 枠の外に出さない
            q["x"] = min(max(q["x"], PIN_R + 4), 1000 - PIN_R - 4)
            q["y"] = min(max(q["y"], PIN_R + 4), h - PIN_R - 4)
        if not moved:
            break
    for q in pins:
        q["x"], q["y"] = round(q["x"], 1), round(q["y"], 1)


def main() -> None:
    geo = json.load(open(os.path.join(SRC, "geo.json"), encoding="utf-8"))
    spots = []
    for f in sorted(os.listdir(SRC)):
        if not f.endswith(".json") or f in ("index.json", "map.json", "geo.json", "citymaps.json"):
            continue
        d = json.load(open(os.path.join(SRC, f), encoding="utf-8"))
        spots += d.get("spots", [])

    print("土台の形を取る")
    shapes = fetch_shapes()

    out = {}
    for city in BASE:
        here = [s for s in spots if s.get("city") == city and s["id"] in geo]
        if not here:
            continue
        pts = [(geo[s["id"]]["lat"], geo[s["id"]]["lon"]) for s in here]
        # 中心は、点の**中央値**。1つだけ遠いものに引っぱられない
        clat = sorted(p[0] for p in pts)[len(pts) // 2]
        clon = sorted(p[1] for p in pts)[len(pts) // 2]

        near = [s for s in here if km((clat, clon), (geo[s["id"]]["lat"], geo[s["id"]]["lon"])) <= NEAR_KM]
        far = [s for s in here if s not in near]
        base_pts = [(geo[s["id"]]["lat"], geo[s["id"]]["lon"]) for s in (near or here)]

        mx = [merc(*p) for p in base_pts]
        x0, x1 = min(p[0] for p in mx), max(p[0] for p in mx)
        y0, y1 = min(p[1] for p in mx), max(p[1] for p in mx)
        # 点が1つだけ／一直線のときに潰れないよう、最低の広さを持たせる
        minw = 0.012
        if x1 - x0 < minw:
            c = (x0 + x1) / 2; x0, x1 = c - minw / 2, c + minw / 2
        if y1 - y0 < minw * 0.6:
            c = (y0 + y1) / 2; y0, y1 = c - minw * 0.3, c + minw * 0.3
        pad = max(x1 - x0, y1 - y0) * PAD
        x0, x1, y0, y1 = x0 - pad, x1 + pad, y0 - pad, y1 + pad
        w, h = x1 - x0, y1 - y0

        # 1000 幅に正規化。y は上下をひっくり返す（SVG は下が正）
        W = 1000.0
        H = round(W * h / w, 1)
        def to(p):
            mxy = merc(*p)
            return (round((mxy[0] - x0) / w * W, 1), round((y1 - mxy[1]) / h * H, 1))

        layers = {}
        for kind, qs in BASE[city].items():
            paths = []
            for q in qs:
                for ring in shapes.get(f"{kind}|{q}", []):
                    # **窓と同じ座標系に直してから切る。** GeoJSON は [経度, 緯度]
                    # のままなので、メルカトルの窓と比べると緯度がずれて、
                    # 全部が「窓の外」になり1本も残らない（実際にそうなった）。
                    mr = [merc(lat, lon) for lon, lat in ring]
                    r = crop(mr, (x0, y0, x1, y1))
                    if len(r) < 3:
                        continue
                    d = "M" + " ".join(
                        f"{round((mxx - x0) / w * W, 1)},{round((y1 - myy) / h * H, 1)}"
                        for mxx, myy in r)
                    paths.append(d + "Z")
            if paths:
                layers[kind] = paths

        pins = []
        for i, s in enumerate(near, 1):
            g = geo[s["id"]]
            x, y = to((g["lat"], g["lon"]))
            # ax, ay は**本当の場所**。x, y はぶつからないようにずらしたあとの丸の位置
            pins.append({"id": s["id"], "n": i, "x": x, "y": y, "ax": x, "ay": y,
                         "cat": s.get("cat", "see"), "t": s.get("title", "")})
        spread(pins, H)

        def compass(a, b):
            dy, dx = b[0] - a[0], b[1] - a[1]
            ang = (math.degrees(math.atan2(dx, dy)) + 360) % 360
            return ["北", "北東", "東", "南東", "南", "南西", "西", "北西"][round(ang / 45) % 8]

        out[city] = {
            "w": W, "h": H, "layers": layers, "pins": pins,
            # 窓に入らなかったもの。**消さずに、距離と方角で言う**
            "far": [{"id": s["id"], "cat": s.get("cat", "see"), "t": s.get("title", ""),
                     "km": round(km((clat, clon), (geo[s["id"]]["lat"], geo[s["id"]]["lon"])), 1),
                     "dir": compass((clat, clon), (geo[s["id"]]["lat"], geo[s["id"]]["lon"]))}
                    for s in far],
            # 窓の実寸（km）。縮尺の棒を出すのに要る
            "km": round(km((clat, x0 + (clat * 0)), (clat, x1)) if False else
                        km((clat, x0), (clat, x1)), 2),
        }
        print(f'  {city:8s} {W:.0f}x{H:<6.0f} ピン{len(pins):2d} ひと足{len(far):2d} '
              f'土台{sum(len(v) for v in layers.values())}本 幅{out[city]["km"]}km')

    json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"書いた: {OUT}  {os.path.getsize(OUT)//1024}KB")


if __name__ == "__main__":
    main()
