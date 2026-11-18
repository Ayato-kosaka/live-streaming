"""**狙う面を、検索の上位と同じ物差しで 100点満点に採点する。**（#1262・#332）

    python3 python/seo_score.py                          # 本番の決めた面（seo_targets.json の pages）を採点して表
    python3 python/seo_score.py --json score.json        # 項目ごとの値も書く（週の表が読む）
    python3 python/seo_score.py --card                   # 採点表そのもの（docs/seo.md に貼る形）
    python3 python/seo_score.py --compete compete.json   # 上位の面が何割持っているかの列を足す（seo_compete.py run の出力）
    python3 python/seo_score.py --base http://localhost:4130 --no-youtube   # 手元の書き出し

終了コード 0=採点できた / **2=決めた面が1つも読めなかった**（0点を答えにしない。`docs/island-standards.md` §15）。

## なぜ要るか

あやと（2026-11-18）「SEO 対策がほんと20点ぐらいしかできていない」。こちらは「入れた手」を数えていて、
**上位の面に比べて何が足りないか**を数えていなかった（#332）。点は「上位の面が持っていて、うちが持っていないもの」が
失う形にした。項目と重みは下の `CARD`。**どの項目も、上位の面（`seo_compete.py`）に同じ物差しを当てて、何割が持っているかを
並べられる**（面の中で測れる項目だけ。リンクや sitemap は上位の家の中が見えないので「—」）。

## 測りかた

- 面は JS を動かさずに読む（`seo_page.features`。AI の読み手と同じ目）
- 被リンクと表紙からの深さは、sitemap の全面を読んで数える（`seo_audit.py` と同じ数えかた）
- **外からのリンク**は、面が貼っている YouTube の動画の説明欄に、その面の URL が在るかを、動画の公開の頁から読む
  （API の鍵は要らない）。島へ人を連れてくるいちばん太い道なので重い
- 1項目ずつ「満点の何割か」を出す（数で決まる項目は線までの割合。0/1 の項目は 0 か満点）

## 公開に出さないもの

点と項目の値だけ。Search Console の語は扱わない（それは週の表）。

対照は `python/seo_score_selftest.py`（手元の口に偽の面・sitemap・YouTube を立てる）。
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import xml.etree.ElementTree as ET
from collections import defaultdict, deque
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import date, datetime, timezone
from pathlib import Path
from urllib.parse import unquote, urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parent))
from seo_audit import fetch, norm_path, read_html  # noqa: E402
from seo_compete import PAUSE, get, images as image_serp, serp as web_serp  # noqa: E402
from seo_page import features  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
TARGETS = ROOT / "python" / "data" / "seo_targets.json"
YT_BASE = "https://www.youtube.com"
YT_MAX = 12          # 1面ぶんで読みに行く動画の上限（面の上から。貼っている動画が多い面でも、YouTube に連打しない）
YT_PAUSE = 1.5
ORIGIN = json.loads(TARGETS.read_text(encoding="utf-8"))["origin"]
VIDEO = re.compile(r"(?:youtube\.com/(?:watch\?v=|shorts/|embed/|live/)|youtu\.be/)([\w-]{11})")


@dataclass
class Item:
    id: str
    group: str
    label: str
    weight: int
    applies: tuple[str, ...]     # guide（街のガイド）・article（街の記事）・country（国の面）・home（表紙）・hub（一覧の面）
    need: str                    # 満点の線（人が読む字）
    page: bool = True            # 面の中だけで測れる（＝上位の面にも当てられる）


G = ("guide",)
GA = ("guide", "article")
GAC = ("guide", "article", "country")
ALL = ("guide", "article", "country", "home", "hub")

GACH = ("guide", "article", "country", "hub")

# 重みは「上位の面が持っている割合」と「直ったときに流入へ効く大きさ」で決めた（docs/seo.md の 6章）。
# **いちばん重いのは 6. 結果**（狙う語で10位以内に居るか・画像検索に絵が出るか・表示が出ているか）。
# 入れた手をいくら数えても、人が来なければ 0 点——あやとの「20点」はここを見ている（#332）。
# 面の型ごとに、当たる項目の重みの和で割って 100点にする。**測れなかった項目は 0 点**（？を付けて出す）
CARD: list[Item] = [
    # 1. 載る・選ばれる（検索結果の顔）15
    Item("index", "載る・選ばれる", "検索に出している（noindex なし・canonical が自分・sitemap に在る・Google に載っている）", 4, ALL,
         "ぜんぶ", page=False),
    Item("title", "載る・選ばれる", "題が 25〜45字で、狙う語の頭が前半にある", 3, ALL, "25〜45字・語が前半"),
    Item("desc", "載る・選ばれる", "説明が 80〜160字", 1, ALL, "80〜160字"),
    Item("dates", "載る・選ばれる", "更新日が構造化データに在る（dateModified）", 3, GAC, "在る"),
    Item("imgprev", "載る・選ばれる", "大きい絵で出してよいと言っている（max-image-preview:large）", 2, ALL, "在る"),
    Item("ogimg", "載る・選ばれる", "共有の絵が横 1200px 以上", 2, ALL, "1200px 以上"),
    # 2. 中身の網羅（上位が持つ節）15
    Item("spots", "中身の網羅", "見どころの節", 2, G, "見出しに在る"),
    Item("map", "中身の網羅", "地図（字の入った地図の絵か、埋め込みの地図）", 2, GAC, "どちらか"),
    Item("access", "中身の網羅", "行き方・空港から市内の節", 2, ("guide", "country"), "見出しに在る"),
    Item("course", "中身の網羅", "モデルコース・回り方の節", 2, G, "見出しに在る"),
    Item("prices", "中身の網羅", "物価・予算の節", 2, ("guide", "country", "article"), "見出しに在る"),
    Item("safety", "中身の網羅", "治安の節", 1, ("guide", "country"), "見出しに在る"),
    Item("season", "中身の網羅", "季節・服装の節", 1, ("guide", "country"), "見出しに在る"),
    Item("food", "中身の網羅", "食べものの節", 1, G, "見出しに在る"),
    Item("toc", "中身の網羅", "目次", 1, GA, "在る"),
    Item("faq", "中身の網羅", "よくある質問（FAQPage か、問いの見出し）", 1, GAC, "在る"),
    # 3. 体験と書き手（E-E-A-T）15
    Item("author", "体験と書き手", "書き手が見える（名前とプロフィール）", 4, GAC, "本文に在る"),
    Item("firsthand", "体験と書き手", "行った人の言い回し（行った・食べた・払った…）", 5, GAC, "6回以上"),
    Item("chars", "体験と書き手", "本文の字数（上位の中央 5,000字）", 2, GAC, "5,000字以上"),
    Item("video", "体験と書き手", "体験の証拠（配信・動画へのリンク）", 2, ALL, "3本以上"),
    Item("ownimg", "体験と書き手", "絵の半分以上が自分の家の絵", 2, GAC, "5割以上"),
    # 4. 絵（画像検索・Discover）10
    Item("mapimg", "絵", "字の入った地図の絵（alt・ファイル名に「地図」「マップ」）", 2, ("guide", "country"), "1枚以上"),
    Item("alt", "絵", "自分の絵の alt が埋まっている", 2, ALL, "9割以上"),
    Item("named", "絵", "自分の絵のファイル名が中身を言っている", 1, ALL, "9割以上"),
    Item("imgsm", "絵", "画像のサイトマップにその面の絵", 2, GAC, "3枚以上", page=False),
    Item("imgn", "絵", "絵の数（上位の中央 15枚）", 1, GAC, "15枚以上"),
    Item("imgld", "絵", "絵の構造化データ（ImageObject）", 2, GAC, "在る"),
    # 5. 繋がり（リンク）20
    Item("inbound", "繋がり", "島の中からのリンク（被リンクの面数）", 5, GACH, "10面以上", page=False),
    Item("cluster", "繋がり", "子の面（物価・料理などの記事、国なら街）へのリンク", 4, ("guide", "country", "hub"), "2面以上", page=False),
    Item("ytback", "繋がり", "外からのリンク（貼っている動画の説明欄が、この面を指している）", 7, ("guide", "article", "country"), "5割以上",
         page=False),
    Item("depth", "繋がり", "表紙から2回で着く", 2, GACH, "2回以内", page=False),
    Item("sibling", "繋がり", "隣の面（同じ国の街・同じ街の記事・国）へのリンク", 2, ("guide", "article"), "1面以上", page=False),
    # 6. 結果（検索で見つかるか）25
    Item("serp", "結果", "狙う語で10位以内（Yahoo! JAPAN＝Google の検索。語の束の何割か）", 12, ("guide", "article", "country"), "5割以上",
         page=False),
    Item("imgserp", "結果", "画像検索の上位20枚に自分の絵（地図の語）", 6, ("guide", "country"), "語の半分以上", page=False),
    Item("impr", "結果", "Search Console の週の表示（その面）", 7, ALL, "50回以上", page=False),
]


def card_md() -> str:
    lines = ["| 区分 | 項目 | 重み | 満点の線 | 当てる面 |", "|---|---|---|---|---|"]
    ja = {"guide": "街", "article": "記事", "country": "国", "home": "表紙", "hub": "一覧"}
    for it in CARD:
        lines.append(f"| {it.group} | {it.label} | {it.weight} | {it.need} | {'・'.join(ja[a] for a in it.applies)} |")
    lines.append(f"| | **計** | **{sum(i.weight for i in CARD)}** | | |")
    return "\n".join(lines)


# ---- 島ぜんたいの事実（sitemap・被リンク・深さ） ----

def read_sitemap(origin: str) -> tuple[dict[str, int], str]:
    """sitemap の面（道 → その面の `<image:loc>` の数）。読めなければ理由。"""
    got = fetch(f"{origin}/sitemap.xml")
    if got.status != 200:
        return {}, f"sitemap.xml が読めない（{got.error or got.status}）"
    try:
        root = ET.fromstring(got.body)
    except ET.ParseError as e:
        return {}, f"sitemap.xml が XML として読めない（{e}）"
    out: dict[str, int] = {}
    for u in root:
        if not u.tag.endswith("url"):
            continue
        loc = next((c.text or "" for c in u if c.tag.rsplit("}", 1)[-1] == "loc"), "")
        imgs = sum(1 for c in u.iter() if c.tag.rsplit("}", 1)[-1] == "image")
        if loc:
            out[norm_path(urlsplit(loc.strip()).path)] = imgs
    return out, ""


def crawl_links(base: str, paths: list[str], workers: int = 6) -> dict[str, set[str]]:
    """sitemap の面ぜんぶの、島の中への行き先（道の集まり）。"""
    host = urlsplit(base).netloc

    def one(p: str) -> tuple[str, set[str]]:
        got = fetch(base + p)
        if got.status != 200 and not p.endswith(".html"):
            got = fetch(base + p + ".html")
        if got.status != 200:
            return p, set()
        outs: set[str] = set()
        for h in read_html(got.text).links:
            s = urlsplit(h)
            if s.netloc and s.netloc not in (host, urlsplit(ORIGIN).netloc):
                continue
            if not s.path or not s.path.startswith("/"):
                continue
            outs.add(norm_path(s.path))
        outs.discard(p)
        return p, outs

    with ThreadPoolExecutor(workers) as ex:
        return dict(ex.map(one, paths))


def graph_facts(links: dict[str, set[str]]) -> tuple[dict[str, int], dict[str, int]]:
    """（被リンクの面数, 表紙からの深さ）。"""
    inbound: dict[str, set] = defaultdict(set)
    for src, outs in links.items():
        for t in outs:
            if t in links:
                inbound[t].add(src)
    depth = {"/": 0} if "/" in links else {}
    q = deque(depth)
    while q:
        cur = q.popleft()
        for t in links.get(cur, ()):
            if t in links and t not in depth:
                depth[t] = depth[cur] + 1
                q.append(t)
    return {p: len(s) for p, s in inbound.items()}, depth


def yt_backlinks(video_ids: list[str], needle: str) -> tuple[int, int, str]:
    """（説明欄が needle を含む動画の数, 読めた数, 読めなかった理由）。"""
    hit = read = 0
    why = ""

    def one(v: str) -> tuple[bool, bool]:
        # 名乗りがブラウザでないと、説明欄の入っていない頁が返る（2026-11-18 に seo-audit の名乗りで 87本中 0本）
        st, text = get(f"{YT_BASE}/watch?v={v}")
        if st != 200:
            return False, False
        m = re.search(r'"shortDescription":"((?:[^"\\]|\\.)*)"', text)
        if not m:
            return False, False
        try:
            desc = json.loads(f'"{m.group(1)}"')
        except ValueError:
            desc = m.group(1)
        return True, needle in desc

    # **1本ずつ、間を空けて。** 並べて取ると YouTube が 429 を返し、そのあと数分は1本も読めない（2026-11-18 に踏んだ）
    for v in video_ids[:YT_MAX]:
        ok, h = one(v)
        read += ok
        hit += h
        time.sleep(YT_PAUSE)
    if video_ids and not read:
        why = "動画の頁が1本も読めなかった"
    return hit, read, why


# ---- 採点 ----

NA = object()        # 当てる項目でない（その面に狙う語が無い）。0点とも満点とも数えない

def _ratio(v: float, need: float) -> float:
    return max(0.0, min(1.0, v / need)) if need else 0.0


def judge(it: Item, f: dict, site: dict) -> tuple[float, str]:
    """（満点の何割か 0..1, 値の字）。site は面の外の事実（無ければ測れない項目は None を返す）。"""
    s = f["sec"]
    own = [x for x in f.get("_own_imgs", [])]
    if it.id == "index":
        ok = [not re.search(r"noindex", f["robots"]), f.get("_canon_self", False), site.get("in_sitemap", False)]
        val = f"noindex {'無し' if ok[0] else '在る'}・canonical {'自分' if ok[1] else '違う'}・sitemap {'在る' if ok[2] else '無い'}"
        if "indexed" in site:                       # 週の表（URL 検査）から来たときだけ
            ok.append(bool(site["indexed"]))
            val += f"・Google {'載っている' if site['indexed'] else '載っていない'}"
        return sum(ok) / len(ok), val
    if it.id == "title":
        n = f["title_len"]
        head = site.get("query_head", "")
        front = (head in f["title"][:20]) if head else True
        return (0.5 * (25 <= n <= 45) + 0.5 * front), f"{n}字" + (f"・「{head}」{'前半' if front else '前半に無い'}" if head else "")
    if it.id == "desc":
        n = f["desc_len"]
        return (1.0 if 80 <= n <= 160 else 0.5 if 50 <= n else 0.0), f"{n}字"
    if it.id == "dates":
        return float(bool(f["modified"])), f["modified"] or "無い"
    if it.id == "imgprev":
        return float(f["max_image_large"]), "在る" if f["max_image_large"] else "無い"
    if it.id == "ogimg":
        return float(f["og_w"] >= 1200), f"{f['og_w']}px" if f["og_w"] else "幅が無い"
    if it.id in ("spots", "access", "course", "prices", "safety", "season", "food"):
        return float(s[it.id]), "在る" if s[it.id] else "無い"
    if it.id == "map":
        ok = f["map_imgs"] > 0 or f["gmaps_embed"] > 0
        return float(ok), f"地図の絵 {f['map_imgs']}・埋め込み {f['gmaps_embed']}"
    if it.id == "toc":
        return float(f["toc"]), "在る" if f["toc"] else "無い"
    if it.id == "faq":
        return float(s["faq"]), "在る" if s["faq"] else "無い"
    if it.id == "author":
        return float(f["author"]), "在る" if f["author"] else "無い"
    if it.id == "firsthand":
        return _ratio(f["firsthand"], 6), f"{f['firsthand']}回"
    if it.id == "chars":
        return _ratio(f["chars_main"], 5000), f"{f['chars_main']:,}字"
    if it.id == "video":
        return _ratio(f["youtube"], 3), f"{f['youtube']}本"
    if it.id == "ownimg":
        n = f["imgs"]
        return (_ratio(len(own) / n, 0.5) if n else 0.0), f"{len(own)}/{n}"
    if it.id == "mapimg":
        return float(f["map_imgs"] > 0), f"{f['map_imgs']}枚"
    if it.id == "alt":
        # 自分の絵が1枚も無い面（飾りだけ・借りた絵だけ）は、名乗らせる絵が無いので当てない。0点にすると
        # 「飾りを飾りのまま置いた」ことで点を失う（/travel が 2 → 0 になった。2026-11-18）
        a = sum(1 for _, alt in own if alt and alt.strip())
        return (_ratio(a / len(own), 0.9), f"{a}/{len(own)}") if own else (NA, "自分の絵が無い")
    if it.id == "named":
        return ((_ratio(f["imgs_named"] / f["imgs"], 0.9), f"{f['imgs_named']}/{f['imgs']}") if f["imgs"]
                else (NA, "絵が無い"))
    if it.id == "imgn":
        return _ratio(f["imgs"], 15), f"{f['imgs']}枚"
    if it.id == "imgld":
        return float(f["image_ld"]), "在る" if f["image_ld"] else "無い"
    # ここから面の外
    if it.id == "imgsm":
        n = site.get("sitemap_images")
        return (_ratio(n, 3), f"{n}枚") if n is not None else (None, "測れない")
    if it.id == "inbound":
        n = site.get("inbound")
        return (_ratio(n, 10), f"{n}面") if n is not None else (None, "測れない")
    if it.id == "cluster":
        n = site.get("children")
        return (_ratio(n, 2), f"{n}面") if n is not None else (None, "測れない")
    if it.id == "depth":
        d = site.get("depth")
        return (float(d is not None and d <= 2), f"{d}回" if d is not None else "着けない") if "depth" in site else (None, "測れない")
    if it.id == "sibling":
        n = site.get("siblings")
        return (_ratio(n, 1), f"{n}面") if n is not None else (None, "測れない")
    if it.id == "ytback":
        if site.get("yt_read") is None:
            return None, "測れない"
        hit, read = site["yt_hit"], site["yt_read"]
        if not read:
            # 貼っていないのは 0点。貼っているのに読めなかったのは「測れない」（0 と書かない）
            return (None, site["yt_why"]) if site.get("yt_why") else (0.0, "貼っている動画が無い")
        return _ratio(hit / read, 0.5), f"{hit}/{read}本"
    if it.id == "serp":
        ranks = site.get("serp")                    # {語: 順位 or None}
        if ranks is None:
            return None, "測れない"
        if not ranks:
            return NA, "狙う語が無い"
        top = sum(1 for r in ranks.values() if r is not None and r <= 10)
        return _ratio(top / len(ranks), 0.5), f"{top}/{len(ranks)}語"
    if it.id == "imgserp":
        ranks = site.get("imgserp")
        if ranks is None:
            return None, "測れない"
        if not ranks:
            return NA, "地図の語が無い"
        top = sum(1 for r in ranks.values() if r is not None and r <= 20)
        return _ratio(top / len(ranks), 0.5), f"{top}/{len(ranks)}語"
    if it.id == "impr":
        n = site.get("impr")
        return (_ratio(n, 50), f"{n}回") if n is not None else (None, "測れない（週の表から）")
    raise KeyError(it.id)


def score(f: dict, kind: str, site: dict) -> dict:
    rows, got, full = [], 0.0, 0
    for it in CARD:
        if kind not in it.applies:
            continue
        r, val = judge(it, f, site)
        if r is NA:                                 # その面には狙う語が決めていない（seo_targets.json）。満点にも数えない
            continue
        full += it.weight
        if r is None:
            rows.append({"id": it.id, "weight": it.weight, "got": None, "value": val})
            continue
        got += r * it.weight
        rows.append({"id": it.id, "weight": it.weight, "got": round(r * it.weight, 1), "value": val})
    measured = sum(r["weight"] for r in rows if r["got"] is not None)
    return {"points": round(100 * got / full, 1) if full else None, "full": full, "measured": measured, "items": rows}


def children_of(path: str, kind: str, outs: set[str], sitemap: dict[str, int]) -> tuple[int, int]:
    """（子の面へのリンク数, 隣の面へのリンク数）。子は道の下の面、隣は同じ親の下の面と親そのもの。"""
    kids = {p for p in outs if p.startswith(path + "/") and p in sitemap}
    parent = path.rsplit("/", 1)[0] or "/"
    sib = {p for p in outs if p in sitemap and p != path and
           (p == parent or (p.startswith(parent + "/") and p.count("/") == path.count("/")))}
    return len(kids), len(sib)


# 島の飾り（家・看板・食べものの小さな絵・ロゴ）。**alt が空で正しい絵**なので、alt の割合から外す
# （中身を言わない絵に字を入れると、読み上げにも画像検索にも雑音になる。Google も「飾りは空でよい」）
DECOR_DIRS = ("/sprites/", "/logos/", "/icons/")


def own_images(html: str, origin: str) -> list[tuple[str, str | None]]:
    """本文の、自分の家の絵（同じ絵は1回）。飾りの置き場と SVG は数えない。"""
    p = read_html(html)
    host = urlsplit(origin).netloc
    out: dict[str, str | None] = {}
    for s, a, inmain in p.imgs:
        if not (inmain or not p.has_main) or not s or s.startswith("data:"):
            continue
        u = urlsplit(s)
        if (u.netloc and u.netloc != host) or unquote(u.path).endswith(".svg") or u.path.startswith(DECOR_DIRS):
            continue
        # 同じ絵が alt 付きと空で混ざっていたら、付いているほうを取る（面の上で1回でも名乗っていればよい）
        if s not in out or (a and a.strip()):
            out[s] = a
    return list(out.items())


def search_ranks(targets: list[dict], path: str, origin: str, cache: dict) -> tuple[dict | None, dict | None]:
    """（{語: 順位}, {地図の語: 順位}）。その面を狙う束の頭の語だけを引く。1つも読めなければ None（0位と書かない）。"""
    host = urlsplit(origin).netloc
    web: dict = {}
    img: dict = {}
    read_web = read_img = False
    for t in targets:
        if t.get("page") != path:
            continue
        q = t["queries"][0]
        if ("w", q) not in cache:
            cache[("w", q)] = web_serp(q)
            time.sleep(PAUSE)
        top = cache[("w", q)]
        read_web = read_web or bool(top)
        web[q] = next((r["rank"] for r in top if host in r["url"]), None) if top else None
        if t.get("image"):
            if ("i", q) not in cache:
                cache[("i", q)] = image_serp(q, 20)
                time.sleep(PAUSE)
            got = cache[("i", q)]
            read_img = read_img or bool(got)
            img[q] = next((r["rank"] for r in got if host in r["page"]), None) if got else None
    return (web if read_web or not web else None), (img if read_img or not img else None)


def measure(base: str, pages: list[dict], youtube: bool = True, today: date | None = None,
            targets: list[dict] | None = None, extra: dict | None = None) -> dict:
    """面ごとに採点する。targets を渡すと検索の順位も引く。extra は週の表から（{道: {"impr": n, "indexed": bool}}）。"""
    sitemap, why = read_sitemap(base)
    links = crawl_links(base, sorted(sitemap)) if sitemap else {}
    inbound, depth = graph_facts(links) if links else ({}, {})
    out = {"base": base, "sitemap_error": why, "pages": []}
    cache: dict = {}
    for pg in pages:
        path, kind = pg["path"], pg.get("kind", "guide")
        got = fetch(base + path)
        if got.status != 200 and base.startswith("http://"):
            got = fetch(base + path + ".html")
        if got.status != 200:
            out["pages"].append({"path": path, "label": pg.get("label", path), "kind": kind, "error": f"{got.error or got.status}"})
            continue
        f = features(got.text, ORIGIN + path, today=today)
        p = read_html(got.text)
        f["_canon_self"] = any(norm_path(urlsplit(c).path) == path for c in p.canonicals)
        f["_own_imgs"] = own_images(got.text, base)
        site: dict = {"query_head": pg.get("head", "")}
        if sitemap:
            site["in_sitemap"] = path in sitemap
            site["sitemap_images"] = sitemap.get(path, 0)
        if links:
            outs = links.get(path, set())
            site["inbound"] = inbound.get(path, 0)
            site["depth"] = depth.get(path)
            site["children"], site["siblings"] = children_of(path, kind, outs, sitemap)
        if youtube and kind in ("guide", "article", "country"):
            vids = list(dict.fromkeys(VIDEO.findall(" ".join(p.links + p.iframes))))
            hit, read, ywhy = yt_backlinks(vids, urlsplit(ORIGIN).netloc + path)
            site.update({"yt_hit": hit, "yt_read": read, "yt_why": ywhy, "yt_linked": len(vids)})
        if targets is not None:
            site["serp"], site["imgserp"] = search_ranks(targets, path, ORIGIN, cache)
        site.update((extra or {}).get(path, {}))
        sc = score(f, kind, site)
        out["pages"].append({"path": path, "label": pg.get("label", path), "kind": kind, **sc,
                             "features": {k: v for k, v in f.items() if not k.startswith("_")}, "site": site})
    return out


def prevalence(compete: dict, queries: list[str] | None = None) -> dict[str, str]:
    """上位の面のうち、その項目を満点で持っている割合（面の中で測れる項目だけ）。"""
    rows = []
    seen = set()
    for q, top in compete.get("queries", {}).items():
        if queries and q not in queries:
            continue
        for r in top:
            if r.get("ok") and r["url"] not in seen and "ayato-arigato.com" not in r["url"]:
                seen.add(r["url"])
                rows.append(r)
    out = {}
    for it in CARD:
        if not it.page or it.id in ("ownimg", "alt"):
            out[it.id] = "—"
            continue
        hit = 0
        for r in rows:
            r.setdefault("_own_imgs", [])
            try:
                v, _ = judge(it, r, {})
            except (KeyError, TypeError):
                v = None
            hit += bool(v is not None and v >= 0.999)
        out[it.id] = f"{round(100 * hit / len(rows))}%" if rows else "—"
    out["_n"] = str(len(rows))
    return out


def table(res: dict, prev: dict | None = None) -> str:
    pages = [p for p in res["pages"] if "items" in p]
    head = "| 項目 | 重み |" + "".join(f" {p['label']} |" for p in pages) + (" 上位の面 |" if prev else "")
    lines = [head, "|" + "---|" * (2 + len(pages) + (1 if prev else 0))]
    lines.append("| **点** | |" + "".join(f" **{p['points']}** |" for p in pages) + (f" {prev['_n']}面 |" if prev else ""))
    for it in CARD:
        cells = []
        for p in pages:
            row = next((r for r in p["items"] if r["id"] == it.id), None)
            if row is None:
                cells.append("・")
            elif row["got"] is None:
                cells.append(f"？ {row['value']}")
            else:
                mark = "○" if row["got"] >= it.weight - 0.05 else ("△" if row["got"] > 0 else "×")
                cells.append(f"{mark} {row['got']:g}（{row['value']}）")
        lines.append(f"| {it.label} | {it.weight} | " + " | ".join(cells) + (f" | {prev.get(it.id, '—')} |" if prev else " |"))
    bad = [p for p in res["pages"] if "error" in p]
    if bad:
        lines.append("")
        lines += [f"- 読めなかった: {p['label']} `{p['path']}`（{p['error']}）" for p in bad]
    return "\n".join(lines)


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description="狙う面を、検索の上位と同じ物差しで 100点満点に採点する")
    ap.add_argument("--base", default=None, help="測る置き場（既定は本番）")
    ap.add_argument("--json", metavar="FILE")
    ap.add_argument("--card", action="store_true", help="採点表そのものを出す")
    ap.add_argument("--compete", metavar="FILE", help="seo_compete.py run の compete.json。上位の面の割合の列を足す")
    ap.add_argument("--no-youtube", action="store_true")
    ap.add_argument("--no-serp", action="store_true", help="検索の順位を引かない（手元の書き出しを測るとき）")
    ap.add_argument("--targets", default=str(TARGETS))
    a = ap.parse_args(argv)
    if a.card:
        print(card_md())
        return 0
    cfg = json.loads(Path(a.targets).read_text(encoding="utf-8"))
    base = (a.base or cfg["origin"]).rstrip("/")
    pages = [p for p in cfg["pages"] if p.get("kind")]
    res = measure(base, pages, youtube=not a.no_youtube, targets=None if a.no_serp else cfg["targets"])
    res["at"] = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    prev = None
    if a.compete:
        prev = prevalence(json.loads(Path(a.compete).read_text(encoding="utf-8")))
    print(table(res, prev))
    if res["sitemap_error"]:
        print(f"\n- sitemap: {res['sitemap_error']}（被リンク・深さ・画像のサイトマップは測れない）")
    if a.json:
        Path(a.json).write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf-8")
    return 0 if any("items" in p for p in res["pages"]) else 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
