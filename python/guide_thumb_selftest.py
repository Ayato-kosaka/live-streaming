#!/usr/bin/env python3
"""`guide_thumb.py`（見どころマップと表紙を横 240px に縮めて並べる）の見張り。

    python3 python/guide_thumb_selftest.py

見るのは2つ。**絵の在る街は 0 で1枚並べる**（並べた絵の幅が 240px ずつ）・**絵の無い街は 2**（0 を合格と読ませない）。
読めるかどうかは道具が決めない（人の目で見る）ので、ここも並べたものの寸法だけを見る。
"""
from __future__ import annotations

import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TOOL = ROOT / "python/guide_thumb.py"
FAILED: list[str] = []


def ok(name: str, got, want) -> None:
    good = got == want
    print(f"  {'○' if good else '✕'} {name}（出た {got}・ほしい {want}）")
    if not good:
        FAILED.append(name)


def main() -> int:
    from PIL import Image

    with tempfile.TemporaryDirectory() as d:
        out = Path(d) / "t.png"
        r = subprocess.run([sys.executable, str(TOOL), "north-macedonia/skopje", "--out", str(out)],
                           capture_output=True, text=True, timeout=120)
        ok("スコピエ（地図と表紙2枚が在る）は 0", r.returncode, 0)
        if out.exists():
            w, _ = Image.open(out).size
            # 240px が3枚と、すきま 12px が4つ
            ok("並べた幅は 240px の3枚ぶん", w, 240 * 3 + 12 * 4)
        else:
            ok("並べた1枚が置かれる", False, True)
        r = subprocess.run([sys.executable, str(TOOL), "nowhere/none", "--out", str(Path(d) / "n.png")],
                           capture_output=True, text=True, timeout=120)
        ok("絵の無い街は 2（0 を合格と読ませない）", r.returncode, 2)
    if FAILED:
        print(f"✕ {len(FAILED)}件 落ちた")
        return 1
    print("○ ぜんぶ通った")
    return 0


if __name__ == "__main__":
    sys.exit(main())
