"""**記録（`docs/island-misses.md`）の決めごとが、1つ残らず仕様に行き先を持っているかを見る。**

    python3 python/misses_rules_selftest.py
    BREAK=missing python3 python/misses_rules_selftest.py   # 対照が効いていることを見る（足は下の表）

終了コード 0=そろっている / 1=ずれている / **2=数えられなかった・対照が外れた**（`docs/island-standards.md` §15）。

## なぜ要るか（2026-11-22 / #1360）

記録は1万9千行あり、`CLAUDE.md` が「作る前に読む」と言っていた。読める長さではない。
決めごとを仕様（主に `docs/island-standards.md`）へ写し、節番号 → 条の対応を `docs/island-misses-map.md` に
1行ずつ置いた（`docs/README.md` D-4）。**記録に節を足して、決めごとを仕様に写し忘れると、ここが落ちる**
（`docs/island-standards.md` §22）。

## 見るもの

| 足 | 見るもの | 崩れると |
| --- | --- | --- |
| `missing` | 抜いた決めごと（`python/misses_rules.py`）が、ぜんぶ対応表に1行ずつ在る | 写し忘れた決めごとが、記録の中にだけ残る |
| `extra` | 対応表の行が、ぜんぶ記録の決めごとを指している。同じ番号が2行無い | 消えた・ずれた番号の行が残り、表の数が抜いた数と合わなくなる |
| `target` | 行き先が実在する（`§N` の章・`§N.M` の条・`出す前のチェック`・`README D-n`・`docs/` の仕様・`この節かぎり`） | 存在しない条を指したまま「写した」ことになる |
| `prompt` | `CLAUDE.md` と `.claude/` が、記録を「作る前に読む」ものとして指していない | 1万9千行の記録が、また読むものに戻る |

## 対照

本物を見る前に、写しで自分を試す。外れたら本物の数字を出さずに 2 で落ちる。

- **抜く道具の対照。** 記録の写しで、決めごとを**1つだけ隠す**（形ごとに1つずつ: 番号つきの項目・太字の項目・
  `**対策**` の段落・`### 決めごと。…` の見出し・塊の外の `**決めごと。…**`・頭の `先-N`）。どの写しでも、
  抜いた数がちょうど1つ減ること
- **見張りの対照。** 対応表の写しから1行消す・1行足す・行き先を在りえない条にする・プロンプトに「作る前に読む」を書く。
  それぞれ、その足だけで落ちること（`BREAK=<足>` で外すと通ってしまうこと）
"""

from __future__ import annotations

import os
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent
sys.path.insert(0, str(HERE))

from misses_num_selftest import Broken  # noqa: E402
from misses_rules import BLOCK_RE, NUM_RE, BOLD_ITEM_RE, INLINE_RE, TAISAKU_RE, TOP_ITEM_RE, extract  # noqa: E402

DOC = REPO / "docs" / "island-misses.md"
MAP = REPO / "docs" / "island-misses-map.md"
STANDARDS = REPO / "docs" / "island-standards.md"
README = REPO / "docs" / "README.md"
LEGS = ("missing", "extra", "target", "prompt")

ROW_RE = re.compile(r"^\|\s*`((?:#\d+|先)-\d+)`\s*\|[^|]*\|[^|]*\|\s*([^|]+?)\s*\|\s*$")
# 記録を「読むもの」として指している言い方。名指しの行（`island-misses.md` #87 のような指し）は通す
READ_RE = re.compile(r"作る前|必ず読む|先に読む|書く前に読む|読んでから")


def legs() -> frozenset[str]:
    want = {x.strip() for x in os.environ.get("BREAK", "").split(",") if x.strip()}
    odd = want - set(LEGS)
    if odd:
        raise SystemExit(f"BREAK に知らない足があります: {' '.join(sorted(odd))}（{' '.join(LEGS)}）")
    return frozenset(want)


def map_rows(text: str) -> list[tuple[str, str]]:
    return [(m.group(1), m.group(2)) for line in text.splitlines() if (m := ROW_RE.match(line))]


def targets(standards: str, readme: str, docs: Path) -> callable:
    chapters = set(re.findall(r"^## (\d+)\. ", standards, re.M))
    clauses = set(re.findall(r"^- \*\*(\d+\.\d+)\*\* ", standards, re.M))
    has_check = "## 出す前のチェック" in standards
    ds = set(re.findall(r"\*\*(D-\d+)\*\*", readme))

    def ok(t: str) -> bool:
        if t == "この節かぎり":
            return True
        if t == "出す前のチェック":
            return has_check
        if m := re.fullmatch(r"§(\d+)\.(\d+)", t):
            return f"{m.group(1)}.{m.group(2)}" in clauses
        if m := re.fullmatch(r"§(\d+)", t):
            return m.group(1) in chapters
        if m := re.fullmatch(r"README (D-\d+)", t):
            return m.group(1) in ds
        if re.fullmatch(r"[a-z0-9-]+\.md", t):
            return (docs / t).is_file() and f"`docs/{t}` | 仕様" in readme
        return False
    return ok


def prompt_lines(files: dict[str, str]) -> list[str]:
    """プロンプトの中で、記録を「読むもの」として指している行。"""
    bad = []
    for name, text in files.items():
        lines = text.splitlines()
        for i, line in enumerate(lines):
            # 名指しの行と、その次の行まで（「…`island-misses.md` — 言われたこと。\n作る前に必ず読む」の折り返し）
            # 次の行が別の項目（`- `・見出し・表の行）なら、そこは別の話なので足さない
            nxt = lines[i + 1] if i + 1 < len(lines) else ""
            near = line + ("" if re.match(r"^\s*(?:[-*] |#|\|)", nxt) else nxt)
            if "island-misses.md" in line and READ_RE.search(near):
                bad.append(f"{name}:{i + 1}: {line.strip()[:80]}")
    return bad


def judge(rule_ids: list[str], rows: list[tuple[str, str]], ok, prompts: dict[str, str],
          ban: frozenset[str]) -> list[str]:
    bad: list[str] = []
    have = [r for r, _ in rows]
    if "missing" not in ban:
        miss = [r for r in rule_ids if r not in set(have)]
        bad += [f"対応表に無い: {r}" for r in miss]
    if "extra" not in ban:
        known = set(rule_ids)
        bad += [f"記録に無い決めごとを指している: {r}" for r in have if r not in known]
        seen: set[str] = set()
        for r in have:
            if r in seen:
                bad.append(f"同じ番号が2行: {r}")
            seen.add(r)
    if "target" not in ban:
        bad += [f"行き先が無い: {r} → {t}" for r, t in rows if not ok(t)]
    if "prompt" not in ban:
        bad += [f"記録を読むものとして指している: {x}" for x in prompt_lines(prompts)]
    return bad


def read_prompts() -> dict[str, str]:
    files = {"CLAUDE.md": (REPO / "CLAUDE.md").read_text(encoding="utf-8")}
    for p in sorted((REPO / ".claude").rglob("*")):
        rel = p.relative_to(REPO)
        # `.claude/worktrees/` はほかの担当の写し。見るのはこのリポジトリの指示だけ
        if p.is_file() and p.suffix in (".md", ".sh") and "worktrees" not in rel.parts:
            files[str(rel)] = p.read_text(encoding="utf-8", errors="replace")
    return files


# ---- 抜く道具の対照: 決めごとを1つだけ隠した写し ----

def hide_one(text: str, shape: str) -> str:
    """形ごとに、決めごとを1つだけ隠す。隠し方は「その形の目印を消す」。"""
    lines = text.splitlines()
    rules = extract(text)
    by_sec: dict[str, int] = {}
    for r in rules:
        by_sec[r.section] = by_sec.get(r.section, 0) + 1
    for r in rules:
        i = r.line - 1
        s = lines[i]
        many = by_sec[r.section] >= 2
        if shape == "num" and NUM_RE.match(s) and many:
            lines[i] = "   " + NUM_RE.sub("", s)
        elif shape == "bold" and BOLD_ITEM_RE.match(s) and many:
            lines[i] = "  " + s[2:]
        elif shape == "taisaku" and TAISAKU_RE.match(s) and by_sec[r.section] == 1:
            lines[i] = s.replace("**対策**", "**メモ**", 1)
        elif shape == "head" and BLOCK_RE.match(s) and re.match(r"^#{3,4} 決めごと。", s) \
                and by_sec[r.section] == 1:
            lines[i] = re.sub(r"^(#{3,4}) 決めごと。", r"\1 メモ。", s)
        elif shape == "inline" and INLINE_RE.match(s):
            lines[i] = s.replace("**決めごと", "**メモ", 1)
        elif shape == "top" and TOP_ITEM_RE.match(s):
            lines[i] = TOP_ITEM_RE.sub("### ", s)
        else:
            continue
        return "\n".join(lines) + "\n"
    raise Broken(f"形 {shape} の決めごとが記録に1つも無い（隠す相手が無い）")


def drill(real: str, ids: list[str], ok, prompts: dict[str, str]) -> bool:
    good = True

    def check(cond: bool, msg: str) -> None:
        nonlocal good
        print(f"  {'ok' if cond else 'NG'} {msg}")
        good &= cond

    print("対照（本物を見る前に、写しで自分を試す）")
    base = len(ids)
    for shape in ("num", "bold", "taisaku", "head", "inline", "top"):
        got = len(extract(hide_one(real, shape)))
        check(got == base - 1, f"決めごとを1つ隠す（{shape}）→ {base} が {got}（{base - 1} であること）")

    rows = [(r, "この節かぎり") for r in ids]
    none: frozenset[str] = frozenset()
    check(judge(ids, rows, ok, {}, none) == [], "そろった表 → 0件")
    cases = {
        "missing": (rows[:-1], {}),
        "extra": (rows + [rows[0]], {}),
        "target": ([(rows[0][0], "§999.1")] + rows[1:], {}),
        "prompt": (rows, {"CLAUDE.md": "- `docs/island-misses.md` — 作る前に必ず読む"}),
    }
    for leg, (rs, ps) in cases.items():
        hit = judge(ids, rs, ok, ps, none)
        check(len(hit) >= 1, f"{leg} を壊した写し → 落ちる（{len(hit)}件）")
        check(judge(ids, rs, ok, ps, frozenset({leg})) == [], f"   BREAK={leg} を当てると通る")
    check(prompt_lines({"x.md": "`docs/island-misses.md` #87 と同じ形"}) == [],
          "節を名指しするだけの行は、読むものとして数えない")
    check(len(prompt_lines({"x.md": "- `docs/island-misses.md` — 言われたこと。\n  作る前に必ず読む。"})) == 1,
          "折り返した次の行で「作る前に読む」と言っていたら数える")
    check(prompt_lines({"x.md": "- `docs/island-misses.md` は記録\n- `docs/x.md` — 作る前に必ず読む"}) == [],
          "次の行が別の項目なら、その項目の「読む」は数えない")
    return good


def main() -> int:
    ban = legs()
    try:
        real = DOC.read_text(encoding="utf-8")
        rules = extract(real)
        ids = [r.id for r in rules]
        map_text = MAP.read_text(encoding="utf-8")
        ok = targets(STANDARDS.read_text(encoding="utf-8"), README.read_text(encoding="utf-8"),
                     REPO / "docs")
        prompts = read_prompts()
        if not drill(real, ids, ok, prompts):
            print("対照が外れた。本物は数えない", file=sys.stderr)
            return 2
    except (Broken, OSError) as e:
        print(f"数えられなかった: {e}", file=sys.stderr)
        return 2

    rows = map_rows(map_text)
    if not rows:
        print("対応表の行が1つも取れない", file=sys.stderr)
        return 2
    bad = judge(ids, rows, ok, prompts, ban)
    print(f"本物: 決めごと {len(ids)} / 対応表 {len(rows)} 行 / ずれ {len(bad)}件")
    for b in bad[:40]:
        print(f"  {b}")
    if len(bad) > 40:
        print(f"  …ほか {len(bad) - 40}件")
    if ban:
        print(f"※ BREAK={','.join(sorted(ban))}。足を抜いているので、この判定は根拠になりません")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
