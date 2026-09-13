"""帰り道の字の濃さを、描かれた画素から測る（`backink.mjs` が撮った2枚を読む）。

**計算は `pcink.py`（＝`inkpx.py`）と同じもの。1行も変えていない。**
違うのは2つだけ。

  1. **落ちたものだけでなく、測った全部を返す。** ここは「前と後で変わって
     いないこと」を見る道具なので、4.5 を越えているものの値も要る
  2. **丸ごと撮った絵を読まない。** `/island/caucasus/streams` は 390px で
     48,037px あり、dpr2 の丸ごとは 96,074px になって**絵の端が白く抜ける**
     （`docs/island-misses.md` #80 の追記）。抜けた白を地として数えると、
     読める字が「割れている」と出る。だから見えている窓だけを撮って、
     窓の中の座標で読む

    使い方: python3 backink.py <base(.json/.shot.png/.bg.png の手前まで)>
"""
import json
import sys

import numpy as np
from PIL import Image

base = sys.argv[1]

d = json.load(open(base + ".json"))
dpr = d["dpr"]
shot = np.asarray(Image.open(base + ".shot.png").convert("RGB"), dtype=np.int16)
bg = np.asarray(Image.open(base + ".bg.png").convert("RGB"), dtype=np.int16)
H, W = shot.shape[:2]


def lum_a(px):
    c = px.astype(np.float64) / 255.0
    c = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    return c[..., 0] * 0.2126 + c[..., 1] * 0.7152 + c[..., 2] * 0.0722


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


out = []
for b0 in d["boxes"]:
    x0, y0 = max(0, int(b0["x"] * dpr)), max(0, int(b0["y"] * dpr))
    x1 = min(W, int((b0["x"] + b0["w"]) * dpr))
    y1 = min(H, int((b0["y"] + b0["h"]) * dpr))
    if x1 - x0 < 2 or y1 - y0 < 2:
        out.append({"t": b0["t"], "why": "窓の外"})
        continue
    a = shot[y0:y1, x0:x1]
    c = bg[y0:y1, x0:x1]
    mask = np.abs(a - c).sum(axis=2) > 40
    if int(mask.sum()) < 6:
        out.append({"t": b0["t"], "why": "字の画素が見つからない"})
        continue
    unders = c[mask]
    diff = np.abs(a - c).sum(axis=2)[mask]
    core = diff >= np.quantile(diff, 0.6)
    use_core = int(core.sum()) >= 4
    painted = a[mask][core] if use_core else a[mask]
    lt = lum_a(painted)
    lb = lum_a(unders[core] if use_core else unders)
    rs = (np.maximum(lt, lb) + 0.05) / (np.minimum(lt, lb) + 0.05)
    mid = float(np.median(rs))
    ink = tuple(int(v) for v in np.median(painted, axis=0))
    ub = unders[core] if use_core else unders
    order = np.argsort(lum_a(ub))
    lo = tuple(int(v) for v in ub[order[len(order) // 20]])
    hi = tuple(int(v) for v in ub[order[-1 - len(order) // 20]])
    out.append({
        "t": b0["t"], "c": b0["c"][:40], "size": b0["size"],
        "mid": round(mid, 2), "lo": round(ratio(ink, lo), 2), "hi": round(ratio(ink, hi), 2),
        "ink": "#%02x%02x%02x" % ink, "bg": "#%02x%02x%02x" % lo,
        "px": int(mask.sum()),
    })

print(json.dumps(out, ensure_ascii=False))
