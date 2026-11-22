"""書き出した面の「見える字」と「リンク先」を一覧にして、2つの書き出しを比べる。

    python3 python/page_text.py diff <前の書き出し> <後の書き出し>   # 違う面を並べる。同じなら 0
    python3 python/page_text.py dump <書き出し> > pages.json          # 一覧そのもの

終了コード（`diff`）: 0=全面同じ / 1=違う面がある / 2=比べるものが無い（HTML が1枚も無い）。

## なぜ要るか

**見た目を変えない作り直し**（データの持ち主を寄せる・表を1つにする。#1275）は、
変えたつもりのない面の字が1つ変わっても気づけない。面は170枚を超えるので、
撮って目で見比べるのでは追いつかない。書き出したもの（`tools/build.sh <ポート>` の
`site/.next-<ポート>`）を前後で2つ作って、ここで突き合わせる。

**同じ日付で書き出すこと。** 焼いた HTML には書き出した日の答え（「あと何日」・いまいる島）が
入るので、日を揃えないと作り直しと関係のない差が出る:

    NEXT_PUBLIC_BUILT_AT=2026-11-22T12:00:00Z tools/build.sh 3175

## 見るもの

- 面ごとの `<title>` と `<meta name="description">`（検索とシェアに出る字）
- 見える字（`<script>` `<style>` `<noscript>` `<template>` の中は外す）。空白は1つに畳む
- `<a href>` の行き先（並びのまま）

画面が出てから描き直す字（`useEffect` のあと）は、ここには写らない。そちらは
データの側（関数の答え）を前後で比べる。
"""

from __future__ import annotations

import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

# 中の字が画面に出ない要素
HIDDEN = {"script", "style", "noscript", "template"}
# 子を持たない要素（閉じタグが来ないので、深さを数えない）
VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta",
        "source", "track", "wbr"}


class _Page(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.hidden = 0
        self.in_title = False
        self.title: list[str] = []
        self.description = ""
        self.text: list[str] = []
        self.links: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        a = dict(attrs)
        if tag in HIDDEN:
            self.hidden += 1
        elif tag == "title":
            self.in_title = True
        elif tag == "meta" and (a.get("name") or "").lower() == "description":
            self.description = a.get("content") or ""
        elif tag == "a" and a.get("href") is not None:
            self.links.append(a["href"] or "")

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        # `<a href="…" />` のような書きかたも行き先として拾う（深さは動かさない）
        if tag in HIDDEN:
            return
        self.handle_starttag(tag, attrs)

    def handle_endtag(self, tag: str) -> None:
        if tag in HIDDEN:
            self.hidden = max(0, self.hidden - 1)
        elif tag == "title":
            self.in_title = False

    def handle_data(self, data: str) -> None:
        if self.in_title:
            self.title.append(data)
            return
        if self.hidden:
            return
        s = re.sub(r"\s+", " ", data).strip()
        if s:
            self.text.append(s)


def read_page(html: str) -> dict:
    """1枚の HTML から、題・説明・見える字・行き先を。"""
    p = _Page()
    p.feed(html)
    p.close()
    return {
        "title": re.sub(r"\s+", " ", "".join(p.title)).strip(),
        "description": p.description,
        "text": p.text,
        "links": p.links,
    }


def read_dir(root: Path) -> dict[str, dict]:
    """書き出しの置き場ぜんぶ。鍵は置き場からの道（`travel/romania.html`）。"""
    return {
        str(f.relative_to(root)): read_page(f.read_text(encoding="utf-8", errors="replace"))
        for f in sorted(root.rglob("*.html"))
        if "_next" not in f.relative_to(root).parts
    }


def diff(a: dict[str, dict], b: dict[str, dict]) -> list[str]:
    """違うところを、面ごとに1行ずつ（多すぎる面は頭だけ）。"""
    out: list[str] = []
    for path in sorted(set(a) | set(b)):
        if path not in a:
            out.append(f"+ {path}（後にだけ在る面）")
            continue
        if path not in b:
            out.append(f"- {path}（前にだけ在る面）")
            continue
        for key in ("title", "description", "text", "links"):
            x, y = a[path][key], b[path][key]
            if x == y:
                continue
            if isinstance(x, list):
                i = next((k for k, (p, q) in enumerate(zip(x, y)) if p != q), min(len(x), len(y)))
                out.append(f"~ {path} の {key}: {i}番目から（前 {len(x)}件 / 後 {len(y)}件）"
                           f" 前={x[i:i + 2]} 後={y[i:i + 2]}")
            else:
                out.append(f"~ {path} の {key}: 前={x!r} 後={y!r}")
    return out


def main(argv: list[str]) -> int:
    if len(argv) >= 3 and argv[1] == "dump":
        print(json.dumps(read_dir(Path(argv[2])), ensure_ascii=False, indent=1))
        return 0
    if len(argv) >= 4 and argv[1] == "diff":
        a, b = read_dir(Path(argv[2])), read_dir(Path(argv[3]))
        if not a or not b:
            print(f"比べるものが無い: HTML 前 {len(a)}枚 / 後 {len(b)}枚")
            return 2
        got = diff(a, b)
        words = sum(len(p["text"]) for p in b.values())
        links = sum(len(p["links"]) for p in b.values())
        print(f"面 前 {len(a)}枚 / 後 {len(b)}枚、後の見える字 {words}片・行き先 {links}本")
        for line in got:
            print(line)
        print("違う面は無い" if not got else f"違うところ {len(got)}件")
        return 1 if got else 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
