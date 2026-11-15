"""**面が、借りた写真を `upload.wikimedia.org` から直に読んでいないかを数える。**（#1228）

    python3 python/hotlink_watch.py                          # 面の元（site/ と直下の app・public ほか）の字を数える
    python3 python/hotlink_watch.py --dist site/.next-3130   # 書き出した全面（HTML・RSC・CSS・JS）を数える
    python3 python/hotlink_watch.py --dist dist              # 本番に配る山（Expo＋public＋site）を数える

終了コード 0=絵として読む所が0本 / 1=在る / 2=数えるものが無い（`docs/island-standards.md` §15）。

## なぜ要るか（2026-11-15）

面が Commons の写真を `upload.wikimedia.org` から直に読んでいると、Wikimedia が混んだ日に 429（取りすぎ）で
断られ、写真の枠が空になる。本番でスコピエの見どころマップのピンが白い丸で写った。この箱から取ると、いつも 429 になる。
だから借りた写真は使う幅で島の置き場に落として配る（`python/guide_photos.py`）。ソフィア・スコピエ・北欧の6か国・
企画を寄せたあと、**面を1枚足した人が Commons の URL をそのまま貼れば黙って戻る**ので、ここで毎回数える。

## 何を数えるか

`upload.wikimedia.org` は Commons の**ファイルの置き場**で、出てくれば絵か動画そのもの。前後の字から、どう使っているかを
見分ける。**`href`（押して開くリンク）だけは数えるが落とさない**——出どころのリンクは面に残す決まりで、ふつうは
Commons のファイルのページ（`commons.wikimedia.org/wiki/File:…`。ここでは数えない）を指している。

| 見分け | 例 | |
| --- | --- | --- |
| タグの属性 | `<img src>` `srcset` `<source srcset>` `style="…url(…)"` `<meta content>`（og:image）`<link href>`（先読み） | 落とす |
| CSS の `url(` | `<style>`・`.css` の中 | 落とす |
| データの欄 | RSC の `\\"src\\":\\"…\\"`・JS の `thumb:"…"`・JSON-LD の `"image"`（あとで絵になる） | 落とす |
| `href` | `<a href>`・JSX の `href="…"`・データの `"href"` | 数えるだけ |
| それ以外の字 | 本文に URL がそのまま出ている | 落とす |

**データの欄まで見るのは、畳んだ中や、押してから描く一覧は HTML の `<img>` に出ないから。** その写真の道は
RSC の字（`self.__next_f.push`）や JS の塊にしか居ない。`<img>` だけ数えると、そこが見張りの外になる。

## 面の元を数える（既定）

書き出しを待たずに毎 PR で赤くするために、面になる字そのもの（`ROOTS`）も同じ物差しで数える。
`hotlink_watch_selftest.py` の最後の節がこれを本物のリポジトリに当てる（`selftest_runner.py` が拾う）。
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HOST = "upload.wikimedia.org"

#: 面になる字の置き場。site（Next の島）と、直下の Expo の側（`dist/` に一緒に配られる）
ROOTS = (
    "site/app",
    "site/components",
    "site/content",
    "site/lib",
    "site/public",
    "app",
    "components",
    "constants",
    "hooks",
    "lib",
    "public",
)
#: 面の元として読む字のファイル
SRC_EXT = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".css", ".html", ".svg"}
#: 書き出しの中で、配る字（RSC は `.txt`）
DIST_EXT = {".html", ".txt", ".css", ".js", ".json"}
#: 配らない段（Next の作業の置き場）と、道具の置き場
SKIP_DIRS = {"node_modules", "server", "cache", "types", "diagnostics", "__pycache__", ".git"}

_TAG = re.compile(r"<\s*([A-Za-z][\w-]*)")
_ATTR = re.compile(r"([A-Za-z_:][\w:.-]*)\s*=\s*[\"']?[^\"'<>]*$")
_URL = re.compile(r"url\(\s*\\?[\"']?[^\"')]*$")
_KEY = re.compile(r"(?:\\?[\"'])?([A-Za-z_$][\w$-]*)(?:\\?[\"'])?\s*[:=]\s*\\?[\"'][^\"'\\\s]*$")


def kind_at(text: str, i: int, html: bool) -> str:
    """`i` に在る `upload.wikimedia.org` が、どう使われているか。`href` だけがリンク、ほかは絵（かその材料）"""
    w = text[max(0, i - 400) : i]
    if html:
        lt, gt = w.rfind("<"), w.rfind(">")
        if lt > gt:
            # タグの中（属性の値）
            inner = w[lt:]
            t = _TAG.match(inner)
            a = _ATTR.search(inner)
            tag = (t.group(1) if t else "?").lower()
            attr = (a.group(1) if a else "?").lower()
            if tag == "a" and attr == "href":
                return "href"
            return f"<{tag} {attr}>"
    if _URL.search(w):
        return "url("
    k = _KEY.search(w)
    if k:
        return "href" if k.group(1).lower() == "href" else f"欄 {k.group(1)}"
    return "字"


def scan_text(text: str, html: bool) -> list[tuple[str, int]]:
    """（見分け, 行）の並び"""
    out = []
    for m in re.finditer(re.escape(HOST), text):
        out.append((kind_at(text, m.start(), html), text.count("\n", 0, m.start()) + 1))
    return out


def files(base: Path, exts: set[str]) -> list[Path]:
    out = []
    if not base.exists():
        return out
    for p in sorted(base.rglob("*")):
        rel = p.relative_to(base).parts
        if any(x in SKIP_DIRS or x.startswith(".next") for x in rel[:-1]):
            continue
        if p.is_file() and p.suffix in exts:
            out.append(p)
    return out


def count(paths: list[Path], base: Path) -> tuple[list[str], list[str]]:
    """（絵として読む所, リンク）。どちらも `ファイル:行 見分け` の並び"""
    bad: list[str] = []
    links: list[str] = []
    for p in paths:
        try:
            t = p.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        if HOST not in t:
            continue
        for k, line in scan_text(t, p.suffix in (".html", ".svg")):
            row = f"{p.relative_to(base)}:{line} {k}"
            (links if k == "href" else bad).append(row)
    return bad, links


def source(root: Path = ROOT) -> tuple[list[str], list[str], int]:
    """面の元を数える。戻りは（絵として読む所, リンク, 見たファイルの数）"""
    paths: list[Path] = []
    for r in ROOTS:
        paths += files(root / r, SRC_EXT)
    bad, links = count(paths, root)
    return bad, links, len(paths)


def dist(d: Path) -> tuple[list[str], list[str], int]:
    """書き出したものを数える。戻りは（絵として読む所, リンク, 見た HTML の数）"""
    paths = files(d, DIST_EXT)
    bad, links = count(paths, d)
    return bad, links, sum(p.suffix == ".html" for p in paths)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--dist", metavar="DIR", help="書き出したものの置き場（無ければ面の元を数える）")
    ap.add_argument("--root", default=str(ROOT), help=argparse.SUPPRESS)
    a = ap.parse_args(argv)
    if a.dist:
        bad, links, seen = dist(Path(a.dist))
        what = f"書き出した HTML {seen} 面"
    else:
        bad, links, seen = source(Path(a.root))
        what = f"面の元 {seen} ファイル"
    if seen == 0:
        print(f"::error::数えるものが無い（{a.dist or '面の元'}。置き場が動いた？）")
        return 2
    for b in bad[:20]:
        print(f"::error::{HOST} から直に読んでいる: {b}（python/guide_photos.py で置き場に落として、道を替える）")
    if len(bad) > 20:
        print(f"  ほか {len(bad) - 20} 本")
    print(f"{what}を見た・{HOST} を絵として読む所 {len(bad)}・リンク {len(links)}")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
