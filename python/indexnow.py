"""**配ったあとに、中身が変わった面だけを IndexNow（Bing・Yandex ほか）に知らせる。**

    python3 python/indexnow.py --state .indexnow/state.json            # 変わった面だけ知らせる
    python3 python/indexnow.py --state .indexnow/state.json --dry-run  # 数えるだけ（知らせない・控えを書かない）
    python3 python/indexnow.py --state .indexnow/state.json --all      # 全部知らせる

終了コード 0=知らせた（か、変わった面が無かった） / 1=知らせたのに断られた（控えは書かない。次の回にもう一度） /
**2=測れなかった**（sitemap が読めない・半分より多くの面が読めない・鍵が本番に無い。`docs/island-standards.md` §15）。

## なぜ要るか（#1262）

Bing は Copilot と ChatGPT の検索の元。島は Bing Webmaster Tools に入っていない（入るにはあやとの
アカウントの同意が要る。#1262）。**IndexNow はアカウントが要らない**——本番に鍵のファイルを置き、
その鍵で「この URL が変わった」と送るだけ。受けた側（Bing・Yandex・Naver・Seznam ほか）は互いに分け合う。
Google は IndexNow を読まない（Google は sitemap と Search Console で足りている）。

## 「変わった面」の決めかた

本番の sitemap の面を全部取り、**題・説明・canonical・`<main>` の字**から指紋を作る。前の回の指紋と
違う面・新しく sitemap に載った面・sitemap から消えた面を送る。

- `<script>` の中（Next の埋め込み・束の名前）は指紋に入れない。**配るたびに変わるので、全部が毎回
  「変わった」になる**（何も変わっていない面を送り続けると、送る側の信用が落ちる）
- 取れなかった面は、前の指紋をそのまま残す（送らない・消さない）。半分より多く取れなければ 2 で止める
- 前の回の控えが無ければ（初めて・控えが流れた）、全部送る。1回 10,000本まで送れるので、島の面の数なら1回

## 鍵

`site/public/<鍵>.txt`（中身が鍵そのもの）。**鍵は公開して使うもの**（本番の URL で誰でも読める決まり）で、
秘密ではない。送る前に本番の `https://ayato-arigato.com/<鍵>.txt` が鍵を返すかを見る。返さなければ 2
（まだ配っていない。控えを書かないので、配ったあとの回で全部送る）。

## 対照

`python/indexnow_selftest.py`。手元の口に偽の島と偽の IndexNow を立てて回す（外に出ない）。
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent.parent
ORIGIN = "https://ayato-arigato.com"
# 送る先。api.indexnow.org は受けたものを参加している検索エンジンへ配る
ENDPOINT = os.environ.get("INDEXNOW_ENDPOINT", "https://api.indexnow.org/indexnow")
UA = "indexnow-notify/1.0 (python-urllib)"
WORKERS = 4
BATCH = 10000
KEY_RE = re.compile(r"^[0-9a-f]{32}$")
SKIP = {"script", "style", "noscript", "template"}


class Unmeasured(Exception):
    """測れなかった（終了コード 2）"""


def find_key(public: Path) -> str:
    """`site/public/` の鍵。**ちょうど1つ**で、中身が名前と同じもの"""
    keys = [p.stem for p in public.glob("*.txt")
            if KEY_RE.match(p.stem) and p.read_text(encoding="utf-8").strip() == p.stem]
    if len(keys) != 1:
        raise Unmeasured(f"{public} に IndexNow の鍵がちょうど1つ無い（{len(keys)}個）")
    return keys[0]


def get(url: str, timeout: float = 30) -> tuple[int, str]:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, ""
    except (urllib.error.URLError, TimeoutError, OSError):
        return 0, ""


class Text(HTMLParser):
    """題・説明・canonical・`<main>` の字。`<main>` が無ければ `<body>`"""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.title, self.desc, self.canon = "", "", ""
        self.main: list[str] = []
        self.body: list[str] = []
        self._skip = 0
        self._in_title = self._in_main = self._in_body = False

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in SKIP:
            self._skip += 1
        elif tag == "title":
            self._in_title = True
        elif tag == "main":
            self._in_main = True
        elif tag == "body":
            self._in_body = True
        elif tag == "meta" and (a.get("name") or "").lower() == "description":
            self.desc = a.get("content") or ""
        elif tag == "link" and "canonical" in (a.get("rel") or "").lower().split():
            self.canon = a.get("href") or ""

    def handle_endtag(self, tag):
        if tag in SKIP:
            self._skip = max(0, self._skip - 1)
        elif tag == "title":
            self._in_title = False
        elif tag == "main":
            self._in_main = False

    def handle_data(self, data):
        if self._skip:
            return
        if self._in_title:
            self.title += data
        if self._in_main:
            self.main.append(data)
        if self._in_body:
            self.body.append(data)


def fingerprint(html: str) -> str:
    p = Text()
    p.feed(html)
    text = " ".join(p.main or p.body)
    parts = [p.title, p.desc, p.canon, text]
    norm = "\n".join(re.sub(r"\s+", " ", s).strip() for s in parts)
    return hashlib.sha256(norm.encode("utf-8")).hexdigest()[:20]


def sitemap(base: str) -> list[str]:
    code, xml = get(f"{base}/sitemap.xml", timeout=60)
    if code != 200:
        raise Unmeasured(f"sitemap.xml が読めない（{code or 'つながらない'}）")
    locs = list(dict.fromkeys(m.strip() for m in re.findall(r"<loc>\s*([^<]+?)\s*</loc>", xml)))
    if not locs:
        raise Unmeasured("sitemap に <loc> が1つも無い")
    return locs


def measure(base: str, urls: list[str]) -> dict[str, str | None]:
    """URL ごとの指紋。取れなかった面は None。404・410 は「消えた」として空の指紋"""
    def one(u: str) -> tuple[str, str | None]:
        path = urlsplit(u).path or "/"
        code, html = get(base + path)
        if code == 200:
            return u, fingerprint(html)
        if code in (404, 410):
            return u, ""
        return u, None
    with ThreadPoolExecutor(WORKERS) as ex:
        return dict(ex.map(one, urls))


def changed(prev: dict[str, str], now: dict[str, str | None], urls: list[str]) -> list[str]:
    out = [u for u in urls if now.get(u) is not None and prev.get(u) != now[u]]
    # sitemap から消えた面も知らせる（向こうが取りに来て 404 を見る）
    out += [u for u in prev if u not in now]
    return out


def notify(host: str, key: str, origin: str, urls: list[str]) -> tuple[bool, str]:
    for i in range(0, len(urls), BATCH):
        body = json.dumps({"host": host, "key": key, "keyLocation": f"{origin}/{key}.txt",
                           "urlList": urls[i:i + BATCH]}).encode()
        req = urllib.request.Request(ENDPOINT, data=body, method="POST",
                                     headers={"Content-Type": "application/json; charset=utf-8", "User-Agent": UA})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                code = r.status
        except urllib.error.HTTPError as e:
            code = e.code
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            return False, f"送れなかった（{type(e).__name__}）"
        # 200=受けた・202=受けた（鍵の確かめはこれから）。ほかは断られた
        if code not in (200, 202):
            hint = {400: "形が違う", 403: "鍵が合わない", 422: "URL がホストと違う", 429: "送りすぎ"}.get(code, "")
            return False, f"HTTP {code}" + (f"（{hint}）" if hint else "")
    return True, "受けた"


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description="中身が変わった面を IndexNow に知らせる")
    ap.add_argument("--state", required=True, help="前の回の指紋（JSON）。無ければ全部送る")
    ap.add_argument("--base", default=ORIGIN, help="測る先（既定は本番。名乗る URL は sitemap のまま）")
    ap.add_argument("--public", default=str(ROOT / "site" / "public"), help="鍵のファイルの置き場")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--all", action="store_true", help="変わっていなくても全部送る")
    a = ap.parse_args(argv)
    base = a.base.rstrip("/")

    try:
        key = find_key(Path(a.public))
        urls = sitemap(base)
    except Unmeasured as e:
        print(f"::error::{e}")
        return 2
    origin = "{0.scheme}://{0.netloc}".format(urlsplit(urls[0]))
    host = urlsplit(urls[0]).hostname or ""

    state_p = Path(a.state)
    try:
        prev = json.loads(state_p.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        prev = {}
    now = measure(base, urls)
    miss = [u for u, v in now.items() if v is None]
    print(f"sitemap {len(urls)}面・取れた {len(urls) - len(miss)}面・前の控え {len(prev)}面")
    if len(miss) * 2 > len(urls):
        print(f"::error::半分より多くの面が取れなかった（{len(miss)}/{len(urls)}）。何も送らない")
        return 2

    send = list(urls) if (a.all or not prev) else changed(prev, now, urls)
    why = "全部（--all）" if a.all else ("全部（前の控えが無い）" if not prev else "変わった面")
    print(f"送る: {why} {len(send)}面")
    for u in send[:15]:
        print(f"  {urlsplit(u).path or '/'}")
    if len(send) > 15:
        print(f"  …ほか {len(send) - 15}面")

    # 次の回の控え: 取れた面は新しい指紋、取れなかった面は前のまま。消えた面は落とす
    nxt = {u: (v if v is not None else prev.get(u, "")) for u, v in now.items()}
    summary = os.environ.get("GITHUB_STEP_SUMMARY")

    def note(line: str) -> None:
        if summary:
            with open(summary, "a", encoding="utf-8") as f:
                f.write(line + "\n")

    if a.dry_run:
        print("dry-run: 送らない・控えを書かない")
        return 0
    if not send:
        state_p.parent.mkdir(parents=True, exist_ok=True)
        state_p.write_text(json.dumps(nxt, ensure_ascii=False, sort_keys=True), encoding="utf-8")
        note(f"IndexNow: 変わった面は無かった（{len(urls)}面を見た）")
        return 0

    code, body = get(f"{base}/{key}.txt")
    if code != 200 or body.strip() != key:
        print(f"::error::本番の鍵のファイルが鍵を返さない（{code or 'つながらない'}）。まだ配っていない。控えは書かない")
        return 2

    ok, said = notify(host, key, origin, send)
    print(f"IndexNow: {said}（{len(send)}面）")
    if not ok:
        print("::warning::IndexNow に断られた。控えを書かないので、次の配りのあとにもう一度送る")
        note(f"IndexNow: **断られた** {said}（{len(send)}面）")
        return 1
    state_p.parent.mkdir(parents=True, exist_ok=True)
    state_p.write_text(json.dumps(nxt, ensure_ascii=False, sort_keys=True), encoding="utf-8")
    note(f"IndexNow: {why} {len(send)}面を送った（{said}）")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
