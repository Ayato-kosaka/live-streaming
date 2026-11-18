"""**週の表の道具（`python/seo_weekly.py`）が、数を正しく束ね、読めなかったものを 0 と書かないかを当てる。**

    python3 python/seo_weekly_selftest.py

    BREAK=norm    python3 python/seo_weekly_selftest.py   # 語の空白を揃えない（言い換えが束ならない）
    BREAK=zero    python3 python/seo_weekly_selftest.py   # 行の無い語を「0」と書く
    BREAK=swallow python3 python/seo_weekly_selftest.py   # 読めなかった API を「行が無い」として飲み込む
    BREAK=frag    python3 python/seo_weekly_selftest.py   # 面の錨（#see-…）を別の面として数える

終了コード 0=通った / 1=落ちた / **2=数えるものが無い**（`docs/island-standards.md` §15）。

**外に出ない。** 手元の口（127.0.0.1）に偽の Search Console・偽の本番の sitemap・偽の GitHub を立てる。

## 足（どれも1本ずつ回す）

| 足 | 偽の側でやること | 当たるはずのこと |
| --- | --- | --- |
| 束ねる | 「ソフィア 観光 マップ」と「ソフィア観光マップ」を別の行で返す | 1語にまとめて 表示 4・順位 14.0位（表示で重み付け） |
| 行なし | 狙う語に行を返さない | 「—」（0 と書かない） |
| 人の語 | 狙う語以外に人の名前らしい語を混ぜる | 語は1つも出さず、数だけ |
| 錨 | 同じ面を `#see-x` 付きでも返す | 1面に束ねる |
| 載った面 | URL 検査で2面だけ PASS、表紙は Google の正が別 | 2/4・前週は前のコメントの印から・表紙の正を名指し |
| 読めない | searchAnalytics が 403 | 「読めなかった」と書き、終了コード 1 |
| 鍵なし | 鍵が読めない | 数を1つも書かず、終了コード 2 |
| 検査 403 | URL 検査が 403 | 1回で止め、載った面の節を「読めなかった」に |
| 書く | dry-run でない | 偽の GitHub に1コメント（印つき） |
| 合否 | seo_audit の出力に × の行 | 「外れた」を名指し |

## 対照

`BREAK=` で道具の守りを1つずつ外し、**外した足が落ちる**ことを見る（全部の足を回して、落ちた足の名前で当てる）。
"""

from __future__ import annotations

import contextlib
import io
import json
import os
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

HERE = Path(__file__).resolve().parent


class Fake:
    """偽の向こう側。足ごとに `mode` を変える"""

    def __init__(self) -> None:
        self.mode: set[str] = set()
        self.posts: list[dict] = []
        self.inspects = 0
        self.origin = ""

    # 週の判定は startDate で（この週は 2026-11-09 始まり。対照の today=2026-11-18）
    def rows(self, body: dict) -> list[dict]:
        week = "now" if body["startDate"] == "2026-11-09" else ("prev" if body["startDate"] == "2026-11-02" else "d28")
        dims, kind = body.get("dimensions") or [], body.get("type", "web")
        o = self.origin
        if not dims:
            return [{"clicks": 1, "impressions": 10, "position": 11.0}] if week != "prev" else []
        if dims == ["query"] and kind == "web":
            if week == "now":
                return [
                    {"keys": ["ソフィア 観光 マップ"], "clicks": 0, "impressions": 3, "position": 12.0},
                    {"keys": ["ソフィア観光マップ"], "clicks": 1, "impressions": 1, "position": 20.0},
                    {"keys": ["やまだたろう あやと"], "clicks": 0, "impressions": 5, "position": 4.0},
                    {"keys": ["おしんこ"], "clicks": 0, "impressions": 1, "position": 44.0},
                ]
            return [{"keys": ["ソフィア 観光 マップ"], "clicks": 0, "impressions": 1, "position": 30.0}]
        if dims == ["page"]:
            if week == "now":
                return [
                    {"keys": [f"{o}/travel/bulgaria/sofia"], "clicks": 0, "impressions": 2, "position": 9.0},
                    {"keys": [f"{o}/travel/bulgaria/sofia#see-x"], "clicks": 0, "impressions": 1, "position": 12.0},
                ]
            return []
        if dims == ["query"] and kind == "image":
            if week == "now":
                return [
                    {"keys": ["ソフィア 見どころマップ"], "clicks": 0, "impressions": 2, "position": 5.0},
                    {"keys": ["ソフィア 見どころマップ 地区"], "clicks": 0, "impressions": 1, "position": 8.0},
                ]
            return []
        return []

    def inspect(self, url: str) -> dict:
        path = urlsplit(url).path or "/"
        if path in ("/travel/bulgaria/sofia", "/"):
            st = {"verdict": "PASS", "coverageState": "Submitted and indexed", "lastCrawlTime": "2026-11-18T01:00:00Z"}
            if path == "/":
                st |= {"googleCanonical": "https://old.example/", "userCanonical": f"{self.origin}/"}
            return st
        return {"verdict": "NEUTRAL", "coverageState": "Crawled - currently not indexed"}


def serve(fake: Fake) -> tuple[ThreadingHTTPServer, str]:
    class H(BaseHTTPRequestHandler):
        def log_message(self, *a):  # noqa: D401
            pass

        def _send(self, code: int, obj, ctype="application/json") -> None:
            raw = obj.encode() if isinstance(obj, str) else json.dumps(obj).encode()
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)

        def _body(self) -> dict:
            n = int(self.headers.get("Content-Length") or 0)
            return json.loads(self.rfile.read(n) or b"{}")

        def do_GET(self):  # noqa: N802
            p = unquote(self.path)
            if p == "/sitemap.xml":
                locs = "".join(f"<url><loc>{fake.origin}{x}</loc></url>"
                               for x in ("", "/travel", "/travel/bulgaria", "/travel/bulgaria/sofia"))
                return self._send(200, f'<?xml version="1.0"?><urlset>{locs}</urlset>', "application/xml")
            if p.endswith("/sitemaps"):
                return self._send(200, {"sitemap": [{"path": f"{fake.origin}/sitemap.xml",
                                                      "lastDownloaded": "2026-11-18T03:00:00Z", "errors": "0",
                                                      "warnings": "0", "contents": [{"submitted": "4"}]}]})
            if "/issues/1262/comments" in p:
                return self._send(200, [{"body": 'x\n<!-- seo-weekly v1 {"indexed": 1, "inspected": 4, "end": "2026-11-08"} -->'}])
            return self._send(404, {"error": {"message": "no"}})

        def do_POST(self):  # noqa: N802
            p = unquote(self.path)
            body = self._body()
            if p.endswith("/searchAnalytics/query"):
                if "sa403" in fake.mode:
                    return self._send(403, {"error": {"message": "User does not have sufficient permission"}})
                return self._send(200, {"rows": fake.rows(body)} if fake.rows(body) else {})
            if p.endswith("/urlInspection/index:inspect"):
                fake.inspects += 1
                if "insp403" in fake.mode:
                    return self._send(403, {"error": {"message": "forbidden"}})
                return self._send(200, {"inspectionResult": {"indexStatusResult": fake.inspect(body["inspectionUrl"])}})
            if "/issues/1262/comments" in p:
                fake.posts.append(body)
                return self._send(201, {"html_url": "https://example/c/1"})
            return self._send(404, {"error": {"message": "no"}})

    srv = ThreadingHTTPServer(("127.0.0.1", 0), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, f"http://127.0.0.1:{srv.server_address[1]}"


def load(base: str):
    os.environ["SEO_WEEKLY_API_BASE"] = base
    os.environ["GITHUB_API_URL"] = base
    sys.path.insert(0, str(HERE))
    import importlib

    import seo_weekly
    m = importlib.reload(seo_weekly)
    m.INSPECT_PAUSE = 0
    # 点数（8節）は本番・YouTube・検索の結果を読みに行くので切る。採点そのものの対照は seo_score_selftest.py
    m.SCORE = False
    brk = os.environ.get("BREAK", "")
    if brk == "norm":
        m.norm_q = lambda s: s
    if brk == "zero":
        orig = m.cell
        m.cell = lambda a, b, k: orig(a, b, k).replace("—", "0")
    if brk == "swallow":
        q = m.Console.query

        def swallow(self, *a, **k):
            try:
                return q(self, *a, **k)
            except m.Unread:
                return []
        m.Console.query = swallow
    if brk == "frag":
        m.norm_path = lambda url, origin: (urlsplit(url).path or "/") + (("#" + urlsplit(url).fragment) if urlsplit(url).fragment else "")
    return m


def run(m, fake: Fake, args: list[str], token: str = "tok", env: dict | None = None) -> tuple[int, str]:
    tmp = Path(tempfile.mkdtemp())
    cfg = json.loads((HERE / "data" / "seo_targets.json").read_text(encoding="utf-8"))
    cfg["origin"] = fake.origin
    (tmp / "t.json").write_text(json.dumps(cfg, ensure_ascii=False), encoding="utf-8")
    os.environ["SEO_WEEKLY_FAKE_TOKEN"] = token
    os.environ["GITHUB_TOKEN"] = "gh"
    os.environ["GITHUB_REPOSITORY"] = "o/r"
    os.environ.pop("GITHUB_STEP_SUMMARY", None)
    for k, v in (env or {}).items():
        os.environ[k] = v
    out, err = io.StringIO(), io.StringIO()
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        code = m.main(["--today", "2026-11-18", "--targets", str(tmp / "t.json"), *args])
    return code, out.getvalue()


def legs(m, fake: Fake) -> dict[str, str | None]:
    """足ごとに、落ちたら理由（通れば None）"""
    res: dict[str, str | None] = {}

    def leg(name: str, cond: bool, why: str) -> None:
        res[name] = None if cond else why

    fake.mode = set()
    code, out = run(m, fake, ["--dry-run"])
    row = next((ln for ln in out.splitlines() if ln.startswith("| ソフィア 観光 マップ／地図 |")), "")
    leg("束ねる", "4（前週 1）" in row and "14.0位（前週 30.0位）" in row, f"束ねた行が違う: {row!r}")
    yog = next((ln for ln in out.splitlines() if ln.startswith("| ブルガリア ヨーグルト 本場 |")), "")
    leg("行なし", yog.endswith("| — | — | — |") and "| 0" not in yog, f"行の無い語: {yog!r}")
    leg("人の語", "やまだたろう" not in out and "この週 2語" in out, "狙う語以外の語が出たか、数が違う")
    sofia = next((ln for ln in out.splitlines() if ln.startswith("| ソフィア `/travel/bulgaria/sofia` |")), "")
    leg("錨", sofia.count("3（前週 —）") == 1 and "載っている" in sofia, f"面の行: {sofia!r}")
    leg("内訳", "載っている内訳: Submitted and indexed 2" in out and "載っていない理由: Crawled - currently not indexed 2" in out,
        "載った面の内訳が違う")
    leg("載った面", "載っている **2/4**（前週 1/4" in out and "`/` → https://old.example/" in out
        and '"indexed": 2' in out, "載った面の節が違う")
    img = next((ln for ln in out.splitlines() if ln.startswith("| 「見どころマップ」を含む語 |")), "")
    leg("画像", img.startswith("| 「見どころマップ」を含む語 | 3（前週 —）"), f"画像の行: {img!r}")
    leg("全部読めた", code == 0 and "読めなかった" not in out, f"終了コード {code}")

    fake.mode = {"sa403"}
    code, out = run(m, fake, ["--dry-run"])
    row = next((ln for ln in out.splitlines() if ln.startswith("| ソフィア 観光 マップ／地図 |")), "")
    leg("読めない", code == 1 and "読めなかった（前週 読めなかった）" in row and "HTTP 403" in out,
        f"終了コード {code}・行 {row!r}")

    fake.mode = set()
    code, out = run(m, fake, ["--dry-run"], token="")
    nums = [ln for ln in out.splitlines() if ln.startswith("| 表示 |")]
    leg("鍵なし", code == 2 and "**読めなかった**" in out and nums and "読めなかった" in nums[0]
        and "| 10 |" not in out, f"終了コード {code}")

    fake.mode = {"insp403"}
    fake.inspects = 0
    code, out = run(m, fake, ["--dry-run"])
    leg("検査403", code == 1 and fake.inspects == 1 and "**読めなかった**（URL 検査）" in out,
        f"終了コード {code}・検査 {fake.inspects}回")

    fake.mode = set()
    fake.posts = []
    code, out = run(m, fake, [])
    leg("書く", code == 0 and len(fake.posts) == 1 and "<!-- seo-weekly v1 " in fake.posts[0]["body"],
        f"終了コード {code}・書いた {len(fake.posts)}本")

    tmp = Path(tempfile.mkdtemp()) / "a.txt"
    tmp.write_text("…\n== 合否（--expect） ==\n  ○ （読めた面）  4/4\n  × title-short<=5  9/143\n"
                   "  ○ canonical=all  4/4\n\n外れた線が 1本\n", encoding="utf-8")
    code, out = run(m, fake, ["--dry-run", "--audit", str(tmp)])
    leg("合否", "通った 2本・**外れた／測れなかった 1本**" in out and "- × title-short<=5" in out, "合否の節が違う")
    return res


def main() -> int:
    fake = Fake()
    srv, base = serve(fake)
    fake.origin = base
    try:
        m = load(base)
        res = legs(m, fake)
    finally:
        srv.shutdown()
    if not res:
        print("足が1本も回らなかった")
        return 2
    bad = {k: v for k, v in res.items() if v}
    for k, v in res.items():
        print(f"  {'○' if not v else '×'} {k}" + (f"  {v}" if v else ""))
    brk = os.environ.get("BREAK")
    if brk:
        # 対照: 外した守りに対応する足が落ちていれば「見張りは効いている」
        want = {"norm": "束ねる", "zero": "行なし", "swallow": "読めない", "frag": "錨"}[brk]
        print(f"\n対照 BREAK={brk}: 「{want}」が" + ("落ちた（見張りは効いている）" if want in bad else "**落ちなかった**"))
        return 0 if want in bad else 1
    if bad:
        print(f"\n{len(bad)}/{len(res)}本 落ちた")
        return 1
    # 対照を子で回す（守りを外すと、その足が落ちること）
    import subprocess
    fails = []
    for b in ("norm", "zero", "swallow", "frag"):
        r = subprocess.run([sys.executable, __file__], env={**os.environ, "BREAK": b}, capture_output=True, text=True)
        if r.returncode != 0:
            fails.append(b)
    if fails:
        print(f"\n対照で落ちなかった: {', '.join(fails)}（見張りが空回りしている）")
        return 1
    print(f"\n{len(res)}本とも通った。対照4つは、それぞれ外した守りの足が落ちた")
    return 0


if __name__ == "__main__":
    sys.exit(main())
