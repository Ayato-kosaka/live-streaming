#!/usr/bin/env python3
"""北欧ふりかえり資料（public/nordic_review.html）に差し込む地図データを焼く。

`site/content/nordic/map.json` が正。あれは Natural Earth の海岸線を
ランベルト正角円錐で投影したもの（`python/build_nordic_map.py` が作る）で、
本物との重なりは 99.5%。**ここで経度緯度から座標を計算し直さない。必ずズレる。**

島の地図（`site/components/nordic/RouteMapSvg.tsx`）との違いは3つ。

1. **資料の置き場は 470x780。** 島の地図は 1000x878 の横長で、そのまま入れると
   幅に合わせて高さが 412 にしかならず、置き場の半分が空く。
   縦長に切り出す（`VIEW`）。
2. **32KB に収める。** 資料は OBS のブラウザソースが1枚読むだけなので、
   画面に出ないものを持って行っても意味がない。
   - 切り出した枠の外は**落とす**（`clip_rect`）。枠のすぐ外までは残す
     （`CLIP_PAD`）。岸の帯は海岸線に沿って太さ 38 まで引くので、枠ちょうどで
     切ると、切り口にも泡が引かれて**地図の端に白い線が立つ**。
   - 海岸線を間引く（`rdp`）。資料での縮尺は 1 単位 ≒ 0.89px なので、
     1px 以下のでこぼこは持って行っても誰にも見えない。
   - 川・格子・きらめき・縮尺は落とす。470 幅では線が消えるか、潰れて汚れになる。
3. **日付（mark 0〜9）で光らせる。** どの区間・どの街がその日のものかを
   焼き込んでおく。資料側は class を付け外しするだけで済む。

出すのは1行の `window.NORDIC_DECK_MAP = {...};` だけ。
**何度回しても同じものが出る**ように、辞書は `sort_keys` で並べる。
`ensure_ascii=True`（\\uXXXX 逃がし）にしてあるのは、この .js が
文字コードの宣言を持たずに読まれても街の名前が化けないようにするため。
"""

from __future__ import annotations

import json
import math
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "site", "content", "nordic", "map.json")
OUT = os.path.join(ROOT, "public", "nordic_review_mapdata.js")

# 資料に切り出す枠。置き場が 470x780（比 0.6026）なので、縦はまるごと使い、
# 横をその比に合わせて切る。左右は、道のり（x 455〜705）とスウェーデンの
# 国名（x 320）が余裕で入るところに寄せた。
VIEW = {"x": 270, "y": 0, "w": 529, "h": 878}

# 枠の外をどこまで残すか。岸の帯（いちばん太い浅瀬が 38）の半分と、
# ぼかしのにじみぶん。ここをケチると地図の端に泡の線が立つ。
CLIP_PAD = 46

# 海岸線の間引き（単位はワールド）。資料では 1 単位 ≒ 0.89px。
EPS_LAND = 0.6
EPS_LAKE = 0.9

# 国と海の名前の大きさ。**もとの数は 1000 幅の地図で決めてある。**
# 529 幅に切り出すと、同じ数でも画面に対して倍近く大きく見える
#（ポーランドの 46 は、切り出した幅の 52% を占める）。切り出した比で縮める。
LABEL_SCALE = 0.7

# これより小さい島・湖は落とす（面積、ワールドの2乗）。
# 12 は 3.5x3.5 単位、資料で 3px 角。点にしか見えないので持って行かない。
MIN_ISLAND = 12.0
MIN_LAKE = 90.0

# 日付（資料の DECK.days の並び）と、その日に動いた区間。
# 4日目（ヴィリニュス）と6日目（リガ）は動かない日なので、街だけ光る。
MARK_LEGS = {
    0: ["fly"],
    1: ["katowice-warszawa"],
    2: ["warszawa-bialystok"],
    3: ["bialystok-vilnius"],
    4: [],
    5: ["vilnius-siauliai", "vilnius-riga"],
    6: [],
    7: ["riga-tallinn"],
    8: ["tallinn-helsinki"],
    9: ["helsinki-stockholm"],
}
# その日に光る街。区間の両端から引けるが、動かない日（4・6）と
# 空から降りる日（0）は区間から引けないので、表で持つ。
MARK_CITIES = {
    0: ["katowice"],
    4: ["vilnius"],
    6: ["riga"],
}

# 海の名前を、切り出した枠のどこへ置くか。
# **焼き込みの場所は 1000 幅の地図で決めてある。** 切り出すと開いた海の形が
# 変わるので、そのまま使うと名前が岸に乗る（実際、バルト海の「バ」と
# ボスニア湾の頭が、スウェーデンの海岸線の上に出ていた）。
# None は落とす。フィンランド湾はこの枠では幅 50 しかない帯で、
# タリンとヘルシンキの名札のあいだに割り込むだけなので置かない。
SEA_AT = {
    "バルト海": (450, 420),
    "ボスニア湾": (512, 105),
    "フィンランド湾": None,
}

# 国の名前を、切り出した枠のどこへ置くか。載っていない国は焼き込みのまま。
# リトアニアは、焼き込みの場所（575, 463）だとクルシュー潟の上に半分乗る。
# 1000 幅のときは国の真ん中だったが、切り出すと海の側がよく見えるようになって、
# 「水の上に国の名前が出ている」絵になった。
COUNTRY_AT = {"リトアニア": (610, 512)}

# 街の名札をどちらへ出すか。**実際に 470x780 で描いて、重なりを数えて決めた。**
# l=左 r=右 u=上 d=下。机上で決めない（タリンとヘルシンキは 45.8 しか離れていない）。
LABEL_AT = {
    "katowice": "l",
    "warszawa": "r",
    "bialystok": "r",
    # 右へ出すと、名札の右はしが枠から 11 はみ出す（枠は x 799 まで）。
    # 下はビャウィストクから登ってくる線が通るので、上へ逃がす。
    "vilnius": "u",
    "siauliai": "l",
    "riga": "l",
    "tallinn": "r",
    "helsinki": "l",
    "stockholm": "l",
}

NUM = re.compile(r"[-+]?(?:\d*\.\d+|\d+)")


def parse_path(d: str) -> list[list[tuple[float, float]]]:
    """`m`/`l`/`q`/`z` の相対パスを、閉じた折れ線の集まりに開く。

    `q` の制御点も点として拾う。map.json の曲線は「もとの頂点を制御点に、
    中点を終点に」して作ってあるので、制御点を捨てると角が丸ごと消える。
    """
    subs: list[list[tuple[float, float]]] = []
    cur: list[tuple[float, float]] = []
    x = y = 0.0
    i = 0
    cmd = ""
    n = len(d)
    while i < n:
        ch = d[i]
        if ch.isalpha():
            cmd = ch
            i += 1
            if cmd in "zZ":
                if len(cur) > 2:
                    subs.append(cur)
                cur = []
            continue
        if ch in " ,":
            i += 1
            continue
        m = NUM.match(d, i)
        if not m:
            i += 1
            continue

        def take(j: int) -> tuple[float, int]:
            mm = NUM.match(d, j)
            while mm is None:
                j += 1
                mm = NUM.match(d, j)
            return float(mm.group()), mm.end()

        if cmd in "mM":
            a, i = take(i)
            b, i = take(i)
            if len(cur) > 2:
                subs.append(cur)
            x, y = (a, b) if cmd == "M" else (x + a, y + b)
            cur = [(x, y)]
            cmd = "l" if cmd == "m" else "L"
        elif cmd in "lL":
            a, i = take(i)
            b, i = take(i)
            x, y = (a, b) if cmd == "L" else (x + a, y + b)
            cur.append((x, y))
        elif cmd in "qQ":
            a, i = take(i)
            b, i = take(i)
            c, i = take(i)
            e, i = take(i)
            if cmd == "Q":
                cx, cy, nx, ny = a, b, c, e
            else:
                cx, cy, nx, ny = x + a, y + b, x + c, y + e
            cur.append((cx, cy))
            cur.append((nx, ny))
            x, y = nx, ny
        else:  # 使っていない命令が来たら黙って進まない。落として気づけるようにする
            raise ValueError("未対応のパス命令: %r" % cmd)
    if len(cur) > 2:
        subs.append(cur)
    return subs


def area(pts: list[tuple[float, float]]) -> float:
    """符号なしの面積（靴ひも公式）。"""
    s = 0.0
    for i in range(len(pts)):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % len(pts)]
        s += x1 * y2 - x2 * y1
    return abs(s) / 2.0


def rdp(pts: list[tuple[float, float]], eps: float) -> list[tuple[float, float]]:
    """Ramer-Douglas-Peucker。閉じた輪なので、いちばん遠い2点で割ってから掛ける。

    端から掛けると、始点と終点が隣り合っている閉じた輪では
    「始点と終点を結ぶ線」が輪全体をつぶす向きに働いて、島が消える。
    """
    if len(pts) < 4:
        return pts
    # いちばん離れた点の組を、始点からの距離で近似して取る（総当たりは 5000 点で重い）
    p0 = pts[0]
    far = max(range(len(pts)), key=lambda i: (pts[i][0] - p0[0]) ** 2 + (pts[i][1] - p0[1]) ** 2)
    a = _rdp_open(pts[: far + 1], eps)
    b = _rdp_open(pts[far:] + [pts[0]], eps)
    out = a[:-1] + b[:-1]
    return out if len(out) >= 3 else pts


def _rdp_open(pts: list[tuple[float, float]], eps: float) -> list[tuple[float, float]]:
    if len(pts) < 3:
        return list(pts)
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        s, e = stack.pop()
        if e <= s + 1:
            continue
        x1, y1 = pts[s]
        x2, y2 = pts[e]
        dx, dy = x2 - x1, y2 - y1
        den = math.hypot(dx, dy)
        best = -1.0
        bi = -1
        for i in range(s + 1, e):
            px, py = pts[i]
            if den < 1e-9:
                dist = math.hypot(px - x1, py - y1)
            else:
                dist = abs(dy * px - dx * py + x2 * y1 - y2 * x1) / den
            if dist > best:
                best, bi = dist, i
        if best > eps:
            keep[bi] = True
            stack.append((s, bi))
            stack.append((bi, e))
    return [p for p, k in zip(pts, keep) if k]


def clip_rect(pts: list[tuple[float, float]], box) -> list[tuple[float, float]]:
    """Sutherland-Hodgman。枠（凸）で閉じた多角形を切る。"""
    x0, y0, x1, y1 = box

    def cut(poly, inside, isect):
        out = []
        for i in range(len(poly)):
            a = poly[i - 1]
            b = poly[i]
            ain, bin_ = inside(a), inside(b)
            if bin_:
                if not ain:
                    out.append(isect(a, b))
                out.append(b)
            elif ain:
                out.append(isect(a, b))
        return out

    def ix(a, b, xv):
        t = (xv - a[0]) / (b[0] - a[0])
        return (xv, a[1] + t * (b[1] - a[1]))

    def iy(a, b, yv):
        t = (yv - a[1]) / (b[1] - a[1])
        return (a[0] + t * (b[0] - a[0]), yv)

    p = pts
    p = cut(p, lambda q: q[0] >= x0, lambda a, b: ix(a, b, x0))
    if not p:
        return []
    p = cut(p, lambda q: q[0] <= x1, lambda a, b: ix(a, b, x1))
    if not p:
        return []
    p = cut(p, lambda q: q[1] >= y0, lambda a, b: iy(a, b, y0))
    if not p:
        return []
    p = cut(p, lambda q: q[1] <= y1, lambda a, b: iy(a, b, y1))
    return p


def fnum(v: float) -> str:
    """整数にして、いちばん短い書き方にする。"""
    s = "%d" % round(v)
    return s


def emit(polys: list[list[tuple[float, float]]], close: bool = True) -> str:
    """折れ線の集まりを、相対整数の `m…l…z` にする。

    **丸めてから差を取る。** 差を丸めると誤差がたまって、
    パスの終わりのほうで島がずれる。

    `close=False` は `z` を書かない。塗りは開いたままでも閉じて描かれるので、
    木と山には要らない（346本ぶんで 377 バイト）。**海岸線では落とさない。**
    あちらは同じパスを線でもなぞる（泡・砂の帯）ので、`z` が無いと
    始点と終点のあいだに帯の切れ目が出る。
    """
    out = []
    px = py = 0
    for poly in polys:
        ip = [(round(x), round(y)) for x, y in poly]
        ded = [ip[0]]
        for q in ip[1:]:
            if q != ded[-1]:
                ded.append(q)
        if len(ded) > 2 and ded[0] == ded[-1]:
            ded.pop()
        if len(ded) < 3:
            continue
        x, y = ded[0]
        out.append("m" + fnum(x - px) + sep(y - py) + fnum(y - py))
        px, py = x, y
        for qx, qy in ded[1:]:
            out.append("l" + fnum(qx - px) + sep(qy - py) + fnum(qy - py))
            px, py = qx, qy
        if close:
            out.append("z")
    return "".join(out)


def sep(v: float) -> str:
    """負の数は符号が区切りになるので、空白を入れない。"""
    return "" if round(v) < 0 else " "


def shrink(raw: str, eps: float, min_area: float, box):
    """間引いて、枠で切る。もとの面積と、切ったあとの面積を返す。"""
    subs = parse_path(raw)
    before_all = sum(area(s) for s in subs)
    before_clip = sum(area(c) for s in subs for c in [clip_rect(s, box)] if len(c) > 2)
    keep = []
    for s in subs:
        if area(s) < min_area:
            continue
        r = rdp(s, eps)
        if len(r) < 3 or area(r) < min_area:
            continue
        c = clip_rect(r, box)
        if len(c) > 2 and area(c) > 0.5:
            keep.append(c)
    d = emit(keep)
    after_all = sum(area(rdp(s, eps)) for s in subs if area(s) >= min_area)
    after_clip = sum(area(c) for c in keep)
    return d, before_all, after_all, before_clip, after_clip


def clip_open(raw: str, box) -> str:
    """木と山。閉じた小さな形なので、枠の外にあるものを丸ごと落とすだけ。"""
    subs = parse_path(raw)
    keep = []
    x0, y0, x1, y1 = box
    for s in subs:
        xs = [p[0] for p in s]
        ys = [p[1] for p in s]
        if max(xs) < x0 or min(xs) > x1 or max(ys) < y0 or min(ys) > y1:
            continue
        keep.append(s)
    return emit(keep, close=False)


def main() -> None:
    src = json.load(open(SRC, encoding="utf-8"))
    box = (
        VIEW["x"] - CLIP_PAD,
        VIEW["y"] - CLIP_PAD,
        VIEW["x"] + VIEW["w"] + CLIP_PAD,
        VIEW["y"] + VIEW["h"] + CLIP_PAD,
    )
    # 木と山は絵の中だけに出ればいいので、枠ちょうどで落としてよい
    tight = (VIEW["x"] - 6, VIEW["y"] - 6, VIEW["x"] + VIEW["w"] + 6, VIEW["y"] + VIEW["h"] + 6)

    land, lb, la, lcb, lca = shrink(src["land"], EPS_LAND, MIN_ISLAND, box)
    lake, _, _, kcb, kca = shrink(src["lakes"], EPS_LAKE, MIN_LAKE, tight)
    woods = clip_open(src["woods"], tight)
    hills = clip_open(src["hills"], tight)

    seq = {c["id"]: c["seq"] for c in src["cities"]}
    leg_mark = {}
    for mk, ids in MARK_LEGS.items():
        for lid in ids:
            leg_mark[lid] = mk

    legs = []
    for l in src["legs"]:
        lid = "%s-%s" % (l["from"], l["to"])
        legs.append(
            {
                "id": lid,
                "from": l["from"],
                "to": l["to"],
                "move": l["move"],
                "mark": leg_mark.get(lid, -1),
                "d": l["d"],
                "mid": [round(l["mid"][0]), round(l["mid"][1]), round(l["mid"][2])],
            }
        )
    legs.append(
        {
            "id": "fly",
            "from": "kutaisi",
            "to": "katowice",
            "move": "fly",
            "mark": 0,
            "d": src["fly"]["d"],
            # 飛行機だけ、向きの印を置く場所が焼き込みに無い（`chip` は札の場所）。
            # 曲線の上を実際に走らせて、枠の中に入ったところの点と接線を取る。
            "mid": _q_at(src["fly"]["d"], 0.55),
        }
    )

    city_mark: dict[str, list[int]] = {c["id"]: [] for c in src["cities"]}
    for l in legs:
        if l["mark"] < 0:
            continue
        for end in (l["from"], l["to"]):
            if end in city_mark and l["mark"] not in city_mark[end]:
                city_mark[end].append(l["mark"])
    for mk, ids in MARK_CITIES.items():
        for cid in ids:
            if mk not in city_mark[cid]:
                city_mark[cid].append(mk)

    cities = [
        {
            "id": c["id"],
            "name": c["name"],
            "x": round(c["x"]),
            "y": round(c["y"]),
            "kind": c["kind"],
            "seq": c["seq"],
            "at": LABEL_AT[c["id"]],
            "marks": sorted(city_mark[c["id"]]),
        }
        for c in sorted(src["cities"], key=lambda c: c["seq"])
    ]

    data = {
        "view": VIEW,
        "land": land,
        "lakes": lake,
        "woods": woods,
        "hills": hills,
        "cities": cities,
        "legs": legs,
        "labels": [
            {
                "name": n,
                "x": clamp_label(
                    COUNTRY_AT.get(n, (v["x"], v["y"]))[0], n, round(v["size"] * LABEL_SCALE)
                ),
                "y": COUNTRY_AT.get(n, (v["x"], v["y"]))[1],
                "size": round(v["size"] * LABEL_SCALE),
            }
            for n, v in sorted(_country_names(src).items())
        ],
        "seas": [
            {
                "name": s["name"],
                "x": clamp_label(
                    SEA_AT[s["name"]][0], s["name"], round(s["size"] * LABEL_SCALE)
                ),
                "y": SEA_AT[s["name"]][1],
                "size": round(s["size"] * LABEL_SCALE),
                "rot": s["rot"],
            }
            for s in src["seas"]
            if SEA_AT.get(s["name"]) is not None
        ],
        "north": {"x": 770, "y": 62, "deg": src["north"]["deg"]},
        "marks": {str(k): MARK_LEGS[k] for k in sorted(MARK_LEGS)},
    }

    body = json.dumps(data, sort_keys=True, ensure_ascii=True, separators=(",", ":"))
    js = "window.NORDIC_DECK_MAP = %s;\n" % body
    with open(OUT, "w", encoding="ascii", newline="\n") as f:
        f.write(js)

    size = len(js.encode("ascii"))
    print("out: %s" % OUT)
    print("bytes: %d (%.1f KB)  上限 32768" % (size, size / 1024))
    print("  land %d / lakes %d / woods %d / hills %d" % (len(land), len(lake), len(woods), len(hills)))
    print("陸の面積（間引きだけ・枠で切る前）: %.1f -> %.1f  差 %+.3f%%" % (lb, la, (la - lb) / lb * 100))
    print("陸の面積（枠で切ったあと。資料に出るぶん）: %.1f -> %.1f  差 %+.3f%%" % (lcb, lca, (lca - lcb) / lcb * 100))
    print("湖の面積（枠の中）: %.1f -> %.1f  差 %+.3f%%" % (kcb, kca, (kca - kcb) / kcb * 100))


def clamp_label(x: int, name: str, size: int) -> int:
    """名前が切り出した枠からはみ出さないところまで、横へ寄せる。

    **焼き込み（map.json）の場所をそのまま使わない。** あれは 1000 幅の地図で
    決めた場所なので、529 幅に切り出すと端の名前が切れる（フィンランド湾の
    右はしが 16 はみ出し、スウェーデンの左はしが 44 はみ出していた）。
    """
    half = len(name) * size * 1.3 / 2 + 10
    lo = VIEW["x"] + half
    hi = VIEW["x"] + VIEW["w"] - half
    return int(round(min(max(x, lo), hi)))


def _q_at(d: str, t: float) -> list[int]:
    """`M x y Q cx cy ex ey` の1本を t で切って、点と接線の角度を返す。"""
    n = [float(v) for v in NUM.findall(d)]
    (x0, y0, cx, cy, x1, y1) = n[:6]
    u = 1 - t
    px = u * u * x0 + 2 * t * u * cx + t * t * x1
    py = u * u * y0 + 2 * t * u * cy + t * t * y1
    dx = 2 * u * (cx - x0) + 2 * t * (x1 - cx)
    dy = 2 * u * (cy - y0) + 2 * t * (y1 - cy)
    return [round(px), round(py), round(math.degrees(math.atan2(dy, dx)))]


def _country_names(src) -> dict:
    """国名の札。`labels` の鍵は英語なので、日本語は `RouteMapSvg` と同じ表から引く。"""
    jp = {
        "poland": "ポーランド",
        "lithuania": "リトアニア",
        "latvia": "ラトビア",
        "estonia": "エストニア",
        "finland": "フィンランド",
        "sweden": "スウェーデン",
    }
    return {jp[k]: v for k, v in src["labels"].items()}


if __name__ == "__main__":
    main()
