"""**1面の HTML から、検索の上位の面と比べる物差しを取り出す。**（SEO の採点表と競合の表の共通の目）

    from seo_page import features
    f = features(html, "https://ayato-arigato.com/travel/bulgaria/sofia")

うちの面にも、競合の面にも**同じ関数**を当てる。物差しが違うと「上位が持っていてうちに無い」が
物差しの差なのか中身の差なのか分からなくなる（#332）。JS は動かさない（`seo_audit.py` と同じ読み手）。

何を「節が在る」と見るかは、**見出し（h2・h3）の字**で決める。本文に「治安」と1回出てくるのは節ではない
（足もとの「治安のよい国ランキング」へのリンクでも当たってしまう）。

採点（`python/seo_score.py`）と競合の表（`python/seo_compete.py`）はここだけを読む。
対照は `python/seo_score_selftest.py`。
"""

from __future__ import annotations

import json
import re
import sys
from datetime import date
from pathlib import Path
from urllib.parse import unquote, urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parent))
from seo_audit import read_html  # noqa: E402

# 見出しにこの字があれば、その節が在る。上位の旅行の面が持つ節の名前の揺れ（2026-11-18 に狙う語の上位 98面で見た）
SECTIONS: dict[str, str] = {
    "access": r"行き方|アクセス|空港から|市内へ|交通|移動",
    "safety": r"治安|注意|トラブル|危険|スリ",
    "season": r"ベストシーズン|気候|服装|天気|季節|時期",
    "course": r"モデルコース|モデルプラン|1日観光|一日観光|日帰り|回り方|まわり方|周り方|日程|プラン",
    "prices": r"物価|予算|費用|値段|相場|いくら",
    "money": r"両替|通貨|ユーロ|レフ|デナル|クレジット|カード|チップ",
    "spots": r"見どころ|観光スポット|観光地|名所|スポット|見たい",
    "food": r"グルメ|料理|食べ|レストラン|カフェ|食事",
    "stay": r"ホテル|宿|泊ま|エリア",
    "faq": r"よくある質問|Q&A|ＱＡ|FAQ|Ｑ＆Ａ|質問",
}

# 本文に出ると「行った人が書いた」と読める言い回し（一人称の体験・払った・泊まった）
FIRSTHAND = re.compile(
    r"行ってきました|行ってきた|行った時|行ったとき|訪れました|訪問しました|実際に|泊まりました|泊まった|"
    r"食べました|食べてみ|飲みました|乗りました|払いました|買いました|歩きました|私は|私が|筆者|旅行記|滞在中|"
    r"でした！|行きました")
AUTHOR = re.compile(r"この記事を書いた人|著者|ライター|執筆者|執筆|プロフィール|監修|運営者|書いた人|筆者")
# 書き手の枠の印（字に「著者」と書かずに、枠の名前で名乗る面がある。島の記事の `Writer` は aria-label="書き手"）
# 枠の名前そのものだけを見る。写真の出どころの説明（aria-label="…No machine-readable author…"）で当たったので、
# aria-label は値が名前だけのときに限る（2026-11-18）
BYLINE = re.compile(r'(?:class|itemprop)="(?:[^"]*\s)?[\w-]*(?:author|writer|byline)[\w-]*(?:\s[^"]*)?"|rel="author"|'
                    r'aria-label="(?:書き手|著者|筆者|この記事を書いた人)"', re.I)
MAPWORD = re.compile(r"地図|マップ|map", re.I)
YEAR = re.compile(r"20[2-3]\d")
LISTN = re.compile(r"\d+\s*選|\d+\s*か所|\d+\s*ヶ所|\d+\s*カ所|ベスト\s*\d+|TOP\s*\d+", re.I)
DATE = re.compile(r"(20\d\d)\s*[年./-]\s*(\d{1,2})\s*[月./-]\s*(\d{1,2})")
DATE_CTX = re.compile(r"更新|公開|投稿|掲載|最終")
# 絵の src のうち、飾り（記号・顔・ロゴ・追跡の1画素）。数えると「絵が多い」に見える
DECOR = re.compile(r"logo|icon|avatar|emoji|spacer|sprite|badge|banner|gravatar|pixel|blank\.gif|loading|button|"
                   r"/ads?/|doubleclick|googlesyndication|facebook\.com/tr|\.svg(\?|$)|^data:", re.I)
GMAPS = re.compile(r"google\.[a-z.]+/maps|maps\.google|/maps/d/|mymaps", re.I)
YOUTUBE = re.compile(r"youtube\.com|youtu\.be|youtube-nocookie\.com", re.I)


def _host(u: str) -> str:
    h = urlsplit(u).netloc.lower()
    return h[4:] if h.startswith("www.") else h


def _ld_items(blocks: list[str]) -> list[dict]:
    """構造化データの塊を平らにして、型を持つ辞書だけを並べる（`@graph` も開く）。"""
    out: list[dict] = []

    def walk(x) -> None:
        if isinstance(x, list):
            for y in x:
                walk(y)
        elif isinstance(x, dict):
            if "@type" in x:
                out.append(x)
            for k, v in x.items():
                if k != "@context":
                    walk(v)

    for b in blocks:
        try:
            walk(json.loads(b))
        except (ValueError, TypeError):
            continue
    return out


def _types(items: list[dict]) -> set[str]:
    s: set[str] = set()
    for it in items:
        t = it.get("@type")
        for x in (t if isinstance(t, list) else [t]):
            if isinstance(x, str):
                s.add(x)
    return s


def _iso(s) -> date | None:
    if not isinstance(s, str):
        return None
    m = re.match(r"(20\d\d)-(\d\d)-(\d\d)", s.strip())
    if not m:
        return None
    try:
        return date(int(m[1]), int(m[2]), int(m[3]))
    except ValueError:
        return None


def _dates(items: list[dict], metas: dict, text: str) -> tuple[date | None, date | None]:
    """（公開日, 更新日）。構造化データ → meta → 本文の「更新日：2025年3月1日」の順に探す。"""
    pub = mod = None
    for it in items:
        pub = pub or _iso(it.get("datePublished"))
        mod = mod or _iso(it.get("dateModified"))
    pub = pub or _iso(metas.get("article:published_time"))
    mod = mod or _iso(metas.get("article:modified_time")) or _iso(metas.get("og:updated_time"))
    if not (pub or mod):
        found: list[date] = []
        for m in DATE.finditer(text[:20000]):
            ctx = text[max(0, m.start() - 12):m.start()]
            if DATE_CTX.search(ctx):
                try:
                    found.append(date(int(m[1]), int(m[2]), int(m[3])))
                except ValueError:
                    pass
        if found:
            mod = max(found)
            pub = min(found)
    return pub, mod or pub


def features(html: str, url: str, query: str = "", today: date | None = None) -> dict:
    """1面ぶんの物差し。値は全部、数か真偽か短い字（表にそのまま出せる形）。"""
    p = read_html(html)
    text = "".join(p.chunks)
    host = _host(url)
    heads = [h for h in p.heads]
    h2 = [t for lv, t, _ in heads if lv == 2]
    h23 = [t for lv, t, _ in heads if lv in (2, 3)]
    h1 = next((t for lv, t, _ in heads if lv == 1), "")
    items = _ld_items(p.jsonld)
    types = _types(items)
    pub, mod = _dates(items, p.metas, text)
    today = today or date.today()

    # 絵: main が在る面は main の中だけ、無ければ本文全体（競合の面は main を持たないことが多い）
    imgs = [(s, a) for s, a, inmain in p.imgs if (inmain or not p.has_main)]
    content = [(s, a) for s, a in imgs if s and not DECOR.search(s)]
    alt_ok = [a for s, a in content if a and a.strip()]
    map_imgs = [s for s, a in content
                if MAPWORD.search(unquote(s)) or (a and MAPWORD.search(a))]
    names = [unquote(urlsplit(s).path.rsplit("/", 1)[-1]) for s, _ in content]
    # 「名前が中身を言っている」= 英字かな漢字の語が入っていて、数字と記号だけ・カメラの連番（IMG_1234 DSC0001）でない
    named = [n for n in names if re.search(r"[A-Za-z]{3,}|[぀-ヿ一-鿿]{2,}", n)
             and not re.match(r"(img|dsc|dscn|dscf|pxl|photo|image|screenshot)[-_]?\d", n, re.I)
             and not re.fullmatch(r"[0-9a-f]{16,}(\.\w+)?", n, re.I)]

    # リンク: 同じ家の中（内部）と外。**本文の中**を数えたいが、読み手は nav を区別しないので全体
    internal, external = set(), set()
    for href in p.links:
        if not href or href.startswith(("#", "mailto:", "tel:", "javascript:")):
            continue
        h = _host(href) if href.startswith("http") else host
        (internal if h == host else external).add(href.split("#")[0])

    sec = {k: any(re.search(rx, t) for t in h23) for k, rx in SECTIONS.items()}
    sec["faq"] = sec["faq"] or ("FAQPage" in types)
    words = [w for w in re.split(r"\s+", query.strip()) if w]
    title = p.title
    return {
        "url": url,
        "host": host,
        "title": title,
        "title_len": len(title),
        "title_year": bool(YEAR.search(title)),
        "title_list": bool(LISTN.search(title)),
        "title_bracket": bool(re.search(r"[【\[［]", title)),
        "title_q": all(w in title for w in words) if words else None,
        "h1": h1,
        "h2_n": len(h2),
        "h23_n": len(h23),
        "h2": h2[:30],
        "chars": p.text,
        "chars_main": p.text_main if p.has_main else p.text,
        "imgs": len(content),
        "imgs_alt": len(alt_ok),
        "imgs_named": len(named),
        "map_imgs": len(map_imgs),
        "gmaps": sum(1 for s in p.iframes if GMAPS.search(s)) + sum(1 for s in p.links if GMAPS.search(s or "")),
        "gmaps_embed": sum(1 for s in p.iframes if GMAPS.search(s)),
        "youtube": sum(1 for s in p.iframes if YOUTUBE.search(s)) + sum(1 for s in p.links if YOUTUBE.search(s or "")),
        "internal": len(internal),
        "external": len(external),
        "toc": "目次" in text,
        "firsthand": len(FIRSTHAND.findall(text)),
        "author": bool(AUTHOR.search(text)) or bool(BYLINE.search(html)) or any(isinstance(it.get("author"), dict) and it["author"].get("@type") == "Person"
                                                  for it in items),
        "author_person": any(isinstance(it.get("author"), dict) and it["author"].get("@type") == "Person" for it in items),
        "ld": sorted(types),
        "faq_ld": "FAQPage" in types,
        "itemlist_ld": "ItemList" in types,
        "image_ld": "ImageObject" in types,
        "video_ld": "VideoObject" in types,
        "published": pub.isoformat() if pub else "",
        "modified": mod.isoformat() if mod else "",
        "age_days": (today - mod).days if mod else None,
        "og_image": p.metas.get("og:image", ""),
        "og_w": int(p.metas.get("og:image:width") or 0) if (p.metas.get("og:image:width") or "").isdigit() else 0,
        "robots": p.metas.get("robots", ""),
        "max_image_large": "max-image-preview:large" in (p.metas.get("robots", "") + p.metas.get("googlebot", "")),
        "desc_len": len(p.metas.get("description", "")),
        "sec": sec,
    }
