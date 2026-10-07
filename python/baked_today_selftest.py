"""**画面の「今日」を、書いた日で止めていないか**を site のソースから見る。

    python3 python/baked_today_selftest.py
    python3 python/baked_today_selftest.py --dir /tmp/写し

終了コード 0=通った / 1=見つかった / **2=数えるものが無い**。

ネットも鍵も要らない。読むのは `site/` のソースだけ。

## なぜ要るか

あやと島は静的書き出し（`output: "export"`）なので、**焼いた HTML が
「JS の動かない読み手に見える全部」**になる。OGP の下見も、検索の下見も、
JS を切った人も、そこしか読まない。

その「焼くときの今日」を `new Date("2026-09-05")` と手で書いた字が、
2026-10-06 までに3か所あった。書いた日で止まる日付なので、

- `/map/sweden` … `<b>-15</b><span>いた日数</span>`。**2026-09-05 より後に
  入った国は、必ずマイナスの日数**になる。本番の HTML にそのまま入っていた
- `/map/<国>` … パスポートの「出国」が、もう出た国でも「まだ、いる」
- `/about` … 年齢。**誕生日（12-06）を過ぎた日から、焼いた HTML だけ1つ若い**

`components/atlas/Days.tsx` は 2026-09-18 に同じ字を `BUILT_AT` へ直しているが、
**残り2か所は18日間そのまま残った**（`docs/island-misses.md` #5 #6
「1件直したら、同じ理由で壊れているところを探しに行く」）。
人が探しにいく形では、また同じだけ残る。ここで数える。

## 正しい形

焼くときの「今日」は `site/lib/builtAt.ts` の `BUILT_AT` ひとつから出す。
ビルドのたびに `next.config.mjs` が入れるので、毎晩の焼き直しで追いつく。
サーバ側とブラウザ側の1回目が同じ字になるので、水あわせも落ちない。

引き算の答えは **0 で止める**。開発サーバでは `BUILT_AT` が1970年になるので、
止めないとそこでもマイナスが出る。**日数にも年齢にもマイナスは無い。**

## 何を拾うか

`new Date(` と `Date.parse(` の引数が、**その場に書いた日付**のもの。

| 拾う | 拾わない |
| --- | --- |
| `new Date("2026-09-05")` | `new Date(from)`（渡された値） |
| `new Date('2026/09/05')` | ``new Date(`${iso}T00:00:00Z`)``（組み立て。6か所ある） |
| ``new Date(`2026-09-05`)`` | `new Date()`（本物の今日。画面が出てから呼ぶぶん） |
| `new Date(2026, 8, 5)` | `new Date(BUILT_AT)` |
| `Date.parse("2026-09-05")` | `Date.parse(`${out}T00:00:00Z`)` |

**注釈の中も拾う。** 合否を人が見るときの手は
`grep -rn 'new Date("20' site/app site/components` で、あれは注釈と中身を
見分けない。注釈に見本として書いてあると、**grep が 0 にならないのに
中身は直っている**という、いちばん読み違えやすい形になる。
説明したいときは字を崩して書く（「日付を直に書いた `new Date`」）。

## 対照（`docs/island-standards.md` §15）

本物を数えるだけだと、**探し方そのものが壊れていても 0 件**が出る。
ここは常に 0 件で通るのが正常なので、なおさら見分けがつかない。
だから本物を数える前に、偽の木を建てて

  - 直書きを1行置いた木 → **見つける**（しかも行番号と字の頭が出る）
  - 直った形だけの木（`BUILT_AT` / 渡された値 / 組み立て） → **1件も拾わない**
  - 見るものが1ファイルも無い木 → **2**

を実測する。1つでも外れたら、本物の数字を1つも出さずに 2 で落ちる。
"""

from __future__ import annotations

import argparse
import re
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent

# 見に行く置き場（`site/` から見た相対）。**ここを増やしたら分母も増える**
DIRS = ("app", "components", "lib", "content")
EXTS = (".ts", ".tsx")

# 引数が「その場に書いた日付」のもの。
# 文字どおりの引用符で始まり、すぐ4桁の年が来るものだけを拾う。
# ``new Date(`${iso}T00:00:00Z`)`` は `$` が来るので当たらない（6か所ある）。
HARD = re.compile(
    r"""(?:new\s+Date|Date\.parse)\s*\(\s*(?:["'`]\s*\d{4}|\d{4}\s*,)"""
)

# **見送り。** 拾いはしたが、焼いた「今日」ではないと決めたもの。
# 鍵は（`site/` から見た道, 字の頭40文字）。**字を書き直すと鍵が外れて、また赤くなる。**
# 黙って落とさずに数を表へ出す（`docs/island-standards.md` §15）。
ALLOW: dict[tuple[str, str], str] = {}


def files(site: Path) -> list[Path]:
    out: list[Path] = []
    for d in DIRS:
        root = site / d
        if not root.is_dir():
            continue
        out += [
            p for p in sorted(root.rglob("*"))
            if p.suffix in EXTS and "node_modules" not in p.parts
        ]
    return out


def scan(site: Path) -> tuple[list[tuple[str, int, str]], int, int]:
    """（見つけたもの, 見たファイル数, 見送った数）を返す。"""
    hits: list[tuple[str, int, str]] = []
    seen = 0
    waived = 0
    for p in files(site):
        seen += 1
        rel = p.relative_to(site).as_posix()
        for i, line in enumerate(p.read_text(encoding="utf-8").splitlines(), 1):
            if not HARD.search(line):
                continue
            head = line.strip()[:40]
            if (rel, head) in ALLOW:
                waived += 1
                continue
            hits.append((rel, i, head))
    return hits, seen, waived


# ---- 対照 --------------------------------------------------------------

GREEN = {
    # 直した形。どれも拾ってはいけない
    "app/a/parts.tsx": (
        'import { BUILT_AT } from "@/lib/builtAt";\n'
        "const baked = Math.max(0, days(from, BUILT_AT));\n"
    ),
    "components/b.tsx": (
        "const n = Math.floor((Date.now() - new Date(from).getTime()) / 86400000);\n"
        'const w = "日月火水木金土"[new Date(`${iso}T00:00:00Z`).getUTCDay()];\n'
        "const t = Date.parse(`${out}T00:00:00Z`);\n"
        "useEffect(() => setN(years(born, new Date())), [born]);\n"
    ),
    "lib/c.ts": "export const BUILT_AT = new Date(process.env.NEXT_PUBLIC_BUILT_AT ?? 0);\n",
}

RED = {
    # 直書き。ぜんぶ拾わなければならない
    'new Date("…")': 'const baked = days(from, new Date("2026-09-05"));\n',
    "new Date('…')": "const baked = days(from, new Date('2026/09/05'));\n",
    "new Date(`…`)": "const baked = days(from, new Date(`2026-09-05`));\n",
    "new Date(年, 月, 日)": "const baked = days(from, new Date(2026, 8, 5));\n",
    "Date.parse(\"…\")": 'const t = Date.parse("2026-09-05T00:00:00Z");\n',
    "注釈の中": '/* ここには `new Date("2026-09-05")` が書いてあった */\n',
}

FAILED: list[str] = []
CHECKED = 0


def ok(cond: bool, what: str) -> None:
    global CHECKED
    CHECKED += 1
    print(f"  {'○' if cond else '✕'} {what}")
    if not cond:
        FAILED.append(what)


def build(box: Path, tree: dict[str, str]) -> Path:
    site = box / "site"
    for rel, body in tree.items():
        f = site / rel
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_text(body, encoding="utf-8")
    return site


def drill() -> bool:
    """本物を数える前に、**探し方が効くか**を偽の木で実測する。"""
    print("\n[1] 対照（偽の木で、見つける側と落ちない側の両方を当てる）")
    with tempfile.TemporaryDirectory() as tmp:
        box = Path(tmp)

        # 1-1 直った形だけの木 → 1件も拾わない
        g = build(box / "green", GREEN)
        hits, seen, _ = scan(g)
        ok(seen == len(GREEN) and not hits,
           f"直った形だけの木（{len(GREEN)}ファイル）では1件も拾わない")

        # 1-2 直書きを1行ずつ混ぜる → ぜんぶ拾う
        for i, (name, body) in enumerate(RED.items()):
            red = build(box / f"red{i}", {**GREEN, "app/x.tsx": body})
            hits, _, _ = scan(red)
            got = [h for h in hits if h[0] == "app/x.tsx"]
            ok(len(got) == 1 and got[0][1] == 1 and got[0][2],
               f"直書きを見つける: {name}（行番号と字の頭つき）")

        # 1-3 見送りの表が効く
        body = 'const baked = days(from, new Date("2026-09-05"));\n'
        red = build(box / "waive", {"app/x.tsx": body})
        ALLOW[("app/x.tsx", body.strip()[:40])] = "対照"
        try:
            hits, _, waived = scan(red)
        finally:
            ALLOW.pop(("app/x.tsx", body.strip()[:40]))
        ok(not hits and waived == 1, "見送りに載せたものは拾わず、数だけ表に出す")

        # 1-4 見るものが無い木
        empty = build(box / "empty", {})
        (empty / "app").mkdir(parents=True, exist_ok=True)
        hits, seen, _ = scan(empty)
        ok(seen == 0, "見るものが1ファイルも無い木では、数えた数が 0 になる（＝2 で落ちる）")

    return not FAILED


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", default=str(REPO / "site"),
                    help="見に行く site の場所（既定はこのリポジトリ）")
    a = ap.parse_args()

    print("=== 焼いた「今日」を、書いた日で止めていないか ===")
    if not drill():
        print(f"\n✕ 対照が落ちました: {', '.join(FAILED)}")
        print("  探し方そのものが壊れています。本物の数字は1つも出しません。")
        return 2

    site = Path(a.dir)
    print(f"\n[2] 本物（{site}）")
    hits, seen, waived = scan(site)
    if seen == 0:
        print(f"  ✕ 見るものが1ファイルもありません（{site} / {', '.join(DIRS)}）")
        return 2
    print(f"  見たファイル {seen}本 / 見送り {waived}件 / 見つけた {len(hits)}件")
    if hits:
        print()
        for rel, line, head in hits:
            print(f"  ✕ site/{rel}:{line}  {head}")
        print()
        print("  焼くときの「今日」は `site/lib/builtAt.ts` の `BUILT_AT` から出す。")
        print("  引き算の答えは 0 で止める（開発サーバでは BUILT_AT が1970年）。")
        print("  手本は `site/components/atlas/Days.tsx`。")
        return 1
    print("  ○ 直書きの「今日」は1件もありません")
    print(f"\n○ {CHECKED}件の対照ぜんぶ通り、本物も {seen}本ぜんぶ白でした")
    return 0


if __name__ == "__main__":
    sys.exit(main())
