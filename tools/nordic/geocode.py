#!/usr/bin/env python3
"""見どころに、本物の緯度経度を付ける。

## なぜ

日ページの「〇〇で見たいもの」に、**その街を拡大した地図**を出したい
（あやと・2026-09-09「首都を拡大した首都の中がわかるような地図」）。
そのためには1件ずつの場所が要る。国の地図を5倍に拡大しても、街の中は
何も分からない。

## どこから取るか

OpenStreetMap の Nominatim。この箱から届く（Overpass は届かない）。
`nordic/*.json` の `local`（現地語の名前）がそのまま鍵になる。

## **1件目をそのまま信じない**

`Wisła, Warszawa` を引くと、ヴィスワ川ではなく**同じ名前の映画館**が
1件目に来る。名前だけで引くと、こういうものが黙って混ざる。

- 街の中心から離れすぎたもの（既定 60km）は捨てる
- 種類（`class`/`type`）を見て、建物・観光・自然のどれかに寄せる
- **選んだ理由と距離を全部レポートに出す。** 目で見て確かめるため

出すもの: `site/content/nordic/geo.json`（id → {lat, lon, 種類, 距離}）と、
`tools/nordic/geo-report.txt`（人が読んで確かめる用）
"""

import json
import math
import re
import os
import sys
import time
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, "site", "content", "nordic")
OUT = os.path.join(SRC, "geo.json")
REPORT = os.path.join(ROOT, "tools", "nordic", "geo-report.txt")

UA = "ayato-island/1.0 (https://live-streaming-d3cac.web.app; nordic city maps)"
API = "https://nominatim.openstreetmap.org/search"

# 街の中心。**ここからの距離で、明らかに違うものを落とす。**
#
# **どの街を焼くかは、ここで決めない。** 旅程（`nordic.ts` の ROUTE / DAYS）
# から導く。あやとの言葉（2026-09-09）:
#
#   シャウレイ・ルンダーレなんか、行かなくないか？？？
#   なぜそれの地図が必要と言う話になってる？？
#
# 手で街の表を作って、行く街と「寄るかもしれない街」を混ぜたのが原因。
# `nordic.ts` には「街の名前を手で並べた表をもう1つ作らない」と書いてあった
# のに、そのまま踏んだ（`docs/island-misses.md` #4）。
#
# 下の表は**中心の座標だけ**を持つ。行くかどうかは `visit_cities()` が決める。
CENTER = {
    "カトヴィツェ": ("Katowice, Poland", 50.2599, 19.0216),
    "ワルシャワ": ("Warszawa, Poland", 52.2297, 21.0122),
    "ビャウィストク": ("Białystok, Poland", 53.1325, 23.1688),
    "ヴィリニュス": ("Vilnius, Lithuania", 54.6872, 25.2797),
    "リガ": ("Rīga, Latvia", 56.9496, 24.1052),
    "タリン": ("Tallinn, Estonia", 59.4370, 24.7536),
    "ヘルシンキ": ("Helsinki, Finland", 60.1699, 24.9384),
    "ストックホルム": ("Stockholm, Sweden", 59.3293, 18.0686),
    # 寄るかどうかがまだ決まっていない街。**既定では焼かない。**
    "シャウレイ": ("Šiauliai, Lithuania", 55.9333, 23.3167),
    "トラカイ": ("Trakai, Lithuania", 54.6383, 24.9346),
    "ルンダーレ": ("Bauska, Latvia", 56.4111, 24.1889),
    "パルヌ": ("Pärnu, Estonia", 58.3859, 24.4971),
}

NORDIC_TS = os.path.join(ROOT, "site", "content", "nordic.ts")


def visit_cities():
    """**行くと決まっている街だけ**を、旅程から拾う。

    `nordic.ts` の `VISIT_CITIES` と同じ作り（ROUTE の from / to / stay と
    DAYS の city / stay）。`maybe`（寄るかもしれない街）は入れない。

    TypeScript を Python から読めないので字面で拾っているが、**表は増やさない。**
    元が変われば、ここも一緒に変わる。
    """
    s = open(NORDIC_TS, encoding="utf-8").read()
    go, maybe = set(), set()
    for m in re.finditer(r'\b(?:from|to|stay|city):\s*"([^"]+)"', s):
        go.add(m.group(1).split("（")[0].split("(")[0].strip())
    for m in re.finditer(r"maybe:\s*\[([^\]]*)\]", s):
        for c in re.findall(r'"([^"]+)"', m.group(1)):
            maybe.add(c.strip())
    return go - maybe, maybe


# 拾ってよい種類。ここに無いものは「あやしい」に回して、目で見る。
GOOD = {
    # 見る
    "attraction", "museum", "gallery", "park", "garden", "castle", "palace",
    "church", "cathedral", "chapel", "monastery", "monument", "memorial",
    "artwork", "viewpoint", "tower", "bridge", "ruins", "fort", "fortress",
    "city_gate", "theatre", "opera", "library", "townhall", "stadium",
    "arena", "planetarium", "aquarium", "zoo", "theme_park", "windmill",
    "lighthouse", "observatory", "university", "place_of_worship", "museum_ship",
    # 広場・通り・地区（街の中の「場所」として正しい）
    "square", "pedestrian", "marketplace", "administrative", "suburb",
    "neighbourhood", "quarter", "city_block", "residential", "living_street",
    "island", "islet", "beach", "bay", "water", "river", "lake", "canal",
    # 食べる・飲む
    "restaurant", "cafe", "bar", "pub", "biergarten", "bakery", "fast_food",
    "ice_cream", "food_court", "confectionery", "deli", "brewery", "winery",
    # 買う
    "supermarket", "mall", "department_store", "shop", "gift", "books",
    "clothes", "boutique", "interior_decoration", "furniture", "houseware",
    "jewelry", "art", "antiques", "second_hand", "variety_store", "retail",
    "convenience", "greengrocer", "wholesale",
    # やる
    "sauna", "swimming_pool", "spa", "water_park", "hotel", "hostel",
    "station", "ferry_terminal", "harbour", "pier", "attraction_park",
    # そのほか、実在の建物として妥当なもの
    "yes", "house", "building", "public_building", "civic", "commercial",
    "hospital", "company",
}



def km(a_lat, a_lon, b_lat, b_lon):
    """2点の距離(km)。細かい精度は要らないので球で足りる。"""
    r = 6371.0
    p = math.pi / 180
    dla = (b_lat - a_lat) * p
    dlo = (b_lon - a_lon) * p
    x = (math.sin(dla / 2) ** 2
         + math.cos(a_lat * p) * math.cos(b_lat * p) * math.sin(dlo / 2) ** 2)
    return 2 * r * math.asin(math.sqrt(x))


# **食べもの・買いもので、場所ではないもの。** ピンを打たない。
#   Cepelinai（料理名）を引くと、同じ名前の店や別の街の何かに当たる。
#   一覧には出すが、地図には出さない。どこで食べるかは本文に書いてある。
NOT_A_PLACE = {
    "Cepelinai", "Kibinai", "Šaltibarščiai", "Lohikeitto", "Korvapuusti",
    "Rīgas Melnais balzams", "Latvijas lini", "Latviešu cimdi",
    "Pelēkie zirņi ar speķi", "Kanelbulle", "Surströmming", "Verivorst",
    "Kama", "Ruisleipä", "Karjalanpiirakka", "Salmiakki", "Mustamakkara",
    "Vodka", "Pierogi", "Żurek", "Oscypek", "Bigos", "Zapiekanka",
    # 体験そのもの（乗る・食べる）で、建物がない
    "Skrydis oro balionu", "Oro balionai virš Vilniaus",
    "Köttbullar med lingonsylt", "Fika", "Allemansrätten",
    "Šakotis", "Juodoji duona", "Rupjmaize", "Kvass", "Leivonnainen",
}


# **名前だけでは当たらないもの。** 引く言葉を、こちらで決める。
#
# 中身は3種類ある。
#   1. 言い方が違うだけ（Gedimino pilies bokštas → Gediminas Castle Tower）
#   2. 通りの名前に「tänav（通り）」が付いていて当たらない
#   3. **お祭りそのものには座標が無いので、開かれる広場に置く。**
#      クリスマス市は毎年ラエコヤ広場に立つので、その広場を指す。
#      「そこで開かれる」ことは本文が言うので、点は場所を指していればいい。
ALIAS = {
    "Rüütli tänav": "Rüütli, Pärnu, Estonia",
    "Müürivahe tänav": "Müürivahe, Tallinn, Estonia",
    "Tallinna jõuluturg": "Raekoja plats, Tallinn, Estonia",
    "Hietalahden kirpputori": "Hietalahdentori, Helsinki, Finland",
    "Rundāles pils": "Rundale Palace, Latvia",
    # 店そのものは OSM に無い。**建物の番地で置く**（Kungu iela 8）
    "Restorāns Milda": "Kungu iela 8, Riga",
    "Gedimino pilies bokštas": "Gedimino pilis, Vilnius",
    # 市が立つのは大聖堂広場。広場を指す
    "Kaziuko mugė": "Cathedral Square, Vilnius, Lithuania",
    "Tunnelbanan konst": "T-Centralen, Stockholm, Sweden",
    "Rīgas Centrāltirgus": "Centrāltirgus, Riga",
    "Užupio Respublika": "Užupis, Vilnius, Lithuania",
}


def clean(local: str) -> str:
    """引くための名前にそろえる。**元のデータは触らない。**

    `local` は人が読むための欄なので、いろいろ混ざっている。
    そのまま投げると、半分が見つからない（実測 82件中28件）。

      Tallinna vanalinn（タリン旧市街）  → 全角かっこの中は読みがな
      Kadrioru loss / Kumu             → スラッシュは「AかB」
      Vanha kauppahalli (Old Market    → 元の字が途中で切れている
    """
    t = local.split("（")[0].split("(")[0]
    t = t.split(" / ")[0].split("／")[0]
    return t.strip(" 　-–—/")


def ask(q, limit=5, poly=False):
    """Nominatim に1回聞く。**1秒に1回まで**（向こうの決まり）。"""
    args = {"q": q, "format": "jsonv2", "limit": str(limit),
            "accept-language": "en"}
    if poly:
        args["polygon_geojson"] = "1"
    url = API + "?" + urllib.parse.urlencode(args)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=45) as r:
                return json.loads(r.read().decode())
        except Exception as e:
            if attempt == 2:
                print(f"    取れない: {e}", file=sys.stderr)
                return []
            time.sleep(3 * (attempt + 1))
    return []


def pick(rows, clat, clon, far):
    """候補から1つ選ぶ。**選べなければ選ばない。**"""
    best = None
    for r in rows:
        try:
            lat, lon = float(r["lat"]), float(r["lon"])
        except (KeyError, ValueError):
            continue
        d = km(clat, clon, lat, lon)
        if d > far:
            continue
        t = r.get("type", "")
        score = (0 if t in GOOD else 1, d)
        if best is None or score < best[0]:
            best = (score, r, lat, lon, d, t)
    return best


def main() -> None:
    only = sys.argv[1] if len(sys.argv) > 1 else ""
    go, maybe = visit_cities()
    # 焼くのは行く街だけ。**寄るかもしれない街は、言われるまで焼かない。**
    use = {c: v for c, v in CENTER.items() if c in go}
    skipped = sorted(set(CENTER) - set(use))
    print(f"行く街 {len(use)}: {'・'.join(use)}")
    if skipped:
        print(f"焼かない（寄るかもしれない街）: {'・'.join(skipped)}")
    spots = []
    for f in sorted(os.listdir(SRC)):
        if not f.endswith(".json") or f in ("index.json", "map.json", "geo.json"):
            continue
        d = json.load(open(os.path.join(SRC, f), encoding="utf-8"))
        for s in d.get("spots", []):
            if s.get("city") in use and s.get("local"):
                spots.append(s)
    if only:
        spots = [s for s in spots if s["city"] == only]

    print(f"引く見どころ {len(spots)}件 / 街 {len(set(s['city'] for s in spots))}")
    out, lines, odd = {}, [], 0
    for i, s in enumerate(spots, 1):
        cq, clat, clon = use[s["city"]]
        name = clean(s["local"])
        if not name or name in NOT_A_PLACE:
            lines.append(f'- {s["city"]:8s} {s["title"][:26]:28s} {s["local"][:30]:32s} 場所ではない（ピンを打たない）')
            continue
        q = ALIAS.get(name) or f'{name}, {cq}'
        rows = ask(q)
        time.sleep(1.1)
        got = pick(rows, clat, clon, 60.0)
        if not got:
            lines.append(f'× {s["city"]:8s} {s["title"][:26]:28s} {name[:30]:32s} 見つからない')
            odd += 1
            continue
        _, r, lat, lon, d, t = got
        sure = t in GOOD
        if not sure:
            odd += 1
        out[s["id"]] = {"lat": round(lat, 6), "lon": round(lon, 6),
                        "type": t, "km": round(d, 2)}
        lines.append(
            f'{"○" if sure else "?"} {s["city"]:8s} {s["title"][:26]:28s} '
            f'{name[:30]:32s} {t:16s} 中心から{d:5.1f}km'
        )
        if i % 10 == 0:
            print(f"  {i}/{len(spots)}")

    json.dump(out, open(OUT, "w", encoding="utf-8"),
              ensure_ascii=False, indent=0, sort_keys=True)
    with open(REPORT, "w", encoding="utf-8") as fp:
        fp.write("\n".join(lines) + "\n")
    print(f"書いた: {OUT}（{len(out)}件）")
    print(f"目で見る: {REPORT}  ← ? と × が {odd}件")


if __name__ == "__main__":
    main()
