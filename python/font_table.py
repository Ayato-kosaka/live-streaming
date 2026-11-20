"""**測った字（`fontweigh.mjs` の答え）を、書体の表（`tools/fonts/weights.json`）へ差し込む。**

    python3 python/font_table.py --got /tmp/w.json                   # 字が増えた面・表に無い面だけ差し込む
    python3 python/font_table.py --got /tmp/w.json --only /next.html # 名指しの面は、増えていなくても差し替える

終了コード 0=差し込んだ（差し込む面が無かった回も含む）/ 2=答えが読めない・名指しの面が答えに無い。

## なぜ「字が増えた面」なのか（2026-11-20）

街のガイドを出すたびに、測る面を人が並べていた（`fonts=/travel/…html,…`）。
記事・街の面・国の面のどれかを並べ忘れると、その面が焼いた束に無い字を描いて、
`fontbudget_selftest` の「記録が古い」で赤くなる（#1331 で国の面が漏れて1回落ちた）。

**全部の面を測って、表に無い字を描いた面だけ差し込む**なら、並べ忘れが起きない。
フッターに街の名前が1つ足されて全部の面に新しい字が出た日も、その面ぜんぶが拾われる。
字が減っただけの面は差し替えない——表に残った字は束を少し太らせるだけで、見た目は壊さない。
差し替えると、測った日で字が揺れる面（日付の入る面）が毎回差分になって、並行する PR どうしがぶつかる。
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TABLE = ROOT / "tools" / "fonts" / "weights.json"
WEIGHTS = ("400", "700", "900")


def page_key(path: str) -> str:
    """`/travel/x.html` → `travel/x`（`fontweigh.mjs` と表の鍵）。`/index.html` は `index`。"""
    return "index" if path == "/index.html" else path.strip("/").removesuffix(".html")


def gained(old: dict | None, new: dict) -> bool:
    """表に無い字を描いたか（どれかの太さで1字でも）。"""
    if old is None:
        return True
    return any(set(new.get(w, "")) - set(old.get(w, "")) for w in WEIGHTS)


def merge(table: dict, got: dict, only: list[str]) -> tuple[dict, list[str]]:
    """→ (新しい表, 差し込んだ面)。表の並びは保つ（足した面は後ろ）。"""
    out = dict(table)
    hit = []
    for k, rec in got.items():
        if k in only or gained(table.get(k), rec):
            out[k] = rec
            hit.append(k)
    return out, hit


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--got", type=Path, required=True, help="fontweigh.mjs の OUT")
    ap.add_argument("--table", type=Path, default=TABLE)
    ap.add_argument("--only", default="", help="増えていなくても差し替える面（/x.html を , でつなぐ）")
    a = ap.parse_args(argv)
    try:
        got = json.loads(a.got.read_text(encoding="utf-8"))
        table = json.loads(a.table.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as e:
        print(f"!! 読めない: {e}", file=sys.stderr)
        return 2
    if not got:
        print("!! 測った答えが空。数えるものが無い", file=sys.stderr)
        return 2
    only = [page_key(x) for x in a.only.split(",") if x]
    miss = [k for k in only if k not in got]
    if miss:
        print(f"!! 名指しの面が測った答えに無い: {miss}（答えの頭: {sorted(got)[:5]}）", file=sys.stderr)
        return 2
    new, hit = merge(table, got, only)
    for k in hit:
        old = table.get(k) or {}
        print(f"{k}: " + "  ".join(f"{w} {len(old.get(w, ''))}→{len(new[k].get(w, ''))}" for w in WEIGHTS)
              + ("（新しい面）" if k not in table else ""))
    print(f"差し込んだ面 {len(hit)} / 測った面 {len(got)}")
    if hit:
        a.table.write_text(json.dumps(new, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
