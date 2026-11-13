"""**検索と AI の入口を数える道具（`python/seo_audit.py`）の、線の引きかたを当てる。**

    python3 python/seo_audit_selftest.py

    BREAK=canon    python3 python/seo_audit_selftest.py  # canonical を「いつも在る」と読む足にする
    BREAK=dup      python3 python/seo_audit_selftest.py  # sitemap の重複を数えない足にする
    BREAK=lastmod  python3 python/seo_audit_selftest.py  # 更新日が1通りでも「ばらけている」と読む
    BREAK=type     python3 python/seo_audit_selftest.py  # 構造化データの型を「いつも在る」と読む
    BREAK=time     python3 python/seo_audit_selftest.py  # datetime を「いつも在る」と読む
    BREAK=zero     python3 python/seo_audit_selftest.py  # 測れなかった線を「通った」にする
    BREAK=html     python3 python/seo_audit_selftest.py  # 手元の口で `.html` を先に試さない
    BREAK=glob     python3 python/seo_audit_selftest.py  # noindex の glob を「何にでも当たる」にする

終了コード 0=通った / 1=落ちた / **2=数えるものが無い**（`docs/island-standards.md` §15）。

**本番にも外にも出ない。** 手元の空いた口（127.0.0.1）に偽の島を配って、そこへ道具を向ける。

## なぜ要るか

`seo_audit.py` は `--expect` を付けると判定器になる（配る前に手元の書き出しへ、
配ったあとに本番へ向ける）。**判定器が黙って通すようになると、
「canonical 149/149」と言いながら1面も見ていない**、がいちばん高くつく。

## 守りを1つずつ外す（偽の島のほうを壊す）

健全な偽の島では、線がぜんぶ通る。そこから**1か所だけ**壊して、
**壊した足の線だけが落ち、ほかの線は通る**ことを見る。「どれかが落ちた」では足りない
——別の線が身代わりに落ちているだけなら、その線は何も見ていない。

| 壊すところ | 落ちるはずの線 |
| --- | --- |
| `/about` の canonical を消す | `canonical=all` |
| `/kitchen/egg` の canonical を `/kitchen` に向ける | `canonical-other<=0` |
| sitemap に `/about` を2回載せる | `sitemap-dup=0` |
| sitemap の更新日を全部同じ値にする | `lastmod-distinct>=2` |
| 更新日を1つ、2999年にする | `lastmod-future=0` |
| 更新日を1つ、日付でない字にする | `lastmod-bad=0` |
| `<priority>` を付ける | `priority=0` |
| 表紙の `WebSite` を消す | `jsonld:/=WebSite` |
| `/about` の `ProfilePage` を消す | `jsonld:/about=ProfilePage+Person` |
| 表紙の `WebSite` から `name` を消す | `jsonld-bad=0` |
| `/kitchen` の `BreadcrumbList` を消す | `crumbs=jsonld` |
| `/kitchen` の `<time>` から `datetime` を消す | `time-plain<=0` |
| 道具の面を1つ、`X-Robots-Tag` なしで返す | `tools-noindex=all` |

## 測れないものを、通さない

sitemap が読めない・1面が 200 で返らない・線が名指しした面が無い・構造化データが1つも無い・
道具の面が1つも返らない・読めない線——どれも **2**。0 でも 1 でもない。

## 足を1本ずつ抜く（道具のほうを壊す）

上は「偽の島を壊して、線が落ちるか」。こちらは逆に**道具の足を折って、この見張りが
赤くなるか**（§15「対照は、足の数だけ用意する」）。頭の `BREAK=` の8本。

## `firebase.json` の noindex は、道具の面にだけ当たるか

配信ヘッダは Hosting の層なので、手元の書き出しには出ない。**配る前に分かるのは、
glob が何に当たるか**まで。ここで3つ見る:

1. 道具の面（Expo の4面・古い授賞式・OBS の部品）に当たる
2. **島の面には1枚も当たらない**（`site/app/**/page.tsx` の道ぜんぶと、動く段の見本）
3. `public/` の HTML のうち当てていないものは、**理由つきで名指ししてある**（`LEFT_OPEN`）。
   `public/` に1枚足して何も決めなければ、ここが赤くなる
"""

from __future__ import annotations

import contextlib
import http.server
import io
import json
import os
import re
import subprocess
import sys
import threading
from pathlib import Path
from urllib.parse import urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parent))

import seo_audit as SA  # noqa: E402

BREAK = os.environ.get("BREAK", "")
LEGS = ("canon", "dup", "lastmod", "type", "time", "zero", "html", "glob")
FAILED: list[str] = []
CHECKED = 0

# 待たない。向ける先は自分の口なので、連打を気にする相手がいない
SA.PAUSE = 0


def ok(name: str, got, want) -> None:
    global CHECKED
    CHECKED += 1
    if got == want:
        print(f"  ○ {name}: {got}")
        return
    FAILED.append(name)
    print(f"  ✕ {name}: {got}（欲しかったのは {want}）")


# ---- 足を抜く（対照）。本物の関数を差し替える ------------------------

if BREAK and BREAK not in LEGS:
    print(f"✕ 知らない BREAK={BREAK}（{' / '.join(LEGS)}）")
    sys.exit(2)

_measure, _facts, _types, _judge = SA.measure, SA.sitemap_facts, SA.ld_types, SA.judge

if BREAK in ("canon", "time"):
    def _bent_measure(html, public_url, hosts):
        row = _measure(html, public_url, hosts)
        if BREAK == "canon":
            row.update(canon_count=1, canon_abs=1, canon_self=1)
        else:
            row["time_datetime"] = max(1, row["time_datetime"])
        return row
    SA.measure = _bent_measure

if BREAK in ("dup", "lastmod"):
    def _bent_facts(entries, now=None):
        sm = _facts(entries, now)
        if BREAK == "dup":
            sm["dup"] = []
        else:
            sm["distinct"] = max(sm["distinct"], 2)
        return sm
    SA.sitemap_facts = _bent_facts

if BREAK == "type":
    SA.ld_types = lambda blocks: (["WebSite", "ProfilePage", "Person", "BreadcrumbList"], 0)

if BREAK == "zero":
    SA.judge = lambda *a, **k: [(raw, "ok" if st == "na" else st, said) for raw, st, said in _judge(*a, **k)]

if BREAK == "html":
    SA.is_local = lambda base: False

if BREAK == "glob":
    SA.glob_re = lambda glob: re.compile(".*")


# ---- 偽の島 -----------------------------------------------------------

# sitemap が名乗る origin。**配っている口とは別のホスト**にしておく
# （道具は `<loc>` の道だけを取って `--base` に付け替える。その足も一緒に当たる）
SAYS = "https://fake-island.example"

LD_SITE = {"@context": "https://schema.org", "@type": "WebSite", "name": "偽の島", "url": SAYS}
LD_PROFILE = {"@context": "https://schema.org", "@type": "ProfilePage", "url": f"{SAYS}/about",
              "mainEntity": {"@type": "Person", "name": "だれか"}}


def ld_crumbs(*names: str) -> dict:
    """見えるパンくずと同じ並び。いちばん奥だけ `item` を持たない"""
    return {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": i + 1, "name": n,
         **({"item": f"{SAYS}/x{i}"} if i + 1 < len(names) else {})}
        for i, n in enumerate(names)]}


def page(path: str, *, canon: str | None = "self", ld: tuple = (), crumbs: tuple = (),
         times: str = '<time datetime="2026-08-21">2026/08/21</time>') -> str:
    """偽の面1枚。`canon="self"` は自分の URL、`None` は無し、ほかはその道"""
    href = SAYS + ("" if path == "/" else path) if canon == "self" else (SAYS + canon if canon else "")
    blocks = list(ld) + ([ld_crumbs("島", *crumbs)] if crumbs else [])
    nav = ('<nav class="crumbs" aria-label="現在地"><a href="/">島</a>'
           + "".join(f"<span><i>›</i><b>{c}</b></span>" for c in crumbs) + "</nav>") if crumbs else ""
    return ("<!doctype html><html lang=\"ja\"><head><meta charset=\"utf-8\">"
            f"<title>{path} の面｜偽の島</title>"
            + (f'<link rel="canonical" href="{href}">' if href else "")
            + "</head><body><main>" + nav + f"<h1>{path}</h1><p>本文。</p>{times}"
            + "".join(f'<script type="application/ld+json">{json.dumps(b, ensure_ascii=False)}</script>'
                      for b in blocks)
            + "</main></body></html>")


def sitemap(rows: list[tuple[str, str]], extra: str = "") -> str:
    return ('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
            + "".join(f"<url><loc>{SAYS}{'' if p == '/' else p}</loc>"
                      + (f"<lastmod>{m}</lastmod>" if m else "") + extra + "</url>" for p, m in rows)
            + "</urlset>")


HTML = "text/html; charset=utf-8"
ROWS = [("/", ""), ("/about", "2026-08-01"), ("/kitchen", "2026-11-09"), ("/kitchen/egg", "2025-02-03")]
# 道具の面。**本物の `firebase.json` と `public/` から数えたもの**を、偽の島がヘッダつきで返す
WANT, LEFT = SA.tool_pages()


def island(**over) -> dict:
    """健全な偽の島。`over` で1か所だけ差し替える。

    置きかたは `python3 -m http.server` で書き出しを配ったときと同じにしてある:
    `/about` は無くて `/about.html` が在る。`/kitchen` は**下の段の置き場**でもあるので、
    301 → 置き場の一覧（200 の HTML。面ではない）。
    """
    pages = {
        "/": page("/", ld=(LD_SITE,)),
        "/about": page("/about", ld=(LD_PROFILE,), crumbs=("あやとのこと",)),
        "/kitchen": page("/kitchen", crumbs=("作った料理",)),
        "/kitchen/egg": page("/kitchen/egg", crumbs=("作った料理", "卵サンド")),
    }
    pages.update(over.get("pages", {}))
    site: dict[str, tuple] = {"/sitemap.xml": (200, "application/xml", over.get("sitemap", sitemap(ROWS)), {})}
    for path, body in pages.items():
        site["/" if path == "/" else path + ".html"] = (200, HTML, body, {})
    site["/kitchen"] = (301, HTML, "", {"Location": "/kitchen/"})
    site["/kitchen/"] = (200, HTML, "<html><head><title>Directory listing</title></head>"
                         "<body><h1>Directory listing for /kitchen/</h1></body></html>", {})
    for path in WANT:
        tag = {} if path in over.get("untagged", ()) else {"X-Robots-Tag": "noindex"}
        site[path] = (200, HTML, "<html><body>道具</body></html>", tag)
    for path in over.get("drop", ()):
        site.pop(path, None)
    site.update(over.get("raw", {}))
    return site


class Fake(http.server.BaseHTTPRequestHandler):
    site: dict = {}

    def _answer(self, with_body: bool) -> None:
        st, ctype, body, heads = self.site.get(urlsplit(self.path).path, (404, HTML, "<h1>404</h1>", {}))
        data = body.encode("utf-8")
        self.send_response(st)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        for k, v in heads.items():
            self.send_header(k, v)
        self.end_headers()
        if with_body:
            self.wfile.write(data)

    def do_GET(self):  # noqa: N802
        self._answer(True)

    def do_HEAD(self):  # noqa: N802
        self._answer(False)

    def log_message(self, *args):
        pass


SRV = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Fake)
threading.Thread(target=SRV.serve_forever, daemon=True).start()
BASE = f"http://127.0.0.1:{SRV.server_address[1]}"

# 健全な偽の島で、ぜんぶ通るはずの線
LINES = ["canonical=all", "canonical-other<=0", "sitemap-dup=0", "priority=0", "lastmod-distinct>=2",
         "lastmod-future=0", "lastmod-bad=0", "jsonld:/=WebSite", "jsonld:/about=ProfilePage+Person",
         "jsonld-bad=0", "crumbs=jsonld", "time-plain<=0", "tools-noindex=all"]


def run(site: dict, lines: list[str] | None = None) -> tuple[int, list[str], list[str]]:
    """道具を偽の島へ向ける。（終了コード, 落ちた線, 測れなかった線）"""
    Fake.site = site
    out, err = io.StringIO(), io.StringIO()
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        code = SA.main(["--base", BASE, "--no-site", "--expect", ",".join(lines or LINES)])
    marks = re.findall(r"^  ([○×？]) (\S+)  ", out.getvalue().split("== 合否（--expect） ==")[-1], re.M)
    return code, [t for m, t in marks if m == "×"], [t for m, t in marks if m == "？"]


# ---- 1. 健全な偽の島 --------------------------------------------------

print("[1] 健全な偽の島では、線がぜんぶ通る")
if not WANT:
    print("✕ `firebase.json` から、noindex を付ける道具の面が1つも読めない。数えられないので 2 で止めます")
    sys.exit(2)
code, ng, na = run(island())
ok("終了コード", code, 0)
ok("落ちた線", ng, [])
ok("測れなかった線", na, [])


# ---- 2. 守りを1つずつ外す ---------------------------------------------

print("[2] 守りを1つ外すと、その足の線だけが落ちる")
P = island  # 短く書くため
FAULTS: list[tuple[str, dict, str]] = [
    ("canonical 無し", {"pages": {"/about": page("/about", canon=None, ld=(LD_PROFILE,), crumbs=("あやとのこと",))}},
     "canonical=all"),
    ("canonical が別の面", {"pages": {"/kitchen/egg": page("/kitchen/egg", canon="/kitchen", crumbs=("作った料理", "卵サンド"))}},
     "canonical-other<=0"),
    ("sitemap の重複", {"sitemap": sitemap(ROWS + [("/about", "2026-08-01")])}, "sitemap-dup=0"),
    ("更新日が1通り", {"sitemap": sitemap([(p, "2026-11-13T13:43:09.000Z") for p, _ in ROWS])}, "lastmod-distinct>=2"),
    ("更新日が未来", {"sitemap": sitemap(ROWS[:3] + [("/kitchen/egg", "2999-01-01")])}, "lastmod-future=0"),
    ("更新日が読めない", {"sitemap": sitemap(ROWS[:3] + [("/kitchen/egg", "きのう")])}, "lastmod-bad=0"),
    ("priority つき", {"sitemap": sitemap(ROWS, "<priority>0.8</priority>")}, "priority=0"),
    ("`WebSite` 無し", {"pages": {"/": page("/")}}, "jsonld:/=WebSite"),
    ("`ProfilePage` 無し", {"pages": {"/about": page("/about", crumbs=("あやとのこと",))}},
     "jsonld:/about=ProfilePage+Person"),
    ("必須の欄が無い", {"pages": {"/": page("/", ld=({k: v for k, v in LD_SITE.items() if k != "name"},))}},
     "jsonld-bad=0"),
    ("`BreadcrumbList` 無し", {"pages": {"/kitchen": page("/kitchen").replace(
        "<h1>", '<nav class="crumbs" aria-label="現在地"><a href="/">島</a></nav><h1>')}}, "crumbs=jsonld"),
    ("`datetime` 無し", {"pages": {"/kitchen": page("/kitchen", crumbs=("作った料理",), times="<time>2026/08/21</time>")}},
     "time-plain<=0"),
    ("道具の面に noindex 無し", {"untagged": (WANT[0],)}, "tools-noindex=all"),
]
for name, over, line in FAULTS:
    code, ng, na = run(P(**over))
    ok(f"{name} → 終了コード 1 で、落ちるのは {line} だけ", (code, ng, na), (1, [line], []))


# ---- 3. 測れないものを、通さない --------------------------------------

print("[3] 測れなかったら 2（0 でも 1 でもない）")
ok("sitemap が読めない", run(P(drop=("/sitemap.xml",)))[0], 2)
ok("sitemap に <url> が1件も無い", run(P(sitemap=sitemap([])))[0], 2)
# 500 にしない。道具は 5xx を「向こうの一時的な不調」と見て間を空けてやり直すので、見張りが9秒伸びる
code, ng, na = run(P(raw={"/about.html": (410, HTML, "<h1>410</h1>", {})}))
ok("1面が 200 で返らない → 読めた面の線が「測れない」", (code, "（読めた面）" in na), (2, True))
code, ng, na = run(P(), ["canonical=all", "jsonld:/nope=WebSite"])
ok("線が名指しした面が sitemap に無い", (code, na), (2, ["jsonld:/nope=WebSite"]))
bare = {p: page(p, crumbs=() if p == "/" else ("どこか",)).replace('<script type="application/ld+json">', "<script>")
        for p, _ in ROWS}
code, ng, na = run(P(pages=bare), ["canonical=all", "jsonld-bad=0"])
ok("構造化データが1つも無いとき、`jsonld-bad=0` は通らない", (code, na), (2, ["jsonld-bad=0"]))
code, ng, na = run(P(pages={p: page(p, ld=(LD_SITE,)) for p, _ in ROWS}), ["canonical=all", "crumbs=jsonld"])
ok("見えるパンくずが1つも無いとき、`crumbs=jsonld` は通らない", (code, na), (2, ["crumbs=jsonld"]))
code, ng, na = run(P(drop=tuple(WANT)), ["canonical=all", "tools-noindex=all"])
ok("道具の面が1つも返らないとき、`tools-noindex=all` は通らない", (code, na), (2, ["tools-noindex=all"]))
with contextlib.redirect_stderr(io.StringIO()):
    ok("読めない線は、測る前に 2", SA.main(["--base", BASE, "--expect", "canonical"]), 2)
    ok("知らない線も 2", SA.main(["--base", BASE, "--expect", "h1=all"]), 2)
    ok("置き場でない所を `--dist` に渡すと 2", SA.main(["--dist", str(Path(__file__).parent), "--expect", "canonical=all"]), 2)


# ---- 4. 手元の口の読み替え --------------------------------------------

print("[4] 手元の口では `.html` を先に試す（置き場の一覧を面として測らない）")
Fake.site = island()
row = SA.fetch_page(BASE, SA.Entry(loc=f"{SAYS}/kitchen"), True)
ok("/kitchen は置き場の一覧ではなく、面のほうを読む", (row["_ok"], row.get("h1_text"), row.get("canon_self")),
   (True, "/kitchen", 1))
ok("sitemap が名乗る URL のまま比べている（付け替えた先とは比べない）", row["url"], f"{SAYS}/kitchen")


# ---- 5. 数えかたの部品 ------------------------------------------------

print("[5] 部品")
NOW = SA.datetime(2026, 11, 13, 20, 0, tzinfo=SA.timezone.utc)
ok("日付だけの更新日は日で比べる（きょうは未来ではない）", SA.lastmod_state("2026-11-13", NOW), "ok")
ok("あしたは未来", SA.lastmod_state("2026-11-14", NOW), "future")
ok("時刻つきは時刻で比べる", SA.lastmod_state("2026-11-13T21:00:00Z", NOW), "future")
ok("時差つきも読む", SA.lastmod_state("2026-11-14T00:00:00+09:00", NOW), "ok")
ok("暦に無い日は読めない", SA.lastmod_state("2026-02-30", NOW), "bad")
ok("パンくずの途中の段に item が無いと困る",
   len(SA.ld_problems([json.dumps({**ld_crumbs("島", "a", "b"), "itemListElement": [
       {"@type": "ListItem", "position": 1, "name": "島"},
       {"@type": "ListItem", "position": 2, "name": "a", "item": "x"},
       {"@type": "ListItem", "position": 3, "name": "b"}]})])), 1)
ok("いちばん奥の段は item が無くてよい", SA.ld_problems([json.dumps(ld_crumbs("島", "a", "b"))]), [])
ok("`@context` が無いと困る", len(SA.ld_problems([json.dumps({"@type": "WebSite", "name": "x", "url": "y"})])), 1)
ok("JSON として読めないと困る", len(SA.ld_problems(["{"])), 1)


# ---- 6. firebase.json の noindex --------------------------------------

print("[6] `firebase.json` の noindex は、道具の面にだけ当たる")

# `public/` の HTML のうち、noindex を**付けないと決めてある**面。理由を書く。
# ここに無い面が「付けていない側」に出たら赤くなる（＝決め忘れ）。
LEFT_OPEN = {
    "/nordic/review": "北欧旅のふりかえり。`/nordic` から `<a>` で送っている、視聴者さんが読む面"
                      "（道具ではない。島の面として扱うかは次の便で決める。2026-11-13）",
    "/nanitabeyo-improvement-theme-survey": "なに食べよの利用者に答えてもらうアンケート。OBS の道具ではなく、"
                                            "人が開いて読む面（別サービスの面をどう扱うかは未定。2026-11-13）",
}
MUST = ["/alertbox", "/daily_user_stats", "/ve-comment", "/ve-postit", "/expo-app",
        "/202601_donation_ceremony", "/202610_monthly_review", "/202610_monthly_review_v2",
        "/alert/probe", "/alert/perf", "/donut-progress"]
conf = json.loads((SA.ROOT / "firebase.json").read_text(encoding="utf-8"))
try:
    rules = SA.noindex_rules(conf)
except ValueError as e:
    rules = []
    ok("noindex の glob が読める", str(e), "")
hits = lambda path: any(r.match(path) for r in rules)  # noqa: E731
if not rules:
    print("✕ `firebase.json` に `X-Robots-Tag: noindex` の行が1つも無い。数えられないので 2 で止めます")
    sys.exit(2)
ok("道具の面に当たる", [p for p in MUST if not hits(p)], [])
ok("拡張子つきで来ても当たる（`cleanUrls` が 301 する前の道）",
   [p for p in ("/202610_monthly_review.html", "/expo-app.html", "/alert/probe.html", "/alertbox/x") if not hits(p)], [])
ok("付けていない `public/` の面は、理由つきで名指ししてある", LEFT, sorted(LEFT_OPEN))
ok("その面の部品（`/review/**`）にも当てていない", [p for p in ("/review/manifest.json", "/review/c/x.webp") if hits(p)], [])

APP = SA.ROOT / "site" / "app"
routes = sorted({"/" + ("" if f.parent == APP else f.parent.relative_to(APP).as_posix())
                 for f in APP.rglob("page.tsx") if "[" not in f.as_posix()})
moving = ["/months/2026-10", "/kitchen/egg-sandwich", "/travel/france", "/apps/nanitabeyo", "/legends/nordic",
          "/streams/cooking", "/island/europe", "/island/europe/streams", "/nordic/day/1", "/travel/sweden",
          "/sitemap.xml", "/robots.txt", "/og.png", "/_next/static/chunks/x.js", "/island-api/state"]
if len(routes) < 20:
    print(f"✕ 島の面が {len(routes)}枚しか見つからない（`site/app/**/page.tsx`）。数えられないので 2 で止めます")
    sys.exit(2)
ok(f"島の面（{len(routes)}枚）と動く段の見本（{len(moving)}本）には、1つも当たらない",
   [p for p in routes + moving if hits(p)], [])
if not BREAK:
    try:
        SA.glob_re("/x?(.html)")
        ok("読めない glob は、当てずに落とす", "落ちなかった", "ValueError")
    except ValueError:
        ok("読めない glob は、当てずに落とす", "ValueError", "ValueError")

SRV.shutdown()
SRV.server_close()


# ---- 7. 対照（この見張りが、落ちるときに落ちるか） -------------------

if not BREAK:
    print("[7] 対照（道具の足を1本ずつ抜くと、ここが赤くなるか）")
    bad = []
    for leg in LEGS:
        r = subprocess.run([sys.executable, str(Path(__file__).resolve())],
                           capture_output=True, text=True, env=dict(os.environ, BREAK=leg),
                           timeout=300, check=False)
        mark = "○" if r.returncode == 1 else "✕"
        if r.returncode != 1:
            bad.append(leg)
        print(f"  {mark} BREAK={leg} → 終了コード {r.returncode}（1 ならよい）")
    if bad:
        FAILED.append("対照: " + " / ".join(bad) + " を抜いても赤くならない")
    CHECKED += len(LEGS)


# ---- まとめ ----------------------------------------------------------

print()
if CHECKED == 0:
    print("✕ 1つも数えなかった。**「通りました」とは言わない**")
    sys.exit(2)
if FAILED:
    print(f"✕ {CHECKED}件みて、{len(FAILED)}件 落ちた")
    for n in FAILED:
        print(f"   - {n}")
    sys.exit(1)
print(f"○ {CHECKED}件ぜんぶ通った")
sys.exit(0)
