# -*- coding: utf-8 -*-
"""ブルガリア（ソフィア）の案内（`/bulgaria`）の中身を焼く。

    python3 python/build_bulgaria.py

材料は `python/data/bulgaria/`:

| | |
| --- | --- |
| `facts.json` | 調べた事実（見どころ・食べもの・基本情報・ことば・買うもの・行事）。
               **件数はここに書かない**——足した日に古くなる。焼くと最後に数が出る |
| `fill.json`  | 料理の豚／酒／肉と、見どころの入場料 |
| `taste.json` | **あやとの好み。議事録から実測したもの**（全件、本人の発言の引用つき） |
| `places.json`| 地図の日本語の札と、料理・土産がひもづく実在の店・市場 |

出すのは `site/content/bulgaria.ts` と `site/content/bulgaria/map.json`。

## 地図は節ごとに3枚（2026-11-13）

あやと（ソフィア滞在中）:

> 見たいもの、食べたいもの、買いたいもののところにマップを入れてほしくて、
> どこにあるのか分かるようにしてほしいです。でマップが日本語じゃなくて見にくいので、
> 日本語のマップに変えてほしいです。Googleマップが使いやすかった。
> でアルクコースのセクションはいらないです。

地の絵（`city.png`）は1枚のまま、**切り抜く枠だけを節ごとに変える。**
載る数が減れば縮尺が上がり、**日本語の札を置く場所ができる**（`place_labels`）。
札が1枚でも重ならずに置けなければ、**焼かずに落ちる。**

**歩くコースは焼いていない。** 材料（`fill.json` の `course`）は残してある
——理由はあちらの `_course_why`。

## 好みの印は付けない。豚と酒は、アイコンで知らせる（2026-11-15。#1228）

あやと（#1228）:

> 僕の好みを書いてることが多くて、第三者から見たときノイズになる。

前は、あやとの好み（豚が苦手・酒をやめた・ローカル市場が好き）を議事録から測って、
規則1本で ◎○⚠ を付けていた。**読む人はあやとではない。** 好みで品を外したり印を
付けたりせず、**豚肉あり・アルコールありの2つだけを事実として焼く**（`pork` `alcohol`）。
選ぶのは読む人（`docs/island-misses.md` #326）。

星（`rank`。1〜3）は一般の重要度なので残す。

## 出どころも焼く

面の終わりに出どころの一覧を出す（`docs/guide-design.md` 4-4）。だから
**事実の1件ごとに `src` を連れてくる**（入場料は `feesrc`、肉の中身は `meatsrc`）。
"""

import json
import math
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from maps_link import search as maps_search  # noqa: E402  Google マップの道は1か所で組む

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "python" / "data" / "bulgaria"
OUT_TS = ROOT / "site" / "content" / "bulgaria.ts"
OUT_MAP = ROOT / "site" / "content" / "bulgaria" / "map.json"

#: Google マイマップの埋め込みの id（`docs/mymaps.md`）。
#: **面に直書きしない。** 3枚の地図は材料から焼いた CSV を取り込んで作ってあり、
#: 作り直すと id が変わる。1か所に置いて、面はここから読む
MIDS = json.loads((SRC / "mymaps" / "mids.json").read_text(encoding="utf-8"))

F = json.loads((SRC / "facts.json").read_text(encoding="utf-8"))
FILL = json.loads((SRC / "fill.json").read_text(encoding="utf-8"))

#: 写真（Wikimedia Commons）。**無くても焼ける**ようにしてある——
#: 写真を集める仕事と面を作る仕事が別なので、片方を待って止まらないため。
#: ただし**1枚も無いまま出さない**。足りない件数は最後に数えて出す
_PH = SRC / "photos.json"
PHOTOS = json.loads(_PH.read_text(encoding="utf-8")) if _PH.exists() else {}

#: 本物の街の地図（OpenStreetMap のタイルを合成したもの）。
#: `python/build_bulgaria_map.py` が焼く。**無ければ自前の丸だけの絵に落ちる**
_TL = SRC / "tiles.json"
TILES = json.loads(_TL.read_text(encoding="utf-8")) if _TL.exists() else None

#: 地図の日本語の札と、料理・土産がひもづく実在の店・市場。
#: あやと（2026-11-13）:「マップが日本語じゃなくて見にくい」。
#: OSM のタイルに焼かれた字はブルガリア語のままなので、**こちらの札を日本語で描く。**
PLACES = json.loads((SRC / "places.json").read_text(encoding="utf-8"))

#: Google マップの検索に足す街の名前（現地の字）と、足さない見どころ（街の外にあるもの）
CITY = PLACES["city"]
NO_CITY = set(PLACES.get("no_city") or [])


def first_name(cyr: str, roman: str = "") -> str:
    """検索に使う名前。**「A / B」と2つ並べた名前は前の1つ**——並べたまま探すと、
    両方の字を持つ所にしか当たらない。現地の字が無ければローマ字で探す。"""
    return ((cyr or roman or "").split(" / ")[0]).strip()


def spot_maps(s: dict) -> str:
    """見どころの Google マップ。**座標ではなく、現地の字の名前 ＋ 街で検索して開く。**

    あやと（2026-11-15）:「座標に飛ばされてよく分かりにくい。店が分かるように、
    Google マップで検索をかけた状態で渡してほしい」。座標だと名前の無い点が1つ
    立つだけで、何の建物か・開いているかが出ない（`python/maps_link.py`）。
    """
    name = first_name(s.get("cyr", ""), s.get("roman", ""))
    return maps_search(name) if s["name"] in NO_CITY else maps_search(name, CITY)


def place_maps(p: dict) -> str:
    """店・市場の Google マップ。**見どころと同じ場所（`from_spot`）は、見どころと同じ字で探す**
    （同じ場所を2通りの字で探すと、片方だけ別の所に当たる）。店は `q`（名前と通り）＋ 街。"""
    if p.get("from_spot"):
        src = next((s for s in F["spots"] if s["name"] == p["from_spot"]), None)
        if not src:
            raise SystemExit("見どころに無い場所: %s" % p["from_spot"])
        return spot_maps(src)
    if not p.get("q"):
        raise SystemExit("検索の字（q）が無い店: %s" % p["key"])
    return maps_search(p["q"], CITY)


def near_maps(d: dict) -> str:
    """料理・土産の「近くで探す」。**品の現地の名前 ＋ 街**で、出している店の一覧を開く。

    **1軒を「ここ」と言わない**決まり（`places.json` の頭）には触れない——
    検索は店を並べるだけで、どれかを選んで渡してはいない。
    """
    return maps_search(first_name(d.get("cyr", ""), d.get("roman", "")), CITY)


# ---------------------------------------------------------------------------
# 地図の札（日本語）を、重ならない場所へ置く
#
# **寸法の単位は地図の目盛り（viewBox）で、画素ではない。** SVG はまるごと同じ
# 倍率で縮むので、**ここで重なっていなければ、どの画面幅でも重ならない。**
# 画素で考えるのは「スマホで何 px に見えるか」を決める下の3つだけ。
# ---------------------------------------------------------------------------

#: 札の字が、横 430px のスマホで何 CSS px に見えるか
LABEL_PX = 10.0
#: そのときの地図の幅（430 − 左右の余白 16px ずつ）
MAP_CSS_W = 398.0
#: ピンの丸の半径（CSS px）
PIN_PX = 13.0

#: 札を置きにいく向き。**右・左・下・上を先に試す**——斜めは線が長くなって読みにくい。
#: 角度は SVG の座標なので、90度が「下」
_DIRS = [0, 180, 90, 270, 30, 150, 210, 330, 60, 120, 240, 300,
         15, 165, 195, 345, 45, 135, 225, 315, 75, 105, 255, 285]


def text_units(s: str, font: float) -> float:
    """札の字の幅。**全角は1em・半角は0.5em**で見積もる（日本語の札なのでほぼ全角）"""
    return sum(0.5 if 0x20 <= ord(ch) <= 0x7e else 1.0 for ch in s) * font


def _hit(a, b, m=0.0) -> bool:
    """2つの矩形が（余白 m ぶん膨らませて）ぶつかるか"""
    return not (a[0] >= b[2] + m or a[2] <= b[0] - m
                or a[1] >= b[3] + m or a[3] <= b[1] - m)


def place_labels(pins, box, font, pin_r) -> bool:
    """札を、どれとも重ならない場所に置く。**1つでも置けなければ False。**

    置けなかったぶんを「札なし」で出すことはしない——地図の上で名前が読めないピンは、
    あやとが現地で見ても何なのか分からない。呼ぶ側が縮尺か字の大きさを変えて測り直す。
    """
    pad = 0.38 * font
    gap = pin_r + 0.30 * font
    taken = [(p["x"] - pin_r, p["y"] - pin_r, p["x"] + pin_r, p["y"] + pin_r)
             for p in pins]
    for p in sorted(pins, key=lambda q: (q["prio"], q["id"])):
        w = text_units(p["text"], font) + 2 * pad
        h = font * 1.5
        got = None
        for far in (1.0, 1.8, 2.8, 4.0):
            for a in _DIRS:
                ux, uy = math.cos(math.radians(a)), math.sin(math.radians(a))
                # 札の「手前の辺」がピンから gap×far だけ離れる位置に、箱の中心を置く
                t = far * gap + (abs(ux) * w + abs(uy) * h) / 2
                cx2, cy2 = p["x"] + ux * t, p["y"] + uy * t
                r = (cx2 - w / 2, cy2 - h / 2, cx2 + w / 2, cy2 + h / 2)
                if r[0] < box[0] or r[1] < box[1] or r[2] > box[2] or r[3] > box[3]:
                    continue
                if any(_hit(r, q, 0.12 * font) for q in taken):
                    continue
                got = (r, far)
                break
            if got:
                break
        if not got:
            return False
        r, far = got
        taken.append(r)
        p.update(lx=round(r[0], 1), ly=round(r[1], 1),
                 lw=round(w, 1), lh=round(h, 1),
                 lcx=round((r[0] + r[2]) / 2, 1), lcy=round((r[1] + r[3]) / 2, 1),
                 lead=far > 1.0)
    return True


def _fit_box(pins, W, H, mx, my, aspect, min_w):
    """ピンを囲む切り抜きの枠。**絵の外にはみ出さない**ように寄せる"""
    xs = [p["x"] for p in pins]
    ys = [p["y"] for p in pins]
    w = max(max(xs) - min(xs) + 2 * mx, min_w)
    h = max(ys) - min(ys) + 2 * my
    if w / h < aspect:
        w = h * aspect
    else:
        h = w / aspect
    if w > W:
        w, h = W, W / aspect
    if h > H:
        h, w = H, min(W, H * aspect)
    cx2 = (min(xs) + max(xs)) / 2
    cy2 = (min(ys) + max(ys)) / 2
    x0 = min(max(cx2 - w / 2, 0.0), W - w)
    y0 = min(max(cy2 - h / 2, 0.0), H - h)
    return x0, y0, w, h


def bake_map(pins, W, H, art, far, aspect=1.15, min_w=520.0):
    """節ひとつぶんの地図。

    **節ごとに、その節の場所だけを載せる**（あやと 2026-11-13）。ピンが減ったぶん
    縮尺を上げられるので、日本語の札を置く場所ができる。

    札が置けなければ、**字を少しずつ小さく・枠を少しずつ広く**して測り直す。
    それでも置けなければ呼び出し側に None を返す（焼かずに落ちる）。
    """
    for shrink in (1.0, 0.94, 0.88, 0.82, 0.76, 0.70):
        for grow in (1.0, 1.15, 1.3, 1.5):
            x0, y0, w, h = _fit_box(pins, W, H, 60.0 * grow, 40.0 * grow,
                                    aspect, min_w * grow)
            font = LABEL_PX * shrink * w / MAP_CSS_W
            pin_r = PIN_PX * w / MAP_CSS_W
            box = (x0 + 0.2 * font, y0 + 0.2 * font,
                   x0 + w - 0.2 * font, y0 + h - 0.2 * font)
            trial = [dict(p) for p in pins]
            if place_labels(trial, box, font, pin_r):
                return {"x": round(x0, 1), "y": round(y0, 1),
                        "w": round(w, 1), "h": round(h, 1),
                        "font": round(font, 2), "r": round(pin_r, 2),
                        "art": art, "pins": trial, "far": far}
    return None


#: 写真の欄。**出どころ（`cm`）と撮った人（`by`）とライセンス（`lic`）を必ず連れてくる。**
#: どれか1つでも欠けたら、その写真は使わない——出どころの書けない絵を島に置かない
PHOTO_KEYS = ("img", "thumb", "big", "cm", "by", "lic", "alt")


def photo_of(kind: str, key: str) -> dict:
    """その1件の写真。**欠けていたら空の欄を返す**（面の側で分岐を書かないため）。"""
    p = (PHOTOS.get(kind) or {}).get(key) or {}
    if not all(p.get(k) for k in ("img", "cm", "lic")):
        return {k: "" for k in PHOTO_KEYS}
    return {k: p.get(k, "") for k in PHOTO_KEYS}


def esc(s) -> str:
    """TypeScript の文字列に入れる形。**改行とバッククォートを殺す**"""
    return (str(s or "").replace("\\", "\\\\").replace('"', '\\"')
            .replace("\n", " ").strip())


def main() -> None:
    fill_food = {x["jp"]: x for x in FILL["food"]}
    fill_spot = {x["name"]: x for x in FILL["spots"]}

    # ---- 突き合わせ。**名前が1つでも合わなければ焼かない**
    miss = [x["jp"] for x in F["food"] if x["jp"] not in fill_food]
    miss += [x["name"] for x in F["spots"] if x["name"] not in fill_spot]
    if miss:
        raise SystemExit("材料の名前が合いません: %s" % miss[:5])

    bad_nc = NO_CITY - {s["name"] for s in F["spots"]}
    if bad_nc:
        raise SystemExit("places.json の no_city が見どころに無い: %s" % sorted(bad_nc))

    spots, food, buy = [], [], []
    for s in F["spots"]:
        g = fill_spot[s["name"]]
        # **Google マップの道は、名前から1か所で作る**（`spot_maps`）。
        # 材料のほうに書いた字を持ち回ると、`hl=ja` のような直しが片側にだけ残る
        spots.append({**s, "fee": g.get("fee", ""), "feesrc": g.get("src", ""),
                      "maps": spot_maps(s),
                      **photo_of("spots", s["name"])})
    # 距離は下で地図を組むときに出す（同じ計算を2回書かない）
    for d in F["food"]:
        g = fill_food[d["jp"]]
        # **豚と酒は事実として持つ**（好みの印にしない。#1228）
        food.append({**d, **{k: g[k] for k in ("pork", "alcohol", "meat", "note")},
                     "meatsrc": g.get("src", ""), "near": near_maps(d),
                     **photo_of("food", d["jp"])})
    alcohol = set(FILL["buy_alcohol"])
    miss_a = alcohol - {x["what"] for x in F["buy"]}
    if miss_a:
        raise SystemExit("土産の名前が合いません: %s" % sorted(miss_a))
    for x in F["buy"]:
        buy.append({**x, "alcohol": x["what"] in alcohol, "near": near_maps(x),
                    **photo_of("buy", x["what"])})

    # ---- 街の地図。**緯度経度から座標を出すのはここだけ。**
    # 面の側で出し直さない（`components/macedonia/NmMapSvg.tsx` と同じ決まり）
    #
    # ## 節ごとに1枚（2026-11-13・あやと）
    #
    # > 見たいもの、食べたいもの、買いたいもののところにマップを入れてほしくて、
    # > どこにあるのか分かるようにしてほしい
    #
    # 1枚の地図に全部を載せるのをやめた。**節ごとに、その節の場所だけ**を載せる。
    # 載るものが減れば縮尺を上げられて、**日本語の札を置く場所ができる。**
    # 地の絵（`city.png`）は3枚で共有し、切り抜く枠だけを変える——
    # 絵を3枚焼くと、読む人が3枚ぶん払うことになる。
    c = F["center"]
    # 1.5km 四方の狭い範囲なので、経度を cos(緯度) で縮めれば十分に合う
    k = math.cos(math.radians(c["lat"]))

    def km(s):
        """中心からの距離（km）。緯度1度=111km、経度は cos で縮める"""
        return math.hypot((s["lat"] - c["lat"]) * 111.0,
                          (s["lon"] - c["lon"]) * 111.0 * k)

    if not TILES:
        raise SystemExit("地図の絵が無い（python3 python/build_bulgaria_map.py）")

    # web-mercator。**緯度を線形で割らない**（焼いたほうと同じ式にする）
    def _merc(lat):
        return math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))

    T, W, H = TILES, float(TILES["w"]), float(TILES["h"])
    _ny, _sy = _merc(T["north"]), _merc(T["south"])

    def at(s):
        return (round((s["lon"] - T["west"]) / (T["east"] - T["west"]) * W, 1),
                round((_ny - _merc(s["lat"])) / (_ny - _sy) * H, 1))

    def on_art(s) -> bool:
        """地の絵の中に入っているか。**外のものはピンにしない**
        （絵の無いところに印だけ置くと、どこを指しているのか読めない）"""
        x, y = at(s)
        return 0 <= x <= W and 0 <= y <= H

    art = {"png": T["png"], "png2x": T.get("png2x", ""), "w": W, "h": H,
           "credit": T["attribution"], "licence": T["licence"]}

    # ---- 見どころ。**中心から1km の中だけ**を街の地図に載せる。
    # 外へ広げるほど中心の印が潰れる——リラ修道院（62km）まで入れた最初の版は
    # 1000x10359 の紙になった。**1.0 は恣意的な線ではない**: 距離を並べると
    # 0.95km（ネフスキー大聖堂）と 1.34km（NDK）のあいだに切れ目がある
    WALK_KM = 1.0
    near = [s for s in spots if km(s) <= WALK_KM and on_art(s)]
    # **近い順。** 絵の下に出す1行が「近いものから」で読めるようにする
    # **同着は名前で切る。** 並びが入力の順に左右されると、同じ材料から
    # 違う焼き上がりが出て、凍りの見張りが字面の差を「新しくなった」と読む
    far = sorted(({**s, "km": round(km(s), 1)} for s in spots
                  if km(s) > WALK_KM or not on_art(s)),
                 key=lambda s: (s["km"], s["name"]))

    # ---- 記号（A・B・C…）。**一覧と地図が同じ字で対応する**のが、るるぶの要。
    # 一覧は星（必見→余裕があれば）の順に並ぶので、**記号もその順**に振る。
    # 番号ではなく英字なのは、星（1〜3）と混ざらないようにするため
    near.sort(key=lambda s: (s["rank"], km(s), s["name"]))
    for i, s in enumerate(near):
        s["letter"] = chr(ord("A") + i) if i < 26 else ""

    # ---- 店・市場。**`where` に名前の出てくるものだけ**をピンにする。
    # 「どのレストランにもある」を1軒に落とすと、現地で探して見つからない
    labels = PLACES["labels"]
    miss_l = [s["name"] for s in spots if s["name"] not in labels]
    if miss_l:
        raise SystemExit("地図の札が無い見どころ: %s" % miss_l[:5])
    by_spot = {s["name"]: s for s in spots}
    places = []
    for i, p in enumerate(PLACES["places"]):
        if p.get("from_spot"):
            # **座標を二重に持たない。** 見どころと同じ場所は見どころから引く
            src = by_spot.get(p["from_spot"])
            if not src:
                raise SystemExit("見どころに無い場所: %s" % p["from_spot"])
            lat, lon = src["lat"], src["lon"]
        else:
            lat, lon = p["lat"], p["lon"]
        places.append({"key": p["key"], "n": i + 1, "label": p["label"],
                       "roman": p.get("roman", ""), "what": p["what"],
                       "lat": lat, "lon": lon, "maps": place_maps(p),
                       "km": round(km({"lat": lat, "lon": lon}), 1),
                       "on": on_art({"lat": lat, "lon": lon})})
    by_key = {p["key"]: p for p in places}

    def tie(table: dict, rows: list, key: str):
        """料理・土産に、場所の番号をひもづける。**名前が1つでも合わなければ焼かない**"""
        bad = [k for k in table if k not in {r[key] for r in rows}]
        if bad:
            raise SystemExit("places.json の名前が合いません: %s" % bad[:5])
        used = []
        for r in rows:
            ks = table.get(r[key], [])
            miss_k = [x for x in ks if x not in by_key]
            if miss_k:
                raise SystemExit("places.json に無い場所: %s" % miss_k[:5])
            r["pins"] = [by_key[x]["n"] for x in ks]
            used += ks
        return used

    used_eat = tie(PLACES["food"], food, "jp")

    def map_of(keys, prio_of):
        """節ひとつぶんの地図。**絵の中に入るものだけ**をピンにして、外は下の一覧へ"""
        seen, pins, out_far = set(), [], []
        for key in keys:
            if key in seen:
                continue
            seen.add(key)
            p = by_key[key]
            if p["on"]:
                x, y = at(p)
                pins.append({"id": p["key"], "letter": str(p["n"]), "name": p["label"],
                             "label": p["label"],
                             "text": "%d %s" % (p["n"], p["label"]),
                             "mark": "place", "star": 0,
                             "x": x, "y": y, "prio": prio_of(p)})
            else:
                out_far.append({"name": p["label"], "km": p["km"], "maps": p["maps"]})
        return pins, out_far

    maps = {}
    see_pins = [{"id": s["roman"], "letter": s["letter"], "name": s["name"],
                 "label": labels[s["name"]],
                 # **札にも記号を入れる。** 丸が近いと、どの札がどの丸のものか
                 # 近さだけでは決まらない（実際に読めない組が出た）
                 "text": "%s %s" % (s["letter"], labels[s["name"]]),
                 "mark": "spot", "star": s["rank"],
                 "x": at(s)[0], "y": at(s)[1], "prio": s["rank"]} for s in near]
    maps["see"] = bake_map(
        see_pins, W, H, art,
        [{"name": s["name"], "km": s["km"], "maps": s["maps"]} for s in far])
    eat_pins, eat_far = map_of(used_eat, lambda p: p["n"])
    maps["eat"] = bake_map(eat_pins, W, H, art, eat_far)
    used_buy = tie(PLACES["buy"], buy, "what")
    buy_pins, buy_far = map_of(used_buy, lambda p: p["n"])
    maps["buy"] = bake_map(buy_pins, W, H, art, buy_far)

    stuck = [n for n, m in maps.items() if m is None]
    if stuck:
        raise SystemExit("札が重ならずに置けない地図: %s" % stuck)

    OUT_MAP.parent.mkdir(parents=True, exist_ok=True)
    OUT_MAP.write_text(json.dumps(
        {"art": art, "center": c, "maps": maps},
        ensure_ascii=False, indent=1), encoding="utf-8")

    ts = ['/** ソフィアの調べた事実（`/travel/bulgaria/sofia` の材料）。',
          ' *',
          ' * **手で直さない。** `python3 python/build_bulgaria.py` が焼く。',
          ' * 中身を直すなら `python/data/bulgaria/*.json` のほうを直す。',
          ' *',
          ' * 面の組み立て（やりたいこと・エリア・基本情報の並び）は `content/guidebook/bulgaria-sofia.ts`。',
          ' */',
          "",
          'export const BG_RATE = "%s";' % esc(F["rate_note"]),
          'export const BG_LEAD = "%s";' % esc(F["lead"]),
          ""]

    def cell(k, v):
        """欄ひとつ。**数・真偽・並びはそのまま、それ以外は字**にする"""
        if isinstance(v, (int, float, bool)) or isinstance(v, list):
            return "%s: %s" % (k, json.dumps(v, ensure_ascii=False))
        return '%s: "%s"' % (k, esc(v))

    def arr(name, rows, keys):
        ts.append("export const %s = [" % name)
        for r in rows:
            ts.append("  { " + ", ".join(cell(k, r.get(k)) for k in keys) + " },")
        ts.append("] as const;")
        ts.append("")

    # **地図はマイマップ**（あやと 2026-11-13「Googleマップが使いやすかった。
    # 今のやつはGoogleマップと違って見慣れてなくて見にくい」）。
    # `which` は面の節と1対1。足りない節があれば焼かずに落ちる——
    # 地図の無い節が黙って出るより、焼けないほうがいい
    want = {"see", "eat", "buy"}
    got = {m["which"] for m in MIDS["maps"]}
    if want - got:
        raise SystemExit("マイマップの id が足りません: %s" % sorted(want - got))

    # 開いた時点の中心と縮尺。**手で決めない。**
    #
    # 渡さないとマイマップは「全部のピンが入る縮尺」で開く。リラ修道院が62km 先に
    # あるので、見たいものの地図が県ごと写って中心部が点の塊になった。
    # そこで手で 15 と書いたら、今度は食べたいものの市場2つが画面の外に出た。
    # **どちらも、ピンの広がりを見ていないから起きる。** ピンから出す。
    #
    # 見たいものだけは**近いものだけで枠を出す**。遠いものを入れると、
    # 62km に合わせた縮尺に戻ってしまう——遠いものは地図の下に名前と距離で出る。
    def view(pts):
        """ピンの群れが収まる中心と縮尺。

        横 4:3 の枠（スマホで幅いっぱい・およそ 400x300）に、広がりの 1.35倍が
        入る縮尺を選ぶ。1.35 は余白——ピンの絵は点ではなく、下が尖った雫なので、
        端のピンがちょうど枠線に乗ると頭が切れる。
        """
        la = [q["lat"] for q in pts]
        lo = [q["lon"] for q in pts]
        clat, clon = (min(la) + max(la)) / 2, (min(lo) + max(lo)) / 2
        # 経度の幅は緯度で縮む。緯度の幅は「縦のほうが狭い」ぶんを横に直して比べる
        dlon = max(max(lo) - min(lo), 1e-4) * 1.35
        dlat = max(max(la) - min(la), 1e-4) * 1.35 * (400 / 300)
        span = max(dlon, dlat / math.cos(math.radians(clat)))
        # 幅 400px の画面に `span` 度が入る縮尺（256px のタイルが 2^z 枚で1周）
        z = math.floor(math.log2(360.0 / span * (400 / 256)))
        return "%.4f,%.4f" % (clat, clon), max(12, min(17, z))

    pin_src = {
        # **歩ける範囲のものだけ。** 遠いものは下の一覧が名前と距離で持つ。
        # 入れると62km のリラ修道院に合わせた縮尺に戻って、中心部が潰れる
        "see": [s for s in spots if km(s) <= WALK_KM],
        # `used_eat` / `used_buy` は `tie()` が返した、実際にひもづいた場所の名前
        "eat": [by_key[k] for k in dict.fromkeys(used_eat)],
        "buy": [by_key[k] for k in dict.fromkeys(used_buy)],
    }
    mymaps = []
    for m in MIDS["maps"]:
        pts = pin_src[m["which"]]
        if not pts:
            raise SystemExit("%s のピンが0件です" % m["which"])
        ll, z = view(pts)
        mymaps.append({**m, "ll": ll, "z": z})
    arr("BG_MYMAPS", mymaps, ["which", "mid", "title", "pins", "ll", "z"])

    arr("BG_FACTS", F["facts"], ["n", "unit", "cap"])
    arr("BG_IMAGE", F["image"], ["title", "body", "src"])
    arr("BG_HISTORY", F["history"], ["title", "body", "src"])
    arr("BG_BASICS", F["basics"], ["title", "body", "src"])
    # **記号と「中心から◯km」を、一覧の側にも入れる。** 地図とつき合わせるのに要る
    letters = {s["name"]: s["letter"] for s in near}
    kms = {s["name"]: s["km"] for s in far}
    for s in spots:
        s["letter"] = letters.get(s["name"], "")
        s["far"] = kms.get(s["name"], 0)
    arr("BG_SPOTS", spots,
        ["letter", "far", "name", "cyr", "roman", "kana", "rank",
         "what", "how", "walk", "stay", "fee", "advice", "maps", "src", "feesrc", *PHOTO_KEYS])
    # 表紙の1枚。**入れ子でも素でも読む**——集めるほうの形に、焼くほうを縛られない
    _h = PHOTOS.get("hero") or {}
    _h = _h.get("hero") if isinstance(_h.get("hero"), dict) else _h
    hero = {k: (_h or {}).get(k, "") for k in PHOTO_KEYS}
    if not all(hero.get(k) for k in ("img", "cm", "lic")):
        hero = {k: "" for k in PHOTO_KEYS}
    ts.append("/** 面のいちばん上に敷く1枚。**無ければ空**で、面の側が字だけの頭に落とす */")
    ts.append("export const BG_HERO = { " + ", ".join(
        '%s: "%s"' % (k, esc(hero.get(k))) for k in PHOTO_KEYS) + " } as const;")
    ts.append("")
    # **店・市場の一覧。** 料理と土産は `pins` に番号だけを持っていて、
    # 名前・説明・Google マップの道はここから引く（同じ字を何度も焼かない）
    arr("BG_PLACES", places, ["n", "key", "label", "roman", "what", "maps", "km", "on"])
    arr("BG_FOOD", food,
        ["jp", "cyr", "roman", "kana", "rank", "pork", "alcohol", "what", "where",
         "price", "meat", "note", "pins", "near", "src", "meatsrc", *PHOTO_KEYS])
    # **「ここでしたいこと」はもう焼かない**（#1228）。あやとの好みから組んだ結論だったので、
    # 初めての人向けの「やりたいこと」は `content/guidebook/bulgaria-sofia.ts` が見どころの事実から組む
    arr("BG_BUY", buy,
        ["what", "cyr", "alcohol", "why", "where", "price", "pins", "near", "src", *PHOTO_KEYS])
    arr("BG_EVENTS", F["events"], ["what", "when", "body", "src"])
    arr("BG_WORDS", F["words"], ["cyr", "roman", "kana", "jp"])

    OUT_TS.write_text("\n".join(ts), encoding="utf-8")
    shots = sum(1 for x in spots + food + buy if x.get("img")) + (1 if hero.get("img") else 0)
    want = len(spots) + len(food) + len(buy) + 1
    print("写真 %d/%d 枚" % (shots, want)
          + ("" if shots == want else "  **足りない: "
             + "、".join([x.get("name") or x.get("jp") or x.get("what")
                         for x in spots + food + buy if not x.get("img")][:6]) + "**"))
    print("焼いた %s（見どころ %d・食べもの %d／豚あり %d・酒 %d）"
          % (OUT_TS.name, len(spots), len(food),
             sum(1 for x in food if x["pork"]), sum(1 for x in food if x["alcohol"])))
    print("焼いた %s（%s）" % (OUT_MAP.name, "／".join(
        "%s ピン%d本・札%d枚・地図に入らないもの%d件"
        % (n, len(m["pins"]), sum(1 for p in m["pins"] if p.get("lw")), len(m["far"]))
        for n, m in maps.items())))


if __name__ == "__main__":
    main()
