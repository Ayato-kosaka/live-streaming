"""`seo_score.py`（採点）と `seo_page.py`（物差し）の対照。手元の口に偽の島を立てて回す（外に出ない）。

    python3 python/seo_score_selftest.py            # 足を全部と、対照（守りを1つずつ外すと、その足が落ちる）
    BREAK=unmeasured python3 python/seo_score_selftest.py   # 対照を1つだけ

足:
  節        見出しに「治安」が在れば満点、消すと 0
  測れない  動画の頁が読めない項目は「？」で 0点。満点に数えない
  飾り      `/sprites/` の絵は alt の割合に入れない（空で正しい絵）
  画像sm    sitemap の `<image:image>` をその面の絵の数として数える
  被リンク  sitemap の全面を読んで、何面から来ているか・表紙から何回か
  順位      検索の結果にうちの面が10位以内に居れば、その語は取れている
  読めない  決めた面が1つも読めなければ終了 2（0点を答えにしない）
"""

from __future__ import annotations

import contextlib
import http.server
import io
import json
import os
import subprocess
import sys
import tempfile
import threading
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

GUIDE = """<!doctype html><html lang="ja"><head><title>ソフィア観光でやりたいこと8選【2026年・地図付き】ブルガリア｜島</title>
<meta name="description" content="{desc}">
<meta name="robots" content="max-image-preview:large">
<link rel="canonical" href="https://ayato-arigato.com/travel/bulgaria/sofia">
<script type="application/ld+json">{{"@context":"https://schema.org","@type":"Article","dateModified":"2026-11-16","image":{{"@type":"ImageObject","url":"x"}}}}</script>
</head><body><main>
<h1>ソフィア</h1><p>目次</p><h2>見どころ</h2><h2>行き方</h2>{safety}<h2>モデルコース</h2><h2>物価と予算</h2>
<h2>季節と服装</h2><h2>食べもの</h2>
<p>実際に行ってきました。食べました。払いました。泊まりました。歩きました。乗りました。</p>
<img src="/guide/sofia/ソフィア-見どころマップ-1200.webp" alt="ソフィアの見どころマップ">
<img src="/sprites/hut.webp" alt="">
<a href="https://www.youtube.com/watch?v=AAAAAAAAAAA">配信</a>
<a href="/travel/bulgaria">ブルガリア</a>
</main></body></html>"""

HOME = """<!doctype html><html><head><title>島</title></head><body><main>
<a href="/travel/bulgaria/sofia">ソフィア</a><a href="/travel/bulgaria">国</a></main></body></html>"""
COUNTRY = """<!doctype html><html><head><title>ブルガリア</title></head><body><main>
<a href="/travel/bulgaria/sofia">ソフィア</a></main></body></html>"""


def sitemap(origin: str) -> str:
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
<url><loc>{origin}/</loc></url>
<url><loc>{origin}/travel/bulgaria</loc></url>
<url><loc>{origin}/travel/bulgaria/sofia</loc><image:image><image:loc>{origin}/a.webp</image:loc></image:image>
<image:image><image:loc>{origin}/b.webp</image:loc></image:image><image:image><image:loc>{origin}/c.webp</image:loc></image:image></url>
</urlset>"""


class Fake(http.server.BaseHTTPRequestHandler):
    pages: dict = {}

    def do_GET(self):  # noqa: N802
        body = self.pages.get(self.path.split("?")[0])
        if body is None:
            self.send_response(404)
            self.end_headers()
            return
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8" if not self.path.endswith(".xml") else "application/xml")
        self.end_headers()
        self.wfile.write(body.encode("utf-8"))

    def log_message(self, *a):
        pass


def load():
    import importlib

    import seo_page
    import seo_score
    importlib.reload(seo_page)
    m = importlib.reload(seo_score)
    m.YT_PAUSE = 0
    m.PAUSE = 0
    brk = os.environ.get("BREAK", "")
    if brk == "unmeasured":
        orig = m.score

        def loose(f, kind, site):
            r = orig(f, kind, site)
            for it in r["items"]:
                if it["got"] is None:
                    it["got"] = it["weight"]
            got = sum(it["got"] for it in r["items"])
            r["points"] = round(100 * got / r["full"], 1)
            return r
        m.score = loose
    if brk == "decor":
        m.DECOR_DIRS = ("/nothing/",)
    if brk == "section":
        # 見出しを見ずに「在る」と答える（本文に1回出ただけで節と数えるのと同じ外し方）
        orig_j = m.judge

        def any_text(it, f, site):
            if it.id == "safety":
                return 1.0, "在る"
            return orig_j(it, f, site)
        m.judge = any_text
    if brk == "inbound":
        m.graph_facts = lambda links: ({}, {})
    return m


def legs(m, origin: str) -> dict[str, str | None]:
    res: dict[str, str | None] = {}
    pages = [{"label": "ソフィア", "path": "/travel/bulgaria/sofia", "kind": "guide", "head": "ソフィア観光"}]
    # 検索と YouTube は外に出さない。うちの面が3位・動画の頁は読めない（429）
    m.web_serp = lambda q: [{"rank": 1, "url": "https://example.com/a"}, {"rank": 3, "url": "https://ayato-arigato.com/travel/bulgaria/sofia"}]
    m.image_serp = lambda q, n=20: [{"rank": 1, "page": "https://example.com/x"}]
    m.get = lambda url, timeout=25: (429, "")
    targets = [{"page": "/travel/bulgaria/sofia", "queries": ["ソフィア 観光"]},
               {"page": "/travel/bulgaria/sofia", "queries": ["ソフィア 地図"], "image": True}]

    def run_once(safety: bool) -> dict:
        Fake.pages["/travel/bulgaria/sofia"] = GUIDE.format(desc="あ" * 100, safety="<h2>治安</h2>" if safety else "")
        out = m.measure(origin, pages, youtube=True, targets=targets)
        return {r["id"]: r for r in out["pages"][0]["items"]} | {"_points": out["pages"][0]["points"]}

    a = run_once(True)
    b = run_once(False)
    res["節"] = None if (a["safety"]["got"] == 1 and b["safety"]["got"] == 0) else f"在る {a['safety']['got']}・無い {b['safety']['got']}"
    # 動画の頁が読めない（429）・週の表示を渡していない → どちらも「？」で、点に入らない
    yt, im = a["ytback"], a["impr"]
    res["測れない"] = None if (yt["got"] is None and im["got"] is None) else f"ytback {yt['got']}・impr {im['got']}"
    res["飾り"] = None if a["alt"]["value"] == "1/1" else f"alt の分母に飾りが入った: {a['alt']['value']}"
    res["画像sm"] = None if a["imgsm"]["value"] == "3枚" else f"sitemap の絵: {a['imgsm']['value']}"
    res["被リンク"] = None if a["inbound"]["value"] == "2面" and a["depth"]["value"] == "1回" else \
        f"被リンク {a['inbound']['value']}・深さ {a['depth']['value']}"
    res["順位"] = None if a["serp"]["value"] == "2/2語" and a["imgserp"]["value"] == "0/1語" else \
        f"順位 {a['serp']['value']}・画像 {a['imgserp']['value']}"
    # 読めない: 決めた面が 404 なら終了 2
    tmp = Path(tempfile.mkdtemp()) / "t.json"
    tmp.write_text(json.dumps({"origin": origin, "targets": [], "pages": [{"label": "無い", "path": "/nope", "kind": "guide"}]},
                              ensure_ascii=False), encoding="utf-8")
    with contextlib.redirect_stdout(io.StringIO()):
        code = m.main(["--base", origin, "--targets", str(tmp), "--no-youtube", "--no-serp"])
    res["読めない"] = None if code == 2 else f"終了 {code}（2 のはず）"
    return res


WANT = {"unmeasured": "測れない", "decor": "飾り", "section": "節", "inbound": "被リンク"}


def main() -> int:
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Fake)
    origin = f"http://127.0.0.1:{srv.server_address[1]}"
    Fake.pages = {"/": HOME, "/travel/bulgaria": COUNTRY, "/sitemap.xml": sitemap(origin)}
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        m = load()
        res = legs(m, origin)
    finally:
        srv.shutdown()
    bad = {k: v for k, v in res.items() if v}
    for k, v in res.items():
        print(f"  {'○' if not v else '×'} {k}" + (f"  {v}" if v else ""))
    brk = os.environ.get("BREAK")
    if brk:
        want = WANT[brk]
        print(f"\n対照 BREAK={brk}: 「{want}」が" + ("落ちた（見張りは効いている）" if want in bad else "**落ちなかった**"))
        return 0 if want in bad else 1
    if bad:
        print(f"\n{len(bad)}/{len(res)}本 落ちた")
        return 1
    fails = [b for b in WANT if subprocess.run([sys.executable, __file__], env={**os.environ, "BREAK": b},
                                               capture_output=True, text=True).returncode != 0]
    if fails:
        print(f"\n対照で落ちなかった: {', '.join(fails)}（見張りが空回りしている）")
        return 1
    print(f"\n{len(res)}本とも通った。対照{len(WANT)}つは、それぞれ外した守りの足が落ちた")
    return 0


if __name__ == "__main__":
    sys.exit(main())
