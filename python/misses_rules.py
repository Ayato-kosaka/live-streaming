"""**`docs/island-misses.md`（記録）から、決めごとの行だけを抜く。**

    python3 python/misses_rules.py                 # 1行に1つ: 番号・日付・決めごとの1行（タブ区切り）
    python3 python/misses_rules.py --count         # 抜いた数だけ
    python3 python/misses_rules.py --section 120   # 1節ぶんだけ
    python3 python/misses_rules.py --from 100 --to 140   # 束で読む
    python3 python/misses_rules.py --json          # 機械で読む形
    python3 python/misses_rules.py --file X.md     # 別の写しを見る（対照を作るとき）

終了コード 0=抜けた / 2=数えられなかった（節が1つも取れない・決めごとが1つも取れない）。

## なぜ要るか（2026-11-22 / #1360）

`island-misses.md` は1万9千行の**記録**で、その中に「次に同じ形で外さないための決めごと」が混ざっている。
決めごとは仕様（主に `docs/island-standards.md`）へ写し、対応を `docs/island-misses-map.md` に1行ずつ置いた
（`docs/README.md` D-4）。**頭から読まずに、決めごとの行だけを見るための道具。**
対応表と数が合っているかは `python/misses_rules_selftest.py` が見る。

## 何を決めごととして数えるか

記録の書きかたが時期で変わっているので、**形を5つ**読む。どれも「節の中の、決めごとの塊」を見つけてから、
塊の中の項目を1つずつ数える。

| 塊の目印 | 主に使われた時期 |
| --- | --- |
| 頭の `## 決めごと（先に読む）` の `### N.` | 最初（番号は `先-N`） |
| 段落の頭の `**対策**` | `#1`〜`#78` ごろ |
| 見出し `### 決めごと` `### 決め` `### 決めたこと` `### 決めごと（…）`（`####` も） | `#70` ごろから |
| 見出し `### これからどうするか` | `#251` ごろ |
| 段落の頭の `**決めごと。…**` `**決めごと13に足す:**` | 塊の外に置いた1行 |

塊の中の数えかた:
- 見出しが `### 決めごと。**…**` のように**決めごとを言い切っている**なら、その1つ
- そうでなければ、行頭の番号つき項目（`1. `）を1つずつ
- 番号が無ければ、太字で始まる行頭の項目（`- **`）を1つずつ
- それも無ければ、塊の中の `####` 見出しを1つずつ
- どれも無ければ、塊を1つ

`### 効いた決めごと` は**ほかの節の決めごとを引いているだけ**なので数えない。
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import asdict, dataclass
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from misses_num_selftest import DOC, Broken, split  # noqa: E402

# 塊の見出し。「決めごと」「決め」「決めたこと」のあとは、終わり・空白・句点・括弧・ダッシュ・コロンだけ。
# 「効いた決めごと」「〜と決めて」のように、決めごとを引いているだけの見出しを拾わないため
BLOCK_RE = re.compile(r"^(#{3,4}) (?:決め(?:ごと|たこと)?(?=$|[ 。（(—:：])|これからどうするか)")
HEAD_RE = re.compile(r"^(#{1,6}) ")
NUM_RE = re.compile(r"^\d+\. ")
BOLD_ITEM_RE = re.compile(r"^- \*\*")
TAISAKU_RE = re.compile(r"^\*\*対策\*\*")
INLINE_RE = re.compile(r"^\*\*決めごと")
PARA_HEAD_RE = re.compile(r"^\*\*[^*]+\*\*")
DATE_RE = re.compile(r"(20\d\d-\d\d-\d\d)")
TOP_START = "## 決めごと（先に読む）"
TOP_ITEM_RE = re.compile(r"^### (\d+)\. ")


@dataclass
class Rule:
    id: str        # `#120-1` / `先-3`
    section: str   # `120` / `先`
    date: str      # 節の見出しの日付。無ければ前の節の日付（`~` を頭に付ける）
    line: int      # 記録の何行目から
    text: str      # 決めごとの1行


def one_line(s: str, width: int = 90) -> str:
    """決めごとを1行にする。太字で始まるなら太字の中身、そうでなければ頭から。"""
    s = s.strip()
    s = re.sub(r"^(\d+\.|-)\s+", "", s)
    s = re.sub(r"^#{1,6}\s+", "", s)
    s = re.sub(r"^決めごと(?:[。:：—]|\s)+", "", s)
    m = re.match(r"^\*\*(.+?)\*\*", s)
    if m and len(m.group(1)) >= 6:
        s = m.group(1)
    s = s.replace("**", "").replace("|", "／").strip()
    return s if len(s) <= width else s[: width - 1] + "…"


def _items(lines: list[str], start: int, end: int, head: str) -> list[tuple[int, str]]:
    """塊（start〜end の行）の中の項目。返すのは [(行番号0始まり, 1行)]。"""
    body = list(range(start, end))
    m = re.match(r"^#{3,4} 決めごと(?:。| — )(.+)$", head)
    if m:
        return [(start - 1, one_line(m.group(1)))]
    for pat in (NUM_RE, BOLD_ITEM_RE):
        hits = [i for i in body if pat.match(lines[i])]
        if hits:
            return [(i, one_line(_join(lines, i, end))) for i in hits]
    subs = [i for i in body if lines[i].startswith("#### ") and not BLOCK_RE.match(lines[i])]
    if subs:
        return [(i, one_line(lines[i])) for i in subs]
    first = next((i for i in body if lines[i].strip() and not lines[i].startswith(">")), start - 1)
    return [(start - 1, one_line(_join(lines, first, end)))]


def _join(lines: list[str], i: int, end: int) -> str:
    """項目の頭の1行が途中で折れているときに、つなぐ。

    太字で始まるなら太字の閉じまで、そうでなければ最初の句点まで（段落の切れ目では止める）。
    """
    s = lines[i]
    k = i + 1
    bold = re.sub(r"^(\d+\.|-)\s+", "", s).startswith("**")
    while k < end and lines[k].strip() and not HEAD_RE.match(lines[k]) and not NUM_RE.match(lines[k]) \
            and not lines[k].startswith("- "):
        if bold and s.count("**") % 2 == 0:
            break
        if not bold and "。" in s:
            break
        s += lines[k].strip()
        k += 1
    return s


def extract(text: str) -> list[Rule]:
    lines = text.splitlines()
    sections, _ = split(text)
    rules: list[Rule] = []

    # 頭の「決めごと（先に読む）」。最初の節より前に在る
    try:
        t0 = lines.index(TOP_START)
    except ValueError:
        raise Broken(f"`{TOP_START}` が無い")
    first_sec = sections[0][0] - 1
    for i in range(t0 + 1, first_sec):
        m = TOP_ITEM_RE.match(lines[i])
        if m:
            rules.append(Rule(f"先-{m.group(1)}", "先", "2026-09-09", i + 1, one_line(lines[i])))

    bounds = [(ln - 1, num, tail) for ln, num, tail in sections] + [(len(lines), None, "")]
    last_date = "2026-09-09"
    for k, (s0, num, tail) in enumerate(bounds[:-1]):
        end = bounds[k + 1][0]
        d = DATE_RE.search(tail)
        date = d.group(1) if d else "~" + last_date
        if d:
            last_date = d.group(1)
        found: list[tuple[int, str]] = []
        j = s0 + 1
        while j < end:
            s = lines[j]
            m = BLOCK_RE.match(s)
            if m:
                lvl = len(m.group(1))
                e = j + 1
                while e < end and not ((h := HEAD_RE.match(lines[e])) and len(h.group(1)) <= lvl):
                    e += 1
                found += _items(lines, j + 1, e, s)
                j = e
                continue
            if TAISAKU_RE.match(s):
                # 段落の塊。次の太字で始まる段落か、見出しまで
                e = j + 1
                while e < end and not HEAD_RE.match(lines[e]) and not (
                        PARA_HEAD_RE.match(lines[e]) and not lines[e - 1].strip()):
                    e += 1
                hits = [i for i in range(j + 1, e) if NUM_RE.match(lines[i])] or \
                    [i for i in range(j + 1, e) if BOLD_ITEM_RE.match(lines[i])]
                if hits:
                    found += [(i, one_line(_join(lines, i, e))) for i in hits]
                else:
                    rest = re.sub(r"^\*\*対策\*\*\s*", "", s).strip()
                    if not rest:
                        nxt = next((i for i in range(j + 1, e) if lines[i].strip()), j)
                        rest = _join(lines, nxt, e)
                    found.append((j, one_line(rest)))
                j = e
                continue
            if INLINE_RE.match(s):
                found.append((j, one_line(_join(lines, j, end))))
            j += 1
        for n, (i, t) in enumerate(found, 1):
            rules.append(Rule(f"#{num}-{n}", str(num), date, i + 1, t))
    if not rules:
        raise Broken("決めごとが1つも取れなかった")
    return rules


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--file", type=Path, default=DOC)
    ap.add_argument("--count", action="store_true")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--section")
    ap.add_argument("--from", dest="lo", type=int)
    ap.add_argument("--to", dest="hi", type=int)
    a = ap.parse_args()
    try:
        rules = extract(a.file.read_text(encoding="utf-8"))
    except (Broken, OSError) as e:
        print(f"数えられなかった: {e}", file=sys.stderr)
        return 2
    if a.section:
        rules = [r for r in rules if r.section == a.section]
    if a.lo is not None or a.hi is not None:
        lo, hi = a.lo or 0, a.hi or 10**9
        rules = [r for r in rules if r.section.isdigit() and lo <= int(r.section) <= hi]
    if a.count:
        print(len(rules))
    elif a.json:
        print(json.dumps([asdict(r) for r in rules], ensure_ascii=False, indent=1))
    else:
        for r in rules:
            print(f"{r.id}\t{r.date}\t{r.text}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
