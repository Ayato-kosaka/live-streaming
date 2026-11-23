"""`python/legend_book_bake.py`（企画の面の中身を材料から焼く道具）の見張り。

    python3 python/legend_book_bake_selftest.py

終了コード 0=通った / 1=落ちた / 2=数えるものが無い（材料が無い）。

## 何を見るか

1. **本物**: 面の印の付いた企画ぜんぶについて、焼いてあるもの（`site/content/legends/<企画>.ts`）が今の材料と同じ
   （`--check` が 0）。材料を直して焼き直し忘れると、面が古い字のまま出る
2. **対照**（本物の材料の写しを壊して、止まるか）: 品が1つ足りない・地域の品が100品に無い・あと◯日の字・★が4 → どれも 1 で何も書かない。
   材料が無い → 2。値段が0の品（タダの食堂）は「無料」と焼く
"""

from __future__ import annotations

import contextlib
import copy
import io
import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import legend_book_bake as lb  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
bad = 0


def ok(name: str, got, want) -> None:
    global bad
    good = got == want
    print(f"  {'○' if good else '✕'} {name}: {got!r}{'' if good else f'（欲しかったのは {want!r}）'}")
    if not good:
        bad += 1
        print(f"::error::{name}: 出た={got!r} 欲しかったのは={want!r}")


books = sorted((ROOT / "python/data/legends").glob("*/book.json"))
if not books:
    print("::error::材料（python/data/legends/<企画>/book.json）が1つも無い。数えられないので 2 で止める")
    sys.exit(2)

print(f"[1] 本物: 材料 {len(books)}本と、焼いてあるものが同じ")
for b in books:
    slug = b.parent.name
    ok(f"{slug} の焼き直しが要らない（--check）", lb.bake(slug, check=True), 0)

print("[2] 対照: 材料の写しを壊すと、何も書かずに止まる")
real = json.loads(books[0].read_text(encoding="utf-8"))
slug = books[0].parent.name


def run(mut) -> tuple[int, bool]:
    with tempfile.TemporaryDirectory() as d:
        src, out = Path(d) / "book.json", Path(d) / "out.ts"
        x = copy.deepcopy(real)
        mut(x)
        src.write_text(json.dumps(x, ensure_ascii=False), encoding="utf-8")
        # 壊した写しの止まりかた（`::error::` の行）は、ここでは読み捨てる（CI の注に出さない）
        with contextlib.redirect_stdout(io.StringIO()):
            rc = lb.bake(slug, src=src, out=out)
        return rc, out.exists()


ok("そのままの写しは焼ける", run(lambda x: None), (0, True))
ok("品が1つ足りない", run(lambda x: x["dishes"].pop()), (1, False))
ok("地域の品が100品に無い", run(lambda x: x["regions"][0]["dishes"].append("no-such-dish")), (1, False))
ok("「あと3日」の字がある", run(lambda x: x["rules"].append("あと3日で始まる")), (1, False))
ok("★が4", run(lambda x: x["dishes"][0].update(star=4)), (1, False))
with tempfile.TemporaryDirectory() as d:
    with contextlib.redirect_stdout(io.StringIO()):
        rc = lb.bake(slug, src=Path(d) / "none.json", out=Path(d) / "out.ts")
    ok("材料が無い", rc, 2)
ok("値段が0の品は「無料」", lb.price_text({"cur": "INR", "min": 0, "max": 0, "yen_min": 0, "yen_max": 0, "rate_date": "2026-11-23"}, "x"), "無料")
ok("値段の字", lb.price_text({"cur": "INR", "min": 13, "max": 25, "yen_min": 22, "yen_max": 43, "rate_date": "2026-11-23"}, "x"),
   "13〜25ルピー（約22〜43円・2026年11月23日の換算）")

print(f"\n{'通った' if not bad else f'{bad}件 落ちた'}")
sys.exit(1 if bad else 0)
