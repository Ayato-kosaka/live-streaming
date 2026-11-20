"""**測った字（`fontweigh.mjs` の答え）を、書体の表（`tools/fonts/weights.json`）へ差し込む。**

    python3 python/font_table.py --got /tmp/w.json                   # 字が増えた面・表に無い面だけ、字を足す（和）
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

**下敷きの字（かな・英数・記号。`subset.py` の `CORE_RANGES`）が増えただけの面も差し替えない。** 下敷きは
どの面にも、どの束にも焼いてあるので、表に載っていなくても焼き上がりは1バイトも変わらない。
2026-11-20 にブカレストで回したら、フッターの「ブカレスト」「スコピエ」（700）のせいで141面が「増えた」に
数えられ、表が300行の差分になった。それを並行する2本が持つと、またぶつかる。
ただし、その太さで1字も描いていなかった面が描くようになったときは差し込む（その太さの束を取りに行くようになる）。

## 表は鍵の順に並べる（2026-11-20）

焼いたもの（woff2・fonts.css）を PR に入れなくなったので（`tools/fonts/subset.py` の頭）、PR がぶつかりうるのは
この表だけになった。足した面を後ろに足すと、並行する2本が同じ末尾に書いて必ずぶつかる。
**鍵の順に並べて書く**と、足した面はそれぞれの場所に入り、隣どうしでなければ git がそのまま重ねる。
並びが崩れていないかは `font_table_selftest.py` が本物の表で見る（`canonical()`）。
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TABLE = ROOT / "tools" / "fonts" / "weights.json"
WEIGHTS = ("400", "700", "900")
SUBSET = ROOT / "tools" / "fonts" / "subset.py"


@lru_cache(maxsize=1)
def core() -> frozenset[str]:
    """下敷きの字（どの面・どの束にも焼く字）。`subset.py` の定義をそのまま読む（書き写すと、足した日にずれる）。"""
    spec = importlib.util.spec_from_file_location("subset_for_table", SUBSET)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return frozenset(mod.ranges(mod.CORE_RANGES) | set(mod.CORE_EXTRA))


def page_key(path: str) -> str:
    """`/travel/x.html` → `travel/x`（`fontweigh.mjs` と表の鍵）。`/index.html` は `index`。"""
    return "index" if path == "/index.html" else path.strip("/").removesuffix(".html")


def gained(old: dict | None, new: dict, base: frozenset[str] | None = None) -> bool:
    """焼き上がりが変わるほど、表に無い字を描いたか。下敷きの字は数えない（上の見出し）。
    その太さで1字も描いていなかった面が描くようになったら、下敷きの字でも数える。"""
    if old is None:
        return True
    base = core() if base is None else base
    for w in WEIGHTS:
        was, now = set(old.get(w, "")), set(new.get(w, ""))
        if (now - was) - base or (now and not was):
            return True
    return False


def canonical(table: dict) -> str:
    """表を書く形。鍵の順・1字下げ・末尾に改行（`fontweigh.mjs` も同じ形で書く）。"""
    return json.dumps({k: table[k] for k in sorted(table)}, ensure_ascii=False, indent=1) + "\n"


def merge(table: dict, got: dict, only: list[str]) -> tuple[dict, list[str]]:
    """→ (新しい表, 差し込んだ面)。書くときは `canonical()` で鍵の順に並べる。"""
    out = dict(table)
    hit = []
    for k, rec in got.items():
        if k in only:
            out[k] = rec
            hit.append(k)
        elif gained(table.get(k), rec):
            # **足すだけ（和）。** 全部の面を測るのは FAST（窓を開かず、送りも粗い）なので、手で測った表より
            # 字が少なく出る面がある（ブカレストの回でマトカの記事が 400 で 363 → 275）。差し替えると、
            # 閉じた窓の字が表から落ちる。表に残った字は束を少し太らせるだけ
            old = table.get(k) or {}
            out[k] = {w: "".join(sorted(set(old.get(w, "")) | set(rec.get(w, "")))) for w in WEIGHTS}
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
    if hit or a.table.read_text(encoding="utf-8") != canonical(new):
        a.table.write_text(canonical(new), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
