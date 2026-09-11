"""同じ面の2枚（直す前／直したあと）を画素で突き合わせる。

  python3 tools/sprites/shotdiff.py before after

島は生きている（あやとが歩き、住人が動く）ので、面ぜんぶの差は0にならない。
**直した場所（左上の隅）だけ**を別に出して、そこが1画素も変わっていないことを見る。
"""
import sys, glob, os
import numpy as np
from PIL import Image

a_tag = sys.argv[1] if len(sys.argv) > 1 else "before"
b_tag = sys.argv[2] if len(sys.argv) > 2 else "after"
# 左上の隅（看板と道具）。dpr2 なので画素は2倍
CORNER = (0, 0, 360, 240)
for f in sorted(glob.glob(f"/tmp/isletop/{a_tag}/*.shot.png")):
    name = os.path.basename(f)
    g = f"/tmp/isletop/{b_tag}/{name}"
    if not os.path.exists(g):
        continue
    A = np.asarray(Image.open(f).convert("RGB"), dtype=np.int16)
    B = np.asarray(Image.open(g).convert("RGB"), dtype=np.int16)
    if A.shape != B.shape:
        print(f"{name:34} 大きさが違う {A.shape} {B.shape}")
        continue
    d = np.abs(A - B).max(axis=2) > 6
    x0, y0, x1, y1 = [v * 2 for v in CORNER]
    c = d[y0:y1, x0:x1]
    print(f"{name:34} 面ぜんぶ {d.mean()*100:5.2f}%   左上の隅 {c.mean()*100:5.2f}%  ({int(c.sum())}画素)")
