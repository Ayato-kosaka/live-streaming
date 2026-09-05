"""描かれた画素から字の濃さを測る（2/2。読むほう）。inkpx.mjs が撮った2枚を突き合わせる。

**合否は中央値で決める。字の下位10%で決めない**（`CLAUDE.md`）。
下位10%はにじみ（アンチエイリアス）の画素で、計算値ちょうど 9.25 の字でも
5.06 と出る。真の値が 9.25 の字がそうなるので、どんな字も落ちる。

下位10%を見たかった理由は「中心だけ濃い暗幕で中央値をよく見せた」失敗を
捕まえるためだった。あれは字ではなく**地**が場所で変わっていた話なので、
2枚目（地だけの絵）を字の面積ぶん見て、**いちばん明るい地といちばん暗い地の
両方で比を出す**。地のばらつきはそちらで捕まえる。

出る4つ:
  中央 … 字の画素の比の中央値。**これで合否を決める**
  明地 … その字が乗っている地のいちばん明るいところとの比
  暗地 … 同じく、いちばん暗いところとの比。**地のムラはここに出る**
  ふり … 明地と暗地の差。大きいほど地がまだらで、場所によって読めなくなる
"""
import json, sys
import numpy as np
from PIL import Image

tag = sys.argv[1] if len(sys.argv) > 1 else "ink"
page = sys.argv[2] if len(sys.argv) > 2 else "_map"
base = f"/tmp/ink/{tag}/{page}"
d = json.load(open(base + ".json"))
dpr = d["dpr"]
# 面によっては字が 500 か所ある。1画素ずつ Python で回すと1面で10分を超えて、
# 「測ってから直す」が回らなくなる。画素は numpy にまとめて渡す。
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
    x1, y1 = min(W, x1), min(H, y1)
    if x1 - x0 < 2 or y1 - y0 < 2:
        continue
    a = shot[y0:y1, x0:x1]
    c = bg[y0:y1, x0:x1]
    # 字が乗って色が変わった画素だけ見る
    mask = np.abs(a - c).sum(axis=2) > 40
    if int(mask.sum()) < 6:
        continue
    unders = c[mask]                        # その字が乗っている地だけ
    # **字の色は、宣言された値ではなく描かれた画素から取る。**
    # computed の color は opacity を含まない。0.72 で薄めてある字を
    # そのまま使うと、実際より濃いものとして数えて合格に見えてしまう
    # （地図の海の名前を 0/170 と報告して、実は 1.88 だったのがこれ）。
    # にじみを拾わないよう、地との差がいちばん大きい側（上位4割）＝字の芯だけを見る。
    diff = np.abs(a - c).sum(axis=2)[mask]
    core = diff >= np.quantile(diff, 0.6)
    painted = a[mask][core] if int(core.sum()) >= 4 else a[mask]
    lt = lum_a(painted)
    lb = lum_a(unders[core] if int(core.sum()) >= 4 else unders)
    hi_l, lo_l = np.maximum(lt, lb), np.minimum(lt, lb)
    rs = (hi_l + 0.05) / (lo_l + 0.05)
    # 合否は中央値。にじみの画素で落とさない。
    mid = float(np.median(rs))
    # 地のばらつきは、字ではなく地のほうを見る。1画素のはずれ値を拾わないよう
    # 上下 5% で切る。明るい地・暗い地それぞれとの比を出す。
    ink = tuple(int(v) for v in np.median(painted, axis=0))
    ub = unders[core] if int(core.sum()) >= 4 else unders
    order = np.argsort(lum_a(ub))
    lo = tuple(int(v) for v in ub[order[len(order) // 20]])
    hi = tuple(int(v) for v in ub[order[-1 - len(order) // 20]])
    rows.append((mid, ratio(ink, hi), ratio(ink, lo), b0, lo, hi, ink))

LIM = float(sys.argv[3]) if len(sys.argv) > 3 else 4.5
rows.sort(key=lambda r: r[0])
print(f"{'中央':>6} {'明地':>6} {'暗地':>6} {'ふり':>5}  {'字':>9} {'暗い地':>9}  大きさ  class / 中身")
n = 0
for mid, rhi, rlo, b0, lo, hi, ink in rows:
    # 中央値が足りないか、地のムラのせいで暗いところだけ落ちているか
    if mid >= LIM and rlo >= LIM:
        continue
    n += 1
    print(f"{mid:6.2f} {rhi:6.2f} {rlo:6.2f} {rhi - rlo:5.2f}  {'#%02x%02x%02x' % ink:>9} {'#%02x%02x%02x' % lo}  {b0['size']:>6}  {b0['c'][:26]} «{b0['t'][:18]}»")
print(f"-- {LIM} を割っているのは {n} / {len(rows)} か所（中央値、または地の暗いほうで）")
