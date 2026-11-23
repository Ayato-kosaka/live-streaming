"""**ノマドキッチンカーの面（`/legends/nomad-kitchen-car`）の材料 `book.json` と絵の注文書 `art_order.json` を、型どおりか数えて確かめる。**

    python3 python/legend_kitchen_check.py                                         # nomad-kitchen-car を確かめる
    python3 python/legend_kitchen_check.py python/data/legends/nomad-kitchen-car   # 置き場を名指し（写しを当てるときも）

終了コード 0=通った / 1=落ちた所がある / 2=数えるものが無い（book.json が無い・読めない）。

## なぜ要るか

材料は担当（エージェント）が集め、面・絵・3D は別の担当が並べて組む。受け渡しの型（置き場の `README.md`）がずれると、
面の錨・絵のファイル名・付箋の宛先・2つのシミュレーションの最初の値が黙ってずれる。46件の課題や30本の題の数、
指す先の食い違いは、字を目で読んでも見落とす。だから型の約束を機械で数える。焼く道具（`legend_kitchen_bake.py`）は
ここの `check_dir` を呼び、落ちたら1字も書かない。

## 何を数えるか

1. **形** — 欄は型にあるものだけ。知らない欄が1つでもあれば落ちる（ひと月の収支や実現度の欄は、これで入らない）
2. **数** — 景色5・売るもの5・食べ物5・中身10〜30・場所3〜5・外装と内装4組・車4・暮らしの課題46・題30・お題6・進み具合6 ほか
3. **鍵** — id は英小文字とハイフンで、同じ並びの中で一意。指す先（食べ物・中身・場所・スプライト・島の国の面）が在る
4. **出どころ** — 数を持つ入れ物は `src`（https）か `est`（見立ての欄の名前）を持つ。1つの `src` に同じ URL を2回書かない
5. **言い切りの字** — 見出し・目標・表紙の注・働くための手続きの1文は型の字と1字も違わない。名前の決まった並び
   （景色・食べ物・外装・車・買うか借りるか・お題）も型の字のまま
6. **字の形** — 一行の字に読点と括弧の強め（“”『』「」）を置かない。名前に「数＋つの」の呼び名を作らない（`docs/guide-copy.md`
   6章の12）。% の字は確かめた事実の中だけ（実現度の数を出さない）。「あと◯日」を書かない
7. **絵の注文書** — 景色・食べ物・車・外装と内装の id と並びが本と同じ。字と布と顔を描かせない頼み。絵地図の枠に線と地名が入る。
   写真の候補は Commons の頁で、許諾が public domain・CC0・CC BY・CC BY-SA

## 持たないもの

禁じる語の表は持たない（置き場の README の決まり）。持つのは数・鍵・言い切りの字の一致と、字の形だけ。
公開してよい線は、点検の担当が非公開の資料で照らす。

## 対照

`python/legend_kitchen_check_selftest.py` が毎 PR で、本物で通り、壊した写し（件を消す・id を重ねる・出どころを消す・
ひと月の欄を足す・一行に読点・事実の外に %・題に「あと◯日」・絵の注文書の景色を消す）で落ちることを見る。
"""

from __future__ import annotations

import datetime as dt
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent
DEFAULT = ROOT / "data" / "legends" / "nomad-kitchen-car"
SPRITES = REPO / "site" / "public" / "sprites"
COUNTRIES_TS = REPO / "site" / "content" / "countries.ts"
TRAVEL_TS = REPO / "site" / "content" / "travel.ts"

ID = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
AT = re.compile(r"^\d+:\d{2}:\d{2}$")
VIDEO = re.compile(r"^[A-Za-z0-9_-]{11}$")
ONE_LINE_BAN = ["、", "“", "”", "\"", "『", "』", "「", "」"]
COINED = re.compile(r"[0-9０-９一二三四五六七八九十]+つの")      # 「5つの台所」の形（guide-copy 6章の12）
COUNTDOWN = re.compile(r"あと\s*[0-9０-９一二三四五六七八九十]+\s*日")
LICENSE = re.compile(r"^(CC0|Public domain|PD[- ].*|CC BY(-SA)? \d\.\d)$")

# ---- 型（置き場の README.md）。言い切りの字と、名前の決まった並び
EXACT = {
    "meta.h1": "ノマドキッチンカープロジェクト",
    "meta.goal": "2027年の秋ごろの開始を目標に進めている（2026年11月）",
    "cover.note": "2026年11月に調べた範囲では、キッチンカーでヨーロッパを一周した例は見つからなかった",
    "issues.work.text": "ヨーロッパは国ごとに、外国人が働いてよいかの決まりが違う。いくつか道を調べ、2026年11月、そのうち1本に手応えが出た",
    "route.said.text": "ポルトガルから北欧、ギリシャのあたりまで",
    "issues.permit.said.text": "1つめの国で売りながら、次の国の許可を取りに行く",
}
QUOTES = ["world-first", "dream"]
LABELS = [("portugal", "ポルトガル"), ("nordic", "北欧"), ("greece", "ギリシャ")]
VIEWS = [("lake-town", "湖のある町"), ("sea-town", "海が見える町"), ("mountain-town", "山の途中の町"),
         ("local-spot", "地元の穴場"), ("italy-seaside", "イタリアの海辺")]
FOODS = [("taiyaki", "たい焼き"), ("takoyaki", "たこ焼き"), ("crepe", "クレープ"), ("waffle", "ワッフル"), ("pizza", "ピザ")]
NO_SIM = {"pizza"}
PICKS = [(1, "taiyaki"), (2, "takoyaki"), (3, "crepe"), (3, "waffle"), (3, "pizza")]
LOOKS = [("nordic", "北欧風"), ("majolica", "イタリアのマジョリカ焼き"), ("azulejo", "ポルトガルのタイル"), ("wa", "和風")]
MAJOLICA_ROOM = "サンスーシ宮殿の花の部屋"
VEHICLES = [("small-van", "小さい車"), ("box-van", "窓口つきの箱バン"), ("campervan-tent", "キャンピングバン＋テントの屋台"),
            ("camper-trailer", "キャンピングカー＋販売トレーラー")]
FIRST_VEHICLE = "box-van"
BUY_OR_RENT = [("buy", "買う"), ("rent", "借りる")]
INPUTS = ["price", "sold", "cost", "fee-fixed", "fee-share", "gas-kg", "drive-km"]
DEFAULT_INPUT = "drive-km"
FIXED = ["lpg_eur_kg", "diesel_eur_l", "l_per_100km"]
SAY = ["bake", "crowd", "loss", "thin", "pricey", "unknown", "good"]
LAYERS = ["before", "food", "place", "gear"]
WEIGHTS = {"light", "mid", "heavy", "heaviest"}
COMPARE = ["food", "place", "gear", "person", "cross"]
GROUPS = ["トイレ", "水", "電気", "ガス", "寝床", "車", "免許", "道", "暮らし", "店"]
NOTES = [("kitchen-car-menu", "メニューの案"), ("kitchen-car-views", "見てみたい町と景色"),
         ("kitchen-car-tips", "暮らしの知恵（トイレ・水・電気・寝床）"), ("kitchen-car-thoughts", "この旅に思うこと"),
         ("kitchen-car-name", "キッチンカーの名前"), ("kitchen-car-shorts", "ショートの案")]
NAME_LEAD = "選んだ名前を車と看板に描く"
ALLERGENS = {"穀類", "甲殻類", "卵", "魚", "落花生", "大豆", "乳", "木の実", "セロリ", "からし", "ごま", "亜硫酸塩", "ルピナス", "軟体動物"}
FLAGS = {"pork", "alcohol", "gelatin"}
FACT_GROUPS = {"permit", "japan", "vehicle", "gear", "market", "life"}
GRADES = {"確", "二"}
ENERGY = {"電気", "ガス"}

COUNTS = {"route.line": (2, 40), "route.countries": (0, 20), "menu.why": (4, 7), "menu.ideas": (5, 20),
          "fillings": (10, 30), "places": (3, 5), "issues.life": (46, 46), "shorts.titles": (30, 30),
          "progress": (6, 6), "log": (5, 20), "facts": (10, 60)}

# 欄の形: 名前 → (なくてはならない欄, あってよい欄)
SHAPE = {
    "book": ({"slug", "updated", "seen", "rate", "meta", "cover", "route", "views", "menu", "foods", "fillings", "places",
              "sim", "looks", "vehicles", "buy_or_rent", "money", "issues", "shorts", "notes", "progress", "log", "facts"}, set()),
    "rate": ({"jpy_per_eur", "date", "src"}, set()),
    "meta": ({"title", "description", "h1", "sub", "goal"}, set()),
    "cover": ({"quotes", "note"}, set()),
    "quote": ({"id", "text", "date", "videoId", "at"}, set()),
    "route": ({"said", "line", "labels", "countries"}, set()),
    "point": ({"lat", "lon"}, set()),
    "label": ({"id", "name", "lat", "lon"}, set()),
    "said": ({"date"}, {"text", "videoId", "at"}),
    "view": ({"id", "title", "lead", "said"}, set()),
    "menu": ({"picks", "decided", "why", "ideas"}, set()),
    "pick": ({"rank", "food"}, set()),
    "why": ({"id", "text"}, set()),
    "idea": ({"id", "name", "food", "from", "date"}, set()),
    "food": ({"id", "name", "unit", "sim", "per_hour", "price", "cost", "dough", "pack", "machine", "energy", "src", "est"},
             {"seen"}),
    "energy": ({"kind", "text", "gas_kg_h"}, set()),
    "filling": ({"id", "name", "foods", "cost", "known", "allergens", "flags", "from", "src", "est"}, {"sprite", "seen"}),
    "place": ({"id", "name", "fee", "hours", "buyers", "src", "est"}, {"seen"}),
    "sim": ({"food", "fillings", "price", "place", "say"}, set()),
    "look": ({"id", "name", "lead", "interior"}, set()),
    "interior": ({"name", "lead"}, {"src", "seen"}),
    "vehicle": ({"id", "name", "price", "license", "good", "weak", "first", "src"}, {"said", "seen"}),
    "vprice": ({"eur", "what"}, set()),
    "buy": ({"id", "name", "price", "good", "weak", "src"}, {"seen"}),
    "money": ({"inputs", "fixed"}, set()),
    "input": ({"id", "min", "max", "step", "src", "est"}, {"default", "seen"}),
    "fixedv": ({"value", "src"}, {"est", "seen"}),
    "issues": ({"as_of", "work", "permit", "life"}, set()),
    "work": ({"text"}, set()),
    "permit": ({"said", "layers", "compare"}, set()),
    "layer": ({"id", "title", "text", "weight", "src"}, {"seen"}),
    "compare": ({"id", "label", "japan", "europe", "src"}, {"seen"}),
    "life": ({"n", "id", "group", "title", "plan", "stars"}, {"src", "seen"}),
    "shorts": ({"titles"}, set()),
    "note": ({"id", "name", "lead", "placeholder"}, set()),
    "progress": ({"date", "title", "body"}, {"said"}),
    "log": ({"date", "what", "why", "by"}, set()),
    "fact": ({"id", "group", "text", "src", "seen"}, {"grade"}),
    "art": ({"style", "cover", "map", "views", "foods", "vehicles", "looks"}, {"food_style", "skin_style", "photos"}),
    "art_map": ({"draw", "bbox"}, set()),
    "bbox": ({"west", "east", "south", "north"}, set()),
    "art_item": ({"id", "title", "draw"}, {"ref"}),
    "art_look": ({"id", "title", "exterior", "interior", "ref"}, set()),
    "exterior": ({"mode", "draw"}, set()),
    "photos": ({"rule", "candidates"}, set()),
    "photo": ({"id", "page", "by", "lic", "taken", "note"}, set()),
}


class Check:
    def __init__(self):
        self.errors: list[str] = []
        self.counts: list[tuple[str, str]] = []
        self.notes: list[str] = []

    def no(self, where: str, msg: str):
        self.errors.append(f"{where}: {msg}")


def shape(c: Check, obj, kind: str, where: str) -> bool:
    """欄の形を見る。足りない欄も、型に無い欄も落とす。"""
    if not isinstance(obj, dict):
        c.no(where, "入れ物が dict でない")
        return False
    need, may = SHAPE[kind]
    miss = sorted(need - obj.keys())
    extra = sorted(obj.keys() - need - may)
    if miss:
        c.no(where, "欄が無い " + ",".join(miss))
    if extra:
        c.no(where, "型に無い欄 " + ",".join(extra))
    return not miss


def is_text(v) -> bool:
    return isinstance(v, str) and v.strip() != ""


def is_num(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def text(c: Check, v, where: str):
    if not is_text(v):
        c.no(where, "字が無い")


def date(c: Check, v, where: str):
    if not (isinstance(v, str) and DATE.match(v)):
        c.no(where, f"日付の形（YYYY-MM-DD）でない: {v!r}")
        return
    try:
        dt.date.fromisoformat(v)
    except ValueError:
        c.no(where, f"無い日付: {v}")


def count(c: Check, name: str, n: int, want):
    lo, hi = want if isinstance(want, tuple) else (want, want)
    c.counts.append((name, f"{n}（{lo}〜{hi}）" if lo != hi else f"{n}/{lo}"))
    if not lo <= n <= hi:
        c.no(name, f"数が {n}（{lo}〜{hi}）" if lo != hi else f"数が {n}（{lo} のはず）")


def ids(c: Check, rows, where: str) -> dict:
    seen: dict = {}
    for k, r in enumerate(rows):
        i = r.get("id") if isinstance(r, dict) else None
        if not (isinstance(i, str) and ID.match(i)):
            c.no(f"{where}[{k}]", f"id が英小文字とハイフンでない: {i!r}")
        elif i in seen:
            c.no(f"{where}[{k}]", f"id が重なる: {i}")
        else:
            seen[i] = r
    return seen


def fixed_list(c: Check, rows, want: list, where: str, name_key: str = "name"):
    """名前の決まった並び。id と字と順が型のとおりか。"""
    got = [(r.get("id"), r.get(name_key)) for r in rows if isinstance(r, dict)]
    c.counts.append((where, f"{len(rows)}/{len(want)}"))
    if got != want:
        c.no(where, f"id・{name_key}・並びが型と違う: {got}")


def srcs(c: Check, obj: dict, where: str, need: bool = True):
    s = obj.get("src")
    if not isinstance(s, list):
        c.no(where, "src が配列でない")
        return
    if need and not s:
        c.no(where, "src が無い")
    for u in s:
        if not (isinstance(u, str) and u.startswith("https://")):
            c.no(where, f"src が https でない: {u!r}")
    if len(set(s)) != len(s):
        c.no(where, "src に同じ URL が2回")


def src_or_est(c: Check, obj: dict, where: str, fields: set):
    """数を持つ入れ物は、出どころか見立ての印を持つ。見立ての印は在る欄を指す。"""
    srcs(c, obj, where, need=False)
    est = obj.get("est")
    if not isinstance(est, list):
        c.no(where, "est が配列でない")
        return
    bad = [e for e in est if e not in fields]
    if bad:
        c.no(where, f"est が知らない欄を指す: {bad}")
    if not obj.get("src") and not est:
        c.no(where, "src も est も無い（数の出どころが無い）")


def rng(c: Check, v, where: str, lo_ok: float = 0.0):
    if not (isinstance(v, list) and len(v) == 2 and all(is_num(x) for x in v)):
        c.no(where, f"幅が [小, 大] の数でない: {v!r}")
        return None
    if v[0] > v[1]:
        c.no(where, f"幅の小が大より大きい: {v}")
    if v[0] < lo_ok:
        c.no(where, f"幅が {lo_ok} より小さい: {v}")
    return (v[0] + v[1]) / 2


def one_line(c: Check, s, where: str, hi: int = 40, lo: int = 1):
    if not isinstance(s, str) or (lo > 0 and not s.strip()):
        c.no(where, "字が無い")
        return
    for b in ONE_LINE_BAN:
        if b in s:
            c.no(where, f"一行に「{b}」: {s}")
    if not lo <= len(s) <= hi:
        c.no(where, f"字数 {len(s)}（{lo}〜{hi}）: {s}")


def coined(c: Check, s, where: str):
    if isinstance(s, str) and COINED.search(s):
        c.no(where, f"数を足した呼び名を作らない: {s}")


def said(c: Check, s, where: str, need_video: bool, need_text: bool = False):
    if not shape(c, s, "said", where):
        return
    date(c, s["date"], where + ".date")
    if need_text:
        text(c, s.get("text"), where + ".text")
    has_v, has_t = "videoId" in s, "at" in s
    if has_v != has_t:
        c.no(where, "videoId と at は両方そろえるか、両方持たない")
    if need_video and not has_v:
        c.no(where, "videoId と at が無い")
    if has_v and not (isinstance(s["videoId"], str) and VIDEO.match(s["videoId"])):
        c.no(where, f"11字の動画 id でない: {s.get('videoId')!r}")
    if has_t and not (isinstance(s["at"], str) and AT.match(s["at"])):
        c.no(where, f"時刻の形（4:11:30）でない: {s.get('at')!r}")


def decimals(x) -> int:
    t = repr(float(x))
    return len(t.split(".")[1]) if "." in t and "e" not in t else 0


def coord(c: Check, p: dict, where: str):
    lat, lon = p.get("lat"), p.get("lon")
    if not (is_num(lat) and is_num(lon) and -90 <= lat <= 90 and -180 <= lon <= 180):
        c.no(where, "座標が数でないか範囲の外")
    elif decimals(lat) > 6 or decimals(lon) > 6:
        c.no(where, "座標が小数6桁を超える")


def island_countries() -> set[str] | None:
    """島に国の面が在る国の slug（歩いた国 `COUNTRY_RECORDS` ＋ 行く前の案内 `GUIDE_ONLY`）。字で読む。読めなければ None。"""
    try:
        ct = COUNTRIES_TS.read_text(encoding="utf-8")
        tt = TRAVEL_TS.read_text(encoding="utf-8")
    except OSError:
        return None
    a, b = ct.find("const COUNTRY_RECORDS"), ct.find("export const COUNTRIES")
    g = tt.find("const GUIDE_ONLY")
    if a < 0 or b < a or g < 0:
        return None
    got = set(re.findall(r'slug: "([a-z0-9-]+)"', ct[a:b]))
    got |= set(re.findall(r'slug: "([a-z0-9-]+)"', tt[g:tt.find("];", g)]))
    return got or None


def walk(v, path: str = ""):
    """本の字を全部、道（どの欄か）つきで出す。URL と動画の鍵は字ではないので出さない。"""
    if isinstance(v, dict):
        for k, x in v.items():
            if k in ("src", "videoId", "at", "page", "ref", "sprite"):
                continue
            yield from walk(x, f"{path}.{k}" if path else k)
    elif isinstance(v, list):
        for k, x in enumerate(v):
            yield from walk(x, f"{path}[{k}]")
    elif isinstance(v, str) and not v.startswith("https://"):
        yield path, v


# ---------------------------------------------------------------------------- 本


def check_book(c: Check, b: dict):
    if not shape(c, b, "book", "book"):
        return
    if b["slug"] != "nomad-kitchen-car":
        c.no("slug", f"{b['slug']!r}（nomad-kitchen-car のはず）")
    date(c, b["updated"], "updated")
    date(c, b["seen"], "seen")
    if shape(c, b["rate"], "rate", "rate"):
        if not (is_num(b["rate"]["jpy_per_eur"]) and b["rate"]["jpy_per_eur"] > 0):
            c.no("rate", "円の率が数でない")
        date(c, b["rate"]["date"], "rate.date")
        srcs(c, b["rate"], "rate")

    m = b["meta"]
    if shape(c, m, "meta", "meta"):
        if not 25 <= len(m["title"]) <= 45:
            c.no("meta.title", f"字数 {len(m['title'])}（25〜45）")
        if not 80 <= len(m["description"]) <= 160:
            c.no("meta.description", f"字数 {len(m['description'])}（80〜160）")
        one_line(c, m["sub"], "meta.sub", 32, 8)
    cv = b["cover"]
    if shape(c, cv, "cover", "cover"):
        qs = cv["quotes"] if isinstance(cv["quotes"], list) else []
        if [q.get("id") for q in qs if isinstance(q, dict)] != QUOTES:
            c.no("cover.quotes", f"ちょうど2つで id は {QUOTES} の順")
        for k, q in enumerate(qs):
            if shape(c, q, "quote", f"cover.quotes[{k}]"):
                text(c, q["text"], f"cover.quotes[{k}].text")
                said(c, {x: q[x] for x in ("date", "videoId", "at")}, f"cover.quotes[{k}]", True)
    exact = {"meta.h1": m.get("h1"), "meta.goal": m.get("goal"), "cover.note": cv.get("note"),
             "issues.work.text": ((b["issues"] or {}).get("work") or {}).get("text"),
             "route.said.text": ((b["route"] or {}).get("said") or {}).get("text"),
             "issues.permit.said.text": (((b["issues"] or {}).get("permit") or {}).get("said") or {}).get("text")}
    for k, v in exact.items():
        if v != EXACT[k]:
            c.no(k, f"型の字と違う: {v!r}")

    # ---- ルートと景色
    r = b["route"]
    if shape(c, r, "route", "route"):
        said(c, r["said"], "route.said", False, True)
        count(c, "route.line", len(r["line"]), COUNTS["route.line"])
        for k, p in enumerate(r["line"]):
            if shape(c, p, "point", f"route.line[{k}]"):
                coord(c, p, f"route.line[{k}]")
        fixed_list(c, r["labels"], LABELS, "route.labels")
        for k, p in enumerate(r["labels"]):
            if shape(c, p, "label", f"route.labels[{k}]"):
                coord(c, p, f"route.labels[{k}]")
        cs = r["countries"]
        count(c, "route.countries", len(cs), COUNTS["route.countries"])
        if len(set(cs)) != len(cs):
            c.no("route.countries", "同じ国が2回")
        known = island_countries()
        if known is None:
            c.notes.append("島の国の面の名簿（site/content/countries.ts・travel.ts）が読めないので、route.countries の指す先は見ていない")
        else:
            lost = [x for x in cs if x not in known]
            if lost:
                c.no("route.countries", f"島に国の面が無い: {lost}")
    fixed_list(c, b["views"], VIEWS, "views", "title")
    for k, v in enumerate(b["views"]):
        if shape(c, v, "view", f"views[{k}]"):
            one_line(c, v["lead"], f"views[{k}].lead", 30, 0)
            said(c, v["said"], f"views[{k}].said", True)

    # ---- 売るもの
    foods = b["foods"]
    fixed_list(c, foods, FOODS, "foods")
    fmap = ids(c, foods, "foods")
    sim_foods = set()
    for k, f in enumerate(foods):
        w = f"foods[{k}]"
        if not shape(c, f, "food", w):
            continue
        text(c, f["unit"], w + ".unit")
        text(c, f["machine"], w + ".machine")
        if f["sim"] is not (f["id"] not in NO_SIM):
            c.no(w, f"sim が {f['sim']!r}（{'false' if f['id'] in NO_SIM else 'true'} のはず）")
        if f["sim"] is True:
            sim_foods.add(f["id"])
        for x in ("per_hour", "price", "cost", "dough", "pack"):
            rng(c, f[x], f"{w}.{x}")
        e = f["energy"]
        if shape(c, e, "energy", w + ".energy"):
            text(c, e["text"], w + ".energy.text")
            if e["kind"] not in ENERGY:
                c.no(w + ".energy", f"kind が {e['kind']!r}（電気かガス）")
            elif not is_num(e["gas_kg_h"]) or (e["kind"] == "電気") != (e["gas_kg_h"] == 0):
                c.no(w + ".energy", "gas_kg_h は電気なら 0、ガスなら 0 より大きい数")
        src_or_est(c, f, w, {"per_hour", "price", "cost", "dough", "pack", "gas_kg_h"})
    menu = b["menu"]
    if shape(c, menu, "menu", "menu"):
        got = [(p.get("rank"), p.get("food")) for p in menu["picks"] if isinstance(p, dict)]
        c.counts.append(("menu.picks", f"{len(menu['picks'])}/{len(PICKS)}"))
        if got != PICKS:
            c.no("menu.picks", f"第1〜第3が型と違う: {got}")
        for k, p in enumerate(menu["picks"]):
            shape(c, p, "pick", f"menu.picks[{k}]")
        said(c, menu["decided"], "menu.decided", True)
        count(c, "menu.why", len(menu["why"]), COUNTS["menu.why"])
        ids(c, menu["why"], "menu.why")
        for k, x in enumerate(menu["why"]):
            if shape(c, x, "why", f"menu.why[{k}]"):
                one_line(c, x["text"], f"menu.why[{k}].text", 40, 8)
        count(c, "menu.ideas", len(menu["ideas"]), COUNTS["menu.ideas"])
        ids(c, menu["ideas"], "menu.ideas")
        for k, x in enumerate(menu["ideas"]):
            w = f"menu.ideas[{k}]"
            if shape(c, x, "idea", w):
                text(c, x["name"], w + ".name")
                coined(c, x["name"], w + ".name")
                if x["food"] not in fmap:
                    c.no(w, f"食べ物が無い: {x['food']}")
                if x["from"] not in ("ayato", "viewer"):
                    c.no(w, f"from が {x['from']!r}（ayato か viewer）")
                date(c, x["date"], w + ".date")
    fills = b["fillings"]
    count(c, "fillings", len(fills), COUNTS["fillings"])
    fl = ids(c, fills, "fillings")
    for k, x in enumerate(fills):
        w = f"filling {x.get('id') if isinstance(x, dict) else k}"
        if not shape(c, x, "filling", w):
            continue
        text(c, x["name"], w + ".name")
        coined(c, x["name"], w + ".name")
        if not (isinstance(x["foods"], list) and x["foods"]):
            c.no(w, "foods が空")
        else:
            bad = [f for f in x["foods"] if f not in sim_foods]
            if bad:
                c.no(w, f"メニュー開発に並ばない食べ物を指す: {bad}")
        rng(c, x["cost"], w + ".cost")
        if x["known"] not in (1, 2, 3):
            c.no(w, f"known が {x['known']!r}（1〜3）")
        if not isinstance(x["allergens"], list) or any(a not in ALLERGENS for a in x["allergens"]):
            c.no(w, f"allergens が EU の14品目の字でない: {x['allergens']!r}")
        if not isinstance(x["flags"], list) or any(f not in FLAGS for f in x["flags"]):
            c.no(w, f"flags が {x['flags']!r}")
        if x["from"] not in ("ayato", "viewer", "guide"):
            c.no(w, f"from が {x['from']!r}")
        if "sprite" in x and SPRITES.is_dir() and not any(SPRITES.glob(f"{x['sprite']}.*")):
            c.no(w, f"島の絵が無い: {x['sprite']}")
        src_or_est(c, x, w, {"cost"})
    places = b["places"]
    count(c, "places", len(places), COUNTS["places"])
    pl = ids(c, places, "places")
    for k, x in enumerate(places):
        w = f"place {x.get('id') if isinstance(x, dict) else k}"
        if not shape(c, x, "place", w):
            continue
        text(c, x["name"], w + ".name")
        coined(c, x["name"], w + ".name")
        fee = x["fee"]
        if not isinstance(fee, dict) or fee.get("kind") not in ("fixed", "share"):
            c.no(w, "fee の kind が fixed か share でない")
        elif fee["kind"] == "fixed" and set(fee) == {"kind", "eur"}:
            rng(c, fee["eur"], w + ".fee.eur")
        elif fee["kind"] == "share" and set(fee) == {"kind", "pct"}:
            mid = rng(c, fee["pct"], w + ".fee.pct")
            if mid is not None and fee["pct"][1] > 100:
                c.no(w, "fee.pct が100を超える")
        else:
            c.no(w, "fee は {kind: fixed, eur} か {kind: share, pct}")
        if not (is_num(x["hours"]) and 0 < x["hours"] <= 24):
            c.no(w, "hours が1日の時間でない")
        rng(c, x["buyers"], w + ".buyers")
        src_or_est(c, x, w, {"fee", "hours", "buyers"})
    sim = b["sim"]
    if shape(c, sim, "sim", "sim"):
        if sim["food"] not in sim_foods:
            c.no("sim.food", f"メニュー開発に並ぶ食べ物でない: {sim['food']}")
        fs = sim["fillings"] if isinstance(sim["fillings"], list) else []
        if not 1 <= len(fs) <= 3 or len(set(fs)) != len(fs):
            c.no("sim.fillings", "中身は1〜3つで重ならない")
        for f in fs:
            if f not in fl:
                c.no("sim.fillings", f"中身が無い: {f}")
            elif sim["food"] not in (fl[f].get("foods") or []):
                c.no("sim.fillings", f"{f} は {sim['food']} に入らない")
        if sim["place"] not in pl:
            c.no("sim.place", f"場所が無い: {sim['place']}")
        say = sim["say"]
        if not isinstance(say, dict) or list(say) != SAY:
            c.no("sim.say", f"鍵は {SAY} の順")
        else:
            for k2, v in say.items():
                one_line(c, v, f"sim.say.{k2}", 40, 6)

    # ---- 外装と内装・車
    fixed_list(c, b["looks"], LOOKS, "looks")
    for k, x in enumerate(b["looks"]):
        w = f"looks[{k}]"
        if not shape(c, x, "look", w):
            continue
        one_line(c, x["lead"], w + ".lead", 32, 6)
        it = x["interior"]
        if shape(c, it, "interior", w + ".interior"):
            text(c, it["name"], w + ".interior.name")
            coined(c, it["name"], w + ".interior.name")
            one_line(c, it["lead"], w + ".interior.lead", 32, 6)
            if "src" in it:
                srcs(c, it, w + ".interior")
            if x["id"] == "majolica":
                if it["name"] != MAJOLICA_ROOM:
                    c.no(w + ".interior", f"名前が {it['name']!r}（{MAJOLICA_ROOM} のはず）")
                if not it.get("src"):
                    c.no(w + ".interior", "src が無い")
    fixed_list(c, b["vehicles"], VEHICLES, "vehicles")
    for k, x in enumerate(b["vehicles"]):
        w = f"vehicles[{k}]"
        if not shape(c, x, "vehicle", w):
            continue
        if x["first"] is not (x["id"] == FIRST_VEHICLE):
            c.no(w, f"first が {x['first']!r}（{FIRST_VEHICLE} だけ true）")
        if shape(c, x["price"], "vprice", w + ".price"):
            rng(c, x["price"]["eur"], w + ".price.eur")
            text(c, x["price"]["what"], w + ".price.what")
        for f in ("license", "good", "weak"):
            text(c, x[f], f"{w}.{f}")
        if "said" in x:
            said(c, x["said"], w + ".said", True, True)
        srcs(c, x, w)
    fixed_list(c, b["buy_or_rent"], BUY_OR_RENT, "buy_or_rent")
    for k, x in enumerate(b["buy_or_rent"]):
        w = f"buy_or_rent[{k}]"
        if shape(c, x, "buy", w):
            for f in ("price", "good", "weak"):
                text(c, x[f], f"{w}.{f}")
            srcs(c, x, w)

    # ---- 収益構造（1日まで）
    mo = b["money"]
    if shape(c, mo, "money", "money"):
        ins = mo["inputs"] if isinstance(mo["inputs"], list) else []
        c.counts.append(("money.inputs", f"{len(ins)}/{len(INPUTS)}"))
        if [x.get("id") for x in ins if isinstance(x, dict)] != INPUTS:
            c.no("money.inputs", f"つまみの id と並びは {INPUTS}")
        lim = {}
        for k, x in enumerate(ins):
            w = f"money.inputs[{k}]"
            if not shape(c, x, "input", w):
                continue
            lim[x["id"]] = x
            if not (is_num(x["min"]) and is_num(x["max"]) and is_num(x["step"]) and x["min"] <= x["max"] and x["step"] > 0):
                c.no(w, "min ≦ max で step は 0 より大きい数")
            if (x["id"] == DEFAULT_INPUT) != ("default" in x):
                c.no(w, f"default を持つのは {DEFAULT_INPUT} だけ")
            if "default" in x and not (is_num(x["default"]) and x["min"] <= x["default"] <= x["max"]):
                c.no(w, "min ≦ default ≦ max でない")
            src_or_est(c, x, w, {"min", "max", "step", "default"})
        fx = mo["fixed"]
        if not isinstance(fx, dict) or list(fx) != FIXED:
            c.no("money.fixed", f"鍵は {FIXED} の順")
        else:
            for k2, v in fx.items():
                w = f"money.fixed.{k2}"
                if shape(c, v, "fixedv", w):
                    if not (is_num(v["value"]) and v["value"] > 0):
                        c.no(w, "value が 0 より大きい数でない")
                    srcs(c, v, w)
                    if "est" in v and (not isinstance(v["est"], list) or any(e != "value" for e in v["est"])):
                        c.no(w, "est は value だけ")
        # 2つのシミュレーションは同じ1匹から始める: その1匹の値が、つまみの幅に入ること
        if isinstance(sim, dict) and sim.get("place") in pl and "price" in lim:
            p = sim.get("price")
            pr = lim["price"]
            if not (is_num(p) and pr["min"] <= p <= pr["max"]):
                c.no("sim.price", f"収益のつまみの幅（{pr['min']}〜{pr['max']}）に入らない: {p!r}")
            fee = pl[sim["place"]].get("fee") or {}
            key, vals = ("fee-fixed", fee.get("eur")) if fee.get("kind") == "fixed" else ("fee-share", fee.get("pct"))
            if key in lim and isinstance(vals, list) and len(vals) == 2 and all(is_num(v) for v in vals):
                mid = (vals[0] + vals[1]) / 2
                if not lim[key]["min"] <= mid <= lim[key]["max"]:
                    c.no("sim.place", f"出店料の真ん中 {mid} が {key} のつまみの幅に入らない")

    # ---- 課題一覧
    iss = b["issues"]
    if shape(c, iss, "issues", "issues"):
        date(c, iss["as_of"], "issues.as_of")
        shape(c, iss["work"], "work", "issues.work")
        pm = iss["permit"]
        if shape(c, pm, "permit", "issues.permit"):
            said(c, pm["said"], "issues.permit.said", False, True)
            c.counts.append(("issues.permit.layers", f"{len(pm['layers'])}/{len(LAYERS)}"))
            if [x.get("id") for x in pm["layers"] if isinstance(x, dict)] != LAYERS:
                c.no("issues.permit.layers", f"id と並びは {LAYERS}")
            for k, x in enumerate(pm["layers"]):
                w = f"issues.permit.layers[{k}]"
                if shape(c, x, "layer", w):
                    text(c, x["title"], w + ".title")
                    coined(c, x["title"], w + ".title")
                    text(c, x["text"], w + ".text")
                    if x["weight"] not in WEIGHTS:
                        c.no(w, f"weight が {x['weight']!r}")
                    srcs(c, x, w)
            c.counts.append(("issues.permit.compare", f"{len(pm['compare'])}/{len(COMPARE)}"))
            if [x.get("id") for x in pm["compare"] if isinstance(x, dict)] != COMPARE:
                c.no("issues.permit.compare", f"id と並びは {COMPARE}")
            for k, x in enumerate(pm["compare"]):
                w = f"issues.permit.compare[{k}]"
                if shape(c, x, "compare", w):
                    for f in ("label", "japan", "europe"):
                        text(c, x[f], f"{w}.{f}")
                    srcs(c, x, w)
        life = iss["life"] if isinstance(iss["life"], list) else []
        count(c, "issues.life", len(life), COUNTS["issues.life"])
        ids(c, life, "issues.life")
        per = {g: 0 for g in GROUPS}
        for k, x in enumerate(life):
            w = f"issues.life[{k}]"
            if not shape(c, x, "life", w):
                continue
            if x["n"] != k + 1:
                c.no(w, f"n が {x['n']!r}（{k + 1} のはず。1〜46 を抜けなく）")
            if x["group"] not in per:
                c.no(w, f"group が {x['group']!r}")
            else:
                per[x["group"]] += 1
            if x["stars"] not in (1, 2, 3, 4, 5):
                c.no(w, f"stars が {x['stars']!r}（1〜5）")
            text(c, x["title"], w + ".title")
            coined(c, x["title"], w + ".title")
            text(c, x["plan"], w + ".plan")
            if "src" in x:
                srcs(c, x, w)
        c.counts.append(("issues.life の group", "・".join(f"{g}{n}" for g, n in per.items())))

    # ---- 30本・お題・畳む3つ
    sh = b["shorts"]
    if shape(c, sh, "shorts", "shorts"):
        ts = sh["titles"] if isinstance(sh["titles"], list) else []
        count(c, "shorts.titles", len(ts), COUNTS["shorts.titles"])
        for k, t in enumerate(ts):
            text(c, t, f"shorts.titles[{k}]")
        if len(set(ts)) != len(ts):
            c.no("shorts.titles", "同じ題が2回")
    fixed_list(c, b["notes"], NOTES, "notes")
    for k, x in enumerate(b["notes"]):
        w = f"notes[{k}]"
        if shape(c, x, "note", w):
            text(c, x["lead"], w + ".lead")
            text(c, x["placeholder"], w + ".placeholder")
            if x["id"] == "kitchen-car-name" and not str(x["lead"]).startswith(NAME_LEAD):
                c.no(w, f"lead が「{NAME_LEAD}」で始まらない")
    pg = b["progress"]
    count(c, "progress", len(pg), COUNTS["progress"])
    prev = ""
    for k, x in enumerate(pg):
        w = f"progress[{k}]"
        if not shape(c, x, "progress", w):
            continue
        date(c, x["date"], w + ".date")
        if isinstance(x["date"], str) and x["date"] < prev:
            c.no(w, "古い順でない")
        prev = x["date"] if isinstance(x["date"], str) else prev
        text(c, x["title"], w + ".title")
        coined(c, x["title"], w + ".title")
        text(c, x["body"], w + ".body")
        last = k == len(pg) - 1
        if last and "said" in x:
            c.no(w, "このページの行は場面を持たない")
        if not last:
            sd = x.get("said")
            if not (isinstance(sd, dict) and set(sd) == {"videoId", "at"}):
                c.no(w, "said は {videoId, at}")
            else:
                said(c, {"date": x["date"], **sd}, w + ".said", True)
    lg = b["log"]
    count(c, "log", len(lg), COUNTS["log"])
    prev = "9999-12-31"
    for k, x in enumerate(lg):
        w = f"log[{k}]"
        if not shape(c, x, "log", w):
            continue
        date(c, x["date"], w + ".date")
        if isinstance(x["date"], str) and x["date"] > prev:
            c.no(w, "新しい順でない")
        prev = x["date"] if isinstance(x["date"], str) else prev
        text(c, x["what"], w + ".what")
        text(c, x["why"], w + ".why")
        if x["by"] not in ("ayato", "guide"):
            c.no(w, f"by が {x['by']!r}（ayato か guide）")
    facts = b["facts"]
    count(c, "facts", len(facts), COUNTS["facts"])
    ids(c, facts, "facts")
    groups = {g: 0 for g in sorted(FACT_GROUPS)}
    for k, x in enumerate(facts):
        w = f"fact {x.get('id') if isinstance(x, dict) else k}"
        if not shape(c, x, "fact", w):
            continue
        if x["group"] not in FACT_GROUPS:
            c.no(w, f"group が {x['group']!r}")
        else:
            groups[x["group"]] += 1
        text(c, x["text"], w + ".text")
        if "grade" in x and x["grade"] not in GRADES:
            c.no(w, f"grade が {x['grade']!r}（確 か 二）")
        srcs(c, x, w)
    c.counts.append(("facts の group", "・".join(f"{g} {n}" for g, n in groups.items())))
    # ---- 字の形（本の字ぜんぶ）。見た日（seen）は項目ごとに上書きできるので、ここでまとめて日付の形を見る
    for path, s in walk(b):
        if path.endswith(".seen"):
            date(c, s, path)
        if COUNTDOWN.search(s):
            c.no(path, f"「あと◯日」を書かない: {s}")
        if ("%" in s or "％" in s) and not re.match(r"^facts\[\d+\]\.text$", path):
            c.no(path, f"% の字は確かめた事実の中だけ: {s}")


# ---------------------------------------------------------------------------- 絵の注文書


def check_art(c: Check, a: dict, b: dict):
    if not shape(c, a, "art", "art_order"):
        return
    st = str(a["style"]).lower()
    if "no text" not in st or "no cloth" not in st or "face" not in st:
        c.no("art_order.style", "字と布と顔を描かせない頼みが無い")
    if not is_text((a["cover"] or {}).get("draw")):
        c.no("art_order.cover", "draw が無い")
    mp = a["map"]
    if shape(c, mp, "art_map", "art_order.map"):
        text(c, mp["draw"], "art_order.map.draw")
        bb = mp["bbox"]
        if shape(c, bb, "bbox", "art_order.map.bbox") and all(is_num(bb[k]) for k in bb):
            if not (bb["west"] < bb["east"] and bb["south"] < bb["north"]):
                c.no("art_order.map.bbox", "west < east・south < north でない")
            route = b.get("route") or {}
            for name in ("line", "labels"):
                for k, p in enumerate(route.get(name) or []):
                    if isinstance(p, dict) and is_num(p.get("lat")) and is_num(p.get("lon")):
                        if not (bb["west"] <= p["lon"] <= bb["east"] and bb["south"] <= p["lat"] <= bb["north"]):
                            c.no(f"route.{name}[{k}]", "絵地図の枠（art_order.map.bbox）の外")
    pairs = {"views": [(v.get("id"), v.get("title")) for v in b.get("views") or [] if isinstance(v, dict)],
             "foods": [(v.get("id"), v.get("name")) for v in b.get("foods") or [] if isinstance(v, dict)],
             "vehicles": [(v.get("id"), v.get("name")) for v in b.get("vehicles") or [] if isinstance(v, dict)],
             "looks": [(v.get("id"), v.get("name")) for v in b.get("looks") or [] if isinstance(v, dict)]}
    for grp, want in pairs.items():
        rows = a[grp] if isinstance(a[grp], list) else []
        got = [(x.get("id"), x.get("title")) for x in rows if isinstance(x, dict)]
        c.counts.append((f"art_order.{grp}", f"{len(got)}/{len(want)}"))
        if got != want:
            c.no(f"art_order.{grp}", "id・title・並びが book.json と違う")
        for k, x in enumerate(rows):
            w = f"art_order.{grp}[{k}]"
            if grp == "looks":
                if not shape(c, x, "art_look", w):
                    continue
                ex = x["exterior"]
                if shape(c, ex, "exterior", w + ".exterior"):
                    if ex["mode"] not in ("tile", "panel"):
                        c.no(w, f"exterior.mode が {ex['mode']!r}（tile か panel）")
                    text(c, ex["draw"], w + ".exterior.draw")
                if not isinstance(x["interior"], dict) or not is_text(x["interior"].get("draw")):
                    c.no(w, "interior.draw が無い")
                refs = x["ref"]
                if not (isinstance(refs, list) and refs and all(isinstance(u, str) and u.startswith("https://") for u in refs)):
                    c.no(w, "ref が https の配列でない")
            else:
                if not shape(c, x, "art_item", w):
                    continue
                text(c, x["draw"], w + ".draw")
                if grp == "foods" and not str(x.get("ref", "")).startswith("https://"):
                    c.no(w, "ref が https でない")
    if "photos" in a and shape(c, a["photos"], "photos", "art_order.photos"):
        text(c, a["photos"]["rule"], "art_order.photos.rule")
        cand = a["photos"]["candidates"] if isinstance(a["photos"]["candidates"], list) else []
        c.counts.append(("art_order.photos", str(len(cand))))
        ids(c, cand, "art_order.photos")
        for k, x in enumerate(cand):
            w = f"art_order.photos[{k}]"
            if not shape(c, x, "photo", w):
                continue
            if not str(x["page"]).startswith("https://commons.wikimedia.org/wiki/File:"):
                c.no(w, "page が Commons の File: の頁でない")
            if not (isinstance(x["lic"], str) and LICENSE.match(x["lic"])):
                c.no(w, f"許諾が public domain・CC0・CC BY・CC BY-SA でない: {x['lic']!r}")
            text(c, x["by"], w + ".by")
            text(c, x["note"], w + ".note")
            date(c, x["taken"], w + ".taken")


# ---------------------------------------------------------------------------- 口


def check_dir(base: Path) -> tuple[Check, dict | None]:
    """置き場を確かめる。book.json が読めなければ (Check, None)。焼く道具はここを呼び、`errors` が空のときだけ書く。"""
    c = Check()
    try:
        book = json.loads((base / "book.json").read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        c.no("book.json", f"読めない（{e}）")
        return c, None
    if not isinstance(book, dict):
        c.no("book.json", "入れ物が dict でない")
        return c, None
    try:
        check_book(c, book)
    except (KeyError, TypeError, AttributeError) as e:  # 形が崩れていて先へ進めない
        c.no("book.json", f"形が崩れていて数えきれない（{type(e).__name__}: {e}）")
    art_path = base / "art_order.json"
    if art_path.exists():
        try:
            check_art(c, json.loads(art_path.read_text(encoding="utf-8")), book)
        except ValueError as e:
            c.no("art_order", f"読めない（{e}）")
        except (KeyError, TypeError, AttributeError) as e:
            c.no("art_order", f"形が崩れていて数えきれない（{type(e).__name__}: {e}）")
    else:
        c.no("art_order", "art_order.json が無い")
    return c, book


def main(argv: list[str]) -> int:
    base = Path(argv[1]) if len(argv) > 1 else DEFAULT
    if base.is_file():
        base = base.parent
    if not (base / "book.json").is_file():
        print(f"数えるものが無い: {base / 'book.json'}")
        return 2
    c, book = check_dir(base)
    if book is None:
        print(f"数えるものが無い: {c.errors[0] if c.errors else base}")
        return 2
    print(f"{book.get('slug')}: {base}")
    print("| 数えたもの | 数 |\n| --- | --- |")
    for k, v in c.counts:
        print(f"| {k} | {v} |")
    for n in c.notes:
        print(f"\n（見ていない: {n}）")
    if c.errors:
        print(f"\n落ちた所 {len(c.errors)}:")
        for e in c.errors:
            print("  - " + e)
        return 1
    print("\n通った")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
