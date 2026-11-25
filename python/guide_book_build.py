"""**街のガイドの材料（`guidebook.json`）と組み立て（`compose.json`）を、街ごとの台本から書く。**

    python3 python/guide_book_build.py build romania/bucharest            # 台本 book.py から2つの JSON を書く
    python3 python/guide_book_build.py build romania/bucharest --check    # 書かずに、いまの JSON と同じかだけ見る（0=同じ / 1=違う）
    python3 python/guide_book_build.py geo romania/bucharest palace="Palatul Parlamentului" …   # 座標を引いて geo.json へ
    python3 python/guide_book_build.py photo romania/bucharest palace="File:X.jpg" …            # Commons のファイルの頁から photos.json へ

終了コード 0=通った / 1=違う・足りない / **2=台本が無い・読めない**（`docs/island-standards.md` §15）。

## なぜ台本か

ブカレスト（2026-11-19）は、見たいもの23・料理23・土産9・店9の材料を、出どころつきで手で JSON に書くと
1項目ごとに `src` の名前・URL・見た日を3回ずつ写すことになった。写すたびに見た日や名前がずれる。
そこで出どころは台本の頭の表（`SRC`）に1回だけ書き、事実の字には鍵だけを付ける（`t("…", "pal", "wv")`）。
座標（`geo.json`）と借りた写真の欄（`photos.json`）も、引いた結果を街の置き場に残して、台本は鍵で呼ぶ。

台本は `python/data/guide/<国>/<街>/book.py`。この道具が下の道具を入れてから読み、台本が作った
`book`（材料）と `compose`（組み立て）を書く。台本に書くのは**事実と並べかただけ**で、形は
`guide_book_check.py` と `guidebook_bake.py` が見る（この道具は形を決めない）。

## 日帰りの町の地図

店（`store`）の地図の検索語には、街の名前を後ろに足す。ただし店の地区が国の表（`cities.json`）の**日帰りの町**なら、
足すのは泊まる街ではなく**その町の名前**（台本の `TRIP_AREAS`。無ければ止める）。ティラナ（2026-11-23）は
クルヤの古いバザールの店に「Tiranë」を足していて、見たいものの同じバザール（`Pazari i Krujës`）と
「マップ（クルヤの古いバザール）」の字のまま別の先を指した（reachkeys の「おなじ字」）。
問いにもう町の名前が入っているときは足さない（`Pazari i Krujës` に `Krujë` を、`Artisti Tiranë` に `Tiranë` を重ねない）。
見たいもので日帰りの町に在るものは `maps("問い", "町の鍵")` で、店と同じ道具から作る。

| 台本で使える道具 | 何を返すか |
| --- | --- |
| `s("鍵", …)` | 出どころの並び（`SRC` の名前・URL・`SEEN`） |
| `t("字", "鍵", …)` | 出どころつきの事実 `{"text", "src"}` |
| `loc("現地の字", "ローマ字", "鍵", …)` | 現地の名前 |
| `osm("鍵")` / `at("鍵")` | `geo.json` の点の出どころ / `lat`・`lon`・`coord_src` |
| `maps("問い", 町=None)` | Google マップの検索の URL（泊まる街の `MAPS_AREA`、日帰りの町なら `TRIP_AREAS` の名前を後ろに足す。問いにもう入っていれば足さない） |
| `photo("鍵", "alt")` | `photos.json` の借りた写真の欄に alt を付けたもの |
| `store(…)` / `lm(…)` | 店（座標と出どころつき）/ 地区の目印 |
| `todo(…)` / `dish(…)` | やりたいこと（`src` を窓の事実から集める）/ 食べたいもの |

**台本と JSON は同じでなければならない。** 手で JSON だけ直すと、次に台本から書いたときに黙って戻る。
`build --check` が違いを 1 で返す（`guide_book_build_selftest.py` が本物のブカレストで回す）。

## 座標を引く（`geo`）

OpenStreetMap の Nominatim。1秒に1回。**国の表（`cities.json`）の街と日帰りの枠の外の点は捨てる**
（同じ名前の店が別の街に在る。`tools/nordic/geocode.py` の「1件目をそのまま信じない」と同じ理由）。
捨てたものは理由を出す。引けなかった鍵は `geo.json` に書かない（台本で `at` を呼べば止まる）。

## 写真の欄（`photo`）

`guide_photos.py --lookup` と同じく、Commons の**ファイルの頁**（`api.php` ではない）から撮った人・許諾・元の幅を読む。
許諾が自由でないもの（NC・ND）は書かない。**写真そのものは落とさない**（落とすのは `guide_photos.py`。名乗りと間隔はそちら）。
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GUIDE = Path("python/data/guide")
# 座標を引く名乗り。島の道具（`tools/nordic/geocode.py`）と同じ形で、誰が何のために引くかを書く
UA = "ayato-island/1.0 (https://ayato-arigato.com; city guide material)"
NOMINATIM = "https://nominatim.openstreetmap.org/search?format=json&limit=5&accept-language=ro&q="


class BookError(Exception):
    """台本の書き損じ（無い出どころの鍵・無い座標・無い写真）。どの鍵かを言って止める"""


def dumps(x) -> str:
    return json.dumps(x, ensure_ascii=False, indent=1) + "\n"


def city_dir(key: str, root: Path = ROOT) -> Path:
    return root / GUIDE / key


def _load(p: Path) -> dict:
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {}


# ---------------------------------------------------------------- 台本の道具

def tools(ns: dict, geo: dict, photos: dict, trips: frozenset[str] = frozenset()) -> dict:
    """台本の名前空間に入れる道具。`SRC`・`SEEN`・`MAPS_AREA`・`TRIP_AREAS`・`STORES` は**呼ばれたときに** `ns` から読む
    （台本は道具を入れたあとで、頭に `SRC` を書く）。`trips` は国の表の、その街の日帰りの町の鍵"""

    def s(*keys: str) -> list[dict]:
        src = ns.get("SRC") or {}
        out = []
        for k in keys:
            if k not in src:
                raise BookError(f"出どころの鍵「{k}」が SRC に無い")
            out.append({"name": src[k][0], "url": src[k][1], "seen": ns["SEEN"]})
        return out

    def g(k: str) -> dict:
        x = geo.get(k)
        if not x or x.get("lat") is None:
            raise BookError(f"座標の鍵「{k}」が geo.json に無い（python3 python/guide_book_build.py geo {ns['KEY']} {k}=…）")
        return x

    def osm(k: str) -> list[dict]:
        x = g(k)
        return [{"name": f"OpenStreetMap「{x['name']}」", "url": x["osm"], "seen": ns["SEEN"]}]

    def t(text: str, *keys: str) -> dict:
        return {"text": text, "src": s(*keys)}

    def area_of(town: str | None) -> str:
        if not town or town == ns.get("TOWN"):
            return ns.get("MAPS_AREA", "")
        names = ns.get("TRIP_AREAS") or {}
        if town not in names:
            raise BookError(f"日帰りの町「{town}」の地図の名前が TRIP_AREAS に無い（無いまま泊まる街の名前を足すと、別の町を探す）")
        return names[town]

    def maps(q: str, town: str | None = None) -> str:
        area = area_of(town)
        # 問いにもう町の名前が入っていれば重ねない（属格の「Krujës」にも「Krujë」は入っている）
        if area and area.casefold() in q.casefold():
            area = ""
        return "https://www.google.com/maps/search/?api=1&query=" + urllib.parse.quote_plus(f"{q} {area}".strip()) + "&hl=ja"

    def photo(k: str, alt: str) -> dict:
        if k not in photos:
            raise BookError(f"写真の鍵「{k}」が photos.json に無い（python3 python/guide_book_build.py photo {ns['KEY']} {k}=File:…）")
        return {**photos[k], "alt": alt}

    def loc(text: str, roman: str, *keys: str) -> dict:
        return {"text": text, "roman": roman, "src": s(*keys)}

    def at(k: str) -> dict:
        x = g(k)
        return {"lat": x["lat"], "lon": x["lon"], "coord_src": osm(k)}

    def store(key, name, local, area, geo_key, why, why_src) -> dict:
        x = g(geo_key)
        return {"key": key, "name": name, "local": local, "area": area, "lat": x["lat"], "lon": x["lon"], "coord_src": osm(geo_key),
                "why": {"text": why, "src": why_src}, "went": False, "maps": maps(local, area if area in trips else None)}

    def lm(k: str, name: str, local: str) -> dict:
        x = g(k)
        return {"name": name, "local": local, "lat": x["lat"], "lon": x["lon"], "coord_src": osm(k)}

    def todo(key, title, head, pts, link_see=None, link_eat=None, ph=None, marks=None, town=None) -> dict:
        """やりたいこと。`src` は窓の事実の出どころを、重ねずに集めたもの。
        `ph` は描いた絵の当て（"do"・"eat"）か、借りた写真の欄（`photo()`）"""
        x = {"key": key, "town": town or ns["TOWN"], "title": title, "head": head,
             "points": {k: pts.get(k, []) for k in ("what", "why", "how", "time", "money", "tips", "route")},
             "src": [], "went": False, "links": {}}
        if link_see:
            x["links"]["see"] = link_see
        if link_eat:
            x["links"]["eat"] = link_eat
        if not x["links"]:
            del x["links"]
        if ph in ("eat", "do"):
            x["photo"] = {"drawn": ph}
        elif ph:
            x["photo"] = {"commons": [ph]}
        if marks:
            x["marks"] = marks
        seen, src = set(), []
        for ps in x["points"].values():
            for p in ps:
                for q in p["src"]:
                    if q["url"] not in seen:
                        seen.add(q["url"])
                        src.append(q)
        x["src"] = src
        return x

    def dish(key, name, local, kinds, alcohol, pork, what, stores=(), **notes) -> dict:
        """食べたいもの。現地の名前の出どころは台本の `DISH_LOCAL_SRC`（料理の名前を確かめた頁）"""
        st = ns.get("STORES") or {}
        for k in stores:
            if k not in st:
                raise BookError(f"店の鍵「{k}」が STORES に無い（料理「{key}」）")
        x = {"key": key, "name": name, "local": loc(local, local, ns["DISH_LOCAL_SRC"]), "kinds": kinds, "alcohol": alcohol,
             "pork": pork, "what": what, "stores": [st[k] for k in stores], "went": False}
        x.update(notes)
        return x

    return {"s": s, "osm": osm, "t": t, "maps": maps, "photo": photo, "loc": loc, "at": at, "store": store, "lm": lm,
            "todo": todo, "dish": dish, "BookError": BookError}


def trips_of(key: str, root: Path = ROOT) -> frozenset[str]:
    """国の表（`cities.json`）の、その街の日帰りの町の鍵"""
    country, _, city = key.partition("/")
    t = _load(root / GUIDE / "cities.json")
    c = ((t.get("countries") or {}).get(country) or {}).get("cities", {}).get(city) or {}
    return frozenset(c.get("trips") or {})


def run(key: str, root: Path = ROOT) -> tuple[dict, dict]:
    """台本を読んで (材料, 組み立て)。台本が無ければ FileNotFoundError"""
    d = city_dir(key, root)
    script = d / "book.py"
    code = compile(script.read_text(encoding="utf-8"), str(script), "exec")
    ns: dict = {"__name__": "guide_book", "__file__": str(script), "KEY": key, "ROOT": root, "HERE": d}
    ns.update(tools(ns, _load(d / "geo.json"), _load(d / "photos.json"), trips_of(key, root)))
    exec(code, ns)  # noqa: S102  台本はこのリポジトリの中のファイルだけ（`python/data/guide/<国>/<街>/book.py`）
    for name in ("book", "compose"):
        if not isinstance(ns.get(name), dict):
            raise BookError(f"台本が `{name}` を作っていない")
    return ns["book"], ns["compose"]


def build(key: str, root: Path = ROOT, check: bool = False, log=print) -> int:
    d = city_dir(key, root)
    if not (d / "book.py").exists():
        log(f"::error::{key}: 台本 {GUIDE / key / 'book.py'} が無い")
        return 2
    try:
        book, compose = run(key, root)
    except BookError as e:
        log(f"::error::{key}: {e}")
        return 1
    out = {"guidebook.json": dumps(book), "compose.json": dumps(compose)}
    if check:
        bad = [n for n, s in out.items() if not (d / n).exists() or (d / n).read_text(encoding="utf-8") != s]
        for n in bad:
            log(f"::error::{key}: {n} が台本（book.py）から書いたものと違う。JSON を手で直したなら台本を直して build する")
        if not bad:
            log(f"{key}: 台本と材料・組み立ては同じ")
        return 1 if bad else 0
    for n, s in out.items():
        (d / n).write_text(s, encoding="utf-8")
    log(f"{key}: 書いた（見たいもの {len(book.get('see') or [])}・やりたいこと {len(book.get('todo') or [])}・"
        f"食べたいもの {len((book.get('eat') or {}).get('items') or [])}・買いたいもの {len((book.get('buy') or {}).get('items') or [])}）。"
        f"次に python3 python/guide_book_check.py {key}")
    return 0


# ---------------------------------------------------------------- 座標

def boxes(key: str, root: Path = ROOT) -> list[tuple[float, float, float, float]]:
    """国の表の、その街と日帰りの枠（南・北・西・東）"""
    country, city = key.split("/")
    t = _load(root / GUIDE / "cities.json")
    c = ((t.get("countries") or {}).get(country) or {}).get("cities", {}).get(city) or {}
    return [tuple(b) for b in [c.get("bbox")] + [v.get("bbox") for v in (c.get("trips") or {}).values()] if b]


def _get_json(url: str):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def geo(key: str, asks: list[str], root: Path = ROOT, get=_get_json, sleep=time.sleep, log=print) -> int:
    """`鍵=問い` を Nominatim で引いて `geo.json` に足す。枠の外の点は捨てる。すでに在る鍵は引き直さない"""
    bx = boxes(key, root)
    if not bx:
        log(f"::error::{key}: 国の表（cities.json）に街の枠（bbox）が無い。先に枠を書く")
        return 2
    p = city_dir(key, root) / "geo.json"
    out = _load(p)
    miss = 0
    for i, a in enumerate(asks):
        k, _, q = a.partition("=")
        if not q:
            log(f"::error::「{a}」は 鍵=問い の形で")
            return 2
        if k in out:
            continue
        if i:
            sleep(1.1)
        rows = get(NOMINATIM + urllib.parse.quote(q)) or []
        inside = [x for x in rows if any(s <= float(x["lat"]) <= n and w <= float(x["lon"]) <= e for s, n, w, e in bx)]
        if not inside:
            miss += 1
            log(f"  ✕ {k}: 「{q}」は枠の中に見つからない（{len(rows)}件はどれも枠の外）")
            continue
        x = inside[0]
        out[k] = {"q": q, "lat": round(float(x["lat"]), 6), "lon": round(float(x["lon"]), 6), "name": x.get("name") or q,
                  "osm": f"https://www.openstreetmap.org/{x['osm_type']}/{x['osm_id']}", "type": x.get("type"),
                  "addr": (x.get("display_name") or "")[:120]}
        log(f"  ○ {k}: {out[k]['lat']}, {out[k]['lon']} {out[k]['name']}（{out[k]['type']}）")
    p.write_text(dumps(out), encoding="utf-8")
    return 1 if miss else 0


# ---------------------------------------------------------------- 写真の欄

def photo(key: str, asks: list[str], root: Path = ROOT, log=print) -> int:
    """`鍵=File:…` を Commons のファイルの頁から読んで `photos.json` に足す（`guide_photos.py` の読みかたのまま）"""
    sys.path.insert(0, str(root / "python"))
    import guide_photos as gp  # noqa: PLC0415  外へ出るときだけ読む
    p = city_dir(key, root) / "photos.json"
    out = _load(p)
    bad = 0
    for i, a in enumerate(asks):
        k, _, name = a.partition("=")
        if not name:
            log(f"::error::「{a}」は 鍵=File:… の形で")
            return 2
        if i:
            time.sleep(gp.GAP)
        url = "https://commons.wikimedia.org/wiki/File:" + urllib.parse.quote(gp.norm(name))
        data, _ = gp.pull(url, gp._get, time.sleep, log)
        if data is None:
            log(f"  ✕ {k}: ファイルの頁が読めない（{name}）。この回はここまで")
            bad += 1
            break
        row = gp.parse_page(name, data.decode("utf-8", "replace"), time.strftime("%Y-%m-%d"))
        if not (row["by"] and gp.LIC_OK.match(row["lic"]) and row["w"]):
            log(f"  ✕ {k}: 撮った人・自由な許諾・元の幅のどれかが無い（{row['lic']}）")
            bad += 1
            continue
        row["alt"] = ""  # 台本の photo("鍵", "alt") が入れる。欄の並びは頁から読んだまま
        out[k] = row
        log(f"  ○ {k}: {row['file']}（{row['lic']}・{row['by']}）")
    p.write_text(dumps(out), encoding="utf-8")
    return 1 if bad else 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("build", help="台本 book.py から guidebook.json と compose.json を書く")
    b.add_argument("key")
    b.add_argument("--check", action="store_true", help="書かずに、いまの JSON と同じかだけ見る")
    g = sub.add_parser("geo", help="鍵=問い を Nominatim で引いて geo.json へ")
    g.add_argument("key")
    g.add_argument("asks", nargs="+")
    f = sub.add_parser("photo", help="鍵=File:… を Commons のファイルの頁から photos.json へ")
    f.add_argument("key")
    f.add_argument("asks", nargs="+")
    a = ap.parse_args(argv)
    if a.cmd == "build":
        return build(a.key, check=a.check)
    if a.cmd == "geo":
        return geo(a.key, a.asks)
    return photo(a.key, a.asks)


if __name__ == "__main__":
    sys.exit(main())
