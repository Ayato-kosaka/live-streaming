"""**`python/legend_kitchen_check.py` を毎 PR で回す見張り。本物で通り、壊した写しで落ちることを見る。**

    python3 python/legend_kitchen_check_selftest.py

終了コード 0=通った / 1=落ちた。

## なぜ要るか（2026-11-23）

ノマドキッチンカーの材料（`python/data/legends/nomad-kitchen-car/`）は、面・絵・3D の担当が読む受け渡しの型で、
焼く道具もこの確かめを通ってから書く。確かめの道具がどこからも走らないと、インドの材料のときと同じく
`python/watch_census_selftest.py` に止められ、守りが空回りしていても誰も気づかない。だから毎 PR の回し役
（`python/selftest_runner.py`）に拾わせる。0.1秒ほどで終わり、依存も無い。

## 何を見るか

1. 本物の置き場で終了コード 0
2. 壊した写しを1つずつ当てて、どれも終了コード 1（**1つでも 0 なら、その守りは空回り**）:
   暮らしの課題を1件消す・中身の id を重ねる・確かめた事実の出どころを消す・収益にひと月の欄を足す・
   一行の字を読点で割る・事実の外に % を書く・題に「あと◯日」を書く・絵の注文書の景色を1つ消す
"""

from __future__ import annotations

import copy
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
TOOL = ROOT / "legend_kitchen_check.py"
REAL = ROOT / "data" / "legends" / "nomad-kitchen-car"


def run(base: Path) -> int:
    return subprocess.run([sys.executable, str(TOOL), str(base)], capture_output=True, text=True).returncode


def drop_life(b: dict, a: dict) -> None:
    b["issues"]["life"].pop()


def dup_id(b: dict, a: dict) -> None:
    b["fillings"][1]["id"] = b["fillings"][0]["id"]


def drop_src(b: dict, a: dict) -> None:
    b["facts"][0]["src"] = []


def add_month(b: dict, a: dict) -> None:
    b["money"]["month"] = {"days": 8}


def comma_lead(b: dict, a: dict) -> None:
    b["views"][0]["lead"] = "湖のほとりに、車を停める"


def percent_outside_facts(b: dict, a: dict) -> None:
    b["progress"][0]["body"] += "（10%）"


def countdown(b: dict, a: dict) -> None:
    b["shorts"]["titles"][0] = "あと29日 " + b["shorts"]["titles"][0]


def art_drop_view(b: dict, a: dict) -> None:
    a["views"].pop()


BREAKS = [drop_life, dup_id, drop_src, add_month, comma_lead, percent_outside_facts, countdown, art_drop_view]


def main() -> int:
    bad = 0
    code = run(REAL)
    print(f"{'○' if code == 0 else '✕'} 本物の置き場 → 終了コード {code}（0 のはず）")
    bad += code != 0

    real_b = json.loads((REAL / "book.json").read_text(encoding="utf-8"))
    real_a = json.loads((REAL / "art_order.json").read_text(encoding="utf-8"))
    for brk in BREAKS:
        with tempfile.TemporaryDirectory() as td:
            base = Path(td) / REAL.name
            shutil.copytree(REAL, base)
            b, a = copy.deepcopy(real_b), copy.deepcopy(real_a)
            brk(b, a)
            (base / "book.json").write_text(json.dumps(b, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
            (base / "art_order.json").write_text(json.dumps(a, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
            code = run(base)
        ok = code == 1
        print(f"{'○' if ok else '✕'} 壊した写し（{brk.__name__}）→ 終了コード {code}（1 のはず）")
        bad += not ok

    print("通った" if not bad else f"落ちた {bad}件")
    return 0 if not bad else 1


if __name__ == "__main__":
    sys.exit(main())
