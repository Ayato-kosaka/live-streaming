"""**配ったあとの知らせ（`python/indexnow.py`）が、変わった面だけを送り、断られたら控えを書かないかを当てる。**

    python3 python/indexnow_selftest.py

    BREAK=script  python3 python/indexnow_selftest.py   # `<script>` の中も指紋に入れる（配るたびに全部「変わった」）
    BREAK=gone    python3 python/indexnow_selftest.py   # sitemap から消えた面を送らない
    BREAK=keep    python3 python/indexnow_selftest.py   # 断られても控えを書く（次の回に送り直さない）
    BREAK=key     python3 python/indexnow_selftest.py   # 本番の鍵のファイルを確かめずに送る

終了コード 0=通った / 1=落ちた / **2=数えるものが無い**（`docs/island-standards.md` §15）。

**外に出ない。** 手元の口に偽の島（sitemap・面・鍵のファイル）と偽の IndexNow を立てる。
偽の sitemap の `<loc>` は配っている口と別のホスト（`island.example`）にしてある。道具は `<loc>` の道を
`--base` に付け替えて取りに行くので、その足も一緒に当たる。

## 足

| 足 | 偽の側でやること | 当たるはずのこと |
| --- | --- | --- |
| 初回 | 控えが無い | sitemap の全面を1回で送る。控えを書く |
| 変わらない | 束の名前（`<script>`）だけ変えて配り直す | 1面も送らない |
| 1面 | 1面の `<main>` の字を変える | その1面だけ送る |
| 消えた | sitemap から1面を外す（404） | その面を送る |
| 断られた | IndexNow が 403 | 終了コード 1・控えを書かない（次に同じ面を送り直す） |
| 鍵が無い | 本番の鍵のファイルが 404 | 終了コード 2・送らない |
| 送る形 | — | `host` は sitemap のホスト・`keyLocation` は `https://<host>/<鍵>.txt` |
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

HERE = Path(__file__).resolve().parent
KEY = "0123456789abcdef0123456789abcdef"
HOST = "island.example"


class Island:
    def __init__(self) -> None:
        self.pages = {"/": "表紙", "/a": "Aの面", "/b": "Bの面", "/c": "Cの面"}
        self.build = "b1"
        self.key_served = True
        self.reply = 200
        self.posts: list[dict] = []

    def html(self, path: str) -> str:
        return (f"<html><head><title>{path}</title><meta name=description content='d{path}'>"
                f"<link rel=canonical href='https://{HOST}{path}'><script src='/_next/{self.build}.js'></script></head>"
                f"<body><header>島</header><main><h1>{self.pages[path]}</h1><p>本文</p>"
                f"<script>self.__next_f.push([1,'{self.build}'])</script></main></body></html>")


def serve(isl: Island) -> tuple[ThreadingHTTPServer, str]:
    class H(BaseHTTPRequestHandler):
        def log_message(self, *a):  # noqa: D401
            pass

        def _send(self, code: int, text: str, ctype: str = "text/html") -> None:
            raw = text.encode()
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)

        def do_GET(self):  # noqa: N802
            p = self.path
            if p == "/sitemap.xml":
                locs = "".join(f"<url><loc>https://{HOST}{x if x != '/' else ''}</loc></url>" for x in isl.pages)
                return self._send(200, f"<urlset>{locs}</urlset>", "application/xml")
            if p == f"/{KEY}.txt":
                return self._send(200 if isl.key_served else 404, KEY if isl.key_served else "", "text/plain")
            if p in isl.pages:
                return self._send(200, isl.html(p))
            if p == "" or p == "/":
                return self._send(200, isl.html("/"))
            return self._send(404, "")

        def do_POST(self):  # noqa: N802
            n = int(self.headers.get("Content-Length") or 0)
            isl.posts.append(json.loads(self.rfile.read(n)))
            return self._send(isl.reply, "", "text/plain")

    srv = ThreadingHTTPServer(("127.0.0.1", 0), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, f"http://127.0.0.1:{srv.server_address[1]}"


def load(base: str):
    os.environ["INDEXNOW_ENDPOINT"] = base + "/indexnow"
    sys.path.insert(0, str(HERE))
    import importlib

    import indexnow
    m = importlib.reload(indexnow)
    brk = os.environ.get("BREAK", "")
    if brk == "script":
        m.SKIP = {"style"}
    if brk == "gone":
        orig = m.changed
        m.changed = lambda prev, now, urls: [u for u in orig(prev, now, urls) if u in now]
    if brk == "keep":
        orig_n = m.notify
        m.notify = lambda *a: (True, "受けた") if orig_n(*a)[0] or True else None
    if brk == "key":
        orig_get = m.get
        m.get = lambda url, timeout=30: (200, KEY) if url.endswith(f"/{KEY}.txt") else orig_get(url, timeout)
    return m


def run(m, base: str, state: Path, pub: Path, *extra: str) -> tuple[int, str]:
    out = io.StringIO()
    os.environ.pop("GITHUB_STEP_SUMMARY", None)
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(out):
        code = m.main(["--state", str(state), "--base", base, "--public", str(pub), *extra])
    return code, out.getvalue()


def legs(m, isl: Island, base: str) -> dict[str, str | None]:
    res: dict[str, str | None] = {}

    def leg(name: str, cond: bool, why: str) -> None:
        res[name] = None if cond else why

    tmp = Path(tempfile.mkdtemp())
    pub = tmp / "public"
    pub.mkdir()
    (pub / f"{KEY}.txt").write_text(KEY + "\n", encoding="utf-8")
    (pub / "robots.txt").write_text("User-agent: *\n", encoding="utf-8")
    state = tmp / "s" / "state.json"
    paths = lambda: [u.replace(f"https://{HOST}", "") or "/" for u in (isl.posts[-1]["urlList"] if isl.posts else [])]  # noqa: E731

    isl.posts = []
    code, out = run(m, base, state, pub)
    leg("初回", code == 0 and len(isl.posts) == 1 and sorted(paths()) == ["/", "/a", "/b", "/c"] and state.exists(),
        f"終了 {code}・送った {paths()}")
    body = isl.posts[-1] if isl.posts else {}
    leg("送る形", body.get("host") == HOST and body.get("keyLocation") == f"https://{HOST}/{KEY}.txt"
        and body.get("key") == KEY, f"送った形 {({k: v for k, v in body.items() if k != 'urlList'})}")

    isl.posts = []
    isl.build = "b2"
    code, out = run(m, base, state, pub)
    leg("変わらない", code == 0 and not isl.posts, f"終了 {code}・送った {len(isl.posts)}回 {paths()}")

    isl.posts = []
    isl.pages["/b"] = "Bの面（直した）"
    code, out = run(m, base, state, pub)
    leg("1面", code == 0 and paths() == ["/b"], f"終了 {code}・送った {paths()}")

    isl.posts = []
    del isl.pages["/c"]
    code, out = run(m, base, state, pub)
    leg("消えた", code == 0 and paths() == ["/c"], f"終了 {code}・送った {paths()}")

    isl.posts = []
    isl.pages["/a"] = "Aの面（直した）"
    isl.reply = 403
    before = state.read_text(encoding="utf-8")
    code, out = run(m, base, state, pub)
    leg("断られた", code == 1 and state.read_text(encoding="utf-8") == before, f"終了 {code}・控えが変わった")
    isl.reply = 200
    isl.posts = []
    code, out = run(m, base, state, pub)
    leg("送り直す", code == 0 and paths() == ["/a"], f"終了 {code}・送った {paths()}")

    isl.posts = []
    isl.pages["/b"] = "Bの面（もう一度）"
    isl.key_served = False
    code, out = run(m, base, state, pub)
    leg("鍵が無い", code == 2 and not isl.posts, f"終了 {code}・送った {len(isl.posts)}回")
    isl.key_served = True
    return res


def main() -> int:
    isl = Island()
    srv, base = serve(isl)
    try:
        m = load(base)
        res = legs(m, isl, base)
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
        want = {"script": "変わらない", "gone": "消えた", "keep": "送り直す", "key": "鍵が無い"}[brk]
        print(f"\n対照 BREAK={brk}: 「{want}」が" + ("落ちた（見張りは効いている）" if want in bad else "**落ちなかった**"))
        return 0 if want in bad else 1
    if bad:
        print(f"\n{len(bad)}/{len(res)}本 落ちた")
        return 1
    import subprocess
    fails = [b for b in ("script", "gone", "keep", "key")
             if subprocess.run([sys.executable, __file__], env={**os.environ, "BREAK": b},
                               capture_output=True, text=True).returncode != 0]
    if fails:
        print(f"\n対照で落ちなかった: {', '.join(fails)}（見張りが空回りしている）")
        return 1
    print(f"\n{len(res)}本とも通った。対照4つは、それぞれ外した守りの足が落ちた")
    return 0


if __name__ == "__main__":
    sys.exit(main())
