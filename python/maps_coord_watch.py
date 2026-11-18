"""**Google マップを座標で開く道が、焼いたもの・面に1本でも残っていれば落ちる。**

    python3 python/maps_coord_watch.py                          # 焼いたもの（site/content ほか）
    python3 python/maps_coord_watch.py --dist site/.next-3130   # 書き出した面（HTML）も見る

終了コード 0=座標の道が0本 / 1=1本でも在る / **2=数えるものが無い**
（Google マップへの道が1本も見つからない＝置き場が動いた。`docs/island-standards.md` §15）。

## なぜ要るか（2026-11-15・あやと、ソフィア滞在中）

> Google マップで開くボタンを押すと、座標に飛ばされてよく分かりにくい。
> 店が分かるように、Google マップで検索をかけた状態で渡してほしい。

`/bulgaria`・スコピエ・北欧の店の面の道が `query=42.68,23.31` の形で、押すと名前の無い点が1つ立つだけだった。
道は名前で検索する形に直し、組むのを1か所にした（`python/maps_link.py`・`site/lib/mapsSearch.ts`）。
**座標は材料の中に正しく在るので、次に面を作る人が手近な座標で道を組むと、黙って同じ形に戻る。**
ここはそれを止める。

## 見るところ

| | |
| --- | --- |
| 焼いたもの | `site/content/**/*.json` `*.ts`、My Maps に入れる CSV（`python/data/**/*.csv`） |
| 面を組む字 | `site/app` `site/components` `site/lib` の `*.ts` `*.tsx`（`query=${s.lat},${s.lon}` のように組む所） |
| 書き出し（`--dist`） | `*.html` ぜんぶ。HTML の `&amp;` と、埋め込みの JSON の `\\u0026` を戻してから読む |

**座標で開く道**とみなすのは、Google マップの道のうち、検索・行き先の欄（`query` `q` `destination` `daddr`）が
座標のもの（`42.68,23.31`・`42.68%2C23.31`・`${lat},${lon}`）と、`/maps/@42.68,23.31` の形。
地図の埋め込み（`/maps/d/embed` の `ll`）は開いたときの中心で、押して飛ぶ先ではないので見ない（欄が違うので拾わない）。
"""

from __future__ import annotations

import argparse
import os
import re
import sys
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

#: 対照（`maps_coord_watch_selftest.py`）が足を1本ずつ抜くための札。ふだんは空
BREAK: set[str] = set(filter(None, os.environ.get("BREAK", "").split(",")))

#: 焼いたもの・面を組む字。`--root` からの相対
GLOBS = [
    "site/content/**/*.json",
    "site/content/**/*.ts",
    "site/app/**/*.ts",
    "site/app/**/*.tsx",
    "site/components/**/*.ts",
    "site/components/**/*.tsx",
    "site/lib/**/*.ts",
    "site/lib/**/*.tsx",
    "python/data/**/*.csv",
]

#: Google マップへの道（`www.google.com/maps…` と `maps.google.com/…`）。ふつうの Google 検索は数えない。
#: 引用符・空白・山括弧・逆引用符で止める
URL = re.compile(r"https?://(?:(?:www\.)?google\.[a-z.]+/maps|maps\.google\.[a-z.]+)[^\s\"'<>`]*", re.I)
#: 押した先を決める欄
KEYS = ("query", "q", "destination", "daddr")
#: 数どうしの座標（`42.68,23.31`）。欄の字は %xx を戻してから読むので、`%2C` もここに来る
NUM = re.compile(r"\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*")
#: 組む途中の座標（`${s.lat},${s.lon}`）
TPL = re.compile(r"\s*\$\{[^}]+\}\s*,\s*\$\{[^}]+\}\s*")
#: `/maps/@42.68,23.31,15z`
AT = re.compile(r"/maps/(?:[^?#]*/)?@-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?")


def unescape(text: str) -> str:
    """HTML と埋め込みの JSON の書きかたを戻す（`&amp;query=` `\\u0026query=`）"""
    if "escape" in BREAK:
        return text
    return text.replace("\\u0026", "&").replace("&amp;", "&")


def is_coord(url: str) -> bool:
    """押すと座標へ飛ぶ道か"""
    if AT.search(url) and "at" not in BREAK:
        return True
    qs = urllib.parse.urlsplit(url).query
    # `+` は空白に戻す。`%2C` は `,` に戻る（`encoded` を抜くと戻さずに読む）
    pairs = (urllib.parse.parse_qsl(qs, keep_blank_values=True) if "encoded" not in BREAK
             else [tuple(kv.split("=", 1)) for kv in qs.split("&") if "=" in kv])
    for k, v in pairs:
        if k not in KEYS:
            continue
        if NUM.fullmatch(v) and "num" not in BREAK:
            return True
        if TPL.fullmatch(v) and "tpl" not in BREAK:
            return True
    return False


def scan_text(text: str) -> tuple[list[str], int]:
    """（座標の道, 名前の道の数）"""
    coords, names = [], 0
    for m in URL.finditer(unescape(text)):
        url = m.group(0)
        if is_coord(url):
            coords.append(url)
        elif any(f"{k}=" in url for k in KEYS):
            names += 1
    return coords, names


def files_of(root: Path) -> list[Path]:
    out: list[Path] = []
    for g in GLOBS:
        out += [p for p in root.glob(g) if "node_modules" not in p.parts]
    return sorted(set(out))


def html_of(dist: Path) -> list[Path]:
    return sorted(dist.rglob("*.html"))


def report(label: str, paths: list[Path], base: Path) -> tuple[int, int, dict[str, int]]:
    """置き場ひとつぶんを読んで、座標の道を全部出す。（座標の本数, 名前の本数, 名前の本数の内訳）"""
    bad, names, per = 0, 0, {}
    for p in paths:
        try:
            text = p.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        c, n = scan_text(text)
        rel = str(p.relative_to(base))
        if n > 0:
            per[rel] = n
        names += n
        for u in c:
            bad += 1
            print(f"  ✕ {rel}: {u[:160]}")
    print(f"{label}: {len(paths)}ファイル・名前で探す道 {names}本・座標で開く道 {bad}本")
    return bad, names, per


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--root", default=str(ROOT), help="焼いたものを探す根（対照が偽の置き場を渡す）")
    ap.add_argument("--dist", help="書き出した置き場（site/.next-<ポート>）")
    ap.add_argument("--pages", nargs="*", default=[],
                    help="--dist のとき、名前で探す道の数を出す面（例 bulgaria.html）")
    a = ap.parse_args(argv)

    root = Path(a.root).resolve()
    bad, names, _ = report("焼いたもの・面を組む字", files_of(root), root)
    if a.dist:
        dist = Path(a.dist).resolve()
        b2, n2, per = report(f"書き出した面（{dist.name}）", html_of(dist), dist)
        bad += b2
        if n2 == 0:
            print("✕ 書き出した面に Google マップへの道が1本も無い。置き場が違うか、書き出しが空")
            return 2
        for page in a.pages:
            print(f"  {page}: 名前で探す道 {per.get(page, 0)}本")
    if bad > 0:
        print(f"✕ 座標で開く道が {bad}本。名前で探す形に直す（python/maps_link.py・site/lib/mapsSearch.ts）")
        return 1
    if names == 0:
        print("✕ Google マップへの道を1本も数えなかった。**「0本でした」とは言わない**（置き場が動いた？）")
        return 2
    print("○ 座標で開く道は0本")
    return 0


if __name__ == "__main__":
    sys.exit(main())
