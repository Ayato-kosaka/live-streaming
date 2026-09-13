"""直す前と直したあとの2枚を突き合わせて、**動いた画素だけ**を出す。

  python3 tools/sprites/redpage.py /tmp/inkreport/before /tmp/inkreport/after /tmp/inkreport/diff

「飾りは1つも動いていない」を目で見られるようにするための道具。
字だけ直したなら、差が出るのは字のところだけになる。
差の出た画素を赤く塗った3枚目を書き出し、面ごとに何画素動いたかを出す。
"""
import sys, os
import numpy as np
from PIL import Image

a_dir, b_dir = sys.argv[1], sys.argv[2]
out = sys.argv[3] if len(sys.argv) > 3 else None
if out:
    os.makedirs(out, exist_ok=True)
for f in sorted(os.listdir(a_dir)):
    if not f.endswith(".png") or not os.path.exists(os.path.join(b_dir, f)):
        continue
    A = Image.open(os.path.join(a_dir, f)).convert("RGB")
    B = Image.open(os.path.join(b_dir, f)).convert("RGB")
    if A.size != B.size:
        print(f"{f:28} 大きさが違う {A.size} → {B.size}")
        continue
    a = np.asarray(A, dtype=np.int16)
    b = np.asarray(B, dtype=np.int16)
    d = np.abs(a - b).sum(axis=2)
    m = d > 12                      # にじみ1段ぶんは動いたうちに入れない
    n = int(m.sum())
    tot = m.size
    ys, xs = np.nonzero(m)
    where = f"  y {ys.min()}–{ys.max()}" if n else ""
    print(f"{f:28} 動いた画素 {n:>8} / {tot}  ({n/tot*100:5.2f}%){where}")
    if out and n:
        v = np.asarray(B, dtype=np.uint8).copy()
        v[m] = [255, 0, 0]
        Image.fromarray(v).save(os.path.join(out, f))
