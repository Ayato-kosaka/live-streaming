"""**`python/legend_book_check.py` を毎 PR で回す見張り。本物で通り、壊した写しで落ちることを見る。**

    python3 python/legend_book_check_selftest.py

終了コード 0=通った / 1=落ちた。

## なぜ要るか（2026-11-23）

材料の確かめの道具を足した PR（#1424）で、道具がどこからも走らないまま入ろうとして、
`python/watch_census_selftest.py` に止められた。材料は面の担当と絵の担当が読む受け渡しの型なので、
**手で1回回して終わりにせず、毎 PR の回し役（`python/selftest_runner.py`）に拾わせる。**
断り（`python/watch_excuses.py`）には書かない。0.1秒ほどで終わり、依存も無いため。

## 何を見るか

1. 本物の置き場で終了コード 0
2. 壊した写し（品を1つ消す・id を重ねる・出どころを消す・食べ比べを無い品に向ける・リードを読点で割る）
   を1つずつ当てて、どれも終了コード 1（**1つでも 0 なら、その守りは空回り**）
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
TOOL = ROOT / "legend_book_check.py"
REAL = ROOT / "data" / "legends" / "india-street-food"


def run(base: Path) -> int:
    return subprocess.run([sys.executable, str(TOOL), str(base)], capture_output=True, text=True).returncode


def drop_dish(b: dict) -> None:
    b["dishes"].pop()


def dup_id(b: dict) -> None:
    b["dishes"][1]["id"] = b["dishes"][0]["id"]


def drop_src(b: dict) -> None:
    b["dishes"][0]["src"] = []


def bad_compare(b: dict) -> None:
    b["compare"][0]["items"][0]["dish"] = "no-such-dish"


def comma_lead(b: dict) -> None:
    b["dishes"][0]["lead"] = "揚げたてを、駅の屋台で"


BREAKS = [drop_dish, dup_id, drop_src, bad_compare, comma_lead]


def main() -> int:
    bad = 0
    code = run(REAL)
    print(f"{'○' if code == 0 else '✕'} 本物の置き場 → 終了コード {code}（0 のはず）")
    bad += code != 0

    real = json.loads((REAL / "book.json").read_text(encoding="utf-8"))
    for brk in BREAKS:
        with tempfile.TemporaryDirectory() as td:
            base = Path(td) / REAL.name
            shutil.copytree(REAL, base)
            b = copy.deepcopy(real)
            brk(b)
            (base / "book.json").write_text(json.dumps(b, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
            code = run(base)
        ok = code == 1
        print(f"{'○' if ok else '✕'} 壊した写し（{brk.__name__}）→ 終了コード {code}（1 のはず）")
        bad += not ok

    print("通った" if not bad else f"落ちた {bad}件")
    return 0 if not bad else 1


if __name__ == "__main__":
    sys.exit(main())
