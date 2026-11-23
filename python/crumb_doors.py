"""**書き出した全部の面で、パンくずの2段目が入口の9つのどれかか**を数える（`docs/spec/routes.md` R-23。#1279）。

    tools/build.sh 3130
    python3 python/crumb_doors.py --dist site/.next-3130

終了コード **0=全部の面が合っている / 1=合わない面がある / 2=数えるものが無い**（`docs/island-standards.md` §15）。

## 何を見るか

面の道を仕様の道の表（`docs/spec/routes.md` 2章。種類の表 `site/content/kinds.ts` と同じ行。
`python/route_spec_selftest.py` が突き合わせている）に当てて、その型の「入口」を出し、面に焼かれたパンくずと比べる。

| 見るもの | 落ちる形 |
| --- | --- |
| 入口を持つ面の、見えるパンくずの2段目（「島」の次） | 入口の名前でない（親を外した・別の入口の下に置いた） |
| 建物の外・表紙の面の2段目 | 入口の名前になっている（建物の外は入口を持たない） |
| 入口を持つ面に、見えるパンくずが在るか | 無い（親が分からない面） |
| 見えるパンくずと `BreadcrumbList` の名前の並び | 食い違う（#1201 の合格。見える字と機械に配る字を同じにする） |
| 面の道が、道の表のどれかの型に当たるか | 当たらない（表に無い面が書き出されている） |

**字は書き出したものから読む。** 面の側がパンくずをどう渡したか（`crumbsOf` か、手で書いたか）は見ない——
手で書いた面ほど、ここでしか捕まらない。

## 対照

`python/crumb_doors_selftest.py` が、こしらえた面（1面だけ親を外す・名札とずらす・建物の外に入口を付ける…）で
1本ずつ赤くなるかを見る。この道具そのものは書き出しが要るので、毎 PR の回し役からはその見張りが import して走らせる。
"""

from __future__ import annotations

import argparse
import html
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ROUTES_MD = ROOT / "docs" / "spec" / "routes.md"

#: 入口ではない「入口」欄の字（表紙・建物の外・廃止予定の控え）
NOT_DOOR = {"表紙", "建物の外", "—"}
#: 道の表に載らないが書き出される面（Next の 404）。入口を持たない
EXTRA_OUTSIDE = {"/404", "/_not-found"}
#: パンくずの頭（`site/lib/jsonld.tsx` の `SITE_ROOT_LABEL`）
ROOT_LABEL = "島"


def read_routes(md: str) -> list[tuple[str, str]]:
    """道の表の `(道の型, 入口)`。`<!-- routes:begin -->` と `<!-- routes:end -->` のあいだだけを読む。"""
    m = re.search(r"<!-- routes:begin -->(.*?)<!-- routes:end -->", md, re.S)
    if not m:
        return []
    out = []
    for line in m.group(1).splitlines():
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) < 4 or not cells[0].startswith("`/"):
            continue
        out.append((cells[0].strip("`"), cells[2]))
    return out


def route_of(routes: list[tuple[str, str]], path: str) -> tuple[str, str] | None:
    """道が当たる型。名指しの段（`/goods/stickers`）が `<…>` の段より先に当たる（`content/kinds.ts` の `routeOf` と同じ）。"""
    b = path.split("/")

    def hits(route: str) -> bool:
        a = route.split("/")
        return len(a) == len(b) and all(
            (re.fullmatch(r"[a-z0-9-]+", y) is not None) if re.fullmatch(r"<.+>", x) else x == y for x, y in zip(a, b)
        )

    for r in sorted(routes, key=lambda r: r[0].count("<")):
        if hits(r[0]):
            return r
    return None


_TAG = re.compile(r"<[^>]+>")


def _text(s: str) -> str:
    return html.unescape(_TAG.sub("", s)).strip()


def visible_crumbs(doc: str) -> list[str] | None:
    """見えるパンくずの字（頭の「島」を含む）。パンくずが無ければ `None`。"""
    m = re.search(r'<nav class="crumbs"[^>]*>(.*?)</nav>', doc, re.S)
    if not m:
        return None
    return [_text(x) for x in re.findall(r"<(?:a|b)\b[^>]*>(.*?)</(?:a|b)>", m.group(1), re.S)]


def ld_crumbs(doc: str) -> list[str] | None:
    """`BreadcrumbList` の名前の並び（position の順）。無ければ `None`。"""
    for body in re.findall(r'<script type="application/ld\+json"[^>]*>(.*?)</script>', doc, re.S):
        try:
            data = json.loads(html.unescape(body))
        except ValueError:
            continue
        stack = [data]
        while stack:
            x = stack.pop()
            if isinstance(x, list):
                stack.extend(x)
            elif isinstance(x, dict):
                if x.get("@type") == "BreadcrumbList":
                    items = sorted(x.get("itemListElement") or [], key=lambda i: i.get("position", 0))
                    return [str(i.get("name", "")) for i in items]
                stack.extend(x.values())
    return None


def path_of(dist: Path, f: Path) -> str:
    rel = f.relative_to(dist).as_posix()[: -len(".html")]
    if rel == "index":
        return "/"
    if rel.endswith("/index"):
        rel = rel[: -len("/index")]
    return "/" + rel


def judge(path: str, doc: str, routes: list[tuple[str, str]]) -> tuple[str, str] | None:
    """1面ぶんの判定。合っていれば `None`、外れていれば `(種類, 字)`。島の面でない（パンくずも道の型も無い）面は `("skip", …)`。"""
    doors = {e for _, e in routes if e not in NOT_DOOR}
    seen = visible_crumbs(doc)
    hit = route_of(routes, path)
    if path in EXTRA_OUTSIDE:
        entrance = "建物の外"
    elif hit:
        entrance = hit[1]
    elif seen is None:
        # `public/` の月末の面など、島の外の面（仕様5章）。パンくずを持たないので数えない
        return ("skip", path)
    else:
        return ("表に無い面", f"{path}（パンくず {' › '.join(seen)}）")
    if seen is None:
        if entrance in doors:
            return ("パンくずが無い", f"{path}（入口は {entrance}）")
        return None  # 表紙・建物の外の道具で、パンくずを持たない面
    second = seen[1] if len(seen) > 1 else ""
    if entrance in doors and second != entrance:
        return ("2段目が入口でない", f"{path}: {' › '.join(seen)}（入口は {entrance}）")
    if entrance not in doors and second in doors:
        return ("建物の外が入口を持つ", f"{path}: {' › '.join(seen)}")
    ld = ld_crumbs(doc)
    if ld is not None and ld != seen:
        return ("名札と食い違う", f"{path}: 見える {' › '.join(seen)} ／ BreadcrumbList {' › '.join(ld)}")
    if ld is None and len(seen) > 1:
        return ("名札が無い", f"{path}: {' › '.join(seen)}")
    return None


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--dist", required=True, help="書き出した置き場（tools/build.sh の site/.next-<ポート>）")
    ap.add_argument("--routes", default=str(ROUTES_MD), help="道の表（既定は docs/spec/routes.md）")
    a = ap.parse_args(argv)

    routes = read_routes(Path(a.routes).read_text(encoding="utf-8"))
    doors = sorted({e for _, e in routes if e not in NOT_DOOR})
    if len(routes) < 10 or not doors:
        print(f"数えるものが無い: 道の表が読めない（{a.routes}。型 {len(routes)}・入口 {len(doors)}）")
        return 2
    dist = Path(a.dist)
    files = sorted(f for f in dist.rglob("*.html") if "_next" not in f.parts)
    if not files:
        print(f"数えるものが無い: {dist} に書き出した面が無い")
        return 2

    by_door: dict[str, int] = {}
    bad: list[tuple[str, str]] = []
    counted = 0
    for f in files:
        path = path_of(dist, f)
        doc = f.read_text(encoding="utf-8", errors="replace")
        got = judge(path, doc, routes)
        if got and got[0] == "skip":
            continue
        counted += 1
        if got:
            bad.append(got)
            continue
        seen = visible_crumbs(doc) or []
        key = seen[1] if len(seen) > 1 and seen[1] in doors else "（入口を持たない面）"
        by_door[key] = by_door.get(key, 0) + 1

    if counted < 20:
        print(f"数えるものが無い: 島の面が {counted} 枚しか見つからない（{dist}）")
        return 2
    print(f"入口 {len(doors)} つ・書き出した島の面 {counted} 枚")
    for d in doors + ["（入口を持たない面）"]:
        print(f"  {d}: {by_door.get(d, 0)}面")
    if bad:
        print(f"\n合わない面 {len(bad)} 枚:")
        for kind, why in bad:
            print(f"  NG {kind}: {why}")
        return 1
    print("全部の面で、パンくずの2段目が道の表の入口と同じ（見えるパンくず＝BreadcrumbList）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
