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

import json
import os
import subprocess
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, ".osmcache")

MIRRORS = [
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]
UA = "ayato-island/1.0 (https://live-streaming-d3cac.web.app; nordic city maps)"

# いま返してくれているミラー（`MIRRORS` の添字）。`query()` が書き換える。
_LIVE = [0]

# 1タイルの上限（km）。これより広い窓は割る。
TILE_KM = 2.5

# 面（塗り）として取るもの。**芝と庭は取らない。**
# ワルシャワの 2.2km 四方に landuse=grass が 2,229、leisure=garden が 1,087 あって、
# 全部が建物のあいだの small な芝生だった。地図には出ないのに、点数だけ3倍になる。
AREA_Q = """
  way["natural"~"^(water|wood|beach|sand)$"]({bb});
  way["waterway"~"^(riverbank|dock)$"]({bb});
  way["leisure"~"^(park|nature_reserve|golf_course)$"]({bb});
  way["landuse"~"^(forest|cemetery|recreation_ground|village_green|allotments|residential|retail|commercial|industrial|railway|military|education)$"]({bb});
  way["amenity"~"^(grave_yard|university|hospital)$"]({bb});
  way["place"~"^(square|quarter|suburb|neighbourhood|city_block)$"]({bb});
  way["amenity"="marketplace"]({bb});
"""

# 関係（multipolygon）は**別に投げる。** 湖や湾は何十万点の関係に入っている
# ことがあって（ストックホルムのメーラレン湖）、`out geom` を頼むと向こうが
# 落ちる。線のぶんと一緒に投げていたので、**街の道まで巻き添えで取れなかった。**
# ここが取れなくても止めない（取れたぶんだけ描く）。
AREAREL_Q = """
  rel["natural"~"^(water|wood)$"]({bb});
  rel["leisure"~"^(park|nature_reserve)$"]({bb});
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
# 目印とラベル。**`out center tags` なので軽い。** 形は要らない、場所と名前だけ。
#
# **2本に割ってある。** 1本にまとめると、`nwr`（節点・線・関係の3つとも）の
# 中心を全部そろえる仕事が重くて、タリンで 504 が6回続いた。
POI_Q = """
  nwr["tourism"~"^(attraction|museum|gallery|viewpoint|artwork|zoo|aquarium|theme_park)$"]({bb});
  nwr["historic"~"^(castle|palace|monument|memorial|city_gate|tower|ruins|fort|church)$"]({bb});
  nwr["amenity"~"^(place_of_worship|marketplace|theatre|townhall|university|library|arts_centre)$"]({bb});
  nwr["building"~"^(church|cathedral|castle|palace|train_station)$"]({bb});
"""
POI2_Q = """
  nwr["railway"="station"]({bb});
  nwr["leisure"="sauna"]({bb});
  nwr["shop"="mall"]({bb});
  nwr["natural"="water"]["name"]({bb});
  nwr["waterway"~"^(river|canal)$"]["name"]({bb});
  nwr["leisure"="park"]["name"]({bb});
  nwr["place"~"^(suburb|quarter|neighbourhood|square|city_block|island)$"]({bb});
"""


# 旧市街の**面**。あとから足した小さな問い合わせなので、別に控える
# （これのために街ぜんぶを取り直すと 30分かかる）。
#
# 旧市街は OSM では点（`node place=suburb`）でしか置かれていない街がある
# （ヴィリニュス）。面は行政界（`boundary=administrative` の 9〜12）のほうに
# 入っているので、両方から拾う。
OLD_Q = """
  rel["boundary"="administrative"]["admin_level"~"^(9|10|11|12)$"]["name"]({bb});
  rel["place"~"^(quarter|suburb|neighbourhood|borough)$"]["name"]({bb});
  way["place"~"^(quarter|suburb|neighbourhood|borough)$"]["name"]({bb});
"""


def _post(url, data, timeout=180):
    """Overpass に POST する。**curl を使う。**

    urllib だと、混んでいる相手に対して**タイムアウトが効かずに固まる**
    ことがあった（ヘルシンキの海岸線で 40分止まった。同じ問い合わせを curl に
    投げると 2.6 秒で返ってきた）。`--max-time` は全体に効くので、
    途中で止まっても必ず戻ってくる。
    """
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


def query(q, why="", soft=False):
    """Overpass に1回。**JSON が返るまで掛け直す。**

    混んでいるときは 200 で HTML（`runtime error: ... Dispatcher_Client`）が
    返ってくる。**状態コードでは分からない**ので、中身が JSON かで見る。
    """
    last = ""
    for attempt in range(8):
        # **返したミラーを覚えて、そこを使い続ける。**
        # 主従を決め打ちにしていたころ、主（kumi）が丸一日 180秒待って
        # 何も返さない日に当たって、1問い合わせに 6分かかった。
        # どちらが生きているかは日によって入れ替わるので、決め打ちにしない。
        # 覚えたほうが黙ったら、次の掛け直しでもう一方に移る。
        url = MIRRORS[(_LIVE[0] + attempt) % len(MIRRORS)]
        try:
            raw = _post(url, q)
            if raw[:1] == b"{":
                _LIVE[0] = MIRRORS.index(url)
                return json.loads(raw.decode())
            last = raw.decode("utf-8", "replace")[:200].replace("\n", " ")
        except Exception as e:  # noqa: BLE001  相手のサーバなので何が来ても待つ
            last = f"{type(e).__name__}: {e}"
        if soft and attempt >= 2:
            # 取れなくても止めない口（重い関係など）。**空で返す。**
            print(f"      あきらめる（{why}）  {last[-120:]}", file=sys.stderr)
            return {"elements": []}
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

    # **1枚ごとに書き出す。** 最後にまとめて書いていたころ、タリンの POI で
    # 6回続けて 504 になって落ち、そこまでに取った4枚（10分ぶん）が消えた。
    part = os.path.join(CACHE, f"{slug}.part.json")
    done = set()
    if os.path.exists(part):
        d = json.load(open(part, encoding="utf-8"))
        if d.get("bbox") == list(bbox):
            done = set(map(tuple, d.get("done", [])))
            add({"elements": d.get("elements", [])})
            print(f"    途中まで取ってある（{len(done)}回ぶん・{len(els)}件）")

    def save(tag):
        done.add(tag)
        json.dump({"bbox": list(bbox), "done": [list(t) for t in done], "elements": els},
                  open(part, "w", encoding="utf-8"), ensure_ascii=False)

    tl = tiles(bbox)
    print(f"    タイル {len(tl)}枚")
    for i, bb in enumerate(tl, 1):
        s = ",".join(f"{v:.5f}" for v in bb)
        for kind, body in (("area", AREA_Q), ("line", LINE_Q), ("arel", AREAREL_Q)):
            if (kind, i) in done:
                continue
            q = f"[out:json][timeout:180];(\n{body.format(bb=s)});\nout geom;"
            add(query(q, why=f"{slug} {kind} {i}/{len(tl)}", soft=(kind == "arel")))
            save((kind, i))
            time.sleep(4)
        print(f"      {i}/{len(tl)} まで {len(els)}件")
    # 目印は窓ぜんぶを一度に。**ただし2本に割る**（1本だと重すぎて 504 が続く）
    s = ",".join(f"{v:.5f}" for v in bbox)
    for kind, body in (("poi", POI_Q), ("poi2", POI2_Q)):
        if (kind, 0) in done:
            continue
        add(query(f"[out:json][timeout:180];(\n{body.format(bb=s)});\nout center tags;",
                  why=f"{slug} {kind}"))
        save((kind, 0))
        time.sleep(4)

    out = {"bbox": list(bbox), "elements": els}
    json.dump(out, open(path, "w", encoding="utf-8"), ensure_ascii=False)
    os.remove(part)
    print(f"    ためた {len(els)}件  {os.path.getsize(path)//1024}KB")
    return out


def fetch_sea(slug, bbox, force=False):
    """海岸線を取る。**海は面として置かれていない。**

    OSM の海は `natural=coastline` の**線**で、面は世界全体で1枚として
    別に配られている。だからバルト海は `natural=water` では引っかからない。
    タリンの地図に湾が1つも出ず、港町が内陸の街に見えた。

    線から面を組み立てるのは `citymap.py` の `sea_polys()`。
    """
    # 湾の名前もここで拾う（`natural=bay`）。本体の問い合わせに足すと、
    # 街ぜんぶを取り直すことになる
    # **海岸線だけ。** 湾の名前（`natural=bay`）も足していたが、湾は
    # フィンランド湾のような巨大な関係に入っていて、`out geom` を頼むと
    # 返ってこない。名前1つのために全部を止めない。
    # 海の無い街（ワルシャワ・ヴィリニュス）でも投げることになるので、
    # 取れなくても止めない。内陸の街で空が返るのは正しい答えでもある。
    return _side(slug, "sea", bbox,
                 '  way["natural"="coastline"]({bb});\n', force, soft=True)


def fetch_old(slug, bbox, force=False):
    """旧市街の面だけを取る。**街ぜんぶを取り直さないための別口。**"""
    return _side(slug, "old", bbox, OLD_Q, force, soft=True)


def _side(slug, tag, bbox, body, force=False, soft=False):
    """本体とは別に、あとから足した小さな問い合わせ。別のファイルに控える。"""
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, f"{slug}-{tag}.json")
    if os.path.exists(path) and not force:
        have = json.load(open(path, encoding="utf-8"))
        hb = have.get("bbox")
        if hb and hb[0] <= bbox[0] + 1e-9 and hb[1] <= bbox[1] + 1e-9 \
                and hb[2] >= bbox[2] - 1e-9 and hb[3] >= bbox[3] - 1e-9:
            return have["elements"]
    s = ",".join(f"{v:.5f}" for v in bbox)
    r = query(f"[out:json][timeout:180];(\n{body.format(bb=s)});\nout geom;",
              why=f"{slug} {tag}", soft=soft)
    els = r.get("elements", [])
    json.dump({"bbox": list(bbox), "elements": els},
              open(path, "w", encoding="utf-8"), ensure_ascii=False)
    time.sleep(4)
    return els
