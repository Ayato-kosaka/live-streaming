"""**仕様の表に無い道の型を、足せないようにする。**

    python3 python/route_spec_selftest.py            # 置き場の道と、仕様の表を突き合わせる
    BREAK=cover python3 python/route_spec_selftest.py  # 対照が効いていることを見る（下の「対照」）

終了コード 0=通った / 1=落ちた / **2=数えるものが無い・対照が外れた**。

## なぜ要るか

面を1つ足すたびに、道の型・建物・表を1つずつ足してきた。足した日は正しく、
あとから「同じことを言う別の道」が残った（#1274）。**道の型は数えられる**ので、
足す前に仕様（`docs/spec/routes.md` の2章の表）へ書かせる。書かずに
`site/app` に新しい型を置くと、ここが落ちる。決めた理由は
`docs/adr/0008-feature-design-gate.md`。

## 見るもの（両側）

1. `site/app/**/page.tsx` の道が、ぜんぶ仕様の表のどれかの型に当たる
   （**仕様に無い道が、置き場に在る**を見つける）
2. 仕様の表で「現行」の型が、ぜんぶ置き場に1つ以上在る
   （**置き場に無い道が、仕様に残っている**を見つける）
3. 表の状態は「現行」か「廃止予定」だけ。種類と入口が空でない。同じ型が2行無い

片側だけだと、表を空にしても・表に何でも当たる行を足しても通る。

4. **種類の表（`site/content/kinds.ts` の `KINDS`）が、仕様の表と同じ行を同じ並びで持つ**（#1357）。
   sitemap・`/all`・パンくずはあちらから出るので、仕様だけ直して種類の表を直さないと、
   仕様の上で畳んだ道が索引に残る（逆も）

## 型の当てかた

仕様の `<…>` は「名前が1つ入る段」。置き場の `[slug]` にも、名指しの段
（`/travel/bulgaria/sofia` の `bulgaria`）にも当たる。段の数は同じでなければ当たらない。
`<…>` でない段は、字が同じときだけ当たる。

## 対照

本物を見る前に、こしらえた道と表で `judge()` を当てる。**対照が1本でも外れたら、
本物の数を1つも出さずに 2 で止まる**（`docs/island-standards.md` §15）。
`BREAK=cover|ghost|state|kinds` で、守りを1つずつ外した判定に差し替えられる。
外した足だけが落ちる。
"""
from __future__ import annotations

import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "python"))
from ts_read import read_array  # noqa: E402
SPEC = ROOT / "docs" / "spec" / "routes.md"
APP = ROOT / "site" / "app"
KINDS = ROOT / "site" / "content" / "kinds.ts"
STATES = ("現行", "廃止予定")
BREAK = os.environ.get("BREAK", "")


def spec_rows(text: str) -> list:
    """仕様の表（`routes:begin`〜`routes:end`）を、(型, 種類, 入口, 状態) の並びで返す。"""
    m = re.search(r"<!-- routes:begin -->(.*?)<!-- routes:end -->", text, re.S)
    if not m:
        return []
    rows = []
    for line in m.group(1).splitlines():
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) != 4 or not cells[0].startswith("`/"):
            continue
        rows.append((cells[0].strip("`"), cells[1], cells[2], cells[3]))
    return rows


def kind_rows(text: str) -> list:
    """種類の表（`kinds.ts` の `KINDS`）を、(型, 種類, 入口, 状態) の並びで返す。

    読み手は `ts_read.read_array` の1本（字を正規表現で読まない）。読み落としが在れば空を返して 2 で止める。
    """
    got = read_array(text, "KINDS", keys=("route", "kind", "entrance", "state"), id_key="route")
    if got.missed:
        return []
    return [(r["route"], r["kind"], r["entrance"], r["state"]) for r in got.rows]


def kinds_judge(spec: list, kinds: list) -> list:
    """仕様の表と種類の表の食い違いを、1行ずつ。"""
    if BREAK == "kinds":
        return []
    bad = []
    for r in spec:
        if r not in kinds:
            bad.append(f"仕様の行が、種類の表（kinds.ts）に無い（か字が違う）: {r[0]}")
    for r in kinds:
        if r not in spec:
            bad.append(f"種類の表（kinds.ts）の行が、仕様に無い（か字が違う）: {r[0]}")
    if not bad and spec != kinds:
        bad.append("種類の表（kinds.ts）の並びが、仕様の表と違う")
    return bad


def app_routes(app: Path) -> list:
    """`site/app` の `page.tsx` から、道を並べる。"""
    out = []
    for p in sorted(app.rglob("page.tsx")):
        rel = p.parent.relative_to(app).as_posix()
        out.append("/" if rel == "." else "/" + rel)
    return out


def segs(path: str) -> list:
    return [s for s in path.split("/") if s]


def hits(pattern: str, route: str) -> bool:
    """仕様の型が、置き場の道に当たるか。"""
    a, b = segs(pattern), segs(route)
    if len(a) != len(b):
        return False
    for x, y in zip(a, b):
        if x.startswith("<") and x.endswith(">"):
            continue
        if x != y:
            return False
    return True


def judge(rows: list, routes: list) -> list:
    """違反を、人が読める1行ずつで返す。無ければ空。"""
    bad = []
    seen = set()
    for pat, kind, door, state in rows:
        if pat in seen:
            bad.append(f"仕様の表に同じ型が2行在る: {pat}")
        seen.add(pat)
        if BREAK != "state" and state not in STATES:
            bad.append(f"状態が「現行」「廃止予定」のどちらでもない: {pat}（{state}）")
        if not kind or not door:
            bad.append(f"種類か入口が空: {pat}")
    if BREAK != "cover":
        for r in routes:
            if not any(hits(pat, r) for pat, *_ in rows):
                bad.append(f"仕様の表に無い道が、置き場に在る: {r}")
    if BREAK != "ghost":
        for pat, _, _, state in rows:
            if state == "現行" and not any(hits(pat, r) for r in routes):
                bad.append(f"仕様で「現行」の型が、置き場に無い: {pat}")
    return bad


CHECKED = 0
FAILED: list = []


def ok(cond: bool, label: str) -> None:
    global CHECKED
    CHECKED += 1
    print(f"  {'ok' if cond else 'NG'}  {label}")
    if not cond:
        FAILED.append(label)


def drill() -> None:
    """こしらえた道と表で、判定を両側から当てる。"""
    rows = [
        ("/", "表紙", "表紙", "現行"),
        ("/travel/<国>", "国", "歩いた国", "現行"),
        ("/travel/<国>/<街>", "街", "歩いた国", "現行"),
        ("/now", "いまどこ", "—", "廃止予定"),
    ]
    routes = ["/", "/travel/[slug]", "/travel/bulgaria/sofia", "/now"]
    ok(judge(rows, routes) == [], "揃っている表と道は、違反0")
    ok(judge(rows, routes[:-1]) == [], "廃止予定の型は、置き場に無くても落ちない")
    ok(hits("/travel/<国>/<街>", "/travel/bulgaria/sofia"), "名前の段は、名指しの段に当たる")
    ok(not hits("/travel/<国>", "/travel/bulgaria/sofia"), "段の数が違えば当たらない")
    ok(not hits("/travel/<国>", "/island/[chapter]"), "頭の字が違えば当たらない")
    got = judge(rows, routes + ["/india"])
    ok(any("/india" in b for b in got), "仕様に無い道を足すと、名指しで落ちる（cover）")
    got = judge(rows, ["/", "/travel/[slug]", "/now"])
    ok(any("/travel/<国>/<街>" in b for b in got), "現行の型が置き場から消えると、名指しで落ちる（ghost）")
    got = judge(rows[:-1] + [("/now", "いまどこ", "—", "たぶん現行")], routes)
    ok(any("たぶん現行" in b for b in got), "決まっていない状態の字は落ちる（state）")
    got = judge(rows + [rows[1]], routes)
    ok(any("2行" in b for b in got), "同じ型が2行在ると落ちる")
    ok(spec_rows("<!-- routes:begin -->\n| 道の型 | 種類 | 入口 | 状態 |\n| --- | --- | --- | --- |\n"
                 "| `/a/<x>` | 国 | 歩いた国 | 現行 |\n<!-- routes:end -->") == [("/a/<x>", "国", "歩いた国", "現行")],
       "表の読みかた: 見出しと罫線を飛ばして、行だけを拾う")
    ok(spec_rows("表が無い") == [], "印が無ければ、行は0")
    ok(kinds_judge(rows, list(rows)) == [], "仕様と同じ種類の表は、違反0")
    ok(any("/now" in b for b in kinds_judge(rows, rows[:-1])), "種類の表から行が抜けると、名指しで落ちる（kinds）")
    ok(any("/india" in b for b in kinds_judge(rows, rows + [("/india", "国", "歩いた国", "現行")])),
       "種類の表にだけ在る行は、名指しで落ちる（kinds）")
    ok(bool(kinds_judge(rows, rows[1:] + rows[:1])), "並びが違えば落ちる（kinds）")
    ok(kind_rows('export const KINDS = [\n  { route: "/a", kind: "国", entrance: "歩いた国", state: "現行" },\n] as const')
       == [("/a", "国", "歩いた国", "現行")], "種類の表の読みかた")


def main() -> int:
    print("=== 道の型を、仕様の表と突き合わせる ===")
    print("[対照] こしらえた道と表")
    drill()
    if FAILED:
        print(f"\n✕ 対照が {len(FAILED)}件 外れました。本物は見ません: {' / '.join(FAILED)}")
        return 2

    rows = spec_rows(SPEC.read_text(encoding="utf-8")) if SPEC.exists() else []
    routes = app_routes(APP) if APP.exists() else []
    print(f"\n[本物] 仕様の表 {len(rows)}行 ／ 置き場の道 {len(routes)}本")
    if not rows or not routes:
        print("✕ 数えるものが無い（仕様の表か、置き場の道が0）")
        return 2
    kinds = kind_rows(KINDS.read_text(encoding="utf-8")) if KINDS.exists() else []
    print(f"       種類の表（kinds.ts） {len(kinds)}行")
    if not kinds:
        print("✕ 種類の表が読めない（site/content/kinds.ts の KINDS）")
        return 2
    bad = judge(rows, routes) + kinds_judge(rows, kinds)
    for b in bad:
        print(f"  NG  {b}")
    if bad:
        print(f"\n✕ {len(bad)}件 落ちました。")
        print("  道の型を足す・動かす・畳むときは、先に `/feature-design` を通し、")
        print("  `docs/spec/routes.md` の2章の表を同じ PR で直してください（決まり R-5）。")
        return 1
    print(f"○ 置き場の道 {len(routes)}本が、ぜんぶ仕様の型に当たる。現行の型は、ぜんぶ置き場に在る")
    return 0


if __name__ == "__main__":
    sys.exit(main())
