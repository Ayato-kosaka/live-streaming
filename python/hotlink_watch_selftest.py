"""**借りた写真を `upload.wikimedia.org` から直に読む所を数える見張り（`python/hotlink_watch.py`）が、落ちるときに落ちるか。**

    python3 python/hotlink_watch_selftest.py

終了コード 0=通った / 1=落ちた / **2=数えるものが無い**（`docs/island-standards.md` §15）。

ネットワークにも書き出しにも触れない。小さな書き出しと面の元をこしらえて食わせ、最後の節だけ**本物のリポジトリの
面の元**を数える——Commons の URL を面に1本でも貼れば、ここが毎 PR で赤くなる。

| 節 | 守り | 崩れると |
| --- | --- | --- |
| 見分け | `<img src>`・`srcset`・`style` の `url(`・`<style>`／`.css` の `url(`・og:image・先読みの `<link>`・RSC と JS のデータの欄・JSON-LD を絵として数え、`<a href>` とデータの `href` だけをリンクに分ける | 絵が素通りする・出どころのリンクで赤くなる |
| 書き出し | `.html` `.txt` `.css` `.js` を見て、Next の作業の置き場（`server/` `cache/`）は見ない。HTML が0面なら 2 | 配らないもので赤くなる・何も見ずに緑 |
| 面の元 | `site/content` の JSON・TSX の `src`・直下の `public/` の HTML を見る。ファイルが0なら 2 | 書き出す前に止められない |
| 本物 | いまのリポジトリの面の元に、絵として読む所が0本 | 貼り戻されても緑 |
"""

from __future__ import annotations

import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import hotlink_watch as hw  # noqa: E402

FAILS: list[str] = []
SEEN = 0

U = "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c4/X.jpg/960px-X.jpg"
PAGE = "https://commons.wikimedia.org/wiki/File:X.jpg"


def ok(cond: bool, what: str) -> None:
    global SEEN
    SEEN += 1
    if not cond:
        FAILS.append(what)
        print(f"  NG {what}")


def kinds(text: str, html: bool) -> list[str]:
    return [k for k, _ in hw.scan_text(text, html)]


def telling() -> None:
    print("見分け")
    cases_html = [
        (f'<img alt="" src="{U}" loading="lazy">', "<img src>"),
        (f'<img src="/a-500.webp" srcset="/a-500.webp 1x, {U} 2x">', "<img srcset>"),
        (f'<picture><source srcset="{U}"><img src="/a.webp"></picture>', "<source srcset>"),
        (f'<div class="h" style="background-image:url({U})">', "<div style>"),
        (f'<meta property="og:image" content="{U}"/>', "<meta content>"),
        (f'<link rel="preload" as="image" href="{U}"/>', "<link href>"),
        (f"<style>.h{{background:url('{U}')}}</style>", "url("),
        (f'<script>self.__next_f.push([1,"{{\\"src\\":\\"{U}\\",\\"alt\\":\\"x\\"}}"])</script>', "欄 src"),
        (f'<script type="application/ld+json">{{"@type":"Place","image":"{U}"}}</script>', "欄 image"),
        (f"<p>写真は {U} から</p>", "字"),
    ]
    for text, want in cases_html:
        got = kinds(text, True)
        ok(got == [want] and want != "href", f"HTML で絵として数える: {want}（{got}）")
    for text in (f'<a class="c" href="{U}" target="_blank">元の写真</a>',
                 f'<script>self.__next_f.push([1,"{{\\"href\\":\\"{U}\\"}}"])</script>'):
        ok(kinds(text, True) == ["href"], f"押して開くリンクは、数えるが落とさない（{kinds(text, True)}）")
    ok(kinds(f'<a href="{PAGE}">Wikimedia Commons</a>', True) == [], "出どころのページ（commons.wikimedia.org）は数えない")

    cases_src = [
        (f'  "thumb": "{U}",', "欄 thumb"),
        (f'{{img:"{U}",big:"{U}"}}', "欄 img"),
        (f'        src: "{U}",', "欄 src"),
        (f'<img src="{U}" alt="" />', "欄 src"),
        (f".x{{background:url({U})}}", "url("),
    ]
    for text, want in cases_src:
        got = kinds(text, False)
        ok(bool(got) and got[0] == want, f"面の元で絵として数える: {want}（{got}）")
    ok(kinds(f'<a href="{U}">x</a>', False) == ["href"], "JSX の href はリンク")
    ok(kinds(f'cm: "{PAGE}", by: "A", lic: "CC BY 2.0"', False) == [], "出どころの欄（cm）は数えない")
    rows = hw.scan_text(f"a\nb\n  src: \"{U}\"\n", False)
    ok(rows == [("欄 src", 3)], f"行を数える（{rows}）")


def dist_scan() -> None:
    print("書き出し")
    with tempfile.TemporaryDirectory() as t:
        d = Path(t)
        bad, links, seen = hw.dist(d)
        ok(seen == 0 and hw.main(["--dist", str(d)]) == 2, "HTML が0面なら 2（何も見ずに緑にしない）")
        (d / "travel").mkdir()
        (d / "travel/finland.html").write_text(
            f'<html><img src="/travel/finland/photos/a-250.webp"><a href="{PAGE}">出どころ</a>'
            f'<a href="{U}">元の大きさ</a></html>', encoding="utf-8")
        bad, links, seen = hw.dist(d)
        ok(seen == 1 and not bad and len(links) == 1, f"置き場の写真と出どころのリンクだけなら0（{bad} {links}）")
        ok(hw.main(["--dist", str(d)]) == 0, "そのとき 0")

        (d / "server/app").mkdir(parents=True)
        (d / "server/app/x.html").write_text(f'<img src="{U}">', encoding="utf-8")
        (d / "cache").mkdir()
        (d / "cache/y.json").write_text(f'{{"src":"{U}"}}', encoding="utf-8")
        ok(not hw.dist(d)[0], "配らない段（server・cache）は見ない")

        (d / "next.txt").write_text(f'1:["$","img",null,{{"src":"{U}"}}]', encoding="utf-8")
        bad, _, _ = hw.dist(d)
        ok(len(bad) == 1 and bad[0].startswith("next.txt:1 "), f"RSC の .txt を見る（{bad}）")
        (d / "next.txt").unlink()

        (d / "_next/static/css").mkdir(parents=True)
        (d / "_next/static/css/a.css").write_text(f".h{{background:url({U})}}", encoding="utf-8")
        bad, _, _ = hw.dist(d)
        ok(len(bad) == 1 and "url(" in bad[0], f"配る CSS の url( を見る（{bad}）")
        ok(hw.main(["--dist", str(d)]) == 1, "絵として読む所が1本でも在れば 1")
        (d / "_next/static/css/a.css").unlink()

        (d / "_next/static/chunks").mkdir(parents=True)
        (d / "_next/static/chunks/p.js").write_text(f'e.exports=JSON.parse(\'{{"thumb":"{U}"}}\')', encoding="utf-8")
        bad, _, _ = hw.dist(d)
        ok(len(bad) == 1 and "thumb" in bad[0], f"JS の塊に焼かれたデータを見る（{bad}）")


def source_scan() -> None:
    print("面の元")
    with tempfile.TemporaryDirectory() as t:
        r = Path(t)
        ok(hw.source(r)[2] == 0 and hw.main(["--root", str(r)]) == 2, "ファイルが0なら 2")
        (r / "site/content/nordic").mkdir(parents=True)
        (r / "site/content/nordic/finland.json").write_text(
            f'{{"spots":[{{"thumb":"/travel/finland/photos/a-250.webp","cm":"{PAGE}"}}]}}', encoding="utf-8")
        (r / "public").mkdir()
        (r / "public/review.html").write_text("<img src=\"/nordic/a.webp\">", encoding="utf-8")
        (r / "site/content/node_modules").mkdir()
        (r / "site/content/node_modules/x.js").write_text(f'src:"{U}"', encoding="utf-8")
        (r / "site/.next-3130").mkdir()
        (r / "site/.next-3130/y.html").write_text(f'<img src="{U}">', encoding="utf-8")
        bad, _, seen = hw.source(r)
        ok(seen == 2 and not bad, f"置き場の道と出どころなら0。node_modules と書き出しは見ない（{seen} {bad}）")
        ok(hw.main(["--root", str(r)]) == 0, "そのとき 0")

        (r / "site/content/nordic/finland.json").write_text(f'{{"spots":[{{"thumb":"{U}"}}]}}', encoding="utf-8")
        bad, _, _ = hw.source(r)
        ok(len(bad) == 1 and "finland.json:1" in bad[0], f"焼いた JSON に戻れば数える（{bad}）")
        (r / "site/components").mkdir(parents=True)
        (r / "site/components/Hero.tsx").write_text(f'export const H = () => <img src="{U}" alt="" />;\n', encoding="utf-8")
        (r / "public/review.html").write_text(f'<div style="background:url({U})"></div>', encoding="utf-8")
        bad, _, _ = hw.source(r)
        ok(len(bad) == 3, f"TSX の src・直下の public の HTML も数える（{bad}）")
        ok(hw.main(["--root", str(r)]) == 1, "そのとき 1")


def real() -> None:
    print("本物の面の元")
    bad, links, seen = hw.source()
    if seen == 0:
        print("::error::本物の面の元を1ファイルも見られなかった（置き場が動いた？）")
        sys.exit(2)
    for b in bad[:5]:
        print(f"    {b}")
    ok(not bad, f"面の元 {seen} ファイルに、{hw.HOST} を絵として読む所が無い（{len(bad)} 本）")


def main() -> int:
    telling()
    dist_scan()
    source_scan()
    real()
    if SEEN == 0:
        return 2
    print(f"{SEEN} 件を見た・落ちた {len(FAILS)}")
    return 1 if FAILS else 0


if __name__ == "__main__":
    sys.exit(main())
