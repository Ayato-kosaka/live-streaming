"""描かれた画素から字の濃さを測る（`pcink.mjs` が撮った2枚を読む）。

**計算は `inkpx.py` と同じもの。** 違うのは、人が読む表ではなく
**JSON を1行返す**こと（109面を回る `pcink.mjs` から1面ずつ呼ばれる）。
`inkpx.py` を直に呼べないのは、あちらが「撮ってから人が見る」前提で
表を印字して終わる作りだから。**計算を変えてはいけない。**
向こうを直したら、こちらも同じに直す。

決めごと（`CLAUDE.md`・`inkpx.py` から持ってきたもの。理由まで写す）:
  - **合否は中央値で決める。字の下位10%で決めない。** 下位10%はにじみの画素で、
    計算値ちょうど 9.25 の字でも 5.06 と出る。どんな字も落ちる
  - **字の色は、宣言された値ではなく描かれた画素から取る。**
    computed の color は opacity を含まない
  - 地のばらつきは、**明るい地といちばん暗い地の両方**との比で見る

    使い方: python3 pcink.py <base(.json/.shot.png/.bg.png の手前まで)> [しきい値]
"""
import json
import sys

import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None  # 全面の絵は dpr2 で 1億画素を超えることがある

base = sys.argv[1]
LIM = float(sys.argv[2]) if len(sys.argv) > 2 else 4.5

d = json.load(open(base + ".json"))
dpr = d["dpr"]
# 面によっては字が 500 か所ある。1画素ずつ Python で回すと1面で10分を超えるので
# 画素は numpy にまとめて渡す
shot = np.asarray(Image.open(base + ".shot.png").convert("RGB"), dtype=np.int16)
bg = np.asarray(Image.open(base + ".bg.png").convert("RGB"), dtype=np.int16)
H, W = shot.shape[:2]


def lum_a(px):
    """画素の並び (N,3) から相対輝度の並びを出す。"""
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


def parse(col):
    col = col.strip()
    # color-mix の計算値は `color(srgb 0.42 0.30 0.09)` で返る。ここを読めないと
    # **色を color-mix で作った字が丸ごと測れない**（島の字はほとんどこれ）
    if col.startswith("color("):
        n = [float(x) for x in col[col.index("(") + 1: col.rindex(")")].split()[1:4]]
        return tuple(max(0, min(255, round(x * 255))) for x in n)
    if col.startswith("rgb"):
        n = [float(x) for x in col[col.index("(") + 1: col.index(")")].replace("/", ",").split(",")[:3]]
        return tuple(int(x) for x in n)
    if col.startswith("#"):
        h = col[1:]
        if len(h) == 3:
            h = "".join(c * 2 for c in h)
        return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))
    return None


bad = []
n = 0
unreadable = 0
for b0 in d["boxes"]:
    if parse(b0["color"]) is None:
        # 色が読めないものを黙って捨てると、**測っていないところが0件に見える**
        unreadable += 1
        continue
    x0, y0 = max(0, int(b0["x"] * dpr)), max(0, int(b0["y"] * dpr))
    x1 = min(W, int((b0["x"] + b0["w"]) * dpr))
    y1 = min(H, int((b0["y"] + b0["h"]) * dpr))
    if x1 - x0 < 2 or y1 - y0 < 2:
        continue
    a = shot[y0:y1, x0:x1]
    c = bg[y0:y1, x0:x1]
    mask = np.abs(a - c).sum(axis=2) > 40  # 字が乗って色が変わった画素だけ
    if int(mask.sum()) < 6:
        continue
    n += 1
    unders = c[mask]
    # にじみを拾わないよう、地との差がいちばん大きい側（上位4割）＝字の芯だけを見る
    diff = np.abs(a - c).sum(axis=2)[mask]
    core = diff >= np.quantile(diff, 0.6)
    use_core = int(core.sum()) >= 4
    painted = a[mask][core] if use_core else a[mask]
    lt = lum_a(painted)
    lb = lum_a(unders[core] if use_core else unders)
    rs = (np.maximum(lt, lb) + 0.05) / (np.minimum(lt, lb) + 0.05)
    mid = float(np.median(rs))  # **合否は中央値。にじみの画素で落とさない**
    ink = tuple(int(v) for v in np.median(painted, axis=0))
    ub = unders[core] if use_core else unders
    order = np.argsort(lum_a(ub))
    lo = tuple(int(v) for v in ub[order[len(order) // 20]])
    hi = tuple(int(v) for v in ub[order[-1 - len(order) // 20]])
    rlo, rhi = ratio(ink, lo), ratio(ink, hi)
    # 中央値が足りないか、地のムラで暗いところだけ落ちているか
    if mid >= LIM and rlo >= LIM:
        continue
    bad.append({
        "mid": round(mid, 2), "lo": round(rlo, 2), "hi": round(rhi, 2),
        "size": b0["size"], "c": b0["c"][:40], "t": b0["t"][:24], "tag": b0["tag"],
        "ink": "#%02x%02x%02x" % ink, "bg": "#%02x%02x%02x" % lo,
        "y": round(b0["y"]),
    })

bad.sort(key=lambda r: r["mid"])
print(json.dumps({"n": n, "unreadable": unreadable, "bad": bad}, ensure_ascii=False))
