"""描かれた画素から字の濃さを測る（2/2。読むほう）。inkpx.mjs が撮った2枚を突き合わせる。

字が乗っている画素だけを見て、その下の地といちばん悪い組み合わせを出す。
地の平均や最頻色ではなく**いちばん悪いところ**を採るのは、
地図の海のように濃淡のある地の上では、平均だと読めない場所を見落とすため。
"""
import json, sys
from PIL import Image
from collections import Counter

tag = sys.argv[1] if len(sys.argv) > 1 else "ink"
page = sys.argv[2] if len(sys.argv) > 2 else "_map"
base = f"/tmp/ink/{tag}/{page}"
d = json.load(open(base + ".json"))
dpr = d["dpr"]
shot = Image.open(base + ".shot.png").convert("RGB")
bg = Image.open(base + ".bg.png").convert("RGB")


def lin(c):
    c /= 255
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def lum(rgb):
    r, g, b = rgb
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)


def ratio(a, b):
    la, lb = lum(a), lum(b)
    if la < lb:
        la, lb = lb, la
    return (la + 0.05) / (lb + 0.05)


def parse(col):
    col = col.strip()
    if col.startswith("rgb"):
        n = [float(x) for x in col[col.index("(") + 1: col.index(")")].replace("/", ",").split(",")[:3]]
        return tuple(int(x) for x in n)
    if col.startswith("#"):
        h = col[1:]
        if len(h) == 3:
            h = "".join(c * 2 for c in h)
        return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))
    return None


rows = []
for i, b0 in enumerate(d["boxes"]):
    col = parse(b0["color"])
    if col is None:
        continue
    x0, y0 = int(b0["x"] * dpr), int(b0["y"] * dpr)
    x1, y1 = int((b0["x"] + b0["w"]) * dpr), int((b0["y"] + b0["h"]) * dpr)
    x0, y0 = max(0, x0), max(0, y0)
    x1, y1 = min(shot.width, x1), min(shot.height, y1)
    if x1 - x0 < 2 or y1 - y0 < 2:
        continue
    a = shot.crop((x0, y0, x1, y1)).load()
    c = bg.crop((x0, y0, x1, y1)).load()
    w, h = x1 - x0, y1 - y0
    unders = []
    for yy in range(h):
        for xx in range(w):
            pa, pc = a[xx, yy], c[xx, yy]
            # 字が乗って色が変わった画素だけ見る
            if abs(pa[0] - pc[0]) + abs(pa[1] - pc[1]) + abs(pa[2] - pc[2]) > 40:
                unders.append(pc)
    if len(unders) < 6:
        continue
    rs = sorted(ratio(col, u) for u in unders)
    worst = rs[len(rs) // 20]  # 下から5%。1画素のはずれ値は拾わない
    # 4.5 を割る地の上に乗っている字の割合。縁の1画素だけなら小さくなるので、
    # 「本当に読めない」と「輪郭がにじんでいるだけ」を分けられる。
    bad = sum(1 for r in rs if r < 4.5) / len(rs)
    mode = Counter(unders).most_common(1)[0][0]
    # いちばん悪い地の色そのもの。最頻色だけ見ていると、
    # 「地はここまで暗くなる」が表に出ないまま直しに入ってしまう。
    wcol = min(unders, key=lambda u: ratio(col, u))
    rows.append((worst, ratio(col, mode), b0, wcol, bad))

LIM = float(sys.argv[3]) if len(sys.argv) > 3 else 0.10
rows.sort(key=lambda r: -r[4])
print(f"{'割れ':>5} {'最悪':>6} {'最頻':>6}  {'字':>9} {'地':>9}  大きさ  class / 中身")
n = 0
for worst, m, b0, mode, bad in rows:
    if bad < LIM:
        break
    n += 1
    print(f"{bad*100:4.0f}% {worst:6.2f} {m:6.2f}  {b0['color'][:9]:>9} {'#%02x%02x%02x' % mode}  {b0['size']:>6}  {b0['c'][:26]} «{b0['t'][:18]}»")
print(f"-- 字の1割以上が 4.5 を割っているのは {n} / {len(rows)} か所")
