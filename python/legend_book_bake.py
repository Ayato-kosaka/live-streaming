"""企画の面（`/legends/<企画>`）の中身を、材料（book.json）から焼く。

    python3 python/legend_book_bake.py india-street-food            # 焼く（site/content/legends/india-street-food.ts）
    python3 python/legend_book_bake.py india-street-food --check    # 焼かずに、焼いてあるものが今の材料と同じかだけ（違えば 1）
    python3 python/legend_book_bake.py india-street-food --src x.json --out y.ts   # 置き場を差し替える（見本で組むとき・見張り）

終了コード 0=焼いた（同じだった）/ 1=材料が型に合わない（何も書かない）・焼き直しが要る / 2=材料が無い。

## 何をするか

面の印の付いた企画（`site/content/projects.ts` の `book`。M-8・`docs/adr/0018-upcoming-project-page.md`）は、
始まる前から決まりとガイドを持つ。中身は材料担当が `python/data/legends/<企画>/book.json` に置く
（受け渡しの型は運営が決めた。中身の字と出どころは材料、並びは企画書 #1404 の本文5章）。
ここはそれを**確かめて、面がそのまま並べられる形に焼くだけ**で、事実の字は足さない。

足すのは、面に要るが材料の型に欄の無い字だけで、どれも企画書（あやとが承認した字）から取る:

- 節の名前（企画書5章の並び。`SECTIONS`）と、★の言葉（5章の6「必食／行けたら／余裕があれば」。`STARS`）
- 地域のカードの欄の名前（6章の表の頭「主食・油・よく食べるもの」。`REGION_LABELS`）
- 数える単位とゴール（3章「1回の食事＝1食」・題の「100食」。`GOAL`）
- 字に組むもの: 始まる日（「ごろ」と出す。面は日付だけ言い、あと◯日は言わない）・値段（現地の額と円、換算した日）・本人の言葉の場面

材料を直したら焼き直す。焼いたもの（`site/content/legends/<企画>.ts`）は**手で直さない**。
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from maps_link import search  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
BEGIN, END = "/* 焼いた中身 */", "/* ここまで */"

#: 節の名前と並び（企画書 #1404 本文5章。0 表紙・目次は節ではない。9 付箋と10 この企画の配信は、
#: 動線を繋ぐ日・始まった日に足す——12章「それまでは付箋の節を出しません」）。「見ておきたい5か所」は7「回りかた」の中
SECTIONS = {
    "rules": "決まり",
    "stamps": "食べた100食",
    "words": "インド料理の基本用語",
    "regions": "地域ごとの料理の違い",
    "compare": "街ごとの食べ比べ",
    "dishes": "食べるべき100品",
    "route": "回りかた",
    "sights": "見ておきたい5か所",
    "tips": "屋台でお腹を壊さないコツ",
    "faq": "よくある質問",
}
#: ★の言葉（企画書5章の6。並びは `rank`＝1が★3。`content/guidebook/types.ts` の `Item.rank`）
STARS = ["", "必食", "行けたら", "余裕があれば"]
#: 地域のカードの欄（企画書6章の表の頭）
REGION_LABELS = {"staple": "主食", "oil": "油", "dishes": "よく食べるもの"}
#: 数える単位とゴール（企画書3章「1回の食事＝1食」・2章の題「100食」）
GOAL = {"n": 100, "unit": "食"}

REGIONS = ["north", "west", "east", "south", "srilanka"]
KINDS = ["屋台", "食堂", "朝ごはん", "甘いもの", "飲みもの"]
FLAGS = {"pork", "alcohol", "beef"}
SEASONS = {"冬だけ", "ラマダンのあいだ"}
CURRENCY = {"INR": "ルピー", "LKR": "スリランカ・ルピー"}
ID = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
DAY = re.compile(r"^\d{4}-\d{2}-\d{2}$")
#: 面は「あと◯日」を言わない（企画書14章。いま・これからを言うのは表紙の役目）
COUNTDOWN = re.compile(r"あと\s*[0-9０-９一二三四五六七八九十百]+\s*日")


class Bad(Exception):
    pass


def jp_date(iso: str) -> str:
    y, m, d = (int(x) for x in iso.split("-"))
    return f"{y}年{m}月{d}日"


def src_of(url: str) -> dict:
    """出どころ1つ。名前は URL から読む（**作らない**）: Wikipedia は記事の題、ほかは置き場の名前"""
    u = urllib.parse.urlparse(url)
    if not u.scheme.startswith("http") or not u.netloc:
        raise Bad(f"出どころが URL でない: {url!r}")
    host = u.netloc.removeprefix("www.")
    if host.endswith("wikipedia.org") and u.path.startswith("/wiki/"):
        title = urllib.parse.unquote(u.path[len("/wiki/"):]).replace("_", " ")
        return {"name": f"Wikipedia「{title}」", "url": url}
    return {"name": host, "url": url}


def srcs(xs, where: str) -> list[dict]:
    if not isinstance(xs, list) or not xs:
        raise Bad(f"{where}: 出どころ（src）が無い")
    out, seen = [], set()
    for x in xs:
        if x in seen:
            continue
        seen.add(x)
        out.append(src_of(x))
    return out


def text(v, where: str, lo: int = 1, hi: int | None = None) -> str:
    if not isinstance(v, str) or not v.strip():
        raise Bad(f"{where}: 字が無い")
    v = v.strip()
    if len(v) < lo or (hi is not None and len(v) > hi):
        raise Bad(f"{where}: {len(v)}字（{lo}〜{hi}字）")
    return v


def count(xs, where: str, lo: int, hi: int | None = None) -> list:
    hi = lo if hi is None else hi
    if not isinstance(xs, list) or not lo <= len(xs) <= hi:
        n = len(xs) if isinstance(xs, list) else "表でない"
        raise Bad(f"{where}: {n}件（{lo}{'' if lo == hi else f'〜{hi}'}件）")
    return xs


def ids(xs: list, where: str) -> set[str]:
    got = [x.get("id") for x in xs]
    bad = [i for i in got if not isinstance(i, str) or not ID.match(i)]
    if bad:
        raise Bad(f"{where}: id は英小文字とハイフン（{bad[:3]}）")
    dup = sorted({i for i in got if got.count(i) > 1})
    if dup:
        raise Bad(f"{where}: 同じ id が2つ（{dup}）")
    return set(got)


def seconds(at: str) -> int:
    m = re.fullmatch(r"(\d+):(\d{2}):(\d{2})", at or "")
    if not m:
        raise Bad(f"本人の言葉の時刻（at）が H:MM:SS でない: {at!r}")
    h, mi, s = (int(x) for x in m.groups())
    return h * 3600 + mi * 60 + s


def price_text(p: dict, where: str) -> str:
    """「13〜25ルピー（約22〜43円・2026年11月23日の換算）」（`docs/guide-design.md` 5-4）"""
    try:
        cur, lo, hi, ylo, yhi, day = p["cur"], p["min"], p["max"], p["yen_min"], p["yen_max"], p["rate_date"]
    except (KeyError, TypeError):
        raise Bad(f"{where}: 値段（price）の欄が足りない") from None
    if cur not in CURRENCY:
        raise Bad(f"{where}: 通貨 {cur!r} を知らない（{sorted(CURRENCY)}）")
    if not all(isinstance(x, int) and x >= 0 for x in (lo, hi, ylo, yhi)) or lo > hi or ylo > yhi:
        raise Bad(f"{where}: 値段の額が崩れている（{lo}〜{hi}・{ylo}〜{yhi}円）")
    # タダで出す所（黄金寺院の無料食堂ランガル）。0 は「無料」と書き、換算は添えない
    if hi == 0:
        if yhi:
            raise Bad(f"{where}: 現地の額が0なのに円の額がある（{ylo}〜{yhi}円）")
        return "無料"
    if not isinstance(day, str) or not DAY.match(day):
        raise Bad(f"{where}: 換算した日（rate_date）が YYYY-MM-DD でない")
    amt = f"{lo:,}" if lo == hi else f"{lo:,}〜{hi:,}"
    yen = f"約{ylo:,}円" if ylo == yhi else f"約{ylo:,}〜{yhi:,}円"
    return f"{amt}{CURRENCY[cur]}（{yen}・{jp_date(day)}の換算）"


def build(b: dict, slug: str) -> dict:
    if b.get("slug") != slug:
        raise Bad(f"材料の slug が {b.get('slug')!r}（{slug!r} のはず）")
    if not isinstance(b.get("updated"), str) or not DAY.match(b["updated"]):
        raise Bad("updated が YYYY-MM-DD でない")
    m = b.get("meta") or {}
    meta = {
        "title": text(m.get("title"), "meta.title", 25, 45),
        "description": text(m.get("description"), "meta.description", 80, 160),
        "h1": text(m.get("h1"), "meta.h1"),
        "sub": text(m.get("sub"), "meta.sub"),
        "start": text(m.get("start"), "meta.start"),
        "from": text(m.get("from"), "meta.from"),
    }
    if not DAY.match(meta["start"]):
        raise Bad("meta.start が YYYY-MM-DD でない")
    q = b.get("quote") or {}
    quote = {
        "text": text(q.get("text"), "quote.text"),
        "date": text(q.get("date"), "quote.date"),
        "at": text(q.get("at"), "quote.at"),
        "v": text(q.get("videoId"), "quote.videoId"),
        "t": seconds(q.get("at")),
    }
    if not DAY.match(quote["date"]):
        raise Bad("quote.date が YYYY-MM-DD でない")

    dishes_in = count(b.get("dishes"), "dishes（食べるべき100品）", GOAL["n"])
    dish_ids = ids(dishes_in, "dishes")
    dishes = []
    for d in dishes_in:
        w = f"dishes[{d['id']}]"
        region = d.get("region")
        if region not in REGIONS:
            raise Bad(f"{w}: 地域 {region!r} を知らない（{REGIONS}）")
        if d.get("kind") not in KINDS:
            raise Bad(f"{w}: 種類 {d.get('kind')!r} を知らない（{KINDS}）")
        star = d.get("star")
        if star not in (1, 2, 3):
            raise Bad(f"{w}: ★は1〜3（{star!r}）")
        flags = d.get("flags") or []
        if not set(flags) <= FLAGS:
            raise Bad(f"{w}: flags は {sorted(FLAGS)} だけ（{flags}）")
        season = d.get("season")
        if season is not None and season not in SEASONS:
            raise Bad(f"{w}: 季節 {season!r} を知らない（{sorted(SEASONS)}）")
        name, city, local = text(d.get("name"), f"{w}.name"), text(d.get("city"), f"{w}.city"), text(d.get("local"), f"{w}.local")
        price = price_text(d.get("price"), w)
        facts = [{"label": "どこで", "text": text(d.get("where"), f"{w}.where")}, {"label": "値段", "text": price}]
        if season:
            facts.append({"label": "時期", "text": season})
        src = srcs([*(d.get("src") or []), *([d["wiki"]] if d.get("wiki") else [])], w)
        dishes.append({
            "id": d["id"],
            "name": name,
            "local": {"text": local, "lang": "en"},
            # ★3 が「必食」。札と窓の部品（`components/guidebook/Items.tsx`）は rank（1が上）で読む
            "rank": 4 - star,
            "line": city,
            "body": text(d.get("what"), f"{w}.what"),
            "facts": facts,
            **({"marks": [{"kind": "season", "text": season}]} if season else {}),
            **({"flags": {f: True for f in sorted(flags)}} if flags else {}),
            "kinds": [region],
            "maps": search(local, city),
            "src": src,
            "region": region,
            "city": city,
            "kind": d["kind"],
            "lead": text(d.get("lead"), f"{w}.lead", 5, 40),
            "price": price,
            **({"season": season} if season else {}),
        })

    words = []
    for x in count(b.get("words"), "words（基本用語）", 12):
        w = f"words[{x.get('id')}]"
        words.append({"id": x["id"], "name": text(x.get("name"), f"{w}.name"), "lead": text(x.get("lead"), f"{w}.lead"),
                      "body": text(x.get("body"), f"{w}.body"), "src": srcs(x.get("src"), w)})
    ids(words, "words")

    regions = []
    got = [x.get("id") for x in count(b.get("regions"), "regions（地域）", len(REGIONS))]
    if sorted(got) != sorted(REGIONS):
        raise Bad(f"regions の id は {REGIONS}（{got}）")
    for x in b["regions"]:
        w = f"regions[{x['id']}]"
        lost = [i for i in x.get("dishes") or [] if i not in dish_ids]
        if lost or not x.get("dishes"):
            raise Bad(f"{w}: よく食べるものが100品に無い（{lost or '空'}）")
        regions.append({"id": x["id"], "name": text(x.get("name"), f"{w}.name"), "staple": text(x.get("staple"), f"{w}.staple"),
                        "oil": text(x.get("oil"), f"{w}.oil"), "dishes": x["dishes"], "body": text(x.get("body"), f"{w}.body"),
                        "src": srcs(x.get("src"), w)})
    regions.sort(key=lambda r: REGIONS.index(r["id"]))

    compare = []
    for x in count(b.get("compare"), "compare（食べ比べ）", 5):
        w = f"compare[{x.get('id')}]"
        items = count(x.get("items"), f"{w}.items", 2, 8)
        lost = [i.get("dish") for i in items if i.get("dish") not in dish_ids]
        if lost:
            raise Bad(f"{w}: 100品に無い品（{lost}）")
        compare.append({"id": x["id"], "title": text(x.get("title"), f"{w}.title"), "lead": text(x.get("lead"), f"{w}.lead"),
                        "items": [{"dish": i["dish"], "note": text(i.get("note"), f"{w}.items.note")} for i in items],
                        "src": srcs(x.get("src"), w)})
    ids(compare, "compare")

    route = []
    for i, x in enumerate(count(b.get("route"), "route（回りかた）", 2, 30)):
        if x.get("region") not in REGIONS or not all(isinstance(x.get(k), (int, float)) for k in ("lat", "lon")):
            raise Bad(f"route[{i}]: 地域か座標が崩れている")
        route.append({"city": text(x.get("city"), f"route[{i}].city"), "region": x["region"], "lat": x["lat"], "lon": x["lon"]})

    sights = []
    for x in count(b.get("sights"), "sights（見ておきたい所）", 5):
        w = f"sights[{x.get('id')}]"
        name = text(x.get("name"), f"{w}.name")
        sights.append({"id": x["id"], "name": name, "lead": text(x.get("lead"), f"{w}.lead"), "what": text(x.get("what"), f"{w}.what"),
                       "price": text(x.get("price"), f"{w}.price"), "maps": search(name), "src": srcs(x.get("src"), w)})
    ids(sights, "sights")

    tips = []
    for x in count(b.get("tips"), "tips（お腹を壊さないコツ）", 4, 6):
        w = f"tips[{x.get('id')}]"
        tips.append({"id": x["id"], "title": text(x.get("title"), f"{w}.title"), "body": text(x.get("body"), f"{w}.body"),
                     "src": srcs(x.get("src"), w)})
    ids(tips, "tips")

    faq = []
    for i, x in enumerate(count(b.get("faq"), "faq（よくある質問）", 4, 6)):
        faq.append({"q": text(x.get("q"), f"faq[{i}].q"), "a": text(x.get("a"), f"faq[{i}].a"), "src": srcs(x.get("src"), f"faq[{i}]")})

    rules = [text(r, f"rules[{i}]") for i, r in enumerate(count(b.get("rules"), "rules（決まり）", 3, 5))]

    out = {
        "slug": slug,
        "updated": b["updated"],
        "meta": meta,
        "start": f"{jp_date(meta['start'])}ごろ {meta['from']}から",
        "goal": GOAL,
        "sections": SECTIONS,
        "stars": STARS,
        "regionLabels": REGION_LABELS,
        "rules": rules,
        "quote": {**quote, "cite": f"{jp_date(quote['date'])}の配信 {quote['at']}"},
        "words": words,
        "regions": regions,
        "compare": compare,
        "dishes": dishes,
        "route": route,
        "sights": sights,
        "tips": tips,
        "faq": faq,
    }
    blob = json.dumps(out, ensure_ascii=False)
    hit = COUNTDOWN.search(blob)
    if hit:
        raise Bad(f"「{hit.group(0)}」がある。面は「あと◯日」を言わない（企画書14章）")
    out["hash"] = hashlib.sha1(blob.encode("utf-8")).hexdigest()[:12]
    return out


def const_of(slug: str) -> str:
    return slug.upper().replace("-", "_")


def render(slug: str, g: dict) -> str:
    return (
        "/**\n"
        f" * 企画の面（`/legends/{slug}`）の中身。**自動生成。手で直さない。**\n"
        " *\n"
        f" * 元は `python/data/legends/{slug}/book.json`（材料担当）。直すならそちらを直して、\n"
        f" * `python3 python/legend_book_bake.py {slug}` で焼き直す。節の名前と★の言葉は企画書（#1404 本文5章）の字で、焼く道具が持つ。\n"
        " */\n"
        'import type { LegendBook } from "./types";\n\n'
        f"export const {const_of(slug)}: LegendBook = {BEGIN}\n"
        + json.dumps(g, ensure_ascii=False, indent=1)
        + f"\n{END};\n"
    )


def report(g: dict) -> str:
    by = {r: sum(1 for d in g["dishes"] if d["region"] == r) for r in REGIONS}
    stars = {s: sum(1 for d in g["dishes"] if 4 - d["rank"] == s) for s in (3, 2, 1)}
    flags = sum(1 for d in g["dishes"] if d.get("flags"))
    return (f"  100品: {' '.join(f'{k}{v}' for k, v in by.items())}／★3 {stars[3]}・★2 {stars[2]}・★1 {stars[1]}／"
            f"豚・酒・牛の印 {flags}品／季節 {sum(1 for d in g['dishes'] if d.get('season'))}品\n"
            f"  用語 {len(g['words'])}・食べ比べ {len(g['compare'])}・道 {len(g['route'])}街・見どころ {len(g['sights'])}・"
            f"コツ {len(g['tips'])}・質問 {len(g['faq'])}")


def bake(slug: str, *, src: Path | None = None, out: Path | None = None, check: bool = False) -> int:
    src = src or ROOT / "python/data/legends" / slug / "book.json"
    out = out or ROOT / "site/content/legends" / f"{slug}.ts"
    if not src.exists():
        print(f"::error::材料が無い: {src}")
        return 2
    try:
        g = build(json.loads(src.read_text(encoding="utf-8")), slug)
    except (Bad, json.JSONDecodeError) as e:
        print(f"::error::{src.name}: {e}")
        print("止めた。何も書いていない")
        return 1
    text_ = render(slug, g)
    rel = out.relative_to(ROOT) if out.is_relative_to(ROOT) else out
    if check:
        same = out.exists() and out.read_text(encoding="utf-8") == text_
        print(("同じ" if same else "焼き直しが要る") + f": {rel}")
        print(report(g))
        return 0 if same else 1
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(text_, encoding="utf-8")
    print(f"焼いた: {rel}（指紋 {g['hash']}・材料の日付 {g['updated']}）")
    print(report(g))
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("slug", help="企画の slug（例: india-street-food）")
    ap.add_argument("--check", action="store_true", help="焼かずに、焼いてあるものが同じかだけ見る")
    ap.add_argument("--src", type=Path, help="材料の置き場（既定は python/data/legends/<企画>/book.json）")
    ap.add_argument("--out", type=Path, help="焼く先（既定は site/content/legends/<企画>.ts）")
    a = ap.parse_args(argv)
    return bake(a.slug, src=a.src, out=a.out, check=a.check)


if __name__ == "__main__":
    sys.exit(main())
