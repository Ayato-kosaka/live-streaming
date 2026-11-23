"""`python/page_text.py` が、**見える字かリンク先が変わったときだけ**違うと言うか。

    python3 python/page_text_selftest.py

終了コード 0=通った / 1=落ちた。

前後の書き出しが「同じ」と出ても、比べる道具が何も見ていなければ意味が無い。
仕込みの2枚で、変わったら落ちる（字・行き先・題・説明・面の数）と、
変わっても落ちない（`<script>` の中・空白の量・属性の並び）の両方を当てる。
"""

from __future__ import annotations

import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import page_text  # noqa: E402

BASE = """<!doctype html><html><head><title>島の地図</title>
<meta name="description" content="バルカン諸国周遊のいま">
<script>self.__next_f.push([1,"ルーマニア"])</script><style>.a{color:red}</style></head>
<body><h1>いまここ</h1><p>ルーマニア・<b>ブカレスト</b></p>
<a href="/travel/romania/bucharest">この国の歩きかた</a><noscript>JS が要ります</noscript>
<template><p>あとで出る字</p></template></body></html>"""

CASES = [
    # (名前, 差し替え前, 差し替え後, 違うと言うべきか)
    ("見える字が変わる", "ブカレスト", "ソフィア", True),
    ("行き先が変わる", 'href="/travel/romania/bucharest"', 'href="/travel/bulgaria/sofia"', True),
    ("題が変わる", "<title>島の地図</title>", "<title>島</title>", True),
    ("説明が変わる", 'content="バルカン諸国周遊のいま"', 'content="バルカン"', True),
    ("script の中だけ変わる", '"ルーマニア"])', '"ブルガリア"])', False),
    ("style の中だけ変わる", "color:red", "color:blue", False),
    ("noscript の中だけ変わる", "JS が要ります", "JS", False),
    ("template の中だけ変わる", "あとで出る字", "べつの字", False),
    ("空白の量だけ変わる", "<h1>いまここ</h1>", "<h1>  いまここ\n </h1>", False),
    ("属性の並びだけ変わる", '<a href="/travel/romania/bucharest">', '<a class="x" href="/travel/romania/bucharest">', False),
]


def run(a_html: str, b_html: str, extra_b: bool = False) -> int:
    with tempfile.TemporaryDirectory() as t:
        a, b = Path(t) / "a", Path(t) / "b"
        for d, h in ((a, a_html), (b, b_html)):
            (d / "travel").mkdir(parents=True)
            (d / "travel" / "romania.html").write_text(h, encoding="utf-8")
            # `_next` の下は面ではない（読まない）
            (d / "_next").mkdir()
            (d / "_next" / "x.html").write_text(h if d == a else "<p>ちがう</p>", encoding="utf-8")
        if extra_b:
            (b / "new.html").write_text(BASE, encoding="utf-8")
        return page_text.main(["page_text.py", "diff", str(a), str(b)])


def main() -> int:
    bad = 0

    def ck(name: str, good: bool) -> None:
        nonlocal bad
        bad += not good
        print(f"  {'ok' if good else 'NG'}   {name}")

    ck("同じ2枚は、同じ（0）", run(BASE, BASE) == 0)
    for name, x, y, want in CASES:
        assert x in BASE, f"仕込みが当たらない: {name}"
        code = run(BASE, BASE.replace(x, y))
        ck(f"{name} → {'違う（1）' if want else '同じ（0）'}", code == (1 if want else 0))
    ck("面が1枚増える → 違う（1）", run(BASE, BASE, extra_b=True) == 1)
    with tempfile.TemporaryDirectory() as t:
        ck("HTML が1枚も無い → 比べるものが無い（2）",
           page_text.main(["page_text.py", "diff", t, t]) == 2)
    print(f"\n落ちた {bad}")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
