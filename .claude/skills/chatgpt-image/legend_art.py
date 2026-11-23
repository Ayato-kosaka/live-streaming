#!/usr/bin/env python3
"""**企画の面（`/legends/<企画>`）の絵（料理の100枚・表紙・地域の地図）を、ChatGPT（EC2 の Chrome）に一括で描かせて置き場に出す。**

    python3 .claude/skills/chatgpt-image/legend_art.py <企画> plan   [--only 品…]
    python3 .claude/skills/chatgpt-image/legend_art.py <企画> layout --work <スクラッチ>   # 地図の下敷き（OpenStreetMap）
    python3 .claude/skills/chatgpt-image/legend_art.py <企画> run    --work <スクラッチ> [--only 品…] [--all]
    python3 .claude/skills/chatgpt-image/legend_art.py <企画> status
    python3 .claude/skills/chatgpt-image/legend_art.py <企画> wait   --until <描けた数> [--every 秒]   # run_in_background で
    python3 .claude/skills/chatgpt-image/legend_art.py <企画> fetch  --work <スクラッチ> [--only 品…]
    python3 .claude/skills/chatgpt-image/legend_art.py <企画> finalize --work <スクラッチ>
    python3 .claude/skills/chatgpt-image/legend_art.py <企画> sheet  --work <スクラッチ>

品は `cover` `map` `dish:<id>`。終了コード: 0=通った / 1=落ちた / 2=見るものが無い。
注文書（`art_order.json`）と材料（`book.json`）がまだ master に無い日は `--order` `--book` で道を渡す。

## なぜ `guide_art.py` と分けたか

`guide_art.py` は街（`<国>/<街>`）の面の形（`site/public/guide/<国>/<街>`・料理と土産の2つの節・地区の地図）に
合わせてある。企画の面は、置き場（`site/public/legends/<企画>/`。`dishes/<id>.webp`・`cover.webp`・`map.webp`・
`manifest.json`）も、品の出どころ（材料担当の注文書）も違う。街の絵の動きを変えないよう、**こちらは別の1本にし、
頼む文の型（`MATCH` `PAINT` `NOTEXT` `WIDE` `MAP_STYLE`）・EC2 の一括（`guide_art.py batch`）・様子と持ち帰り
（`STATUS_PY` `PACK_PY`）・札の焼きかた（`guide_layout.py`）は `guide_art.py` から借りる**（同じ型を2か所に持たない）。

## 頼み書き（`legend/<企画>.json`）

- `order` `book`（注文書と材料の道）・`ec2_dir`・`model`（料理の手本。街のガイドと同じソフィアの1枚目を渡し、
  街のガイドの料理と同じ卓・角度・光にそろえる）・`dish_size`（`dishes/<id>.webp` の一辺）
- `dishes.<id>` = `v`（描き直すたびに上げる。id が `food-<id>2` に変わるので EC2 の前の絵に飛ばされない）・
  `fix`（描写の前に足す注意。英語）・`draw`（注文書の `draw` を置き換える。材料担当の字は直さない）・`why`（描き直した理由。日本語）
- `cover`: `scene`（英語）・`people`（人を描くなら手本の絵。島に在るあやとの絵。無ければ人を描かない）・`ayato`（手本の説明）・
  `title`（**題はこちらで焼く**。`lines` 行の並び・`x` `y` 札の上の中心・`scale`）・`og_bias`（1200x630 に切るとき、上 0 下 1）
- `map`: `bbox`・`regions.<id>`（`name` 焼く名前・`color` 下敷きの色・`tag` 札の色・`states`（OpenStreetMap の州の名前）か
  `country`（国の符号）と `q`（国の名前））・`prompt`・`labels.<id>`（札の中心 `x` `y`。描けた絵を見て決める。無ければ地域の真ん中）・
  `cities.<街>`（街の名前の札をどちらに置くか `side` = `l` `r` `t` `b`、ずらす `dx` `dy`）

## 地図（`layout`・`finalize`）

- 下敷きは OpenStreetMap: 海と湖は OpenFreeMap のベクトルタイル（z6 から OSM の海の多角形）、州と国の形は Nominatim の
  境界（`polygon_threshold` で間引く）。控えは `<スクラッチ>/geo/`。投影は Web メルカトルで、`bbox` を正方形に描く
- **ChatGPT に描かせるのは、海岸・地域の色・地域ごとの料理の小さな絵だけ。** 回る街の点・点線・地域の名前・街の名前は
  `finalize` がこちらで焼く（点の位置を緯度経度から出すので、名前と点がずれない。`docs/guide-copy.md` 6章の字だけ）
- 札は `guide_layout.py` の `bake`（地域。地区の札と同じ形）と `bake_names`（街。目印の名前と同じ形）。重なれば止まる
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import guide_art as ga  # noqa: E402

ROOT = ga.ROOT
SPECS = HERE / "legend"
UA = {"User-Agent": "island-legend-art/1.0"}
NOMINATIM = "https://nominatim.openstreetmap.org/search"


def die(msg: str, code: int = 2):
    print(f"✕ {msg}")
    sys.exit(code)


def gl():
    return ga.gl()


# ---------------------------------------------------------------- 頼み書きと注文書

def load(slug: str, root: Path, order: str | None, book: str | None) -> tuple[dict, dict, dict]:
    p = SPECS / f"{slug}.json"
    if not p.is_file():
        die(f"頼み書きが無い: {p}")
    spec = json.loads(p.read_text(encoding="utf-8"))
    spec["_slug"] = slug
    op = Path(order) if order else root / spec["order"]
    bp = Path(book) if book else root / spec["book"]
    for q in (op, bp):
        if not q.is_file():
            die(f"{q} が無い（材料担当の PR がまだ入っていなければ --order / --book で道を渡す）")
    o = json.loads(op.read_text(encoding="utf-8"))
    b = json.loads(bp.read_text(encoding="utf-8"))
    ids_o = [d["id"] for d in o["dishes"]]
    ids_b = [d["id"] for d in b["dishes"]]
    if sorted(ids_o) != sorted(ids_b):
        die(f"注文書と材料で品が違う: 注文書だけ {sorted(set(ids_o) - set(ids_b))}・材料だけ {sorted(set(ids_b) - set(ids_o))}")
    unknown = sorted(set(spec.get("dishes", {})) - set(ids_o))
    if unknown:
        die(f"頼み書きの dishes に、注文書に無い品: {unknown}")
    return spec, o, b


def out_dir(spec: dict, root: Path) -> Path:
    return root / "site/public/legends" / spec["_slug"]


def url_dir(spec: dict) -> str:
    return f"/legends/{spec['_slug']}/"


def white(src: Path, dst: Path) -> Path:
    """透過の手本（あやとの絵）を白い地に置いた webp（EC2 で PNG に直すと、抜けたところが黒になるため）"""
    from PIL import Image
    if not dst.is_file() or dst.stat().st_mtime < src.stat().st_mtime:
        im = Image.open(src).convert("RGBA")
        bg = Image.new("RGBA", im.size, (255, 255, 255, 255))
        dst.parent.mkdir(parents=True, exist_ok=True)
        Image.alpha_composite(bg, im).convert("RGB").save(dst, "WEBP", quality=92)
    return dst


def slots(spec: dict, order: dict, root: Path, work: Path | None) -> list[dict]:
    ja = spec["ja"]
    D = spec["ec2_dir"]
    out = []
    # 表紙
    c = spec["cover"]
    people = c.get("people", [])
    files = []
    for p in people:
        local = white(root / p, (work or Path("/nonexistent")) / "in" / f"{Path(p).stem}.webp") if work else root / p
        files.append((str(local), f"{D}/in/person-{Path(p).stem}.png"))
    prompt = (c.get("ayato", "") if people else "") + c.get("fix", "") + ga.WIDE + c["scene"] + " " + ga.PAINT + " " + ga.NOTEXT
    out.append({"slot": "cover", "kind": "cover", "key": "cover", "v": c.get("v", 1), "prompt": prompt, "files": files,
                "label": "表紙"})
    # 地図
    m = spec["map"]
    lay = (work / "map-layout.png") if work else Path("map-layout.png")
    out.append({"slot": "map", "kind": "map", "key": "map", "v": m.get("v", 1),
                "prompt": m.get("fix", "") + m["prompt"] + ga.MAP_STYLE,
                "files": [(str(lay), f"{D}/in/map-layout.png")], "label": "地域の地図"})
    # 料理
    model = spec.get("model")
    mf = ga.model_file(model, root) if model else None
    for d in order["dishes"]:
        it = spec.get("dishes", {}).get(d["id"], {})
        draw = it.get("draw", d["draw"])
        prompt = (ga.MATCH if mf else "") + order["style"] + " Subject: " + it.get("fix", "") + draw
        files = [(str(mf), f"{D}/in/model-{model.replace('/', '-').replace(':', '-')}.png")] if mf else []
        out.append({"slot": f"dish:{d['id']}", "kind": "dish", "key": d["id"], "v": it.get("v", 1), "prompt": prompt,
                    "files": files, "label": d["title"], "why": it.get("why")})
    for s in out:
        base = "food-" + s["key"] if s["kind"] == "dish" else s["key"]
        s["id"] = base + (str(s["v"]) if s["v"] > 1 else "")
        s["title"] = (f"{time.strftime('%Y-%m-%d')} {'新しく描く' if s['v'] == 1 else '描き直し'}：{ja}の{s['label']}"
                      f"（企画の面）")
        s["sha"] = hashlib.sha1(s["prompt"].encode()).hexdigest()[:10]
    return out


def read_manifest(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8")) if path.is_file() else {}


def entry_of(man: dict, s: dict) -> dict | None:
    return man.get("dishes", {}).get(s["key"]) if s["kind"] == "dish" else man.get(s["key"])


def select(spec, order, root, work, only=None, all_=False) -> list[dict]:
    out = out_dir(spec, root)
    man = read_manifest(out / "manifest.json")
    names = set(only or [])
    picked = []
    for s in slots(spec, order, root, work):
        if names and s["slot"] not in names and s["id"] not in names and s["key"] not in names:
            continue
        e = entry_of(man, s)
        if not names and not all_ and e and e.get("job") == s["id"]:
            continue
        miss = [lf for lf, _ in s["files"] if not Path(lf).is_file()]
        if miss:
            s = {**s, "later": f"渡す絵が無い（{miss[0]}）"}
        picked.append(s)
    left = names - {s["slot"] for s in picked} - {s["id"] for s in picked} - {s["key"] for s in picked}
    if left:
        die(f"知らない品: {sorted(left)}")
    return picked


# ---------------------------------------------------------------- 地図の下敷き

def merc(bb: dict):
    """緯度経度 → 割合（0〜1）。bbox を正方形に描く前提で、x と y を別々に割る"""
    x0, x1 = gl()._wx(bb["west"]), gl()._wx(bb["east"])
    y0, y1 = gl()._wy(bb["north"]), gl()._wy(bb["south"])

    def f(lat, lon):
        return (gl()._wx(lon) - x0) / (x1 - x0), (gl()._wy(lat) - y0) / (y1 - y0)
    return f


def nominatim(q: dict, cache: Path) -> dict:
    if cache.is_file():
        return json.loads(cache.read_text(encoding="utf-8"))
    url = NOMINATIM + "?" + urllib.parse.urlencode({**q, "format": "jsonv2", "polygon_geojson": 1,
                                                    "polygon_threshold": 0.004, "limit": 5})
    for i in range(4):
        try:
            rows = json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=90))
            break
        except OSError:
            time.sleep(5 + 5 * i)
    else:
        die(f"Nominatim に届かない: {q}")
    time.sleep(1.2)   # 1秒に1回まで（Nominatim の決まり）
    rows = [r for r in rows if r.get("geojson", {}).get("type") in ("Polygon", "MultiPolygon")
            and r.get("category") == "boundary"]
    if not rows:
        die(f"Nominatim に境界が無い: {q}")
    # 州（と国）の段の境界を先に（「Delhi」は街の境界も返る）
    r = sorted(rows, key=lambda r: (r.get("addresstype") not in ("state", "country"), r.get("place_rank", 99)))[0]
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps({"name": r["display_name"], "osm": f"{r['osm_type']}/{r['osm_id']}",
                                 "geojson": r["geojson"]}, ensure_ascii=False), encoding="utf-8")
    return json.loads(cache.read_text(encoding="utf-8"))


def rings(geo: dict) -> list[list[tuple[float, float]]]:
    g = geo["geojson"]
    polys = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
    return [p[0] for p in polys]   # 外の輪だけ（穴は同じ地域の州なので塗りに困らない）


def layout(spec: dict, book: dict, work: Path, size: int = 1024) -> int:
    from PIL import Image, ImageDraw
    m = spec["map"]
    bb = m["bbox"]
    f = merc(bb)
    big = size * 2
    im = Image.new("RGB", (big, big), gl()._hex(m["land"]))
    d = ImageDraw.Draw(im)
    geo = work / "geo"
    used = {}
    for rid, r in m["regions"].items():
        shapes = []
        if "country" in r:
            g = nominatim({"q": r["q"], "countrycodes": r["country"], "featureType": "country"},
                          geo / f"country-{r['country']}.json")
            shapes.append(g)
        for st in r.get("states", []):
            g = nominatim({"q": st, "countrycodes": "in"}, geo / f"state-{re.sub(r'[^a-z0-9]+', '-', st.lower())}.json")
            shapes.append(g)
        used[rid] = [g["osm"] + " " + g["name"].split(",")[0] for g in shapes]
        for g in shapes:
            for ring in rings(g):
                pts = [(x * big, y * big) for x, y in (f(la, lo) for lo, la in ring)]
                if len(pts) > 2:
                    d.polygon(pts, fill=gl()._hex(r["color"]))
    # 海と湖（OpenFreeMap。z6 から OpenStreetMap の海の多角形）
    z = 6
    n = 2 ** z
    tx0, tx1 = int(gl()._wx(bb["west"]) * n), int(gl()._wx(bb["east"]) * n)
    ty0, ty1 = int(gl()._wy(bb["north"]) * n), int(gl()._wy(bb["south"]) * n)
    X0, X1 = gl()._wx(bb["west"]) * n, gl()._wx(bb["east"]) * n
    Y0, Y1 = gl()._wy(bb["north"]) * n, gl()._wy(bb["south"]) * n
    cache = gl().CACHE
    cache.mkdir(parents=True, exist_ok=True)
    tiles_url = None
    water = gl()._hex(m["water"])
    # 海は面（L）に塗ってから色を置く。MVT の多角形は外の輪（面積が正）のあとに穴（島。負）が続くので、
    # 穴を 0 で塗り戻す（穴まで海で塗ると、スリランカが海に沈む）。湖と川の小さな粒は下敷きに要らないので海だけ
    sea = Image.new("L", (big, big), 0)
    sdraw = ImageDraw.Draw(sea)
    for tx in range(tx0, tx1 + 1):
        for ty in range(ty0, ty1 + 1):
            p = cache / f"{z}_{tx}_{ty}.pbf"
            if not p.is_file():
                tiles_url = tiles_url or json.loads(gl()._get(gl().TILEJSON))["tiles"][0]
                p.write_bytes(gl()._get(tiles_url.format(z=z, x=tx, y=ty)))
                time.sleep(0.3)
            for name, ext, fs in gl().mvt_layers(p.read_bytes()):
                if name != "water":
                    continue
                for typ, pr, rs in fs:
                    if typ != 3 or pr.get("class") != "ocean":
                        continue
                    for r in rs:
                        if len(r) < 3:
                            continue
                        area = sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(r, r[1:] + r[:1]))
                        pts = [((tx + q[0] / ext - X0) / (X1 - X0) * big, (ty + q[1] / ext - Y0) / (Y1 - Y0) * big) for q in r]
                        sdraw.polygon(pts, fill=255 if area > 0 else 0)
    im.paste(Image.new("RGB", im.size, water), (0, 0), sea)
    im = im.resize((size, size), Image.LANCZOS)
    out = work / "map-layout.png"
    im.save(out)
    # 地域の真ん中（札の既定の位置）と街の位置を控える。finalize が読む
    import numpy as np
    a = np.asarray(im.resize((256, 256), Image.NEAREST)).astype(int)
    cen = {}
    for rid, r in m["regions"].items():
        c = np.array(gl()._hex(r["color"]))
        ys, xs = np.nonzero(np.abs(a - c).sum(axis=2) < 12)
        if len(xs):
            cen[rid] = {"x": round(float(xs.mean()) / 256, 4), "y": round(float(ys.mean()) / 256, 4), "px": int(len(xs))}
    cities = [{"city": c["city"], "region": c["region"], **dict(zip(("x", "y"), (round(v, 4) for v in f(c["lat"], c["lon"]))))}
              for c in book["route"]]
    (work / "map-geo.json").write_text(json.dumps({"bbox": bb, "centers": cen, "cities": cities, "sources": used},
                                                  ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"下敷き: {out}（{size}x{size}）。地域 {', '.join(f'{k} {v['px']}' for k, v in cen.items())}・街 {len(cities)}")
    return 0


# ---------------------------------------------------------------- EC2

def who(spec: dict) -> str:
    return "legend-art-" + spec["_slug"]


def run(spec, order, root, work, only=None, all_=False) -> int:
    picked = select(spec, order, root, work, only, all_)
    for s in picked:
        if s.get("later"):
            print(f"後回し {s['slot']}: {s['later']}")
    jobs = [{"id": s["id"], "prompt": s["prompt"], "title": s["title"], "files": [r for _, r in s["files"]]}
            for s in picked if not s.get("later")]
    if not jobs:
        print("送る品が無い（manifest に全部ある。描き直しは頼み書きの v を上げて --only で）")
        return 0
    e = ga.ec2()
    D = spec["ec2_dir"]
    work.mkdir(parents=True, exist_ok=True)
    jf = work / "jobs.json"
    jf.write_text(json.dumps(jobs, ensure_ascii=False, indent=1), encoding="utf-8")
    e.ensure_running()
    e.put(str(HERE.parent / "ec2-chrome" / "cdp.py"), f"{ga.EC2_TOOLS}/cdp.py")
    e.put(str(HERE.parent / "chatgpt" / "chatgpt.py"), f"{ga.EC2_TOOLS}/chatgpt.py")
    e.put(str(HERE / "chatgpt_image.py"), f"{ga.EC2_TOOLS}/chatgpt_image.py")
    e.put(str(HERE / "guide_art.py"), f"{ga.EC2_TOOLS}/guide_art.py")
    conv, sent = [], set()
    for s in picked:
        for local, remote in ([] if s.get("later") else s["files"]):
            if remote in sent:
                continue
            sent.add(remote)
            if remote.endswith(".png") and local.endswith(".webp"):
                e.put(local, remote[:-4] + ".webp")
                conv.append((remote[:-4] + ".webp", remote))
            else:
                e.put(local, remote)
    e.put(str(jf), f"{D}/jobs.json")
    # 同じ id の絵が EC2 にもう在ると、一括は描かずにそれを返す（guide_art.py の run と同じ止め）
    stale = "".join(f"[ -f {D}/{j['id']}-0.png ] && S=\"$S {j['id']}\"\n" for j in jobs)
    sh = (f"S=''\n{stale}"
          f"if [ -n \"$S\" ]; then echo \"STALE:$S\"; exit 0; fi\n"
          f"mkdir -p {D}/in\n"
          + (f"python3 -c 'import sys; from PIL import Image; a=sys.argv[1:]; "
             f"[Image.open(a[i]).convert(\"RGB\").save(a[i+1]) for i in range(0, len(a), 2)]' "
             + " ".join(f"{a} {b}" for a, b in conv) + "\n" if conv else "") +
          f"rm -f {D}/DONE-jobs.json\n"
          f"nohup {ga.QUEUE} hold chatgpt --who {who(spec)} --purpose 'legend art {spec['_slug']} {len(jobs)}' "
          f"--wait 14400 -- python3 {ga.EC2_TOOLS}/guide_art.py batch {D}/jobs.json {D} > {D}/log-jobs.txt 2>&1 &\n"
          f"sleep 8\n{ga.QUEUE} list 2>&1 | tail -4\ntail -3 {D}/log-jobs.txt\n")
    st, out = e.run(sh, 300, quiet=True)
    if "STALE:" in out:
        print(f"送らなかった: EC2 に前の絵が在る品 {out.split('STALE:', 1)[1].strip()}。頼み書きの v を上げて、もう一度 run")
        return 1
    print(out.strip()[-500:])
    print(f"送った {len(jobs)}件（1件 1.5〜5分）。待つのは `wait` を run_in_background で。終わったら `fetch`")
    return 0 if st == "Success" else 1


def status_rows(spec: dict) -> tuple[str, list[list[str]]] | None:
    st, out = ga.ec2().run(f"python3 - {spec['ec2_dir']} <<'PY'\n{ga.STATUS_PY}\nPY\n", 90, quiet=True)
    lines = out.strip().splitlines()
    if not lines or lines[0] not in ("DONE", "RUNNING"):
        print(out.strip()[-300:])
        return None
    return lines[0], [ln.split(" ", 2) for ln in lines[1:]]


def status(spec: dict) -> int:
    r = status_rows(spec)
    if not r:
        return 1
    head, rows = r
    n = {k: sum(1 for x in rows if x[1] == k) for k in ("ok", "ng", "wait")}
    print(f"{head}: 描けた {n['ok']} / 断り・失敗 {n['ng']} / まだ {n['wait']}")
    for x in rows:
        if x[1] == "ng":
            print(f"  ng {x[0]}: {x[2] if len(x) > 2 else ''}")
    return 0


def wait(spec: dict, until: int, every: int, limit: int) -> int:
    """裏で回す待ち（run_in_background）。描けた数が `until` に届くか、一括が終わるまで、`every` 秒ごとに1回だけ聞く"""
    end = time.time() + limit
    while True:
        r = status_rows(spec)
        if r:
            head, rows = r
            ok = sum(1 for x in rows if x[1] == "ok")
            ng = sum(1 for x in rows if x[1] == "ng")
            if head == "DONE" or ok >= until:
                print(f"{head}: 描けた {ok} / 断り・失敗 {ng} / 全 {len(rows)}")
                return 0
        if time.time() > end:
            print("待ちの上限に来た")
            return 1
        time.sleep(every)


def fetch(spec, order, root, work, only=None) -> int:
    raw = work / "raw"
    raw.mkdir(parents=True, exist_ok=True)
    if only:
        ids = [s["id"] for s in select(spec, order, root, work, only)]
    elif (work / "jobs.json").is_file():
        ids = [j["id"] for j in json.loads((work / "jobs.json").read_text(encoding="utf-8"))]
    else:
        ids = [s["id"] for s in select(spec, order, root, work)]
    want = [i for i in ids if not any((raw / f"{i}-0{x}").is_file() for x in (".png", ".webp"))]
    if not want:
        print("持ち帰るものが無い（手元に全部ある）")
        return 0
    D = spec["ec2_dir"]
    st, out = ga.ec2().run(f"python3 - {D} {' '.join(want)} <<'PY'\n{ga.PACK_PY}\nPY\n", 600, quiet=True)
    m = re.search(r"PACKED (\d+)", out)
    if not m:
        print(out.strip()[-300:])
        return 1
    if m.group(1) == "0":
        print("EC2 にも、まだ描けた絵が無い")
        return 2
    tar = work / "pack.tar"
    ga.ec2().get(f"{D}/pack.tar", str(tar))
    import tarfile
    with tarfile.open(tar) as t:
        t.extractall(raw, filter="data")
    tar.unlink()
    print(f"持ち帰った {m.group(1)}件 → {raw}")
    return 0


# ---------------------------------------------------------------- 焼く

def bake_cover_title(im, t: dict):
    """表紙の上の空に、題の札（面の紙の色の角丸）を焼く。1行目は大きく、2行目は帯（`guide_layout.bake_title` と同じ色）"""
    from PIL import Image, ImageDraw, ImageFilter, ImageFont
    W, H = im.size
    u = W * t.get("scale", 1.0)
    l1, l2 = t["lines"]
    f1 = ImageFont.truetype(str(gl().font("Black")), round(u * 0.066))
    f2 = ImageFont.truetype(str(gl().font("Black")), round(u * 0.042))
    w1 = f1.getlength(l1)
    w2 = f2.getlength(l2) + u * 0.05
    pad = u * 0.026
    lh1, lh2 = u * 0.088, u * 0.066
    w, h = max(w1, w2) + 2 * pad, lh1 + lh2 + pad * 1.6
    x0, y0 = t["x"] * W - w / 2, t["y"] * H
    ex, ey = W * gl().TITLE_EDGE, H * gl().TITLE_EDGE
    if x0 < ex or y0 < ey - 0.5 or x0 + w > W - ex or y0 + h > H - ey:
        raise ValueError(f"題の札が絵の端より外へ出る（札 {w:.0f}x{h:.0f}px・左上 {x0:.0f},{y0:.0f}・絵 {W}x{H}）")
    shadow = Image.new("RGBA", im.size, (0, 0, 0, 0))
    top = Image.new("RGBA", im.size, (0, 0, 0, 0))
    sd, td = ImageDraw.Draw(shadow), ImageDraw.Draw(top)
    r = u * 0.025
    sd.rounded_rectangle((x0, y0 + u * 0.008, x0 + w, y0 + h + u * 0.008), r, fill=(60, 40, 20, 110))
    td.rounded_rectangle((x0, y0, x0 + w, y0 + h), r, fill=gl().TITLE_PAPER + (238,))
    cx, y = x0 + w / 2, y0 + pad * 0.8
    td.text((cx, y + lh1 / 2), l1, font=f1, fill=gl().INK + (255,), anchor="mm")
    y += lh1
    mm = u * 0.007
    td.rounded_rectangle((cx - w2 / 2, y + mm, cx + w2 / 2, y + lh2 - mm), (lh2 - 2 * mm) / 2, fill=gl().TITLE_ACCENT + (255,))
    td.text((cx, y + lh2 / 2), l2, font=f2, fill=(255, 255, 255, 255), anchor="mm")
    shadow = shadow.filter(ImageFilter.GaussianBlur(u * 0.01))
    box = {"x": round(t["x"], 4), "y": round((y0 + h / 2) / H, 4), "w": round(w / W, 4), "h": round(h / H, 4)}
    return Image.alpha_composite(Image.alpha_composite(im.convert("RGBA"), shadow), top).convert("RGB"), box


def city_label(c: dict, how: dict, W: int, H: int) -> dict:
    lab = [c["city"]]
    b = gl().name_box(lab, W, H)
    gap = 0.014
    side = how.get("side", "r")
    x, y = c["x"], c["y"]
    if side == "r":
        x += b["w"] / 2 + gap
    elif side == "l":
        x -= b["w"] / 2 + gap
    elif side == "t":
        y -= b["h"] / 2 + gap
    else:
        y += b["h"] / 2 + gap
    return {"label": lab, "x": round(x + how.get("dx", 0), 4), "y": round(y + how.get("dy", 0), 4)}


def bake_route(im, cities: list[dict]):
    """回る街の点線（順に）と、街の点を焼く。最後の飛ぶ区間（陸の上を長く渡る）は西の海へふくらむ弧にする"""
    from PIL import Image, ImageDraw, ImageFilter
    W, H = im.size
    k = W / 1200
    ov = Image.new("RGBA", im.size, (0, 0, 0, 0))
    sh = Image.new("RGBA", im.size, (0, 0, 0, 0))
    d, sd = ImageDraw.Draw(ov), ImageDraw.Draw(sh)
    red = gl().TITLE_ACCENT + (255,)
    pts = [(c["x"] * W, c["y"] * H) for c in cities]

    def dots(path, r, step):
        """折れ線の上に、長さ `step` ごとに点を打つ（街の点の上には打たない）"""
        segs = [(a, b, math.hypot(b[0] - a[0], b[1] - a[1])) for a, b in zip(path, path[1:])]
        total = sum(L for _, _, L in segs)
        t = 14 * k
        while t < total - 14 * k:
            s = t
            for (ax, ay), (bx, by), L in segs:
                if s <= L:
                    x, y = ax + (bx - ax) * s / L, ay + (by - ay) * s / L
                    break
                s -= L
            sd.ellipse((x - r - 1.6 * k, y - r, x + r + 1.6 * k, y + r + 3.2 * k), fill=(60, 40, 20, 90))
            d.ellipse((x - r - 1.6 * k, y - r - 1.6 * k, x + r + 1.6 * k, y + r + 1.6 * k), fill=(255, 255, 255, 255))
            d.ellipse((x - r, y - r, x + r, y + r), fill=red)
            t += step
    for a in range(len(pts) - 2):
        dots([pts[a], pts[a + 1]], 3.4 * k, 15 * k)
    # 最後の区間（飛行機）。西へふくらむ2次の弧
    (ax, ay), (bx, by) = pts[-2], pts[-1]
    cx, cy = min(ax, bx) - 0.22 * W, (ay + by) / 2
    arc = [((1 - t) ** 2 * ax + 2 * (1 - t) * t * cx + t ** 2 * bx, (1 - t) ** 2 * ay + 2 * (1 - t) * t * cy + t ** 2 * by)
           for t in (i / 80 for i in range(81))]
    dots(arc, 2.6 * k, 15 * k)
    for x, y in pts:
        r = 9 * k
        sd.ellipse((x - r, y - r + 2 * k, x + r, y + r + 2 * k), fill=(60, 40, 20, 110))
        d.ellipse((x - r, y - r, x + r, y + r), fill=(255, 255, 255, 255))
        d.ellipse((x - r * 0.62, y - r * 0.62, x + r * 0.62, y + r * 0.62), fill=red)
    sh = sh.filter(ImageFilter.GaussianBlur(2 * k))
    return Image.alpha_composite(Image.alpha_composite(im.convert("RGBA"), sh), ov).convert("RGB")


def raw_of(work: Path, id: str) -> Path | None:
    return next((p for x in (".png", ".webp") if (p := work / "raw" / f"{id}-0{x}").is_file()), None)


def map_labels(spec: dict, work: Path, W: int, H: int) -> tuple[list[dict], list[dict], list[dict]]:
    m = spec["map"]
    g = json.loads((work / "map-geo.json").read_text(encoding="utf-8"))
    areas = []
    for rid, r in m["regions"].items():
        at = m.get("labels", {}).get(rid) or g["centers"][rid]
        areas.append({"id": rid, "label": [r["name"]], "x": at["x"], "y": at["y"], "color": r["tag"]})
    names = [city_label(c, m.get("cities", {}).get(c["city"], {}), W, H) for c in g["cities"]]
    return areas, names, g["cities"]


def bake_map(spec: dict, work: Path, base):
    W, H = base.size
    areas, names, cities = map_labels(spec, work, W, H)
    im = bake_route(base, cities)
    r = 0.012
    avoid = {**gl().area_boxes(areas, W, H), **{f"街の点「{c['city']}」": {"x": c["x"], "y": c["y"], "w": r, "h": r}
                                               for c in cities}}
    im = gl().bake_names(im, names, avoid)
    dots = {f"街の点「{c['city']}」": {"x": c["x"], "y": c["y"], "w": r, "h": r} for c in cities}
    im = gl().bake(im, areas, dots)
    return im, areas, names, cities


def finalize(spec, order, book, root, work) -> int:
    from PIL import Image
    out = out_dir(spec, root)
    (out / "dishes").mkdir(parents=True, exist_ok=True)
    old = read_manifest(out / "manifest.json")
    man = {"slug": spec["_slug"], "updated": time.strftime("%Y-%m-%d"),
           "note": "ChatGPT（EC2 の Chrome）で描いた絵。字（題・地域と街の名前）はこちらの道具で焼いた。"
                   "job は描いた頼みの id（版が上がると末尾の数が増える）、prompt_sha は頼んだ文の sha1 の頭",
           "cover": old.get("cover"), "map": old.get("map"), "dishes": {}}
    today = time.strftime("%Y-%m-%d")
    got = {"cover": 0, "map": 0, "dish": 0}
    U = url_dir(spec)
    for s in slots(spec, order, root, work):
        p = raw_of(work, s["id"])
        e = entry_of(old, s)
        ver = {"job": s["id"], "v": s["v"], "prompt_sha": s["sha"], "drawn": today}
        if s["kind"] == "dish":
            if p is None:
                if e:
                    man["dishes"][s["key"]] = e
                continue
            n = spec.get("dish_size", 600)
            im = Image.open(p).convert("RGB")
            im = ga.crop(im, 1.0).resize((n, n), Image.LANCZOS)
            im.save(out / "dishes" / f"{s['key']}.webp", "WEBP", quality=82, method=6)
            keep = e if e and e.get("job") == s["id"] else {}
            man["dishes"][s["key"]] = {"src": f"{U}dishes/{s['key']}.webp", "w": n, "h": n, "alt": s["label"],
                                       "kind": "ai", **ver, "drawn": keep.get("drawn", today),
                                       **({"why": s["why"]} if s.get("why") else {})}
            got["dish"] += 1
        elif s["kind"] == "cover":
            if p is None:
                continue
            c = spec["cover"]
            base = Image.open(p).convert("RGB")
            base.save(out / "cover-base.webp", "WEBP", quality=86, method=6)
            im, box = bake_cover_title(base, c["title"])
            im.save(out / "cover.webp", "WEBP", quality=86, method=6)
            og = ga.crop(base, 1200 / 630, c.get("og_bias", 0.5)).resize((1200, 630), Image.LANCZOS)
            og.save(out / "cover-1200x630.jpg", "JPEG", quality=86, optimize=True, progressive=True)
            keep = e if e and e.get("job") == s["id"] else {}
            title = "".join(c["title"]["lines"])
            man["cover"] = {"src": f"{U}cover.webp", "w": im.width, "h": im.height,
                            "alt": f"{title}。{c['alt']}", "titled": True, "title_box": box,
                            "base": {"src": f"{U}cover-base.webp", "w": base.width, "h": base.height, "alt": c["alt"]},
                            "og": {"src": f"{U}cover-1200x630.jpg", "w": 1200, "h": 630, "alt": c["alt"]},
                            "kind": "ai", "people": [Path(x).name for x in c.get("people", [])], **ver,
                            "drawn": keep.get("drawn", today)}
            got["cover"] += 1
        else:
            if p is None and not (out / "map-base.webp").is_file():
                continue
            base = Image.open(p).convert("RGB") if p else Image.open(out / "map-base.webp").convert("RGB")
            if base.width != 1200:
                base = base.resize((1200, round(base.height * 1200 / base.width)), Image.LANCZOS)
            base.save(out / "map-base.webp", "WEBP", quality=88, method=6)
            im, areas, names, cities = bake_map(spec, work, base)
            im.save(out / "map.webp", "WEBP", quality=88, method=6)
            keep = e if e and e.get("job") == s["id"] else {}
            man["map"] = {"src": f"{U}map.webp", "w": im.width, "h": im.height, "alt": spec["map"]["alt"],
                          "base": {"src": f"{U}map-base.webp", "w": base.width, "h": base.height},
                          "regions": [{"id": a["id"], "name": a["label"][0], "x": a["x"], "y": a["y"]} for a in areas],
                          "cities": [{"city": c["city"], "region": c["region"], "x": c["x"], "y": c["y"]} for c in cities],
                          "source": "OpenStreetMap（海岸線と境界。下敷き）", "kind": "ai", **ver,
                          "drawn": keep.get("drawn", today) if p is None or keep else today}
            got["map"] += 1
    ordered = {d["id"]: man["dishes"][d["id"]] for d in order["dishes"] if d["id"] in man["dishes"]}
    man["dishes"] = ordered
    man = {k: v for k, v in man.items() if v is not None}
    (out / "manifest.json").write_text(json.dumps(man, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    missing = [d["id"] for d in order["dishes"] if d["id"] not in ordered]
    print(f"書き出し: 料理 {len(ordered)}/{len(order['dishes'])}（今回 {got['dish']}）・表紙 {'有' if 'cover' in man else '無'}"
          f"・地図 {'有' if 'map' in man else '無'} → {out}")
    if missing:
        print(f"まだの料理 {len(missing)}: {' '.join(missing[:20])}{' …' if len(missing) > 20 else ''}")
    return 0


# ---------------------------------------------------------------- 見比べ

def ref_url(ref: str) -> str | None:
    if re.search(r"\.(jpe?g|png|webp)(\?|$)", ref, re.I):
        return ref
    m = re.match(r"https?://en\.wikipedia\.org/wiki/(.+)$", ref)
    if not m:
        return None
    u = "https://en.wikipedia.org/api/rest_v1/page/summary/" + m.group(1)
    d = json.load(urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=30))
    t = (d.get("thumbnail") or {}).get("source")
    return re.sub(r"/(\d+)px-", "/330px-", t) if t else None


def sheet(spec, order, root, work, only=None) -> int:
    """`sheet-tone.png`（描いた100枚を縮めて10列に並べた1枚）と、`sheet-check-<n>.png`（20品ずつ、Wikipedia の写真｜描いた絵）"""
    from PIL import Image, ImageDraw, ImageFont
    out = out_dir(spec, root)
    ds = [d for d in order["dishes"] if (out / "dishes" / f"{d['id']}.webp").is_file()
          and (not only or d["id"] in only)]
    if not ds:
        print("✕ 並べる絵が無い（finalize がまだ）")
        return 2
    c, per = 150, 10
    tone = Image.new("RGB", (per * c, ((len(ds) + per - 1) // per) * c), (238, 232, 210))
    for i, d in enumerate(ds):
        tone.paste(Image.open(out / "dishes" / f"{d['id']}.webp").convert("RGB").resize((c - 4, c - 4), Image.LANCZOS),
                   ((i % per) * c + 2, (i // per) * c + 2))
    tone.save(work / "sheet-tone.png")
    refd = work / "ref"
    refd.mkdir(parents=True, exist_ok=True)
    f = ImageFont.truetype(str(gl().font("Bold")), 18)
    T, cols, rows = 260, 2, 5
    sheets = []
    for k in range(0, len(ds), cols * rows):
        part = ds[k:k + cols * rows]
        sh = Image.new("RGB", (cols * (2 * T + 30), rows * (T + 30)), (250, 248, 240))
        dr = ImageDraw.Draw(sh)
        for i, d in enumerate(part):
            x, y = (i % cols) * (2 * T + 30), (i // cols) * (T + 30)
            rp = refd / f"{d['id']}.jpg"
            if not rp.is_file():
                for t in range(3):
                    try:
                        u = ref_url(d.get("ref", ""))
                        if u:
                            rp.write_bytes(urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=30).read())
                        break
                    except (OSError, ValueError):
                        time.sleep(2 + 2 * t)
            if rp.is_file():
                try:
                    r = Image.open(rp).convert("RGB")
                    r.thumbnail((T, T))
                    sh.paste(r, (x + (T - r.width) // 2, y + 26 + (T - r.height) // 2))
                except OSError:
                    pass
            sh.paste(Image.open(out / "dishes" / f"{d['id']}.webp").convert("RGB").resize((T, T)), (x + T + 4, y + 26))
            dr.text((x + 4, y + 3), f"{k + i + 1}. {d['id']} {d['title']}", font=f, fill=(60, 40, 20))
        p = work / f"sheet-check-{k // (cols * rows) + 1}.png"
        sh.save(p)
        sheets.append(p)
    print(f"トーン: {work / 'sheet-tone.png'}（{len(ds)}品）\n見比べ: {sheets[0]} …（{len(sheets)}枚）")
    return 0


# ---------------------------------------------------------------- 入口

def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("slug", help="企画（site/public/legends の下の道）")
    ap.add_argument("cmd", choices=["plan", "layout", "run", "status", "wait", "fetch", "finalize", "sheet"])
    ap.add_argument("--only", nargs="*", help="品（cover・map・dish:<id>）か id")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--work")
    ap.add_argument("--order", help="art_order.json の道（既定は頼み書きの order）")
    ap.add_argument("--book", help="book.json の道（既定は頼み書きの book）")
    ap.add_argument("--until", type=int, default=10 ** 6)
    ap.add_argument("--every", type=int, default=600)
    ap.add_argument("--limit", type=int, default=6 * 3600)
    ap.add_argument("--root", default=str(ROOT))
    a = ap.parse_args(argv)
    root = Path(a.root)
    spec, order, book = load(a.slug, root, a.order, a.book)
    work = Path(a.work) if a.work else None
    if a.cmd in ("layout", "run", "fetch", "finalize", "sheet") and work is None:
        die(f"{a.cmd} には --work が要る")
    if a.cmd == "plan":
        for s in select(spec, order, root, work, a.only, a.all or not a.only):
            print(f"{s['id']:<34} {len(s['prompt']):>5}字 絵{len(s['files'])} {s['label']}"
                  + (f"  後回し: {s['later']}" if s.get("later") else ""))
        return 0
    if a.cmd == "layout":
        return layout(spec, book, work)
    if a.cmd == "run":
        return run(spec, order, root, work, a.only, a.all)
    if a.cmd == "status":
        return status(spec)
    if a.cmd == "wait":
        return wait(spec, a.until, a.every, a.limit)
    if a.cmd == "fetch":
        return fetch(spec, order, root, work, a.only)
    if a.cmd == "finalize":
        return finalize(spec, order, book, root, work)
    return sheet(spec, order, root, work, a.only)


if __name__ == "__main__":
    sys.exit(main())
