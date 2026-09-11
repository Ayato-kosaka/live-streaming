"""島の名前が最初の1文字から読めるか（2/2。読むほう）。isletop.mjs が撮った2枚を突き合わせる。

1文字ぶんの枠の中で、2枚の絵が1画素も違わなければ、その字は**画面に出ていない**。
上に不透明なものが乗っている、ということ。

  python3 tools/sprites/isletop.py before
"""
import json, sys, glob, os
import numpy as np
from PIL import Image

tag = sys.argv[1] if len(sys.argv) > 1 else "now"
root = f"/tmp/isletop/{tag}"
bad = 0
for j in sorted(glob.glob(f"{root}/*.json")):
    d = json.load(open(j))
    base = j[:-5]
    shot = np.asarray(Image.open(base + ".shot.png").convert("RGB"), dtype=np.int16)
    bg = np.asarray(Image.open(base + ".bg.png").convert("RGB"), dtype=np.int16)
    dpr = d["dpr"]
    diff = (np.abs(shot - bg).max(axis=2) > 6)
    hidden, weak, total = [], [], 0
    for ch in d["chars"]:
        x0, y0 = int(ch["x"] * dpr), int(ch["y"] * dpr)
        x1, y1 = int(np.ceil((ch["x"] + ch["w"]) * dpr)), int(np.ceil((ch["y"] + ch["h"]) * dpr))
        x0, y0 = max(0, x0), max(0, y0)
        sub = diff[y0:y1, x0:x1]
        if sub.size == 0:
            continue
        total += 1
        n = int(sub.sum())
        if n == 0:
            hidden.append(ch["c"])
        elif n < 0.08 * sub.size:
            weak.append((ch["c"], round(n / sub.size * 100, 1)))
    name = os.path.basename(base)
    note = ""
    if hidden:
        note += f"  **隠れた字 {len(hidden)}/{total}「{''.join(hidden)}」**"
    if weak:
        note += f"  かすれ {weak}"
    if not note:
        note = "  ○ 全部出ている"
    print(f"{name:34} 字{total:3}{note}")
    bad += len(hidden)
print(f"\n隠れた字の合計: {bad}")
