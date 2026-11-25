"""**企画の面（`/legends/<企画>`）の材料 `book.json` と絵の注文書 `art_order.json` を、数えて確かめる。**

    python3 python/legend_book_check.py                                         # india-street-food を確かめる
    python3 python/legend_book_check.py python/data/legends/india-street-food   # 置き場を名指し（写しを当てるときも）

終了コード 0=通った / 1=落ちた所がある / 2=数えるものが無い（book.json が無い・読めない）。

## なぜ要るか

材料は担当（エージェント）が集め、面は別の担当が並べて組む。受け渡しの型（置き場の `README.md`）がずれると、
面の錨（`#dish-<id>`）・絵のファイル名・食べ比べの組が黙って欠ける。字を目で読んでも、100品の数と鍵の食い違いは見落とす。
だから型の約束を機械で数える:

1. **形** — 上の鍵・節ごとの欄・欄の型（`kind` `star` `flags` `season` は決まった値だけ）
2. **数と配分** — 100品・用語12・地域5・食べ比べ5・見どころ5・コツ4〜6・問い4〜6・決まり3〜5。地域ごとの品の数（企画ごとの `EXPECT`）
3. **鍵** — id は英小文字とハイフンで一意。地域と食べ比べが指す品が全部在る。地域が指す品はその地域の品
4. **出どころと値段の欠け 0** — 事実を持つ入れ物は全部 `src`（https）を持つ。全品に値段（通貨・額・円・レートの日付）。
   円はレートから計算した額と1円より離れない。スリランカの品はルピー（LKR）、ほかはインド・ルピー（INR）
5. **道** — 企画書の順のまま。座標は小数6桁まで
6. **字の形** — リードに読点と括弧の強め（“”『』「」）を置かない・字数・使わない語（`docs/guide-copy.md` 6章・7章の4、`docs/guide-design.md` 5-1）
7. **絵の注文書** — 品が本と同じ id の同じ順で100、`style` が字と布を描かせない

## 対照

壊した写し（品を1つ消す・id を重ねる・出どころを消す・食べ比べの鍵を無い品に向ける）を置き場ごと当てると、終了コード1で落ちる。
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DEFAULT = ROOT / "data" / "legends" / "india-street-food"

#: 企画ごとの約束（数・配分・道の順）。型は置き場の README.md
EXPECT = {
    "india-street-food": {
        "dishes": 100,
        "per_region": {"west": 15, "south": 25, "east": 15, "north": 30, "srilanka": 15},
        "words": 12, "regions": 5, "compare": 5, "sights": 5, "tips": (4, 6), "faq": (4, 6), "rules": (3, 5),
        "route": ["ムンバイ", "ゴア", "コーチ", "マドゥライ", "チェンナイ", "ハイデラバード", "コルカタ", "バラナシ",
                  "ラクナウ", "アーグラ", "デリー", "アムリトサル", "コロンボ"],
        "currency": {"srilanka": "LKR"}, "currency_default": "INR",
        "compare_sizes": {"biryani": 6},
    },
}
REGIONS = {"north", "west", "east", "south", "srilanka"}
KINDS = {"屋台", "食堂", "朝ごはん", "甘いもの", "飲みもの"}
FLAGS = {"pork", "alcohol", "beef"}
SEASONS = {None, "冬だけ", "ラマダンのあいだ"}
RATE = {"INR": 1.71, "LKR": 0.475}
ID = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
ONE_LINE_BAN = ["、", "“", "”", "\"", "『", "』", "「", "」"]
WORD_BAN = ["いまは", "いまも", "いまの", "今年", "最新", "最旬", "今こそ", "話題の", "絶品", "極上", "至福", "本場の",
            "正解", "できます", "になっています", "おすすめです", "“", "”"]

KEYS = {
    "top": ["slug", "updated", "meta", "rules", "quote", "words", "regions", "compare", "dishes", "route", "sights", "tips", "faq"],
    "meta": ["title", "description", "h1", "sub", "start", "from"],
    "quote": ["text", "date", "at", "videoId"],
    "words": ["id", "name", "lead", "body", "src"],
    "regions": ["id", "name", "staple", "oil", "dishes", "body", "src"],
    "compare": ["id", "title", "lead", "items", "src"],
    "dishes": ["id", "name", "local", "region", "city", "kind", "star", "flags", "season", "lead", "what", "where",
               "price", "src", "wiki"],
    "price": ["cur", "min", "max", "yen_min", "yen_max", "rate_date"],
    "route": ["city", "region", "lat", "lon"],
    "sights": ["id", "name", "lead", "what", "price", "lat", "lon", "src"],
    "tips": ["id", "title", "body", "src"],
    "faq": ["q", "a", "src"],
}


class Check:
    def __init__(self):
        self.errors: list[str] = []
        self.counts: list[tuple[str, str]] = []

    def no(self, where: str, msg: str):
        self.errors.append(f"{where}: {msg}")


def keys(c: Check, obj, need, where):
    if not isinstance(obj, dict):
        c.no(where, "入れ物が dict でない")
        return False
    miss = [k for k in need if k not in obj]
    if miss:
        c.no(where, "欄が無い " + ",".join(miss))
    return not miss


def is_text(v) -> bool:
    return isinstance(v, str) and v.strip() != ""


def srcs(c: Check, obj, where):
    s = obj.get("src")
    if not isinstance(s, list) or not s:
        c.no(where, "src が無い")
        return
    for u in s:
        if not (isinstance(u, str) and u.startswith("https://")):
            c.no(where, f"src が https でない: {u!r}")


def count(c: Check, name, n, want):
    lo, hi = want if isinstance(want, tuple) else (want, want)
    ok = lo <= n <= hi
    c.counts.append((name, f"{n}（{lo}〜{hi}）" if lo != hi else f"{n}/{lo}"))
    if not ok:
        c.no(name, f"数が {n}（{lo}〜{hi}）" if lo != hi else f"数が {n}（{lo} のはず）")


def one_line(c: Check, s, where, lo=12, hi=32):
    if not is_text(s):
        c.no(where, "字が無い")
        return
    for b in ONE_LINE_BAN:
        if b in s:
            c.no(where, f"一行に「{b}」: {s}")
    if not (lo <= len(s) <= hi):
        c.no(where, f"字数 {len(s)}（{lo}〜{hi}）: {s}")


def words_ok(c: Check, s, where):
    if not isinstance(s, str):
        return
    for w in WORD_BAN:
        if w in s:
            c.no(where, f"使わない語「{w}」")


def decimals(x) -> int:
    t = repr(float(x))
    return len(t.split(".")[1]) if "." in t and "e" not in t else 0


def check_book(c: Check, b: dict, ex: dict):
    if not keys(c, b, KEYS["top"], "book"):
        return
    m = b["meta"]
    if keys(c, m, KEYS["meta"], "meta"):
        if not (25 <= len(m["title"]) <= 45):
            c.no("meta.title", f"字数 {len(m['title'])}（25〜45）")
        if not (80 <= len(m["description"]) <= 160):
            c.no("meta.description", f"字数 {len(m['description'])}（80〜160）")
        if not DATE.match(str(m["start"])):
            c.no("meta.start", "日付の形でない")
        words_ok(c, m["description"], "meta.description")
    if keys(c, b["quote"], KEYS["quote"], "quote"):
        if not re.match(r"^[A-Za-z0-9_-]{11}$", str(b["quote"]["videoId"])):
            c.no("quote.videoId", "11字の動画 id でない")
        if not re.match(r"^\d+:\d{2}:\d{2}$", str(b["quote"]["at"])):
            c.no("quote.at", "時刻の形（0:25:30）でない")

    count(c, "rules", len(b["rules"]), ex["rules"])
    for k, r in enumerate(b["rules"]):
        one_line(c, r, f"rules[{k}]", 8, 30)

    # ---- 品
    dishes = b["dishes"]
    count(c, "dishes", len(dishes), ex["dishes"])
    ids: dict[str, dict] = {}
    per = {r: 0 for r in REGIONS}
    for k, d in enumerate(dishes):
        w = f"dishes[{k}]"
        if not keys(c, d, KEYS["dishes"], w):
            continue
        w = f"dish {d['id']}"
        if not ID.match(str(d["id"])):
            c.no(w, "id が英小文字とハイフンでない")
        if d["id"] in ids:
            c.no(w, "id が重なる")
        ids[d["id"]] = d
        if d["region"] not in REGIONS:
            c.no(w, f"region が {d['region']!r}")
        else:
            per[d["region"]] += 1
        if d["kind"] not in KINDS:
            c.no(w, f"kind が {d['kind']!r}")
        if d["star"] not in (1, 2, 3):
            c.no(w, f"star が {d['star']!r}")
        if not isinstance(d["flags"], list) or any(f not in FLAGS for f in d["flags"]):
            c.no(w, f"flags が {d['flags']!r}")
        if d["season"] not in SEASONS:
            c.no(w, f"season が {d['season']!r}")
        for f in ("name", "local", "city", "what", "where"):
            if not is_text(d[f]):
                c.no(w, f"{f} が空")
        one_line(c, d["lead"], w + " lead")
        for f in ("what", "where"):
            words_ok(c, d[f], f"{w} {f}")
        srcs(c, d, w)
        if not (isinstance(d["wiki"], str) and d["wiki"].startswith("https://")):
            c.no(w, "wiki が https でない")
        p = d["price"]
        if keys(c, p, KEYS["price"], w + " price"):
            want = ex["currency"].get(d["region"], ex["currency_default"])
            if p["cur"] != want:
                c.no(w, f"通貨が {p['cur']}（{want} のはず）")
            nums = [p[x] for x in ("min", "max", "yen_min", "yen_max")]
            if not all(isinstance(x, (int, float)) and x >= 0 for x in nums):
                c.no(w, "値段が数でない")
            elif p["min"] > p["max"]:
                c.no(w, "値段の min が max より大きい")
            elif p["cur"] in RATE:
                for a, y in (("min", "yen_min"), ("max", "yen_max")):
                    if abs(p[a] * RATE[p["cur"]] - p[y]) > 1:
                        c.no(w, f"円が合わない（{p[a]} {p['cur']} → {p[y]}円）")
            if not DATE.match(str(p["rate_date"])):
                c.no(w, "rate_date が日付の形でない")
    for r, n in ex["per_region"].items():
        count(c, f"dishes.{r}", per.get(r, 0), n)

    # ---- 用語・地域・食べ比べ
    count(c, "words", len(b["words"]), ex["words"])
    seen = set()
    for k, x in enumerate(b["words"]):
        if keys(c, x, KEYS["words"], f"words[{k}]"):
            w = f"word {x['id']}"
            if not ID.match(str(x["id"])) or x["id"] in seen:
                c.no(w, "id が形どおりでないか重なる")
            seen.add(x["id"])
            one_line(c, x["lead"], w + " lead")
            words_ok(c, x["body"], w + " body")
            srcs(c, x, w)
    count(c, "regions", len(b["regions"]), ex["regions"])
    got = set()
    for k, x in enumerate(b["regions"]):
        if keys(c, x, KEYS["regions"], f"regions[{k}]"):
            w = f"region {x['id']}"
            got.add(x["id"])
            if not x["dishes"]:
                c.no(w, "よく食べるものが空")
            for di in x["dishes"]:
                if di not in ids:
                    c.no(w, f"指す品が無い: {di}")
                elif ids[di]["region"] != x["id"]:
                    c.no(w, f"指す品 {di} の地域が {ids[di]['region']}")
            words_ok(c, x["body"], w + " body")
            srcs(c, x, w)
    if got != REGIONS:
        c.no("regions", f"地域の id が {sorted(got)}（north west east south srilanka のはず）")
    count(c, "compare", len(b["compare"]), ex["compare"])
    for k, x in enumerate(b["compare"]):
        if keys(c, x, KEYS["compare"], f"compare[{k}]"):
            w = f"compare {x['id']}"
            one_line(c, x["title"], w + " title", 8, 24)
            one_line(c, x["lead"], w + " lead")
            if len(x["items"]) < 2:
                c.no(w, "比べる品が2つ未満")
            want = ex["compare_sizes"].get(x["id"])
            if want and len(x["items"]) != want:
                c.no(w, f"品が {len(x['items'])}（{want} のはず）")
            for it in x["items"]:
                if it.get("dish") not in ids:
                    c.no(w, f"指す品が無い: {it.get('dish')}")
                if not is_text(it.get("note")):
                    c.no(w, f"{it.get('dish')} の note が空")
            srcs(c, x, w)

    # ---- 道・見どころ・コツ・問い
    route = b["route"]
    cities = [x.get("city") for x in route]
    if cities != ex["route"]:
        c.no("route", f"順が企画書と違う: {cities}")
    c.counts.append(("route", f"{len(route)}/{len(ex['route'])}"))
    for k, x in enumerate(route):
        if keys(c, x, KEYS["route"], f"route[{k}]"):
            w = f"route {x['city']}"
            if x["region"] not in REGIONS:
                c.no(w, f"region が {x['region']!r}")
            if not (isinstance(x["lat"], (int, float)) and -90 <= x["lat"] <= 90 and isinstance(x["lon"], (int, float))
                    and -180 <= x["lon"] <= 180):
                c.no(w, "座標が数でないか範囲の外")
            elif decimals(x["lat"]) > 6 or decimals(x["lon"]) > 6:
                c.no(w, "座標が小数6桁を超える")
    count(c, "sights", len(b["sights"]), ex["sights"])
    for k, x in enumerate(b["sights"]):
        if keys(c, x, KEYS["sights"], f"sights[{k}]"):
            w = f"sight {x['id']}"
            one_line(c, x["lead"], w + " lead")
            words_ok(c, x["what"], w + " what")
            if not is_text(x["price"]):
                c.no(w, "price が空")
            if decimals(x["lat"]) > 6 or decimals(x["lon"]) > 6:
                c.no(w, "座標が小数6桁を超える")
            srcs(c, x, w)
    count(c, "tips", len(b["tips"]), ex["tips"])
    for k, x in enumerate(b["tips"]):
        if keys(c, x, KEYS["tips"], f"tips[{k}]"):
            one_line(c, x["title"], f"tip {x['id']} title", 8, 24)
            words_ok(c, x["body"], f"tip {x['id']} body")
            srcs(c, x, f"tip {x['id']}")
    count(c, "faq", len(b["faq"]), ex["faq"])
    for k, x in enumerate(b["faq"]):
        if keys(c, x, KEYS["faq"], f"faq[{k}]"):
            words_ok(c, x["a"], f"faq[{k}] a")
            srcs(c, x, f"faq[{k}]")
    return ids


def check_art(c: Check, a: dict, dishes: list):
    if not keys(c, a, ["style", "cover", "map", "dishes"], "art_order"):
        return
    st = str(a["style"]).lower()
    if "no text" not in st or "no cloth" not in st:
        c.no("art_order.style", "字と布を描かせない頼みが無い")
    if not is_text((a["cover"] or {}).get("draw")):
        c.no("art_order.cover", "draw が無い")
    mp = a["map"] or {}
    if not is_text(mp.get("draw")) or set(mp.get("regions") or []) != REGIONS:
        c.no("art_order.map", "draw か regions（5地域）が無い")
    got = [x.get("id") for x in a["dishes"]]
    want = [d["id"] for d in dishes]
    c.counts.append(("art_order.dishes", f"{len(got)}/{len(want)}"))
    if got != want:
        c.no("art_order.dishes", "品の id と並びが book.json と違う")
    names = {d["id"]: d["name"] for d in dishes}
    for x in a["dishes"]:
        w = f"art {x.get('id')}"
        if x.get("title") != names.get(x.get("id")):
            c.no(w, "title が品の名前と違う")
        if not is_text(x.get("draw")):
            c.no(w, "draw が空")
        if not str(x.get("ref", "")).startswith("https://"):
            c.no(w, "ref が https でない")


def main(argv: list[str]) -> int:
    base = Path(argv[1]) if len(argv) > 1 else DEFAULT
    if base.is_file():
        base = base.parent
    try:
        book = json.loads((base / "book.json").read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        print(f"数えるものが無い: {base / 'book.json'}（{e}）")
        return 2
    slug = book.get("slug") if isinstance(book, dict) else None
    ex = EXPECT.get(slug or base.name)
    if not ex:
        print(f"約束（EXPECT）の無い企画: {slug}")
        return 2
    c = Check()
    check_book(c, book, ex)
    art_path = base / "art_order.json"
    if art_path.exists():
        try:
            check_art(c, json.loads(art_path.read_text(encoding="utf-8")), book.get("dishes") or [])
        except ValueError as e:
            c.no("art_order", f"読めない（{e}）")
    else:
        c.no("art_order", "art_order.json が無い")

    print(f"{slug}: {base}")
    print("| 数えたもの | 数 |\n| --- | --- |")
    for k, v in c.counts:
        print(f"| {k} | {v} |")
    if isinstance(book.get("dishes"), list):
        ds = [d for d in book["dishes"] if isinstance(d, dict)]
        star3 = sum(1 for d in ds if d.get("star") == 3)
        fl = {f: sum(1 for d in ds if f in (d.get("flags") or [])) for f in sorted(FLAGS)}
        print(f"| ★3 | {star3} |")
        print("| flags | " + "・".join(f"{f} {n}" for f, n in fl.items()) + " |")
    if c.errors:
        print(f"\n落ちた所 {len(c.errors)}:")
        for e in c.errors:
            print("  - " + e)
        return 1
    print("\n通った")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
