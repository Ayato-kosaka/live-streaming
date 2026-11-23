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
4. 仕様・手順・台帳の文書は、題のすぐ下の1行で `種別: <台帳と同じ字>` を名乗る
   （**文書の頭と台帳が食い違う**を見つける）。記録と決定は直さない決まりなので
   名乗りを求めない。名乗っているなら台帳と同じ字でなければならない
5. 状態は 有効・北欧の旅だけ・廃止予定（#畳む issue）のどれか。「片づけ待ち」
   「一部古い」のように古さを状態で抱えない。廃止予定には畳む issue の番号が要る

台帳の行が `/` で終わるとき（`docs/adr/`）は、その箱の中の文書をまとめて1行で受ける。

## 対照

本物を見る前に、こしらえた文書と台帳で `judge()` を当てる。外れたら 2 で止まる
（`docs/island-standards.md` §15）。`BREAK=cover|ghost|kind|head|state` で守りを1つずつ外せる。
"""
from __future__ import annotations

import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INDEX = ROOT / "docs" / "README.md"
KINDS = ("仕様", "決定", "手順", "台帳", "記録")
# 直さない決まりの種別。頭の1行も足さないので、名乗りを求めない
FROZEN = ("記録", "決定")
STATE = re.compile(r"^(有効|北欧の旅だけ|廃止予定（#\d+）)$")
HEAD = re.compile(r"^種別:\s*(\S+)\s*$")
# 指示（プロンプト）は文書の種別を持たない（台帳の8章）。直下ではこの1本だけ
PROMPTS = {"CLAUDE.md"}
BREAK = os.environ.get("BREAK", "")
ROW = re.compile(r"^\|\s*`([^`]+)`\s*\|\s*([^|]+?)\s*\|")


def index_table(text: str) -> list:
    """台帳の行を (道, 種別, 状態) で返す。状態は行のいちばん右の欄。"""
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
            cells = [c.strip() for c in line.strip().strip("|").split("|")]
            rows.append((path, kind, cells[-1]))
    return rows


def index_rows(text: str) -> list:
    """台帳の行を (道, 種別) で返す。"""
    return [(p, k) for p, k, _ in index_table(text)]


def declared_kind(text: str):
    """題（最初の `# `）のすぐ下の、空でない1行が名乗る種別。名乗っていなければ None。"""
    lines = text.splitlines()
    for i, line in enumerate(lines):
        if line.startswith("# "):
            for nxt in lines[i + 1:]:
                if nxt.strip():
                    m = HEAD.match(nxt.strip())
                    return m.group(1) if m else None
            return None
    return None


def judge_heads(rows: list, read) -> list:
    """文書の頭の名乗りと、台帳の種別を突き合わせる。`read(道)` は中身を返す（無ければ None）。"""
    bad = []
    if BREAK == "head":
        return bad
    for path, kind in rows:
        if not path.endswith(".md"):
            continue  # `docs/adr/` のような箱の行は、中が決定なので見ない
        text = read(path)
        if text is None:
            continue  # 無い文書は ghost が拾う
        got = declared_kind(text)
        if got is None:
            if kind not in FROZEN:
                bad.append(f"頭に種別の1行が無い: {path}（台帳は {kind}。題のすぐ下に `種別: {kind}`）")
        elif got != kind:
            bad.append(f"頭の種別と台帳が食い違う: {path}（頭は {got}、台帳は {kind}）")
    return bad


def judge_states(table: list) -> list:
    if BREAK == "state":
        return []
    return [f"状態が 有効・北欧の旅だけ・廃止予定（#番号）のどれでもない: {p}（{s}）"
            for p, _, s in table if not STATE.match(s)]


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

    # 頭の名乗り（4）
    docs = {
        "docs/a.md": "# A\n\n種別: 仕様\n\n本文",
        "docs/r.md": "# R\n\n日付つきの記録",
        "README.md": "# 入口\n種別: 台帳\n",
    }
    hrows = [("docs/a.md", "仕様"), ("docs/r.md", "記録"), ("README.md", "台帳"), ("docs/adr/", "決定")]
    rd = lambda p: docs.get(p)  # noqa: E731
    ok(judge_heads(hrows, rd) == [], "名乗りが台帳と同じ・記録は名乗らなくてよい・箱の行は見ない、で違反0")
    ok(declared_kind("# T\n\n種別: 手順\n") == "手順", "題のすぐ下の `種別:` を読む")
    ok(declared_kind("# T\n\n本文\n\n種別: 手順\n") is None, "題のすぐ下でない `種別:` は名乗りにしない")
    got = judge_heads(hrows, lambda p: "# A\n\n本文" if p == "docs/a.md" else docs.get(p))
    ok(any("docs/a.md" in b and "無い" in b for b in got), "仕様が名乗っていないと落ちる（head）")
    got = judge_heads(hrows, lambda p: "# A\n\n種別: 手順\n" if p == "docs/a.md" else docs.get(p))
    ok(any("食い違う" in b for b in got), "頭と台帳の種別が違うと落ちる（head）")
    got = judge_heads(hrows, lambda p: "# R\n\n種別: 仕様\n" if p == "docs/r.md" else docs.get(p))
    ok(any("docs/r.md" in b for b in got), "記録が別の種別を名乗ると落ちる（head）")

    # 状態（5）
    good = [("docs/a.md", "仕様", "有効"), ("docs/b.md", "仕様", "北欧の旅だけ"), ("docs/c.md", "仕様", "廃止予定（#1277）")]
    ok(judge_states(good) == [], "有効・北欧の旅だけ・廃止予定（#番号）は通る")
    for s in ("片づけ待ち", "一部古い", "廃止予定"):
        ok(bool(judge_states(good + [("docs/x.md", "記録", s)])), f"状態「{s}」は落ちる（state）")
    t2 = "| `docs/a.md` | 仕様 | x | 廃止予定（#12） |"
    ok(index_table(t2) == [("docs/a.md", "仕様", "廃止予定（#12）")], "台帳の読みかた: 状態はいちばん右の欄")


def main() -> int:
    print("=== 文書を、台帳と突き合わせる ===")
    print("[対照] こしらえた文書と台帳")
    drill()
    if FAILED:
        print(f"\n✕ 対照が {len(FAILED)}件 外れました。本物は見ません: {' / '.join(FAILED)}")
        return 2

    table = index_table(INDEX.read_text(encoding="utf-8")) if INDEX.exists() else []
    rows = [(p, k) for p, k, _ in table]
    files = real_files(ROOT)
    print(f"\n[本物] 台帳 {len(rows)}行 ／ 文書 {len(files)}本")
    if not rows or not files:
        print("✕ 数えるものが無い（台帳の行か、文書が0）")
        return 2
    bad = judge(rows, files, lambda p: (ROOT / p).exists())

    def read(p):
        f = ROOT / p
        return f.read_text(encoding="utf-8") if f.is_file() else None

    bad += judge_heads(rows, read)
    bad += judge_states(table)
    named = sum(1 for p, k in rows if p.endswith(".md") and k not in FROZEN)
    for b in bad:
        print(f"  NG  {b}")
    if bad:
        print(f"\n✕ {len(bad)}件 落ちました。")
        print("  文書を足したら・消したら、`docs/README.md` の台帳を同じ PR で直してください（決まり D-8）。")
        print("  種別は 仕様・決定・手順・台帳・記録 のどれか1つです。")
        print("  仕様・手順・台帳の文書は、題のすぐ下に `種別: <台帳と同じ字>` の1行を置いてください。")
        return 1
    if named == 0:
        print("✕ 頭の名乗りを見る文書が0本（台帳の読みかたが外れている）")
        return 2
    print(f"○ 文書 {len(files)}本が、ぜんぶ台帳に載っている。台帳の行は、ぜんぶ実在する")
    print(f"○ 仕様・手順・台帳の {named}本が、頭の1行で台帳と同じ種別を名乗っている。状態は {len(table)}行とも決まった字")
    return 0


if __name__ == "__main__":
    sys.exit(main())
