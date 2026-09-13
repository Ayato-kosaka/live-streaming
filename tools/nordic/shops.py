#!/usr/bin/env python3
"""街の「お土産と雑貨」を OpenStreetMap から焼く。

## なぜ作ったか

あやとの言葉（2026-09-13・ビャウィストクにて）:

> ビャウィストク Białystok つきました。お土産とか雑貨とか行きたかったけど、
> あやと島みても見つからず行けなかった

9/6 の企画会議で @まこも-z3i さんも言っていた（`docs/island-meeting-nordic.md`）:

> ポ−ランドに行ったらアウシュビッツは行きたいな! あとは雑貨とか家具もみたい

**掲示板の付箋に書き留めただけで、現地で使える形にしていなかった。**
ここはその埋め合わせ。**旅の最中に、スマホで開いて、店にたどり着くための表。**

## どの街を焼くか

`geocode.visit_cities()`（＝`nordic.ts` の `VISIT_CITIES` と同じ導出）と
`geocode.CENTER` の両方にある街だけ。**街の名簿を手で作らない**
（`docs/island-misses.md` #4）。寄るか決まっていない街（トラカイ・シャウレイ・
ルンダーレ・パルヌ）は焼かない。

## どの `shop=` を拾うか

**実際に返ってきた中身を1件ずつ読んでから決めた**（`docs/island-misses.md` #78）。
ビャウィストク 2.5km で 1,111件を落として、名前を全部目で見た結果:

| 拾う | 理由 |
| --- | --- |
| `gift` | Cepelia（ポーランドの民芸品店）、Pod Aniołami。**ここが本命** |
| `souvenir` `art` `antiques` `pottery` | みやげ・工芸・骨董・焼きもの |
| `craft=handicraft` ほか手仕事 | Pył-Ceramic studio のような工房 |
| `variety_store` `interior_decoration` `houseware` `craft`(shop) | home&you、à Tab、Homla。**可愛い雑貨はここ** |
| `honey` `confectionery` `chocolate` `deli` `cheese` `farm` `spices` | Podlaska Pasieka（ポドラシェの蜂蜜）、Krakowski Kredens。**食べるおみやげ** |
| `amenity=marketplace` | 市場。土地のものがいちばん集まる |
| `jewelry` のうち琥珀 | バルト三国の琥珀。名前に琥珀の語がある店だけ |

| 落とす | 理由 |
| --- | --- |
| `clothes`（100軒） | H&M・Cropp・Mohito。チェーンの服屋で、雑貨ではない |
| `books`（11軒） | Empik・Dom Książki。本屋であって雑貨ではない |
| `alcohol`（12軒） | Monopolowy・Chorten。酒販店 |
| `stationery` `toys` `candles` `second_hand` `charity` | チェーンか、土地と関係がないもの |
| `jewelry` の残り | Apart・W.KRUK。金のチェーン店 |

**数が多いことは良いことではない。** 28軒を「取れた」と言うのは測定であって、
それが「可愛い雑貨」かどうかは中身を見ないと分からない。

## 0 と「読めなかった」を分ける

Overpass は混むと**中身の空いた答え**を返す（`docs/island-misses.md` #79）。
0軒と失敗を同じ扱いにすると、あやとは「この街には無い」と思って探しに行かない。
だから焼くほうも `ok` / `fail` を持って出す。画面はそれで言葉を変える。

## 公共の無料サーバなので、連打しない

控えを順に試して、1回ごとに間を空ける。全部だめならその街は `fail` にして、
**次の街へ進む**（1つのために全部を止めない）。落としたものは
`tools/nordic/.osmcache/shops-<街>.json` に置いて使い回す。
**選び方を変えるたびに向こうへ投げ直さない**ために、落とすのは広く
（`shop=*` と `craft=*` と市場の全部）、絞るのはこちら側でやる。

## 出すもの

`site/content/nordic/shops.json`。**同じものを2度流しても同じ結果になる**
（日付を1つも焼かない。並べ替えの鍵も全部データから作る）。

    python3 tools/nordic/shops.py              # キャッシュがあれば使う
    python3 tools/nordic/shops.py ヴィリニュス     # 街を指定
    python3 tools/nordic/shops.py --force      # 落とし直す

出典の表示は ODbL の義務。`docs/nordic-shops.md` と画面の両方にある。
"""

import json
import os
import re
import subprocess
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
SRC = os.path.join(ROOT, "site", "content", "nordic")
OUT = os.path.join(SRC, "shops.json")
CACHE = os.path.join(HERE, ".osmcache")

sys.path.insert(0, HERE)
import geocode as G  # noqa: E402  行く街の導出と距離計算を借りる

UA = "ayato-island/1.0 (https://live-streaming-d3cac.web.app; nordic souvenir shops)"

# 控え。**上から順に試す。** 2026-09-13 に叩いた結果を添えてある
# （その日に生きていた順ではなく、混み具合は日で入れ替わるので順は目安）。
MIRRORS = [
    "https://overpass.openstreetmap.fr/api/interpreter",     # 2.0秒で返った
    "https://overpass.private.coffee/api/interpreter",       # 混むと 120秒黙る
    "https://overpass.osm.ch/api/interpreter",               # 生きていた
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",         # 50秒返らない日がある
    "https://overpass-api.de/api/interpreter",               # too busy が多い
]

# 1回に待つ秒数。**長く待つほど、次の控えに移るのが遅れる。**
# private.coffee は混んでいると 120秒**まるごと**黙ってから切れる。
# 6つ並べてあるので、1つに賭けず早めに次へ移る。
WAIT = 60

# 街の中心から何メートルまで見るか。
#
# 2.5km は「歩いて行ける」の外縁。ビャウィストクで 1,111件、そこから残るのが
# 30件ほど。これより広げると、車でしか行けない郊外のショッピングモールが混ざる。
RADIUS = 2500

# 1つの街で、種類ごとに出す数の上限。理由は `pick()` の中に書いてある。
PER_KIND = 20

# ─────────────────────────────────────────────────────────────
# 何を「お土産・雑貨」とみなすか
#
# **種類を増やすときは、必ずキャッシュを読み直して名前を目で見てから。**
# 名前を見ずに種類だけで足すと、チェーンの服屋が 100軒まぎれ込む。
# ─────────────────────────────────────────────────────────────

# みやげ・工芸。その土地のものが置いてある店
SHOP_GIFT = {
    "gift": "みやげもの",
    "souvenir": "みやげもの",
    "art": "絵と工芸",
    "antiques": "骨董",
    "pottery": "焼きもの",
    "ceramics": "焼きもの",
    "glass": "ガラス",
    "musical_instrument": "楽器",
}

# 雑貨・インテリア。可愛いものを見に行く店
SHOP_ZAKKA = {
    "variety_store": "雑貨",
    "interior_decoration": "インテリア雑貨",
    "houseware": "台所と暮らしの道具",
    "kitchen": "台所の道具",
    "craft": "手芸と画材",
    "fabric": "布",
    "bag": "かばん",
}

# 食べるおみやげ。持って帰れるもの
SHOP_FOOD = {
    "honey": "はちみつ",
    "confectionery": "お菓子",
    "chocolate": "チョコレート",
    "deli": "土地の食べもの",
    "cheese": "チーズ",
    "farm": "農家の直売",
    "spices": "香辛料",
    "tea": "お茶",
}
# `tea` だけは扱いが違う。**チェーンの紅茶屋は落とす**（下の `TEA_SKIP`）。
TEA_SKIP = re.compile(r"czas na herbat|teavana|tchibo|lipton", re.I)

# 手仕事の工房（`craft=*`）。**修理屋と建築屋は入れない。**
# 鍵屋・電気屋・窓屋が混ざると、一覧が町の職人名簿になる。
CRAFT_OK = {
    "handicraft": "手仕事の工房",
    "pottery": "焼きものの工房",
    "basket_maker": "かごの工房",
    "glassblower": "ガラスの工房",
    # `jeweller` `goldsmith` は入れない。ワルシャワの中心 0.5km で
    # Ofir・Gold Shop・Batzgold の3軒が挙がったが、どれも金を売り買いする店で、
    # 「その土地のお土産」ではない。バルトの琥珀は下の `AMBER` で別に拾う。
    "weaver": "織りの工房",
    "candlemaker": "ろうそくの工房",
    "leather": "革の工房",
    "bookbinder": "製本の工房",
    "woodturner": "木工の工房",
    "carpenter": None,   # 家の工事。入れない
    "shoemaker": None,
    "saddler": None,
}

# 琥珀。**バルト三国のお土産の筆頭**なので、宝飾店のうちこれだけ拾う。
# 現地語（gintaras / dzintars / bursztyn）と英語の両方を見る。
AMBER = re.compile(r"gintar|dzintar|bursztyn|amber|merav|amberton", re.I)

# 名前で落とすもの。**大きなチェーンは「その土地の」ではない。**
CHAIN = re.compile(
    r"^(pepco|action|tedi|jysk|ikea|flying tiger|søstrene|sostrene|rusta|clas ohlson|"
    r"dollarstore|normal|kik|tk maxx|hm home|h&m home)\b",
    re.I,
)

# 卸と印刷。**旅の人が入る店ではない。**
# ビャウィストクで Emitex（`hurtownia tkanin`＝生地の卸）と FotoDruk.pl
# （`Fototapety, Obrazy, Plakaty`＝壁紙の印刷）が雑貨に紛れていた。
# タグは `shop=fabric` `shop=interior_decoration` なので、**説明の字で落とす。**
NOT_SHOP = re.compile(
    r"hurtowni|wholesale|оптов|fotodruk|foto ?druk|fototapet|drukarni|printing", re.I)


def dist_km(clat, clon, lat, lon):
    return G.km(clat, clon, lat, lon)


def _post(url, data, timeout=WAIT):
    """curl で POST する。**urllib はタイムアウトが効かずに固まることがある**
    （`osmfetch.py` に経緯）。`--max-time` は全体に効くので必ず戻ってくる。"""
    with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False) as f:
        f.write(data)
        qf = f.name
    try:
        r = subprocess.run(
            ["curl", "-sS", "--compressed", "--max-time", str(timeout),
             "-A", UA, "--data-urlencode", f"data@{qf}", url],
            capture_output=True, timeout=timeout + 20)
        if r.returncode != 0:
            raise RuntimeError(r.stderr.decode("utf-8", "replace")[:160] or "curl 失敗")
        return r.stdout
    finally:
        os.unlink(qf)


def query(q, why=""):
    """Overpass に投げる。**JSON が返らなかったら控えへ移る。**

    混んでいるときは状態コード 200 のまま HTML が返る（`Dispatcher_Client
    ::request_read_and_idx::timeout`）ので、**中身が JSON かどうかで見る。**

    全部の控えがだめなら `None` を返す。**空の一覧を返さない。**
    0軒と「読めなかった」を同じ形にすると、画面が嘘をつく（#79）。
    """
    last = ""
    for i, url in enumerate(MIRRORS):
        try:
            raw = _post(url, q)
            if raw[:1] == b"{":
                host = url.split("/")[2]
                print(f"      {host} が返した", file=sys.stderr)
                return json.loads(raw.decode())
            last = raw.decode("utf-8", "replace").replace("\n", " ")
            last = re.sub(r"<[^>]+>", " ", last)
            last = re.sub(r"\s+", " ", last)[:140]
        except Exception as e:  # noqa: BLE001  相手のサーバなので何が来ても次へ
            last = f"{type(e).__name__}: {e}"[:140]
        print(f"      {url.split('/')[2]} だめ（{why}）  {last}", file=sys.stderr)
        # 相手は公共の無料サーバ。**連打しない。**
        if i < len(MIRRORS) - 1:
            time.sleep(6)
    print(f"      どの控えも返さなかった（{why}）", file=sys.stderr)
    return None


def fetch_city(city, clat, clon, force=False):
    """1つの街ぶんを落とす。**広く落として、絞るのはこちら側。**

    返すのは `(elements, ok)`。`ok=False` は「読めなかった」で、0軒ではない。
    """
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, f"shops-{city}.json")
    if os.path.exists(path) and not force:
        have = json.load(open(path, encoding="utf-8"))
        if have.get("radius", 0) >= RADIUS:
            print(f"    キャッシュ {len(have['elements'])}件")
            return have["elements"], True
        print("    前より広い窓を頼まれた。取り直す")
    q = (
        f"[out:json][timeout:120];\n(\n"
        f'  nwr["shop"](around:{RADIUS},{clat},{clon});\n'
        f'  nwr["craft"](around:{RADIUS},{clat},{clon});\n'
        f'  nwr["amenity"="marketplace"](around:{RADIUS},{clat},{clon});\n'
        f");\nout center tags;"
    )
    r = query(q, why=city)
    if r is None:
        return [], False
    els = r.get("elements", [])
    json.dump({"radius": RADIUS, "center": [clat, clon], "elements": els},
              open(path, "w", encoding="utf-8"), ensure_ascii=False)
    print(f"    落とした {len(els)}件")
    time.sleep(4)
    return els, True


# ─────────────────────────────────────────────────────────────
# 選り分け
# ─────────────────────────────────────────────────────────────
def classify(tags):
    """タグ1件を「みやげ / 雑貨 / 食べもの / 市場」に分ける。

    当てはまらなければ `None`。**迷ったら落とす。**
    一覧に混ざった1軒の外れは、30軒ぶんの信用を削る。
    """
    name = (tags.get("name") or "").strip()
    shop = tags.get("shop")
    craft = tags.get("craft")

    if tags.get("wholesale") == "yes" or NOT_SHOP.search(
            name + " " + (tags.get("description") or "")):
        return None

    if tags.get("amenity") == "marketplace":
        return "market", "市場"

    if shop in SHOP_GIFT:
        return "gift", SHOP_GIFT[shop]
    if shop in SHOP_ZAKKA:
        if CHAIN.match(name):
            return None
        return "zakka", SHOP_ZAKKA[shop]
    if shop in SHOP_FOOD:
        if shop == "tea" and TEA_SKIP.search(name):
            return None
        return "food", SHOP_FOOD[shop]
    if shop == "jewelry" and AMBER.search(name + " " + (tags.get("description") or "")):
        return "gift", "琥珀"
    if craft and CRAFT_OK.get(craft):
        return "gift", CRAFT_OK[craft]
    return None


def latlon(e):
    if e.get("lat") is not None:
        return e["lat"], e["lon"]
    c = e.get("center")
    if c:
        return c["lat"], c["lon"]
    return None


def addr(tags):
    """住所。**通りと番地だけ。** 郵便番号と国名は、歩く人には要らない。"""
    st = tags.get("addr:street")
    no = tags.get("addr:housenumber")
    if st and no:
        return f"{st} {no}"
    return st or ""


def pick(city, clat, clon, els):
    """その街の一覧を作る。**名前の無い店は出さない。**

    看板を探すのは現地の綴りなので、名前が無ければ探しようがない。
    OSM には `shop=yes` だけ置かれた点がたくさんある。
    """
    out, seen = [], set()
    for e in els:
        tags = e.get("tags") or {}
        name = (tags.get("name") or "").strip()
        if not name:
            continue
        c = classify(tags)
        if not c:
            continue
        pos = latlon(e)
        if not pos:
            continue
        lat, lon = pos
        # 同じ店が node と way の両方に置かれていることがある。名前と座標で寄せる
        k = (name.lower(), round(lat, 4), round(lon, 4))
        if k in seen:
            continue
        seen.add(k)
        kind, label = c
        out.append({
            "id": f"{e['type'][0]}{e['id']}",
            "name": name,
            "kind": kind,
            "what": label,
            "lat": round(lat, 6),
            "lon": round(lon, 6),
            "km": round(dist_km(clat, clon, lat, lon), 2),
            "at": addr(tags),
            "open": tags.get("opening_hours", ""),
        })
    # 並びは「種類 → 中心から近い順 → 名前」。**日付も乱数も使わない**ので、
    # 同じキャッシュから何度焼いても同じ順になる。
    order = {"gift": 0, "zakka": 1, "food": 2, "market": 3}
    out.sort(key=lambda s: (order[s["kind"]], s["km"], s["name"], s["id"]))

    # 種類ごとに、**近いほうから 20軒まで。**
    #
    # ストックホルムは 372軒、ワルシャワは 280軒あった。全部載せると、
    # 一覧ではなく名簿になる。**数が多いことは良いことではない。**
    # 旅の途中に1日で歩けるのはせいぜい数軒で、その数軒は必ず中心の近くにある
    # （ストックホルムの上位20軒はぜんぶ旧市街の 0.6km 以内）。
    # ビャウィストクのような小さい街は 20軒に届かないので、**全部残る。**
    kept, seen_kind = [], {}
    for s in out:
        k = s["kind"]
        seen_kind[k] = seen_kind.get(k, 0) + 1
        if seen_kind[k] <= PER_KIND:
            kept.append(s)
    return kept


# 街のある時間帯。**「いま開いているか」は画面が出てから数える**ので、
# ここでは地名だけを渡す（`docs/island-misses.md`・静的書き出しの戒め）。
TZ = {
    "カトヴィツェ": "Europe/Warsaw",
    "ワルシャワ": "Europe/Warsaw",
    "ビャウィストク": "Europe/Warsaw",
    "ヴィリニュス": "Europe/Vilnius",
    "リガ": "Europe/Riga",
    "タリン": "Europe/Tallinn",
    "ヘルシンキ": "Europe/Helsinki",
    "ストックホルム": "Europe/Stockholm",
}


def main():
    only = [a for a in sys.argv[1:] if not a.startswith("-")]
    force = "--force" in sys.argv

    go, _maybe = G.visit_cities()
    cities = [c for c in G.CENTER if c in go]
    if only:
        cities = [c for c in cities if c in only]
    if not cities:
        print("焼く街がない。旅程（nordic.ts）と CENTER を見てください", file=sys.stderr)
        return 1

    have = {}
    if os.path.exists(OUT):
        have = json.load(open(OUT, encoding="utf-8")).get("cities", {})

    cities_out = dict(have)
    for city in cities:
        _q, clat, clon = G.CENTER[city]
        print(f"  {city}")
        els, ok = fetch_city(city, clat, clon, force=force)
        if not ok:
            # **前に取れていたものを消さない。** 今日サーバが混んでいるだけで
            # 店が消えたわけではない。読めたときの表をそのまま残す。
            if city in cities_out and cities_out[city].get("ok"):
                print("    読めなかった。前に読めたぶんを残す")
                continue
            cities_out[city] = {"ok": False, "tz": TZ.get(city, "Europe/Warsaw"),
                                "center": [clat, clon], "shops": []}
            print("    読めなかった")
            continue
        shops = pick(city, clat, clon, els)
        cities_out[city] = {
            "ok": True,
            "tz": TZ.get(city, "Europe/Warsaw"),
            "center": [round(clat, 6), round(clon, 6)],
            "shops": shops,
        }
        n = {}
        for s in shops:
            n[s["kind"]] = n.get(s["kind"], 0) + 1
        print(f"    {len(shops)}軒  " + " ".join(f"{k}:{v}" for k, v in sorted(n.items())))

    out = {
        # ODbL の表示義務。**消さない。**
        "credit": "© OpenStreetMap contributors",
        "license": "https://www.openstreetmap.org/copyright",
        "radius": RADIUS,
        "cities": {c: cities_out[c] for c in sorted(cities_out)},
    }
    json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1, sort_keys=False)
    print(f"\n書いた {OUT}  {os.path.getsize(OUT)//1024}KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
