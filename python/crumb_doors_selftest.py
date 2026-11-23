"""`python/crumb_doors.py`（パンくずの2段目＝入口）の対照。**こしらえた面で、1本ずつ赤くなるか**を見る。

    python3 python/crumb_doors_selftest.py

終了コード **0=全部の対照が当たった / 1=外れた対照がある / 2=数えるものが無い**（道の表が読めない）。

道の表は本物（`docs/spec/routes.md` 2章）を読む。面だけをこしらえる——
「入口の歩いた国の下に旅の島」「建物の外の道具」「親を外した1面」「名札とずれた1面」…を置いて、
外したものだけが、外した理由の名前で落ちることを見る。本物の書き出しを数えるのは `crumb_doors.py --dist`。
"""

from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import crumb_doors as C  # noqa: E402

OK = 0
BAD = 0


def check(name: str, cond: bool, why: str = "") -> None:
    global OK, BAD
    if cond:
        OK += 1
        print(f"  ok   {name}")
    else:
        BAD += 1
        print(f"  NG   {name}{'  — ' + why if why else ''}")


def page(crumbs: list[str] | None, ld: list[str] | None = "same") -> str:
    """パンくず（頭の「島」を含む）と BreadcrumbList を持つ面。`ld="same"` は見えるものと同じ名札"""
    nav = ""
    if crumbs is not None:
        parts = [f'<a href="/">{crumbs[0]}</a>'] + [
            f'<span><i aria-hidden="true">›</i>{"<b>" + c + "</b>" if i == len(crumbs) - 2 else "<a href=" + chr(34) + "/x" + chr(34) + ">" + c + "</a>"}</span>'
            for i, c in enumerate(crumbs[1:])
        ]
        nav = f'<nav class="crumbs" aria-label="現在地">{"".join(parts)}</nav>'
    names = crumbs if ld == "same" else ld
    script = ""
    if names and len(names) > 1:
        data = {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            "itemListElement": [{"@type": "ListItem", "position": i + 1, "name": n, "item": "https://x/"} for i, n in enumerate(names)],
        }
        script = f'<script type="application/ld+json">{json.dumps(data, ensure_ascii=False)}</script>'
    return f"<html><body>{nav}{script}</body></html>"


def main() -> int:
    routes = C.read_routes(C.ROUTES_MD.read_text(encoding="utf-8"))
    doors = {e for _, e in routes if e not in C.NOT_DOOR}
    if len(routes) < 10 or len(doors) < 9:
        print(f"数えるものが無い: 道の表が読めない（型 {len(routes)}・入口 {len(doors)}）")
        return 2

    j = lambda p, d: C.judge(p, d, routes)  # noqa: E731
    kind = lambda g: g[0] if g else None  # noqa: E731

    # 足1 道の表から入口を引く
    check("足1 旅の1日は歩いた国", (C.route_of(routes, "/island/nordic/day/depart") or ("", ""))[1] == "歩いた国")
    check("足1b 名指しの段が先に当たる（/goods/stickers）", (C.route_of(routes, "/goods/stickers") or ("", ""))[0] == "/goods/stickers")
    check("足1c 表に無い道は当たらない", C.route_of(routes, "/nordic/photos") is None)

    # 足2 合っている面は通す
    check("足2 歩いた国の下の旅の島は通る", j("/island/nordic", page(["島", "歩いた国", "島の地図", "北欧周遊"])) is None)
    check("足2b 入口の建物の面そのものも通る", j("/kitchen", page(["島", "作った料理"])) is None)
    check("足2c 建物の外の道具は、入口でない2段目で通る", j("/cards/import", page(["島", "あやと島カード", "写真をまとめて登録"])) is None)
    check("足2d 表紙はパンくずが無くても通る", j("/", page(None)) is None)

    # 足3 1面だけ親を外すと赤（issue の対照）
    g = j("/island/nordic/guide", page(["島", "島の地図", "北欧周遊", "旅のしおり"]))
    check("足3 親（歩いた国）を外した面は落ちる", kind(g) == "2段目が入口でない", str(g))
    g = j("/cards", page(["島", "あやと島カード"]))
    check("足3b 入口の下にない面（カード）は落ちる", kind(g) == "2段目が入口でない", str(g))
    g = j("/months/2026-10", page(["島", "伝説の企画", "2026年10月"]))
    check("足3c 別の入口の下に置いた面は落ちる", kind(g) == "2段目が入口でない", str(g))

    # 足4 建物の外が入口を持つと赤
    g = j("/privacy", page(["島", "やってほしいこと", "プライバシーポリシー"]))
    check("足4 建物の外の面が入口の下に居ると落ちる", kind(g) == "建物の外が入口を持つ", str(g))

    # 足5 見えるパンくず＝BreadcrumbList
    g = j("/travel", page(["島", "歩いた国"], ld=["島", "旅の記録"]))
    check("足5 名札とずれると落ちる", kind(g) == "名札と食い違う", str(g))
    g = j("/island", page(["島", "歩いた国", "島の地図"], ld=None))
    check("足5b 名札が無いと落ちる", kind(g) == "名札が無い", str(g))

    # 足6 入口を持つのにパンくずが無い・表に無い面
    g = j("/updates", page(None))
    check("足6 入口を持つ面にパンくずが無いと落ちる", kind(g) == "パンくずが無い", str(g))
    g = j("/nordic/photos", page(["島", "島の地図", "旅の写真"]))
    check("足6b 道の表に無い面は落ちる", kind(g) == "表に無い面", str(g))
    g = j("/2026-10-monthly", page(None))
    check("足6c パンくずも型も無い面（島の外）は数えない", kind(g) == "skip", str(g))

    # 足7 置き場を歩いて数える（終了コード）
    with tempfile.TemporaryDirectory() as t:
        d = Path(t)
        (d / "island").mkdir()
        (d / "index.html").write_text(page(None), encoding="utf-8")
        (d / "island.html").write_text(page(["島", "歩いた国", "島の地図"]), encoding="utf-8")
        for i in range(25):
            (d / f"kitchen-{i}.html").write_text(page(None), encoding="utf-8")  # 島の外の面として数えない
        check("足7 島の面が少なすぎると 2", C.main(["--dist", t]) == 2)
        (d / "kitchen").mkdir()
        for i in range(25):
            (d / "kitchen" / f"dish-{i}.html").write_text(page(["島", "作った料理", f"料理{i}"]), encoding="utf-8")
        check("足7b 全部合えば 0", C.main(["--dist", t]) == 0)
        (d / "island" / "nordic.html").write_text(page(["島", "島の地図", "北欧周遊"]), encoding="utf-8")
        check("足7c 1面だけ親を外すと 1", C.main(["--dist", t]) == 1)

    print(f"\n{OK + BAD}件中 {OK}件通った")
    return 1 if BAD else 0


if __name__ == "__main__":
    sys.exit(main())
