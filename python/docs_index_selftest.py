"""**台帳（`docs/README.md`）に載っていない文書を、置けないようにする。**

    python3 python/docs_index_selftest.py
    BREAK=cover python3 python/docs_index_selftest.py   # 対照が効いていることを見る

終了コード 0=通った / 1=落ちた / **2=数えるものが無い・対照が外れた**。

## なぜ要るか

`docs/` に46本・4万2千行が平らに並び、仕様・手順・現状の表・日付つきの記録が
同じ箱に混ざっていた（2026-11-22）。「作る前に読むもの」が1万9千行の記録を
指していた。**文書は種別を1つ持つ**と決めて（`docs/adr/0001-docs-kinds.md`）、
全部を台帳に1行ずつ載せた。足すときに種別を付け忘れると、ここが落ちる。

## 見るもの（両側）

1. 直下の `*.md` と `docs/**/*.md` が、ぜんぶ台帳のどれかの行に入る
   （**台帳に無い文書が在る**を見つける）
2. 台帳の行が指す文書・箱が、ぜんぶ在る（**消した文書の行が残っている**を見つける）
3. 種別は 仕様・決定・手順・台帳・記録 の5つだけ。同じ文書が2行無い

台帳の行が `/` で終わるとき（`docs/adr/`）は、その箱の中の文書をまとめて1行で受ける。

## 対照

本物を見る前に、こしらえた文書と台帳で `judge()` を当てる。外れたら 2 で止まる
（`docs/island-standards.md` §15）。`BREAK=cover|ghost|kind` で守りを1つずつ外せる。
"""
from __future__ import annotations

import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INDEX = ROOT / "docs" / "README.md"
KINDS = ("仕様", "決定", "手順", "台帳", "記録")
# 指示（プロンプト）は文書の種別を持たない（台帳の8章）。直下ではこの1本だけ
PROMPTS = {"CLAUDE.md"}
BREAK = os.environ.get("BREAK", "")
ROW = re.compile(r"^\|\s*`([^`]+)`\s*\|\s*([^|]+?)\s*\|")


def index_rows(text: str) -> list:
    """台帳の行を (道, 種別) で返す。種別の欄に5つのどれかが在る行だけが、文書の行。"""
    rows = []
    for line in text.splitlines():
        m = ROW.match(line)
        if not m:
            continue
        path, kind = m.group(1), m.group(2)
        if path.endswith(".md") or path.endswith("/"):
            # 8章（プロンプトの置き場）の行は、文書の行ではない
            if path.startswith(".claude/") or path in PROMPTS:
                continue
            rows.append((path, kind))
    return rows


def real_files(root: Path) -> list:
    out = [p.name for p in sorted(root.glob("*.md")) if p.name not in PROMPTS]
    docs = root / "docs"
    if docs.exists():
        out += [p.relative_to(root).as_posix() for p in sorted(docs.rglob("*.md"))]
    return out


def covered(path: str, rows: list) -> bool:
    for row, _ in rows:
        if row == path or (row.endswith("/") and path.startswith(row)):
            return True
    return False


def judge(rows: list, files: list, exists) -> list:
    """違反を1行ずつ返す。`exists(道)` は、その文書・箱が在るかを返す関数。"""
    bad = []
    seen = set()
    for path, kind in rows:
        if path in seen:
            bad.append(f"台帳に同じ文書が2行在る: {path}")
        seen.add(path)
        if BREAK != "kind" and kind not in KINDS:
            bad.append(f"種別が5つのどれでもない: {path}（{kind}）")
        if BREAK != "ghost" and not exists(path):
            bad.append(f"台帳の行が指す文書が無い: {path}")
    if BREAK != "cover":
        for f in files:
            if not covered(f, rows):
                bad.append(f"台帳に載っていない文書が在る: {f}")
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
    rows = [("docs/a.md", "仕様"), ("docs/adr/", "決定"), ("README.md", "台帳")]
    files = ["README.md", "docs/a.md", "docs/adr/0001-x.md", "docs/adr/README.md"]
    have = set(files) | {"docs/adr/"}
    ex = lambda p: p in have  # noqa: E731
    ok(judge(rows, files, ex) == [], "揃っている台帳と文書は、違反0")
    ok(covered("docs/adr/0001-x.md", rows), "`/` で終わる行は、箱の中の文書をまとめて受ける")
    ok(not covered("docs/adrx.md", rows), "箱の名前で始まるだけの文書は受けない")
    got = judge(rows, files + ["docs/new.md"], ex)
    ok(any("docs/new.md" in b for b in got), "台帳に無い文書を足すと、名指しで落ちる（cover）")
    got = judge(rows + [("docs/gone.md", "手順")], files, ex)
    ok(any("docs/gone.md" in b for b in got), "消した文書の行が残っていると落ちる（ghost）")
    got = judge([("docs/a.md", "メモ")] + rows[1:], files, ex)
    ok(any("メモ" in b for b in got), "5つに無い種別は落ちる（kind）")
    got = judge(rows + [rows[0]], files, ex)
    ok(any("2行" in b for b in got), "同じ文書が2行在ると落ちる")
    text = "| 文書 | 種別 | 何を持つか |\n| --- | --- | --- |\n| `docs/a.md` | 仕様 | x |\n| `.claude/skills/<名前>/SKILL.md` | 手順 | y |\n| `python/x.py` | 手順 | z |\n| `CLAUDE.md` | いつも守ること | w |"
    ok(index_rows(text) == [("docs/a.md", "仕様")], "台帳の読みかた: 文書の行だけを拾う（見出し・罫線・プロンプトの表・道具を飛ばす）")


def main() -> int:
    print("=== 文書を、台帳と突き合わせる ===")
    print("[対照] こしらえた文書と台帳")
    drill()
    if FAILED:
        print(f"\n✕ 対照が {len(FAILED)}件 外れました。本物は見ません: {' / '.join(FAILED)}")
        return 2

    rows = index_rows(INDEX.read_text(encoding="utf-8")) if INDEX.exists() else []
    files = real_files(ROOT)
    print(f"\n[本物] 台帳 {len(rows)}行 ／ 文書 {len(files)}本")
    if not rows or not files:
        print("✕ 数えるものが無い（台帳の行か、文書が0）")
        return 2
    bad = judge(rows, files, lambda p: (ROOT / p).exists())
    for b in bad:
        print(f"  NG  {b}")
    if bad:
        print(f"\n✕ {len(bad)}件 落ちました。")
        print("  文書を足したら・消したら、`docs/README.md` の台帳を同じ PR で直してください（決まり D-8）。")
        print("  種別は 仕様・決定・手順・台帳・記録 のどれか1つです。")
        return 1
    print(f"○ 文書 {len(files)}本が、ぜんぶ台帳に載っている。台帳の行は、ぜんぶ実在する")
    return 0


if __name__ == "__main__":
    sys.exit(main())
