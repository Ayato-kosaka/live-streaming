"""**本番を、JS を動かさないクローラの目で読んで数える。**（検索と AI の回答の入口の棚おろし）

    python3 python/seo_audit.py                                   # 本番の sitemap.xml の全面
    python3 python/seo_audit.py --base https://… --out seo.tsv    # 面ごとの TSV も書く
    python3 python/seo_audit.py --detail /bulgaria /travel/north-macedonia   # その面だけ。見出しの木・絵・リンク
    python3 python/seo_audit.py --html dom.html --as /bulgaria    # 落としてある HTML を同じ物差しで測る
    python3 python/seo_audit.py --dist site/.next-3130 --no-site  # 手元の書き出しを測る（配るのも止めるのも道具がやる）
    python3 python/seo_audit.py --expect canonical=all,sitemap-dup=0   # 線を引いて、合否を出す

終了コード 0=測れた / **2=sitemap が読めない・1面も測れない**（`docs/island-standards.md` §15。
**0件を答えとして出さない**）。`--expect` を付けないあいだは **1 を返さない。** 数を出す道具なので、
「足りない」と決めるのは読む人の仕事（`python/cron_lag.py` と同じ立ち位置）。

## 線を引く（`--expect`）

`--expect` を付けたときだけ判定器になる。**0=ぜんぶ通った / 1=外れた線がある / 2=測れなかった線がある。**

    --expect 'canonical=all,sitemap-dup=0,lastmod-distinct>=2,lastmod-future=0,priority=0,\
              jsonld:/=WebSite,jsonld:/about=ProfilePage+Person,jsonld-bad=0,crumbs=jsonld,time-plain<=1'

| 線 | 何を数えるか | 分母（0 なら「測れない」） |
| --- | --- | --- |
| `canonical=all` | canonical が在る面（ちょうど1つ・絶対 URL） | sitemap の一意な URL |
| `canonical-other<=1` | canonical が在るのに、自分ではない URL を指している面 | canonical が在る面 |
| `sitemap-dup=0` | sitemap に2回以上載っている URL | sitemap の行 |
| `priority=0` | `<priority>` の付いた行 | sitemap の行 |
| `lastmod-distinct>=2` | `<lastmod>` の値が何通りか | `<lastmod>` の付いた行 |
| `lastmod-future=0` | いまより先の `<lastmod>` | `<lastmod>` の付いた行 |
| `lastmod-bad=0` | 日付として読めない `<lastmod>` | `<lastmod>` の付いた行 |
| `jsonld:<道>=<型>+<型>` | その面の構造化データが、その型を全部持っているか | その面が読めたか |
| `jsonld-bad=0` | JSON として読めない・`@context` `@type`・型ごとの必須の欄が欠けた塊 | 構造化データの塊 |
| `crumbs=jsonld` | 見えるパンくずを持つ面と、`BreadcrumbList` を持つ面が同じ集まりか | 見えるパンくずを持つ面 |
| `time-plain<=N` | `<time>` は在るのに `datetime` が1つも無い面 | `<time>` を持つ面 |
| `tools-noindex=all` | `firebase.json` が noindex を付けると決めた道具の面に、`X-Robots-Tag: noindex` が返るか | 200 で返った道具の面 |

数の線は `=` `>=` `<=` のどれでも書ける。`all` は分母と同じ数。
**分母が 0 の線は通さない**（`jsonld-bad=0` は、構造化データが1つも無い面の集まりでは 2 になる）。
**1面でも読めなかったら 2**——読めなかった面を分母から黙って抜いて「ぜんぶ通った」と言わない。

## 手元の書き出しを測る（`--dist`）

sitemap の `<loc>` は本番の origin で書かれている。この道具は**道だけを取って `--base` に付け替える**
ので、`--base http://localhost:4130` と渡せば手元の書き出しも測れる（`/x` が無ければ `/x.html` を試す。
本番の `cleanUrls` と同じ読み替え）。`--dist <置き場>` はその手間を省く——道具が自分で空いた口に配って、
測り終えたら止める。**開発サーバは立てない**（`CLAUDE.md`「測るときは、書き出したものを静的に配る」）。
canonical と `og:url` は、付け替える前の URL（＝本番で名乗る URL）と比べる。

## なぜ、JS を動かさずに読むか

検索の Googlebot は JS を動かすが、**AI の回答のためのクローラ（GPTBot・ClaudeBot・
PerplexityBot など）はほとんどが動かさない。** 取りに来るのは生の HTML の1本だけ。
島は Next の静的書き出しなので本文は HTML に焼かれている——**はず**、で止めずに数える。
`tools/sprites/crawl.mjs` はブラウザで開いて「人に見える面」を見ている。
こちらは**機械に読める面**を見る。同じ面でも、答えが違うことがある。

## 「本文の字数」の数えかた

`<body>` の中の字から、`<script>` `<style>` `<noscript>` `<template>` の中身を除く
（Next が埋める `self.__next_f.push(…)` は `<script>` なので、ここで落ちる。
`/bulgaria` は HTML 1.85MB のうち、ほとんどがこの埋め込み）。
SVG の `<title>` `<desc>` `<metadata>` も画面に出ないので除く。**空白は数えない。**

字数は1つにまとめずに、**内訳を3つ**横に出す:

  - `main` の中 … 頭のバーと足もとを除いた、その面だけの字
  - SVG の `<text>` の中 … 地図の地名など。タグを剥ぐだけの読み手には読めるが、
    `<svg>` ごと捨てる読み手には読めない
  - `hidden` 属性の中 … Next が `<div hidden id="S:0">` で流し込むぶん。
    HTML には在るので数に入れるが、分けておく
  - 閉じた畳み（`open` の無い `<details>`）の中 … 開くまで人には見えないが、HTML には在る。
    **「人に見える字（`innerText`）」とこの道具の字数が合わないときは、まずここ**
    （2026-11-13 の実測で、`/bulgaria` は 28,276字のうち 21,483字がここ。`innerText` は 6,875字）

## 落としてある HTML も測れるようにしてある（`--html`）

「JS を動かしたあとに何字増えるか」は、ブラウザで開いたあとの DOM
（`document.documentElement.outerHTML`）を落として、**この道具でもう一度測る**。
`innerText` の長さと比べない——あちらは CSS で隠した字を落とすので、物差しが違う。
**同じ物差しを2回当てて、差だけを読む。**

## 被リンクは、生の HTML の `<a href>` だけで数える

JS が後から足すリンクは、JS を動かさない読み手には辿れない。
だから「sitemap には在るが、どの面からも `<a href>` で指されていない面」を孤児と呼ぶ。
頭のバーのリンクも1本に数える（読み手にとっては同じ1本なので）。

## 数に分母を付ける

「JSON-LD 0面」とは出さない。**「0/150」**と出す。面が取れなかった回に
「0面」と出るのがいちばん悪い（`python/counts.py` の冒頭と同じ理由）。
分母は **200 で HTML を返した面**。取れなかった面・200 でない面は、別に名指しする。

## 外に出る

本番へ `urllib` で取りに行く（この箱のプロキシと証明書は環境変数から読まれる。
**TLS の検証は切らない**）。並びは4本まで、1本ごとに少し待つ。
User-Agent には持ち主の名前を入れない。**見張り（selftest）から本番へは出ない**——
外に出るものを毎 PR で回すと、向こうの都合で赤くなる。

## 対照（落ちるときに落ちるか）

`python/seo_audit_selftest.py`。手元の口に偽の島を配って、守りを1つずつ外す
（canonical 無し・sitemap の重複・更新日が1通り・`WebSite` 無し・`datetime` 無し ほか）。
**外した足の線だけが落ちて、ほかの線は通る**ことまで見る。
偽の sitemap の `<loc>` は**配っている先と別のホスト**にしてある——
この道具は `<loc>` の道を `--base` に付け替えて取りに行くので、その足も一緒に当たる。
"""

from __future__ import annotations

import argparse
import functools
import gzip
import hashlib
import http.client
import http.server
import json
import re
import statistics
import sys
import threading
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict, deque
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ts_read import code_only, fields, object_body  # noqa: E402


def site_url(root: Path | None = None) -> str:
    """正の URL（canonical・sitemap の `<loc>` が名乗る原点）。`site/content/site.ts` の `SITE.url` を読む。

    **ここに字で書かない。** 2026-11-13 に独自ドメインへ移ったとき（#1202）、ここに古いドメインが
    直書きしてあった。読めなければ投げる（黙って古い宛先に落ちると、測る先が黙って入れ替わる）。
    読むのは `ts_read`（焼き込みを読む口は1本。`python/ts_readers_selftest.py`）。
    """
    src = ((root or Path(__file__).resolve().parent.parent) / "site/content/site.ts").read_text(encoding="utf-8")
    url = fields(object_body(code_only(src), "SITE")).get("url", "")
    if not re.fullmatch(r"https?://[^/]+", url):
        raise RuntimeError(f"site/content/site.ts の SITE.url が原点だけの URL として読めない（{url or '無い'}）")
    return url


# 本番の置き場。**正の URL**（`metadataBase` と同じ1行）
ORIGIN = site_url()

# Firebase Hosting がもとから持っている名前。**正の URL とは別のもの。** 独自ドメインへ移ったあとも
# 同じ面をここで配り続けている（301 で送らない。#1202）。`--alt` の既定に使う
HOSTING_DEFAULT = "https://live-streaming-d3cac.web.app"

# 名乗り。**持ち主の名前・連絡先を入れない**（外のサービスのログに残る）
UA = "seo-audit/1.0 (python-urllib; raw-html, no-js)"

# 並び。**上げない。** 自分の本番でも、Hosting から見れば外からの連打
WORKERS = 4
PAUSE = 0.15
MAX_HOPS = 5

# 目安の線。**合否ではない**（数を出すだけ）。動かすと前の回と比べられなくなる
# - title: Google の検索結果は全角30字前後で切れる。32 は「切れ始める」あたり。
#   15 は「唐揚げ｜あやと島」（8字）のように、名前と島の名前だけで終わっている長さ
# - description: 全角で 50〜120字が、スマホと PC の両方で切れずに出る幅
# - 本文: 300字は、AI が1面から引用できる段落がやっと1つある量
TITLE_SHORT, TITLE_LONG = 15, 32
DESC_SHORT, DESC_LONG = 50, 120
THIN_TEXT = 300

# 孤児と呼ぶ線。**0〜1本**（1本は、たいてい索引の面からの1本だけ）
ORPHAN_MAX = 1

# 計測タグの見分け。生の HTML と、表紙が読む JS の両方に当てる
# （Next は外部スクリプトを束の中に入れるので、HTML だけ見ると「無い」と読み違える）
TAGS: list[tuple[str, str]] = [
    ("gtag.js", r"googletagmanager\.com/gtag/js|\bgtag\s*\(\s*['\"](?:config|js|event)"),
    ("GTM", r"googletagmanager\.com/gtm\.js|\bGTM-[A-Z0-9]{5,8}\b"),
    ("GA4 の測定ID", r"['\"]G-[A-Z0-9]{8,12}['\"]"),
    ("analytics.js", r"google-analytics\.com/(?:analytics|ga)\.js"),
    ("Firebase Analytics", r"\bmeasurementId\b|firebase[-_/]analytics"),
    ("Clarity", r"clarity\.ms/tag"),
    ("Plausible", r"plausible\.io/js"),
    ("Cloudflare Web Analytics", r"static\.cloudflareinsights\.com"),
    ("Hotjar", r"static\.hotjar\.com"),
]

# robots.txt で名指しされているかを見る、AI の読み手たち
AI_BOTS = ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-SearchBot",
           "Claude-User", "PerplexityBot", "Perplexity-User", "Google-Extended",
           "Applebot-Extended", "CCBot", "Bytespider", "Amazonbot", "meta-externalagent"]

VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta",
        "param", "source", "track", "wbr"}
# 中身を本文に数えない入れもの
SKIP = {"script", "style", "noscript", "template"}
# SVG の中で、画面に出ない字
SVG_META = {"title", "desc", "metadata"}
YOUTUBE = re.compile(r"(?:^|\.)(?:youtube\.com|youtu\.be|youtube-nocookie\.com)$")

# 見えるパンくずの見分け。島は `<nav class="crumbs" aria-label="現在地">`
# （`site/components/ui/PageShell.tsx` の `Crumbs`）。クラス名を変えたら、ここも変える
# ——変え忘れると `crumbs=jsonld` の線が「分母 0＝測れない」で 2 になるので、黙っては通らない
CRUMB_CLASS = "crumbs"
CRUMB_LABELS = {"現在地", "パンくず", "breadcrumb"}

# 構造化データの、型ごとに無いと困る欄。**増やすのは、その型を島が出すようになってから**
# （`site/lib/jsonld.tsx`）。Google の必須の欄のうち、いちばん外せないものだけ
LD_NEEDS: dict[str, list[str]] = {
    "WebSite": ["name", "url"],
    "ProfilePage": ["mainEntity"],
    "Person": ["name"],
    "BreadcrumbList": ["itemListElement"],
}

# このリポジトリの根。`firebase.json` と `public/` から、道具の面を数えるのに使う
ROOT = Path(__file__).resolve().parent.parent


def _chars(s: str) -> int:
    """空白を除いた字数。日本語の面なので、語ではなく字で数える。"""
    return len("".join(s.split()))


def _one_line(s: str) -> str:
    return " ".join(s.split())


# ---- 取ってくる -------------------------------------------------------

class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """リダイレクトを黙って追わせない。**追った事実が数に要る**
    （`tools/sprites/prod.mjs` の「追う。追ったことは言う」と同じ）。"""

    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: D401
        return None


# 既定の opener はプロキシ（`https_proxy`）と証明書（`SSL_CERT_FILE`）を環境変数から読む
_OPENER = urllib.request.build_opener(_NoRedirect)


@dataclass
class Got:
    url: str
    final: str = ""
    status: int = 0
    hops: int = 0
    ctype: str = ""
    headers: dict = field(default_factory=dict)
    body: bytes = b""
    wire: int = 0          # 圧縮されたまま届いたバイト数（gzip）
    error: str = ""

    @property
    def text(self) -> str:
        return self.body.decode("utf-8", "replace")


def _once(url: str, method: str, timeout: float) -> tuple[int, dict, bytes]:
    req = urllib.request.Request(url, method=method, headers={
        "User-Agent": UA,
        # brotli は標準ライブラリで解けないので、gzip だけ頼む
        "Accept-Encoding": "gzip",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    })
    try:
        with _OPENER.open(req, timeout=timeout) as r:
            return r.status, {k.lower(): v for k, v in r.headers.items()}, r.read()
    except urllib.error.HTTPError as e:
        # 3xx / 4xx / 5xx はここに来る。**失敗ではなく答え**なので、本文ごと返す
        return e.code, {k.lower(): v for k, v in e.headers.items()}, e.read()


def fetch(url: str, *, follow: bool = True, method: str = "GET",
          timeout: float = 40, tries: int = 3) -> Got:
    """1本取る。リダイレクトは自分で追い、追った回数を返す。"""
    got = Got(url=url, final=url)
    cur = url
    while True:
        status, headers, raw, err = 0, {}, b"", ""
        for n in range(tries):
            try:
                status, headers, raw = _once(cur, method, timeout)
                err = ""
            except (urllib.error.URLError, http.client.HTTPException, TimeoutError, OSError, ValueError) as e:
                # 途中で切れた・URL として読めない、も「届かなかった」に入れる。
                # ここで例外を上げると、並びの1本が全体を道連れにして1面も出なくなる
                err = f"{type(e).__name__}: {getattr(e, 'reason', e)}"
            time.sleep(PAUSE)
            # 混んでいる・向こうの一時的な不調だけ、間を空けてやり直す
            if not err and status not in (429, 500, 502, 503, 504):
                break
            time.sleep(1.5 * (n + 1))
        got.status, got.headers, got.error, got.final = status, headers, err, cur
        if err:
            return got
        loc = headers.get("location", "")
        if follow and status in (301, 302, 303, 307, 308) and loc and got.hops < MAX_HOPS:
            got.hops += 1
            cur = urljoin(cur, loc)
            continue
        got.wire = len(raw)
        if headers.get("content-encoding", "").lower() == "gzip":
            try:
                raw = gzip.decompress(raw)
            except OSError as e:
                got.error = f"gzip が解けない: {e}"
        got.body = raw
        got.ctype = headers.get("content-type", "")
        return got


# ---- sitemap ----------------------------------------------------------

@dataclass
class Entry:
    loc: str
    lastmod: str = ""
    priority: str = ""


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def read_sitemap(url: str, depth: int = 0) -> tuple[list[Entry], str]:
    """sitemap を読む。索引（`<sitemapindex>`）なら子も読む。読めなければ理由を返す。"""
    got = fetch(url)
    if got.error or got.status != 200:
        return [], f"{url} が読めない（{got.error or got.status}）"
    try:
        root = ET.fromstring(got.body)
    except ET.ParseError as e:
        return [], f"{url} が XML として読めない（{e}）"
    out: list[Entry] = []
    if _local(root.tag) == "sitemapindex":
        if depth >= 2:
            return [], f"{url}: 索引の入れ子が深すぎる"
        for sm in root:
            loc = next((c.text or "" for c in sm if _local(c.tag) == "loc"), "").strip()
            if loc:
                sub, why = read_sitemap(loc, depth + 1)
                if why:
                    return [], why
                out += sub
        return out, ""
    for u in root:
        if _local(u.tag) != "url":
            continue
        e = Entry(loc="")
        for c in u:
            name, val = _local(c.tag), (c.text or "").strip()
            if name == "loc":
                e.loc = val
            elif name == "lastmod":
                e.lastmod = val
            elif name == "priority":
                e.priority = val
        if e.loc:
            out.append(e)
    return out, ""


# ---- 1面を読む --------------------------------------------------------

@dataclass
class Page:
    """1面ぶんの、生の HTML から読めたもの。"""
    lang: str = ""
    title: str = ""
    metas: dict = field(default_factory=dict)       # name / property → content（最初の1つ）
    canonicals: list = field(default_factory=list)
    hreflang: int = 0
    feeds: int = 0
    heads: list = field(default_factory=list)       # [段, 本文, そこまでの本文字数]
    text: int = 0
    text_main: int = 0
    text_svg: int = 0
    text_hidden: int = 0
    text_folded: int = 0
    has_main: bool = False
    jsonld: list = field(default_factory=list)      # 生の字
    imgs: list = field(default_factory=list)        # (src, alt | None, main の中か)
    links: list = field(default_factory=list)       # href
    iframes: list = field(default_factory=list)     # src
    scripts: list = field(default_factory=list)     # src
    time_dt: int = 0
    time_plain: int = 0
    crumbs: int = 0                                 # 見えるパンくず（`<nav class="crumbs">`）の数
    inline_script_bytes: int = 0
    chunks: list = field(default_factory=list)      # 本文の字そのもの（生と JS 後の DOM を引き算するとき用）


class _Reader(HTMLParser):
    """生の HTML を1回なめて `Page` に詰める。

    入れ子は**タグ名の積み重ね**で追う。React が書き出す HTML は閉じが揃っているので
    これで足りる。閉じが合わないとき（手書きの面）は、同じ名前が出るまで巻き戻す。
    """

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.p = Page()
        self.stack: list[tuple[str, bool, int]] = []    # (タグ, hidden を持つか, 畳みの増減)
        self.depth: Counter = Counter()             # いま開いているタグの数
        self.hidden = 0
        self.folded = 0                             # いま何重の「閉じた畳みの中身」に居るか
        self.in_body = False
        self._title: list[str] | None = None
        self._head: list | None = None              # 読んでいる途中の見出し
        self._head_tag = ""
        self._ld: list[str] | None = None

    # -- 開く・閉じる --
    def handle_startendtag(self, tag, attrs):       # `<path/>` `<meta/>`
        self._open(tag, dict(attrs), push=False)

    def handle_starttag(self, tag, attrs):
        self._open(tag, dict(attrs), push=tag not in VOID)

    def _open(self, tag: str, a: dict, push: bool) -> None:
        p = self.p
        skipping = any(self.depth[t] for t in SKIP)
        if tag == "html":
            p.lang = p.lang or (a.get("lang") or "")
        elif tag == "body":
            self.in_body = True
        elif tag == "main":
            p.has_main = True
        if not skipping:
            if tag == "title" and not self.depth["svg"] and not p.title and self._title is None:
                self._title = []
            elif tag == "meta":
                key = (a.get("name") or a.get("property") or "").lower()
                if key and key not in p.metas:
                    p.metas[key] = a.get("content") or ""
            elif tag == "link":
                rel = (a.get("rel") or "").lower().split()
                if "canonical" in rel:
                    p.canonicals.append(a.get("href") or "")
                if "alternate" in rel and a.get("hreflang"):
                    p.hreflang += 1
                if "alternate" in rel and re.search(r"rss|atom", a.get("type") or ""):
                    p.feeds += 1
            elif tag in ("h1", "h2", "h3") and self._head is None:
                self._head, self._head_tag = [int(tag[1]), [], p.text], tag
            elif tag == "img":
                p.imgs.append((a.get("src") or a.get("data-src") or "", a.get("alt"),
                               bool(self.depth["main"])))
            elif tag == "a" and a.get("href") is not None:
                p.links.append(a.get("href") or "")
            elif tag == "iframe":
                p.iframes.append(a.get("src") or "")
            elif tag == "time":
                if a.get("datetime"):
                    p.time_dt += 1
                else:
                    p.time_plain += 1
            elif tag == "nav":
                if (CRUMB_CLASS in (a.get("class") or "").split()
                        or (a.get("aria-label") or "").strip().lower() in CRUMB_LABELS):
                    p.crumbs += 1
        if tag == "script":
            if a.get("src"):
                p.scripts.append(a["src"])
            if (a.get("type") or "").lower() == "application/ld+json":
                self._ld = []
        if push:
            hid = "hidden" in a
            # 閉じた `<details>` の中身は +1。その見出し（`<summary>`）の中だけは見えているので -1
            fold = 0
            if tag == "details" and "open" not in a:
                fold = 1
            elif tag == "summary" and self.stack and self.stack[-1][0] == "details" and self.stack[-1][2] == 1:
                fold = -1
            self.stack.append((tag, hid, fold))
            self.depth[tag] += 1
            self.hidden += hid
            self.folded += fold

    def handle_endtag(self, tag):
        if not any(t == tag for t, *_ in self.stack):
            return                                   # 開いていないものの閉じは捨てる
        while self.stack:
            t, hid, fold = self.stack.pop()
            self.depth[t] -= 1
            self.hidden -= hid
            self.folded -= fold
            self._closed(t)
            if t == tag:
                break

    def _closed(self, tag: str) -> None:
        p = self.p
        if tag == "title" and self._title is not None:
            p.title = _one_line("".join(self._title))
            self._title = None
        elif tag == self._head_tag and self._head is not None:
            lv, parts, at = self._head
            p.heads.append([lv, _one_line("".join(parts)), at])
            self._head, self._head_tag = None, ""
        elif tag == "script" and self._ld is not None:
            p.jsonld.append("".join(self._ld))
            self._ld = None

    # -- 字 --
    def handle_data(self, data):
        p = self.p
        if self.depth["script"]:
            if self._ld is not None:
                self._ld.append(data)
            else:
                p.inline_script_bytes += len(data.encode("utf-8"))
            return
        if any(self.depth[t] for t in SKIP):
            return
        if self._title is not None:
            self._title.append(data)
            return
        if not self.in_body:
            return
        if self.depth["svg"] and any(self.depth[t] for t in SVG_META):
            return
        n = _chars(data)
        if not n:
            return
        p.text += n
        p.chunks.append(data)
        if self.depth["main"]:
            p.text_main += n
        if self.depth["svg"]:
            p.text_svg += n
        if self.hidden:
            p.text_hidden += n
        if self.folded > 0:
            p.text_folded += n
        if self._head is not None:
            self._head[1].append(data)


def read_html(html: str) -> Page:
    r = _Reader()
    r.feed(html)
    r.close()
    return r.p


def ld_types(blocks: list[str]) -> tuple[list[str], int]:
    """JSON-LD の `@type` を、出てきた順に（入れ子も）。読めなかった塊の数も返す。"""
    seen: list[str] = []
    bad = 0

    def walk(x) -> None:
        if isinstance(x, dict):
            t = x.get("@type")
            for v in (t if isinstance(t, list) else [t]):
                if isinstance(v, str) and v not in seen:
                    seen.append(v)
            for v in x.values():
                walk(v)
        elif isinstance(x, list):
            for v in x:
                walk(v)

    for b in blocks:
        try:
            walk(json.loads(b))
        except ValueError:
            bad += 1
    return seen, bad


def ld_problems(blocks: list[str]) -> list[str]:
    """構造化データの塊ごとに、困るところを1行で。困らなければ空。

    見るのは3つだけ: JSON として読めるか／いちばん外の入れものが `@context` と `@type` を
    持っているか／型ごとの必須の欄（`LD_NEEDS`）が在るか。パンくずは並びの番号と、
    **いちばん奥を除く段の行き先**（`item`）まで見る——途中の `item` が欠けた名札は、
    読む側で丸ごと捨てられる。
    """
    out: list[str] = []

    def need(node: dict, where: str) -> list[str]:
        bad: list[str] = []
        types = node.get("@type")
        for t in (types if isinstance(types, list) else [types]):
            for k in LD_NEEDS.get(t, []) if isinstance(t, str) else []:
                if node.get(k) in (None, "", [], {}):
                    bad.append(f"{where}{t} に {k} が無い")
            if t == "BreadcrumbList":
                items = node.get("itemListElement")
                items = items if isinstance(items, list) else []
                for i, it in enumerate(items):
                    if not isinstance(it, dict) or it.get("position") != i + 1 or not it.get("name"):
                        bad.append(f"{where}BreadcrumbList の {i + 1}段目に position か name が無い")
                    elif i + 1 < len(items) and not it.get("item"):
                        bad.append(f"{where}BreadcrumbList の {i + 1}段目（途中の段）に item が無い")
        for k, v in node.items():
            for child in (v if isinstance(v, list) else [v]):
                if isinstance(child, dict) and "@type" in child:
                    bad += need(child, where)
        return bad

    for n, b in enumerate(blocks, 1):
        try:
            data = json.loads(b)
        except ValueError:
            out.append(f"{n}個目が JSON として読めない")
            continue
        tops = data if isinstance(data, list) else [data]
        why: list[str] = []
        for top in tops:
            if not isinstance(top, dict):
                why.append("入れものが {…} ではない")
                continue
            if "schema.org" not in str(top.get("@context", "")):
                why.append("@context が無い")
            nodes = top.get("@graph") if isinstance(top.get("@graph"), list) else [top]
            for node in nodes:
                if not isinstance(node, dict) or not node.get("@type"):
                    why.append("@type が無い")
                else:
                    why += need(node, "")
        if why:
            out.append(f"{n}個目: " + "・".join(dict.fromkeys(why)))
    return out


# ---- 1面を測る --------------------------------------------------------

def norm_url(u: str) -> str:
    """比べるための形。**根だけ**、末尾の `/` の有無を同じに見る。
    ほかの道では見ない——本番は `/bulgaria/` を `/bulgaria` へ 301 するので、別物。"""
    s = urlsplit(u)
    return f"{s.scheme.lower()}://{s.netloc.lower()}{s.path or '/'}" + (f"?{s.query}" if s.query else "")


def norm_path(path: str) -> str:
    """被リンクを数えるための形。末尾の `/` と `.html` を落とす。"""
    path = path or "/"
    if path.endswith("/index.html"):
        path = path[: -len("index.html")]
    elif path.endswith(".html"):
        path = path[: -len(".html")]
    if len(path) > 1 and path.endswith("/"):
        path = path.rstrip("/") or "/"
    return path


def kind(path: str) -> str:
    """面の型。1段目はそのまま、2段目からは動く段として `*` に畳む。"""
    segs = [s for s in path.split("/") if s]
    if not segs:
        return "/"
    return "/" + segs[0] + "/*" * (len(segs) - 1)


def find_tags(text: str) -> list[str]:
    return [name for name, pat in TAGS if re.search(pat, text)]


def measure(html: str, public_url: str, hosts: set[str]) -> dict:
    """生の HTML 1本を、列の束にする。`public_url` は sitemap が名乗っている URL。"""
    p = read_html(html)
    m = p.metas
    self_path = norm_path(urlsplit(public_url).path)
    row: dict = {}

    row["lang"] = p.lang
    robots = " ".join(v for k, v in m.items() if k in ("robots", "googlebot")).lower()
    row["noindex"] = int("noindex" in robots)
    row["title"] = p.title
    row["title_len"] = len(p.title)
    desc = _one_line(m.get("description", ""))
    row["desc"] = desc
    row["desc_len"] = len(desc)

    canon = p.canonicals[0] if p.canonicals else ""
    row["canonical"] = canon
    row["canon_count"] = len(p.canonicals)
    row["canon_abs"] = int(bool(urlsplit(canon).scheme and urlsplit(canon).netloc))
    row["canon_self"] = int(bool(canon) and norm_url(canon) == norm_url(public_url))

    for k in ("og:title", "og:description", "og:image", "og:url", "twitter:card"):
        row[k.replace(":", "_")] = int(bool(m.get(k)))
    row["og_image_url"] = m.get("og:image", "")
    row["og_url_self"] = int(bool(m.get("og:url")) and norm_url(m["og:url"]) == norm_url(public_url))

    h1 = [t for lv, t, _ in p.heads if lv == 1]
    row["h1_count"] = len(h1)
    row["h1_text"] = " | ".join(h1)
    row["h2_count"] = sum(1 for lv, *_ in p.heads if lv == 2)
    row["h3_count"] = sum(1 for lv, *_ in p.heads if lv == 3)

    row["text_chars"] = p.text
    row["text_main_chars"] = p.text_main if p.has_main else ""
    row["text_svg_chars"] = p.text_svg
    row["text_hidden_chars"] = p.text_hidden
    row["text_folded_chars"] = p.text_folded
    row["inline_script_bytes"] = p.inline_script_bytes

    types, bad = ld_types(p.jsonld)
    row["jsonld_count"] = len(p.jsonld)
    row["jsonld_types"] = ",".join(types) + (f" (読めない塊 {bad})" if bad else "")
    row["_ld_types"] = types
    row["_ld_problems"] = ld_problems(p.jsonld)
    row["jsonld_bad"] = len(row["_ld_problems"])
    row["crumbs"] = p.crumbs

    row["img_count"] = len(p.imgs)
    row["img_alt_missing"] = sum(1 for _, alt, _m in p.imgs if alt is None)
    row["img_alt_empty"] = sum(1 for _, alt, _m in p.imgs if alt is not None and not alt.strip())
    # 頭のバーと足もとの絵（どの面にも同じものが並ぶ飾り）を除いた、その面だけの絵
    row["img_main_count"] = sum(1 for *_, m_ in p.imgs if m_)
    row["img_main_noalt"] = sum(1 for _, alt, m_ in p.imgs if m_ and not (alt or "").strip())

    internal: list[str] = []
    ext = yt = frag = 0
    yt_urls: list[str] = []
    for href in p.links:
        h = href.strip()
        if not h or h.startswith("#"):
            frag += 1
            continue
        if re.match(r"(?i)(mailto|tel|javascript|data|sms):", h):
            continue
        s = urlsplit(urljoin(public_url, h))
        if s.scheme not in ("http", "https"):
            continue
        if s.netloc.lower() in hosts:
            internal.append(norm_path(s.path))
        else:
            ext += 1
            if YOUTUBE.search(s.hostname or ""):
                yt += 1
                yt_urls.append(h)
    row["links_internal"] = len(internal)
    row["links_internal_uniq"] = len(set(internal) - {self_path})
    row["links_fragment"] = frag
    row["links_external"] = ext
    row["links_youtube"] = yt
    row["youtube_iframes"] = sum(
        1 for s in p.iframes if YOUTUBE.search(urlsplit(urljoin(public_url, s)).hostname or ""))

    row["time_datetime"] = p.time_dt
    row["time_no_datetime"] = p.time_plain
    row["hreflang"] = p.hreflang
    row["feed_links"] = p.feeds
    row["gsc_verify"] = int("google-site-verification" in m)
    row["analytics"] = ",".join(find_tags(html))

    # 表には出さないが、集計と --detail が使う
    row["_out"] = set(internal) - {self_path}
    row["_page"] = p
    row["_yt_urls"] = yt_urls
    return row


# ---- 全面 -------------------------------------------------------------

COLS = ["path", "type", "status", "hops", "final_url", "html_bytes", "wire_bytes",
        "inline_script_bytes", "lang", "noindex", "title_len", "title_dup", "desc_len",
        "desc_dup", "canon_count", "canon_abs", "canon_self", "og_title", "og_description",
        "og_image", "og_url", "og_url_self", "twitter_card", "h1_count", "h2_count",
        "h3_count", "text_chars", "text_main_chars", "text_svg_chars", "text_hidden_chars",
        "text_folded_chars",
        "jsonld_count", "jsonld_types", "jsonld_bad", "crumbs", "img_count", "img_alt_missing", "img_alt_empty",
        "img_main_count", "img_main_noalt",
        "links_internal", "links_internal_uniq", "links_fragment", "links_external",
        "links_youtube", "youtube_iframes", "time_datetime", "time_no_datetime", "hreflang",
        "feed_links", "gsc_verify", "analytics", "inbound", "depth", "lastmod", "priority",
        "title", "desc", "h1_text", "canonical", "og_image_url", "url", "note"]


def fetch_page(base: str, e: Entry, try_html: bool) -> dict:
    """sitemap の1件を取りに行く。道は `<loc>` から、宛先は `--base` から。"""
    s = urlsplit(e.loc)
    path = s.path or "/"
    url = base.rstrip("/") + path + (f"?{s.query}" if s.query else "")
    note = []
    bare = "." not in path.rsplit("/", 1)[-1] and path != "/"
    if try_html and bare and is_local(base):
        # 手元の `python3 -m http.server` は `/x` を `/x.html` に読み替えてくれない。しかも
        # `x/`（下の段の置き場）が在ると、`/x` は 301 → **置き場の一覧（200 の HTML）**になる。
        # 404 を待ってから `.html` を試すと、一覧を面として測ってしまうので、**先に `.html`**
        got = fetch(url + ".html")
        if got.status == 200:
            note.append(".html を足して取れた")
        else:
            got = fetch(url)
    else:
        got = fetch(url)
        if try_html and bare and got.status == 404:
            # **本番を測るときはここを通らない**（`<loc>` と `--base` のホストが同じなので）
            alt = fetch(url + ".html")
            if alt.status == 200:
                got = alt
                note.append(".html を足して取れた")
    row = {"url": e.loc, "path": norm_path(path), "type": kind(norm_path(path)),
           "status": got.status, "hops": got.hops, "final_url": got.final if got.hops else "",
           "html_bytes": len(got.body), "wire_bytes": got.wire,
           "lastmod": e.lastmod, "priority": e.priority}
    if got.error:
        note.append(got.error)
    row["_ok"] = (not got.error and got.status == 200 and "html" in got.ctype.lower())
    if row["_ok"]:
        hosts = {urlsplit(e.loc).netloc.lower(), urlsplit(base).netloc.lower()}
        row.update(measure(got.text, e.loc, hosts))
        if "noindex" in got.headers.get("x-robots-tag", "").lower():
            row["noindex"] = 1
            note.append("X-Robots-Tag: noindex")
    elif not got.error and got.status == 200:
        note.append(f"HTML ではない（{got.ctype}）")
    row["note"] = " / ".join(note)
    return row


def crosslink(rows: list[dict]) -> dict:
    """全面を読んだあとにしか出ない数——重複・被リンク・表紙からの深さ。"""
    ok = [r for r in rows if r["_ok"]]
    for key in ("title", "desc"):
        n = Counter(r[key] for r in ok if r[key])
        for r in ok:
            r[f"{key}_dup"] = n[r[key]] - 1 if r[key] else 0

    paths = {r["path"] for r in rows}
    inbound: dict[str, set] = defaultdict(set)
    off_map: Counter = Counter()        # sitemap に無い、島の中の行き先
    for r in ok:
        for t in r["_out"]:
            if t in paths:
                inbound[t].add(r["path"])
            else:
                off_map[t] += 1
    for r in rows:
        r["inbound"] = len(inbound[r["path"]])

    # 表紙から `<a href>` だけを辿って、何回で着くか。着けない面は空欄
    out = {r["path"]: r["_out"] & paths for r in ok}
    depth = {"/": 0} if "/" in out else {}
    q = deque(depth)
    while q:
        cur = q.popleft()
        for t in out.get(cur, ()):
            if t not in depth:
                depth[t] = depth[cur] + 1
                q.append(t)
    for r in rows:
        r["depth"] = depth.get(r["path"], "")
    return {"off_map": off_map}


def is_local(base: str) -> bool:
    return (urlsplit(base).hostname or "") in ("localhost", "127.0.0.1", "::1")


def lastmod_state(val: str, now: datetime) -> str:
    """`<lastmod>` 1つを "ok" / "future" / "bad" に。

    日付だけの値（`2026-11-12`）は**日**で比べる（UTC のきょうより先なら未来）。
    時刻つきの値は時刻で比べる（時計のずれぶん5分は見逃す）。
    """
    v = val.strip()
    m = re.fullmatch(r"(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?", v)
    try:
        if m:
            d = date(int(m[1]), int(m[2] or 1), int(m[3] or 1))
            return "future" if d > now.date() else "ok"
        t = datetime.fromisoformat(v.replace("Z", "+00:00"))
    except ValueError:
        return "bad"
    if t.tzinfo is None:
        t = t.replace(tzinfo=timezone.utc)
    return "future" if t > now + timedelta(minutes=5) else "ok"


def sitemap_facts(entries: list[Entry], now: datetime | None = None) -> dict:
    """sitemap の行から出る数。**取りに行かない**（`--no-site` でも出す）。"""
    now = now or datetime.now(timezone.utc)
    locs = Counter(norm_url(e.loc) for e in entries)
    mods = [e.lastmod for e in entries if e.lastmod]
    states = [lastmod_state(v, now) for v in mods]
    return {
        "rows": len(entries),
        "uniq": len(locs),
        "dup": sorted(u for u, n in locs.items() if n > 1),
        "with_mod": len(mods),
        "distinct": len(set(mods)),
        "oldest": min(mods) if mods else "",
        "newest": max(mods) if mods else "",
        "future": [v for v, st in zip(mods, states) if st == "future"],
        "bad": [v for v, st in zip(mods, states) if st == "bad"],
        "priority": sum(1 for e in entries if e.priority),
    }


def sitemap_lines(sm: dict) -> list[tuple[str, str]]:
    rows, mod = sm["rows"], sm["with_mod"]
    out = [("行 / 一意な URL", f"{rows}行 / {sm['uniq']}")]
    out.append(("2回以上載っている URL", f"{len(sm['dup'])}/{sm['uniq']}"
                + (f"（{', '.join(sm['dup'])}）" if sm["dup"] else "")))
    line = f"付いている {mod}/{rows}"
    if mod:
        line += f"（{mod * 100 // rows}%）・値は {sm['distinct']}通り・{sm['oldest']} 〜 {sm['newest']}"
        if sm["distinct"] == 1 and mod > 1:
            line += "（**全部同じ値＝更新日として読めない**）"
    out.append(("lastmod", line))
    out.append(("lastmod がいまより先", f"{len(sm['future'])}/{mod}"
                + (f"（{', '.join(sorted(set(sm['future']))[:5])}）" if sm["future"] else "")))
    out.append(("lastmod が日付として読めない", f"{len(sm['bad'])}/{mod}"
                + (f"（{', '.join(sorted(set(sm['bad']))[:5])}）" if sm["bad"] else "")))
    out.append(("priority の付いた行", f"{sm['priority']}/{rows}"))
    return out


def glob_re(glob: str) -> re.Pattern:
    """Firebase Hosting の `source` の glob を正規表現に。

    読むのは `firebase.json` が実際に使っている形だけ（`**`・`*`・`@(a|b)`）。
    ほかの形が来たら**当てずに落とす**——読めない glob を「当たらない」と数えると、
    noindex が付いていない面を「付けないと決めた面」と読み違える。
    """
    out, i = [], 0
    while i < len(glob):
        c = glob[i]
        if glob.startswith("**", i):
            out.append(".*")
            i += 2
        elif c == "*":
            out.append("[^/]*")
            i += 1
        elif glob.startswith("@(", i) and ")" in glob[i:]:
            j = glob.index(")", i)
            out.append("(?:" + "|".join(re.escape(x) for x in glob[i + 2:j].split("|")) + ")")
            i = j + 1
        elif c in "?+!@[]{}()|\\":
            raise ValueError(f"この道具が読めない glob（{glob!r} の {i + 1}字目 {c!r}）")
        else:
            out.append(re.escape(c))
            i += 1
    return re.compile("^" + "".join(out) + "$")


def noindex_rules(conf: dict) -> list[re.Pattern]:
    """`firebase.json` の headers のうち、`X-Robots-Tag: noindex` を付ける行の `source`。"""
    rules = []
    for h in conf.get("hosting", {}).get("headers", []):
        if not any(x.get("key", "").lower() == "x-robots-tag" and "noindex" in x.get("value", "").lower()
                   for x in h.get("headers", [])):
            continue
        rules.append(glob_re(h["source"]) if "source" in h else re.compile(h["regex"]))
    return rules


def tool_pages(root: Path = ROOT) -> tuple[list[str], list[str]]:
    """（noindex を付けると決めてある道具の面, 付けていない `public/` の面）。

    道は**本番で開く形**（`cleanUrls` で `.html` と `/index` が落ちたあと）。数えるのは
    Expo の面（`/expo-app.html` へ書き換える道と、その実体）と、`public/` の HTML。
    島の面（`site/`）はここに入らない。**手で並べない**——`public/` に1枚足せば、
    ここに出てくる（付けていない側に出るので、決め忘れが見える）。
    """
    conf = json.loads((root / "firebase.json").read_text(encoding="utf-8"))
    rules = noindex_rules(conf)
    paths: set[str] = set()
    for r in conf.get("hosting", {}).get("rewrites", []):
        if r.get("destination") == "/expo-app.html":
            paths.add("/expo-app")
            if "*" not in r.get("source", "*"):
                paths.add(r["source"])
    pub = root / "public"
    for f in sorted(pub.rglob("*.html")) if pub.is_dir() else []:
        paths.add(norm_path("/" + f.relative_to(pub).as_posix()))
    hit = sorted(x for x in paths if any(r.match(x) for r in rules))
    return hit, sorted(paths - set(hit))


def probe_tools(base: str, root: Path = ROOT) -> dict:
    """道具の面を1本ずつ取って、`X-Robots-Tag: noindex` が返るかを見る。

    **配信ヘッダは Hosting の層**なので、手元の書き出しには出ない
    （`docs/island-routing.md`）。配ったあとに本番へ向けて見る数。
    """
    want, left = tool_pages(root)
    fix = base.rstrip("/")
    with ThreadPoolExecutor(WORKERS) as ex:
        got = list(ex.map(lambda x: fetch(fix + x), want + left))
    live = [(x, g) for x, g in zip(want, got) if g.status == 200]
    tagged = [x for x, g in live if "noindex" in g.headers.get("x-robots-tag", "").lower()]
    open_ = [x for x, g in zip(left, got[len(want):]) if g.status == 200
             and "noindex" not in g.headers.get("x-robots-tag", "").lower()]
    return {"want": want, "live": [x for x, _ in live], "tagged": tagged,
            "untagged": [x for x, _ in live if x not in tagged], "left": left, "open": open_}


def tool_lines(t: dict) -> list[tuple[str, str]]:
    return [
        (f"道具の面（`firebase.json` が noindex を付ける {len(t['want'])}面）",
         f"200 で返った {len(t['live'])}面のうち `X-Robots-Tag: noindex` が {len(t['tagged'])}/{len(t['live'])}"
         + (f"（無い: {', '.join(t['untagged'][:12])}）" if t["untagged"] else "")),
        (f"noindex を付けていない `public/` の面（{len(t['left'])}面）",
         (", ".join(t["left"]) or "無い") + f"／うち 200 で開いている {len(t['open'])}面"),
    ]


class _Dist(http.server.SimpleHTTPRequestHandler):
    """書き出した置き場を、本番の `cleanUrls` と同じ読み替えで配る（`/x` → `x.html`）。"""

    def translate_path(self, path):  # noqa: D401
        got = super().translate_path(path)
        if not Path(got).is_file() and Path(got.rstrip("/") + ".html").is_file():
            return got.rstrip("/") + ".html"
        return got

    def log_message(self, *args):  # 1面ごとの行は要らない
        pass


def serve_dist(directory: str) -> tuple[http.server.ThreadingHTTPServer, str]:
    """空いている口に配る。止めるのは呼んだ側（`shutdown()`）。"""
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(_Dist, directory=directory))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, f"http://127.0.0.1:{srv.server_address[1]}"


# ---- 線を引く（--expect）----------------------------------------------

EXPECT_COUNTS = ("canonical", "canonical-other", "sitemap-dup", "priority", "lastmod-distinct", "lastmod-future",
                 "lastmod-bad", "jsonld-bad", "time-plain", "tools-noindex")
_TERM = re.compile(r"^(?P<name>[a-z-]+)(?::(?P<path>/[^=<>]*))?(?P<op>>=|<=|=)(?P<val>[^=<>]+)$")


def parse_expect(text: str) -> list[dict]:
    """`--expect` の字を線の並びに。**読めない線は、測る前に落とす**（黙って捨てない）。"""
    out = []
    for raw in (t.strip() for t in text.split(",")):
        if not raw:
            continue
        m = _TERM.match(raw)
        if not m:
            raise ValueError(f"読めない線: {raw!r}")
        name, path, op, val = m["name"], m["path"], m["op"], m["val"].strip()
        if name == "jsonld" and path and op == "=":
            out.append({"raw": raw, "kind": "types", "path": norm_path(path), "types": val.split("+")})
        elif name == "crumbs" and not path and op == "=" and val == "jsonld":
            out.append({"raw": raw, "kind": "crumbs"})
        elif name in EXPECT_COUNTS and not path and (val == "all" or val.isdigit()):
            out.append({"raw": raw, "kind": "count", "name": name, "op": op, "val": val})
        else:
            raise ValueError(f"知らない線: {raw!r}（数の線は {', '.join(EXPECT_COUNTS)}）")
    if not out:
        raise ValueError("線が1本も無い")
    return out


def _names(xs: list[str]) -> str:
    return f"（{', '.join(xs[:NAME_UP_TO])}{' …' if len(xs) > NAME_UP_TO else ''}）" if xs else ""


def judge(terms: list[dict], rows: list[dict], sm: dict, tools: dict | None) -> list[tuple[str, str, str]]:
    """線ごとに（線, "ok" / "ng" / "na", 言い分）。**"na" は測れなかった**（分母が 0）。"""
    ok = [r for r in rows if r["_ok"]]
    has_time = [r for r in ok if r["time_datetime"] or r["time_no_datetime"]]
    blocks = sum(r["jsonld_count"] for r in ok)

    def counts(name: str) -> tuple[int, int, list[str], str]:
        """（数, 分母, 名指し, 分母の呼び名）"""
        if name == "canonical":
            miss = [r["path"] for r in rows if not (r["_ok"] and r["canon_count"] == 1 and r["canon_abs"])]
            return len(rows) - len(miss), len(rows), miss, "sitemap の一意な URL"
        if name == "canonical-other":
            has = [r for r in ok if r["canon_count"]]
            other = [f"{r['path']} → {r['canonical']}" for r in has if not r["canon_self"]]
            return len(other), len(has), other, "canonical が在る面"
        if name == "sitemap-dup":
            return len(sm["dup"]), sm["rows"], sm["dup"], "sitemap の行"
        if name == "priority":
            return sm["priority"], sm["rows"], [], "sitemap の行"
        if name == "lastmod-distinct":
            return sm["distinct"], sm["with_mod"], [], "lastmod の付いた行"
        if name == "lastmod-future":
            return len(sm["future"]), sm["with_mod"], sorted(set(sm["future"])), "lastmod の付いた行"
        if name == "lastmod-bad":
            return len(sm["bad"]), sm["with_mod"], sorted(set(sm["bad"])), "lastmod の付いた行"
        if name == "jsonld-bad":
            bad = [r["path"] for r in ok if r["jsonld_bad"]]
            return sum(r["jsonld_bad"] for r in ok), blocks, bad, "構造化データの塊"
        if name == "time-plain":
            plain = [r["path"] for r in has_time if not r["time_datetime"]]
            return len(plain), len(has_time), plain, "`<time>` を持つ面"
        if name == "tools-noindex":
            t = tools or {"tagged": [], "live": [], "untagged": []}
            return len(t["tagged"]), len(t["live"]), t["untagged"], "200 で返った道具の面"
        raise KeyError(name)

    out: list[tuple[str, str, str]] = []
    unread = [r["path"] for r in rows if not r["_ok"]]
    out.append(("（読めた面）", "na" if unread else "ok",
                f"{len(ok)}/{len(rows)}" + (f"＝読めなかった面が在る{_names(unread)}" if unread else "")))
    for t in terms:
        if t["kind"] == "count":
            got, den, named, what = counts(t["name"])
            if den == 0:
                out.append((t["raw"], "na", f"分母が 0（{what}が1つも無い）＝測れない"))
                continue
            want = den if t["val"] == "all" else int(t["val"])
            hit = {"=": got == want, ">=": got >= want, "<=": got <= want}[t["op"]]
            # 通っていても、残っているものが数えるほどなら道を言う（「1/106」だけでは、どの面か分からない）
            tell = named if (not hit or (t["op"] == "<=" and got)) else []
            out.append((t["raw"], "ok" if hit else "ng", f"{got}/{den}" + _names(tell)))
        elif t["kind"] == "types":
            row = next((r for r in ok if r["path"] == t["path"]), None)
            if row is None:
                out.append((t["raw"], "na", f"{t['path']} が読めていない（sitemap に無いか、200 で返らない）"))
                continue
            miss = [x for x in t["types"] if x not in row["_ld_types"]]
            out.append((t["raw"], "ng" if miss else "ok",
                        f"在る型: {', '.join(row['_ld_types']) or '無い'}" + (f"／無い型: {', '.join(miss)}" if miss else "")))
        else:
            seen = {r["path"] for r in ok if r["crumbs"]}
            told = {r["path"] for r in ok if "BreadcrumbList" in r["_ld_types"]}
            if not seen:
                out.append((t["raw"], "na", "見えるパンくずを持つ面が 0（見分けが外れているか、読めていない）＝測れない"))
                continue
            only_seen, only_told = sorted(seen - told), sorted(told - seen)
            out.append((t["raw"], "ng" if only_seen or only_told else "ok",
                        f"見えるパンくず {len(seen)}面・BreadcrumbList {len(told)}面"
                        + (f"／名札が無い{_names(only_seen)}" if only_seen else "")
                        + (f"／パンくずが見えない{_names(only_told)}" if only_told else "")))
    return out


def site_checks(base: str, entries: list[Entry], rows: list[dict], alt: str | None) -> list[tuple[str, str]]:
    """面をまたぐ検査。（何を見たか, 何が返ったか）の並びで返す。"""
    out: list[tuple[str, str]] = []
    host = urlsplit(base).netloc
    root = base.rstrip("/")

    g = fetch(root + "/robots.txt")
    body = g.text.strip() if g.status == 200 else ""
    out.append(("robots.txt", f"{g.status or g.error}"
                + ("".join("\n      | " + ln for ln in body.splitlines()[:30]) if body else "")))
    if body:
        named = [b for b in AI_BOTS if re.search(rf"(?im)^user-agent:\s*{re.escape(b)}\b", body)]
        out.append(("robots.txt が名指ししている AI の読み手",
                    f"{len(named)}/{len(AI_BOTS)}" + (f"（{', '.join(named)}）" if named else "")))
        out.append(("robots.txt の Disallow の行", str(len(re.findall(r"(?im)^disallow:\s*\S", body)))))
        out.append(("robots.txt の Sitemap の行", ", ".join(re.findall(r"(?im)^sitemap:\s*(\S+)", body)) or "無い"))

    for name in ("/llms.txt", "/llms-full.txt"):
        g = fetch(root + name)
        real = g.status == 200 and "html" not in g.ctype.lower()
        out.append((name, f"{g.status or g.error}"
                    + (f"（{len(g.body):,}B）" if real else "（無い）" if g.status == 404 else "")))

    g = fetch(root + "/this-does-not-exist-xyz")
    out.append(("無い道 /this-does-not-exist-xyz", f"{g.status or g.error}"
                + ("（**200 で返している＝無い面が索引に入りうる**）" if g.status == 200 else "")))

    if base.startswith("https://"):
        g = fetch("http://" + host + "/", follow=False, tries=1, timeout=15)
        out.append((f"http://{host}/", (f"{g.status} → {g.headers.get('location', '')}" if g.status
                                        else f"届かない（{g.error}）")))

    # 同じ中身を配る、もう1つのドメイン。Firebase Hosting は `*.firebaseapp.com` でも同じ面を配る。
    # 正の URL（独自ドメイン）を測るときは、もとの `*.web.app` がその「もう1つ」になる
    if alt is None and host.endswith(".web.app"):
        alt = "https://" + host[: -len(".web.app")] + ".firebaseapp.com"
    elif alt is None and host == urlsplit(ORIGIN).netloc.lower() and host != urlsplit(HOSTING_DEFAULT).netloc:
        alt = HOSTING_DEFAULT
    if alt:
        main = fetch(root + "/")
        g = fetch(alt.rstrip("/") + "/", follow=False)
        if g.status == 200:
            same = hashlib.sha1(g.body).hexdigest() == hashlib.sha1(main.body).hexdigest()
            canon = (read_html(g.text).canonicals or ["無い"])[0]
            out.append((f"{alt}/", f"200（表紙と{'同じ中身' if same else '違う中身'}・{len(g.body):,}B。"
                                   f"canonical は {canon}）"))
        else:
            out.append((f"{alt}/", f"{g.status or g.error}"
                        + (f" → {g.headers.get('location', '')}" if g.headers.get("location") else "")))

        # 表紙だけでは分からない。**表紙に canonical が無くても、ほかの面には在る**ことがある
        deep = next((urlsplit(e.loc).path for e in entries if urlsplit(e.loc).path not in ("", "/")), "")
        if deep:
            g = fetch(alt.rstrip("/") + deep, follow=False)
            canon = (read_html(g.text).canonicals or ["無い"])[0] if g.status == 200 else ""
            out.append((f"{alt}{deep}", f"{g.status or g.error}" + (f"（canonical は {canon}）" if canon else "")))

    # 同じ面が、別の書きかたの URL でも 200 で返っていないか
    deep = next((urlsplit(e.loc).path for e in entries if urlsplit(e.loc).path not in ("", "/")), "")
    if deep:
        for tail in ("/", ".html"):
            g = fetch(root + deep + tail, follow=False)
            out.append((f"別の書きかた {deep}{tail}", f"{g.status or g.error}"
                        + (f" → {g.headers.get('location', '')}" if g.headers.get("location") else "")))

    # sitemap の重複・lastmod は `sitemap_lines` が出す（取りに行かない数なので、`--no-site` でも出る）
    off = sorted({urlsplit(e.loc).netloc for e in entries} - {host})
    if off:
        out.append(("sitemap の宛先のホスト", f"{', '.join(off)}（測ったのは {host}）"))

    # 計測タグ。生の HTML と、表紙が読む JS の両方
    ok = [r for r in rows if r["_ok"]]
    in_html = Counter(t for r in ok for t in r["analytics"].split(",") if t)
    home = next((r for r in ok if r["path"] == "/"), ok[0] if ok else None)
    in_js: Counter = Counter()
    n_js = 0
    if home:
        srcs = sorted({urljoin(root + "/", s) for s in home["_page"].scripts})
        srcs = [s for s in srcs if urlsplit(s).netloc == host]
        with ThreadPoolExecutor(WORKERS) as ex:
            for g in ex.map(fetch, srcs):
                if g.status == 200:
                    n_js += 1
                    in_js.update(find_tags(g.text))
    out.append(("計測タグ（生の HTML）", ", ".join(f"{k} {v}/{len(ok)}面" for k, v in in_html.items()) or f"無い 0/{len(ok)}面"))
    out.append((f"計測タグ（表紙が読む JS {n_js}本）", ", ".join(f"{k} {v}/{n_js}本" for k, v in in_js.items()) or f"無い 0/{n_js}本"))

    # og:image は、タグが在っても絵が落ちていれば無いのと同じ。違う URL を1本ずつ確かめる
    imgs = sorted({urljoin(r["url"], r["og_image_url"]) for r in ok if r.get("og_image_url")})
    if imgs:
        fix = lambda u: (root + urlsplit(u).path) if urlsplit(u).netloc in off else u  # noqa: E731
        with ThreadPoolExecutor(WORKERS) as ex:
            res = list(ex.map(lambda u: fetch(fix(u), method="HEAD"), imgs))
        dead = [f"{urlsplit(u).path}({g.status or '届かない'})" for u, g in zip(imgs, res) if g.status != 200]
        out.append(("og:image の絵（違う URL を1本ずつ）",
                    f"{len(imgs)}通り・200 で返る {len(imgs) - len(dead)}/{len(imgs)}"
                    + (f"（落ちている: {', '.join(dead[:8])}）" if dead else "")))
    return out


# ---- 出す -------------------------------------------------------------

def _w(s: str) -> int:
    """端末での幅。全角は2つぶん。"""
    return sum(2 if ord(c) > 0x2E7F else 1 for c in s)


def _pad(s: str, n: int) -> str:
    return s + " " * max(0, n - _w(s))


def table(head: list[str], rows: list[list[str]]) -> str:
    width = [max(_w(str(r[i])) for r in [head] + rows) for i in range(len(head))]
    return "\n".join("  " + "  ".join(_pad(str(c), width[i]) for i, c in enumerate(r)).rstrip()
                     for r in [head] + rows)


def summarize(rows: list[dict]) -> list[list[str]]:
    """型ごとの表。**どの数にも分母を付ける。**"""
    by: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        if r["_ok"]:
            by[r["type"]].append(r)
    out = []
    order = sorted(by, key=lambda k: (-len(by[k]), k))
    for k in order + ["（全部）"]:
        rs = by[k] if k in by else [r for r in rows if r["_ok"]]
        n = len(rs)
        t = [r["text_chars"] for r in rs]
        tm = [r["text_main_chars"] for r in rs if r["text_main_chars"] != ""]
        img = sum(r["img_count"] for r in rs)
        miss = sum(r["img_alt_missing"] for r in rs)
        empty = sum(r["img_alt_empty"] for r in rs)
        im = sum(r["img_main_count"] for r in rs)
        im_no = sum(r["img_main_noalt"] for r in rs)
        out.append([
            k, str(n),
            f"{int(statistics.median(t)):,} / {min(t):,}",
            (f"{int(statistics.median(tm)):,} / {min(tm):,}" if tm else "—"),
            f"{sum(1 for r in rs if r['title_dup'])}/{n}",
            f"{sum(1 for r in rs if r['desc_dup'])}/{n}",
            f"{sum(1 for r in rs if not r['canon_self'])}/{n}",
            f"{sum(1 for r in rs if r['jsonld_count'])}/{n}",
            (f"{miss}+{empty}/{img}（{(miss + empty) * 100 // img}%）" if img else "0/0"),
            (f"{im_no}/{im}（{im_no * 100 // im}%）" if im else "0/0"),
            f"{sum(1 for r in rs if r['links_youtube'] or r['youtube_iframes'])}/{n}",
        ])
    return out


SUM_HEAD = ["型", "面", "本文字数 中央/最小", "うち main 中央/最小", "title重複", "desc重複",
            "canonical不一致", "JSON-LD", "alt 無し+空/絵", "うち main の絵", "YouTube"]


# 当たった面（か、外れた面）がこの数以下なら、数だけでなく道も言う。
# **「1/149」とだけ出すと、その1面を探すためにもう一度測ることになる**
NAME_UP_TO = 8


def tallies(rows: list[dict]) -> list[tuple[str, list[str], list[str]]]:
    """（何の数か, 当たった面の道, 分母に入った面の道）。分母は 200 で HTML を返した面。"""
    ok = [r for r in rows if r["_ok"]]

    def c(f, of=None):
        base = [r for r in ok if of(r)] if of else ok
        return [r["path"] for r in base if f(r)], [r["path"] for r in base]

    defs = [
        ("JSON-LD を持つ面", c(lambda r: r["jsonld_count"])),
        ("JSON-LD に困るところが在る面（読めない・必須の欄が無い）", c(lambda r: r["jsonld_bad"])),
        ("見えるパンくずを持つ面", c(lambda r: r["crumbs"])),
        ("`BreadcrumbList` を持つ面", c(lambda r: "BreadcrumbList" in r["_ld_types"])),
        ("パンくずは見えるのに `BreadcrumbList` が無い面",
         c(lambda r: r["crumbs"] and "BreadcrumbList" not in r["_ld_types"])),
        ("`BreadcrumbList` は在るのにパンくずが見えない面",
         c(lambda r: not r["crumbs"] and "BreadcrumbList" in r["_ld_types"])),
        ("`<time datetime>` を持つ面", c(lambda r: r["time_datetime"])),
        ("`<time>` は在るが datetime が無い面", c(lambda r: r["time_no_datetime"] and not r["time_datetime"])),
        ("canonical が在る面", c(lambda r: r["canon_count"])),
        ("canonical が2つ以上在る面", c(lambda r: r["canon_count"] > 1)),
        ("canonical が絶対 URL でない面", c(lambda r: r["canon_count"] and not r["canon_abs"])),
        ("canonical が自分の URL と一致しない面（無い面を含む）", c(lambda r: not r["canon_self"])),
        ("title が無い面", c(lambda r: not r["title_len"])),
        ("title がほかの面と同じ面", c(lambda r: r["title_dup"])),
        (f"title が {TITLE_SHORT}字未満の面（無い面を除く）", c(lambda r: 0 < r["title_len"] < TITLE_SHORT)),
        (f"title が {TITLE_LONG}字を超える面", c(lambda r: r["title_len"] > TITLE_LONG)),
        ("description が無い面", c(lambda r: not r["desc_len"])),
        ("description がほかの面と同じ面", c(lambda r: r["desc_dup"])),
        (f"description が {DESC_SHORT}字未満の面（無い面を除く）", c(lambda r: 0 < r["desc_len"] < DESC_SHORT)),
        (f"description が {DESC_LONG}字を超える面", c(lambda r: r["desc_len"] > DESC_LONG)),
        ("og:title が無い面", c(lambda r: not r["og_title"])),
        ("og:description が無い面", c(lambda r: not r["og_description"])),
        ("og:image が無い面", c(lambda r: not r["og_image"])),
        ("og:url が無い面", c(lambda r: not r["og_url"])),
        ("og:url が自分の URL と一致しない面（無い面を含む）", c(lambda r: not r["og_url_self"])),
        ("twitter:card が無い面", c(lambda r: not r["twitter_card"])),
        ("`<html lang>` が無い面", c(lambda r: not r["lang"])),
        ("noindex の面（sitemap に載っているのに）", c(lambda r: r["noindex"])),
        ("h1 が無い面", c(lambda r: r["h1_count"] == 0)),
        ("h1 が2つ以上在る面", c(lambda r: r["h1_count"] > 1)),
        ("h2 が1つも無い面", c(lambda r: r["h2_count"] == 0)),
        (f"本文が {THIN_TEXT}字未満の面", c(lambda r: r["text_chars"] < THIN_TEXT)),
        ("`<main>` が無い面", c(lambda r: r["text_main_chars"] == "")),
        ("alt の無い絵を1枚でも持つ面", c(lambda r: r["img_alt_missing"])),
        ("alt が空の絵を1枚でも持つ面", c(lambda r: r["img_alt_empty"])),
        ("main の中に、alt が無いか空の絵を1枚でも持つ面", c(lambda r: r["img_main_noalt"])),
        ("main の中の絵が、全部 alt 無しか空の面（絵が在る面のうち）",
         c(lambda r: r["img_main_noalt"] == r["img_main_count"], of=lambda r: r["img_main_count"])),
        ("YouTube へのリンクか埋め込みを持つ面", c(lambda r: r["links_youtube"] or r["youtube_iframes"])),
        ("hreflang を持つ面", c(lambda r: r["hreflang"])),
        ("RSS / Atom を名指ししている面", c(lambda r: r["feed_links"])),
        ("google-site-verification を持つ面", c(lambda r: r["gsc_verify"])),
        (f"被リンクが {ORPHAN_MAX}本以下の面（孤児）", c(lambda r: r["inbound"] <= ORPHAN_MAX)),
        ("表紙から `<a href>` で辿り着けない面", c(lambda r: r["depth"] == "")),
        ("表紙から4回以上かかる面", c(lambda r: r["depth"] != "" and r["depth"] >= 4)),
    ]
    return [(name, hit, among) for name, (hit, among) in defs]


def tally_line(name: str, hit: list[str], among: list[str], wide: int) -> str:
    """「当たった面/分母」。少ない側が数えるほどなら、その道も添える。"""
    line = f"  {_pad(name, wide)}  {len(hit)}/{len(among)}"
    miss = [p for p in among if p not in set(hit)]
    if 0 < len(hit) <= NAME_UP_TO:
        line += f"  → {', '.join(hit)}"
    elif 0 < len(miss) <= NAME_UP_TO:
        line += f"  （当たらないのは {', '.join(miss)}）"
    return line


def write_tsv(path: Path, rows: list[dict]) -> None:
    clean = lambda v: re.sub(r"[\t\r\n]+", " ", str(v))  # noqa: E731
    with path.open("w", encoding="utf-8") as f:
        f.write("\t".join(COLS) + "\n")
        for r in rows:
            f.write("\t".join(clean(r.get(c, "")) for c in COLS) + "\n")


def detail(row: dict, label: str = "") -> str:
    """1面ぶん。見出しの木（右の数は、その見出しから次の見出しまでの本文字数）・絵・リンク。"""
    p: Page = row["_page"]
    L = [f"## {label or row.get('path', '')}"]
    if "status" in row:
        L.append(f"  HTTP {row['status']}・HTML {row['html_bytes']:,}B（gzip で届くのは {row['wire_bytes']:,}B）"
                 f"・うち埋め込みスクリプト {row['inline_script_bytes']:,}B")
    L.append(f"  title（{row['title_len']}字）: {row['title']}")
    L.append(f"  description（{row['desc_len']}字）: {row['desc']}")
    L.append(f"  canonical: {row['canonical'] or '無い'} / JSON-LD: {row['jsonld_count']}個 {row['jsonld_types']}")
    L.append(f"  本文 {row['text_chars']:,}字（main の中 {format(row['text_main_chars'], ',') if row['text_main_chars'] != '' else '—'}"
             f"・SVG の中 {row['text_svg_chars']:,}・hidden の中 {row['text_hidden_chars']:,}"
             f"・閉じた畳みの中 {row['text_folded_chars']:,}）")
    L.append(f"  見出し h1 {row['h1_count']}・h2 {row['h2_count']}・h3 {row['h3_count']}"
             f"（最初の見出しより前の本文 {p.heads[0][2] if p.heads else p.text:,}字）")
    for i, (lv, text, at) in enumerate(p.heads):
        nxt = p.heads[i + 1][2] if i + 1 < len(p.heads) else p.text
        L.append(f"    {'  ' * (lv - 1)}h{lv} {text or '（字が無い）'}  …{nxt - at:,}字")
    L.append(f"  絵 {row['img_count']}枚（alt 無し {row['img_alt_missing']}・空 {row['img_alt_empty']}）"
             f"・うち main の中 {row['img_main_count']}枚（alt 無し+空 {row['img_main_noalt']}）")
    for src, alt, in_main in p.imgs:
        tag = "alt 無し" if alt is None else "alt 空" if not alt.strip() else f"alt「{alt}」"
        L.append(f"    {'main' if in_main else '外  '} {tag}  {src.split('?')[0][-70:]}")
    L.append(f"  リンク: 島の中 {row['links_internal']}本（行き先 {row['links_internal_uniq']}通り）・"
             f"外 {row['links_external']}本・うち YouTube {row['links_youtube']}本・"
             f"YouTube の埋め込み {row['youtube_iframes']}個・面の中の # {row['links_fragment']}本")
    L.append(f"  `<time datetime>` {row['time_datetime']}個（datetime の無い `<time>` {row['time_no_datetime']}個）")
    return "\n".join(L)


# ---- 入口 -------------------------------------------------------------

def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description="本番を、JS を動かさないクローラの目で読んで数える")
    ap.add_argument("--base", default=ORIGIN, help="測る先（既定は本番）")
    ap.add_argument("--sitemap", help="sitemap の URL（既定は <base>/sitemap.xml）")
    ap.add_argument("--out", help="面ごとの TSV を書く先")
    ap.add_argument("--detail", nargs="+", metavar="PATH", help="この面だけを取って、見出しの木・絵・リンクを出す")
    ap.add_argument("--html", help="落としてある HTML を測る（--as で道を言う）")
    ap.add_argument("--as", dest="as_path", default="/", help="--html の面の道")
    ap.add_argument("--alt", help="同じ中身を配っていないか見る、もう1つのドメイン（既定は、正の URL を測るときは *.web.app、*.web.app を測るときは *.firebaseapp.com）")
    ap.add_argument("--no-site", action="store_true", help="サイト全体の検査を飛ばす")
    ap.add_argument("--dist", metavar="DIR", help="手元の書き出し（`site/.next-<port>` や `dist/`）を、この道具が配って測る")
    ap.add_argument("--expect", metavar="線,線,…", help="線を引いて合否を出す（頭の表）。0=通った / 1=外れた / 2=測れなかった")
    a = ap.parse_args(argv)
    try:
        terms = parse_expect(a.expect) if a.expect else []
    except ValueError as e:
        print(f"::error::--expect が読めない（{e}）", file=sys.stderr)
        return 2
    if not a.dist:
        return run(a, a.base.rstrip("/"), terms)
    if not (Path(a.dist) / "sitemap.xml").is_file():
        print(f"::error::{a.dist} に sitemap.xml が無い（書き出しの置き場ではない）", file=sys.stderr)
        return 2
    srv, base = serve_dist(a.dist)
    try:
        return run(a, base, terms)
    finally:
        srv.shutdown()
        srv.server_close()


def run(a: argparse.Namespace, base: str, terms: list[dict]) -> int:
    host = urlsplit(base).netloc.lower()

    if a.html:
        try:
            html = Path(a.html).read_text(encoding="utf-8", errors="replace")
        except OSError as e:
            print(f"::error::{a.html} が読めない（{e}）", file=sys.stderr)
            return 2
        row = measure(html, base + a.as_path, {host})
        row.update(path=a.as_path, html_bytes=len(html.encode("utf-8")))
        print(detail(row, f"{a.as_path}（{a.html}）"))
        return 0

    if a.detail:
        got_any = False
        for path in a.detail:
            row = fetch_page(base, Entry(loc=base + path), try_html=False)
            if not row["_ok"]:
                print(f"::error::{path} が測れない（{row['status']} {row['note']}）", file=sys.stderr)
                continue
            got_any = True
            print(detail(row) + "\n")
        return 0 if got_any else 2

    sm = a.sitemap or base + "/sitemap.xml"
    entries, why = read_sitemap(sm)
    if why or not entries:
        print(f"::error::{why or sm + ' に <url> が1件も無い'}", file=sys.stderr)
        print("\n**測れませんでした。** 0面を答えとして出していません。", file=sys.stderr)
        return 2

    # 同じ URL が2回載っていても、取りに行くのは1回（載っている事実は site_checks が言う）
    seen: set[str] = set()
    uniq = [e for e in entries if not (norm_url(e.loc) in seen or seen.add(norm_url(e.loc)))]
    foreign = any(urlsplit(e.loc).netloc.lower() != host for e in uniq)
    t0 = time.time()
    with ThreadPoolExecutor(WORKERS) as ex:
        rows = list(ex.map(lambda e: fetch_page(base, e, foreign), uniq))
    ok = [r for r in rows if r["_ok"]]
    if not ok:
        for r in rows[:10]:
            print(f"::error::{r['path']}: {r['status']} {r['note']}", file=sys.stderr)
        print(f"\n**1面も測れませんでした**（sitemap は {len(uniq)}面）。0 を答えとして出していません。", file=sys.stderr)
        return 2
    extra = crosslink(rows)

    print(f"{a.dist or base} を JS なしで読んだ（{date.today().isoformat()} に測った・{time.time() - t0:.0f}秒）")
    print(f"sitemap {len(entries)}行 / 違う URL {len(uniq)}面 / **200 で HTML を返した {len(ok)}面**（以下の分母）")
    named = sorted({urlsplit(e.loc).netloc for e in uniq} - {host})
    if named:
        print(f"sitemap が名乗っているのは {', '.join(named)}。**道だけを取って、{base} に付け替えて読んだ**"
              "（canonical と og:url は、名乗っている URL と比べる）")
    print()

    bad = [r for r in rows if not r["_ok"]]
    if bad:
        print(f"== 200 で HTML が返らなかった面 {len(bad)}/{len(rows)}（下の数には入れていない） ==")
        for r in bad:
            print(f"  {r['path']}  {r['status'] or '届かない'}  {r['note']}")
        print()
    moved = [r for r in rows if r["hops"]]
    print(f"== sitemap の URL がリダイレクトされた面 {len(moved)}/{len(rows)} ==")
    for r in moved:
        print(f"  {r['path']} → {r['final_url']}（{r['hops']}回）")
    print()

    print("== 型ごと ==")
    print(table(SUM_HEAD, summarize(rows)))
    print("  （本文字数は空白を除いた字。main は頭のバーと足もとを除いた、その面だけのぶん。")
    print("    alt は「属性が無い + 空」/ `<img>` の数。YouTube は `<a>` か `<iframe>` を持つ面）\n")

    html_b = [r["html_bytes"] for r in ok]
    wire_b = [r["wire_bytes"] for r in ok]
    script_b = sum(r["inline_script_bytes"] for r in ok)
    print("== HTML の重さ ==")
    print(f"  HTML 中央 {int(statistics.median(html_b)):,}B / 最大 {max(html_b):,}B"
          f"（{max(ok, key=lambda r: r['html_bytes'])['path']}）/ 合計 {sum(html_b):,}B")
    print(f"  gzip で届く量 中央 {int(statistics.median(wire_b)):,}B / 最大 {max(wire_b):,}B"
          "（本番は br でも返す。ブラウザに届くのはこれより小さい）")
    print(f"  うち埋め込みスクリプト（`self.__next_f` など）合計 {script_b:,}B"
          f"（HTML の {script_b * 100 // max(1, sum(html_b))}%）")
    all_t, fold_t = sum(r["text_chars"] for r in ok), sum(r["text_folded_chars"] for r in ok)
    print(f"  本文の字 合計 {all_t:,}字・うち閉じた畳みの中 {fold_t:,}字（{fold_t * 100 // max(1, all_t)}%）"
          f"・畳みを持つ面 {sum(1 for r in ok if r['text_folded_chars'])}/{len(ok)}\n")

    print("== 全体の数え（当たった面 / 分母） ==")
    tl = tallies(rows)
    wide = max(_w(t[0]) for t in tl)
    for name, hit, among in tl:
        print(tally_line(name, hit, among, wide))
    print()

    for key, label in (("title", "title"), ("desc", "description")):
        groups = defaultdict(list)
        for r in ok:
            if r[f"{key}_dup"]:
                groups[r[key]].append(r["path"])
        print(f"== 同じ {label} を持つ組 {len(groups)}組（{sum(map(len, groups.values()))}/{len(ok)}面） ==")
        for text, ps in sorted(groups.items(), key=lambda kv: -len(kv[1]))[:8]:
            print(f"  {len(ps)}面「{text[:60]}」 {', '.join(ps[:6])}{' …' if len(ps) > 6 else ''}")
        print()

    orphans = sorted((r for r in ok if r["inbound"] <= ORPHAN_MAX), key=lambda r: (r["inbound"], r["path"]))
    print(f"== 孤児（ほかの面からの `<a href>` が {ORPHAN_MAX}本以下） {len(orphans)}/{len(ok)} ==")
    for r in orphans[:60]:
        print(f"  {r['inbound']}本  {r['path']}")
    if len(orphans) > 60:
        print(f"  …ほか {len(orphans) - 60}面（TSV の inbound の列）")
    inb = [r["inbound"] for r in ok]
    print(f"  被リンクの中央値 {int(statistics.median(inb))}本 / 最小 {min(inb)}本 / 最大 {max(inb)}本\n")

    off = extra["off_map"]
    print(f"== 島の中で指されているが sitemap に無い行き先 {len(off)}通り ==")
    for t, n in off.most_common(25):
        print(f"  {n}面から  {t}")
    if len(off) > 25:
        print(f"  …ほか {len(off) - 25}通り")
    print()

    sm = sitemap_facts(entries)
    print("== sitemap ==")
    for name, val in sitemap_lines(sm):
        print(f"  {name}: {val}")
    print()

    # 道具の面は、サイト全体の検査を飛ばす回でも、線（`tools-noindex`）が引いてあれば見る
    tools = None
    if not a.no_site or any(t.get("name") == "tools-noindex" for t in terms):
        tools = probe_tools(base)

    if not a.no_site:
        print("== サイト全体 ==")
        for name, val in site_checks(base, entries, rows, a.alt) + tool_lines(tools):
            print(f"  {name}: {val}")
        hl = sum(1 for r in ok if r["hreflang"])
        print(f"  hreflang: {hl}/{len(ok)}面")

    if a.out:
        write_tsv(Path(a.out), rows)
        print(f"\nTSV: {a.out}（{len(rows)}行・{len(COLS)}列）")

    if not terms:
        return 0
    verdicts = judge(terms, rows, sm, tools)
    mark = {"ok": "○", "ng": "×", "na": "？"}
    print("\n== 合否（--expect） ==")
    for raw, state, said in verdicts:
        print(f"  {mark[state]} {raw}  {said}")
    na = sum(1 for _, st, _ in verdicts if st == "na")
    ng = sum(1 for _, st, _ in verdicts if st == "ng")
    if na:
        print(f"\n**測れなかった線が {na}本。** 通ったとは言っていません（終了コード 2）。", file=sys.stderr)
        return 2
    if ng:
        print(f"\n外れた線が {ng}本（{len(verdicts) - 1}本中）。", file=sys.stderr)
        return 1
    print(f"\n{len(verdicts) - 1}本とも通った。")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
