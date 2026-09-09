#!/usr/bin/env python3
"""街の地図の元データを OpenStreetMap から落としてくる。

## なぜ Overpass なのか

前の地図には**道路が1本も無かった**。あやとの言葉（2026-09-09）:

> なにこのカスみたいな地図。（…）誰がワルシャワってわかるねん？

道路が無いものは地図ではない。Nominatim は「名前で1つの形を引く」道具なので、
街じゅうの道を取ることはできない。道の一本ずつが要るなら Overpass しかない。

## 落ちていたのは本家だけだった

`https://overpass-api.de` はこの箱から 000 が返る。**それを見て「Overpass に
届かない」と決めつけたのが前回の失敗。** ミラーは生きている:

    https://overpass.kumi.systems/api/interpreter          200
    https://maps.mail.ru/osm/tools/overpass/api/interpreter 504 になる日がある

`kumi` を既定にして、混んでいるときは待って掛け直す（`Dispatcher_Client
::request_read_and_idx::timeout` が JSON ではなく HTML で返ってくる）。

## 広く投げない

2km 四方でも 6MB 返る。窓が 5km あるときは **2km 四方のタイルに割って**
1枚ずつ投げる。1リクエストごとに間を空ける（相手のサーバなので）。

落としたものは `tools/nordic/.osmcache/` に置いて使い回す。生データは
数十MB あるのでリポジトリには入れない（`.gitignore`）。
"""

import gzip
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, ".osmcache")

MIRRORS = [
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]
UA = "ayato-island/1.0 (https://live-streaming-d3cac.web.app; nordic city maps)"

# 1タイルの上限（km）。これより広い窓は割る。
TILE_KM = 2.5

# 面（塗り）として取るもの。**芝と庭は取らない。**
# ワルシャワの 2.2km 四方に landuse=grass が 2,229、leisure=garden が 1,087 あって、
# 全部が建物のあいだの small な芝生だった。地図には出ないのに、点数だけ3倍になる。
AREA_Q = """
  way["natural"~"^(water|wood|beach|sand)$"]({bb});
  rel["natural"~"^(water|wood)$"]({bb});
  way["waterway"~"^(riverbank|dock)$"]({bb});
  way["leisure"~"^(park|nature_reserve|golf_course)$"]({bb});
  rel["leisure"~"^(park|nature_reserve)$"]({bb});
  way["landuse"~"^(forest|cemetery|recreation_ground|village_green|allotments|residential|retail|commercial|industrial|railway|military|education)$"]({bb});
  way["amenity"~"^(grave_yard|university|hospital)$"]({bb});
  way["place"~"^(square|quarter|suburb|neighbourhood|city_block)$"]({bb});
  rel["place"~"^(quarter|suburb|neighbourhood)$"]({bb});
"""

# 線として取るもの
LINE_Q = """
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|pedestrian)(_link)?$"]({bb});
  way["railway"~"^(rail|light_rail|subway|tram|narrow_gauge)$"]({bb});
  way["waterway"~"^(river|canal|stream)$"]({bb});
  way["historic"="citywalls"]({bb});
  way["barrier"="city_wall"]({bb});
"""

# 目印とラベル。**`out center tags` なので軽い。** 形は要らない、場所と名前だけ。
POI_Q = """
  nwr["tourism"~"^(attraction|museum|gallery|viewpoint|artwork|zoo|aquarium|theme_park)$"]({bb});
  nwr["historic"~"^(castle|palace|monument|memorial|city_gate|tower|ruins|fort|church)$"]({bb});
  nwr["amenity"~"^(place_of_worship|marketplace|theatre|townhall|university|library|arts_centre|casino)$"]({bb});
  nwr["building"~"^(church|cathedral|castle|palace|train_station)$"]({bb});
  nwr["railway"="station"]({bb});
  nwr["leisure"="sauna"]({bb});
  nwr["shop"="mall"]({bb});
  nwr["natural"="water"]["name"]({bb});
  nwr["waterway"~"^(river|canal)$"]["name"]({bb});
  nwr["leisure"="park"]["name"]({bb});
  nwr["place"~"^(suburb|quarter|neighbourhood|square|city_block|island)$"]({bb});
"""


def _post(url, data, timeout=300):
    req = urllib.request.Request(
        url,
        data=urllib.parse.urlencode({"data": data}).encode(),
        headers={"User-Agent": UA, "Accept-Encoding": "gzip"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read()
        if r.headers.get("Content-Encoding") == "gzip":
            raw = gzip.decompress(raw)
        return raw


def query(q, why=""):
    """Overpass に1回。**JSON が返るまで掛け直す。**

    混んでいるときは 200 で HTML（`runtime error: ... Dispatcher_Client`）が
    返ってくる。**状態コードでは分からない**ので、中身が JSON かで見る。
    """
    last = ""
    for attempt in range(6):
        url = MIRRORS[attempt % len(MIRRORS)]
        try:
            raw = _post(url, q)
            if raw[:1] == b"{":
                return json.loads(raw.decode())
            last = raw.decode("utf-8", "replace")[:200].replace("\n", " ")
        except Exception as e:  # noqa: BLE001  相手のサーバなので何が来ても待つ
            last = f"{type(e).__name__}: {e}"
        wait = 15 * (attempt + 1)
        print(f"      混んでいる（{why}）… {wait}秒待って掛け直す  {last[-120:]}",
              file=sys.stderr)
        time.sleep(wait)
    raise RuntimeError(f"Overpass が返さない: {why}  {last}")


def tiles(bbox, tile_km=TILE_KM):
    """窓を 2km 四方くらいに割る。**1枚で投げると 504 になる。**"""
    s, w, n, e = bbox
    mid = (s + n) / 2
    hkm = (n - s) * 111.32
    wkm = (e - w) * 111.32 * max(0.2, __import__("math").cos(__import__("math").radians(mid)))
    ny = max(1, int(hkm / tile_km + 0.999))
    nx = max(1, int(wkm / tile_km + 0.999))
    out = []
    for iy in range(ny):
        for ix in range(nx):
            out.append((
                s + (n - s) * iy / ny, w + (e - w) * ix / nx,
                s + (n - s) * (iy + 1) / ny, w + (e - w) * (ix + 1) / nx,
            ))
    return out


def fetch_city(slug, bbox, force=False):
    """1つの街ぶんを落として、キャッシュに置く。"""
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, f"{slug}.json")
    if os.path.exists(path) and not force:
        have = json.load(open(path, encoding="utf-8"))
        # **窓が広がったら取り直す。** キャッシュは街の名前だけを鍵にしているので、
        # 前より広い窓を頼まれると、外側が白いまま出る（気づきにくい）。
        hb = have.get("bbox")
        if hb and hb[0] <= bbox[0] + 1e-9 and hb[1] <= bbox[1] + 1e-9 \
                and hb[2] >= bbox[2] - 1e-9 and hb[3] >= bbox[3] - 1e-9:
            return have
        print("    窓が前より広い。取り直す")

    els, seen = [], set()

    def add(res):
        for x in res.get("elements", []):
            k = (x.get("type"), x.get("id"))
            if k in seen:
                continue
            seen.add(k)
            els.append(x)

    tl = tiles(bbox)
    print(f"    タイル {len(tl)}枚")
    for i, bb in enumerate(tl, 1):
        s = ",".join(f"{v:.5f}" for v in bb)
        for kind, body in (("area", AREA_Q), ("line", LINE_Q)):
            q = f"[out:json][timeout:180];(\n{body.format(bb=s)});\nout geom;"
            r = query(q, why=f"{slug} {kind} {i}/{len(tl)}")
            add(r)
            time.sleep(4)
        print(f"      {i}/{len(tl)} まで {len(els)}件")
    s = ",".join(f"{v:.5f}" for v in bbox)
    add(query(f"[out:json][timeout:180];(\n{POI_Q.format(bb=s)});\nout center tags;",
              why=f"{slug} poi"))
    time.sleep(4)

    out = {"bbox": list(bbox), "elements": els}
    json.dump(out, open(path, "w", encoding="utf-8"), ensure_ascii=False)
    print(f"    ためた {len(els)}件  {os.path.getsize(path)//1024}KB")
    return out
