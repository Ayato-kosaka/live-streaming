"""焼いたスプライトを1枚ずつ測って、島から浮いているものを名指しする。

`docs/island-design.md` 2章の「絵の原則」は、そのまま数で測れる。

  1. 輪郭線を引かない        → 縁の画素が中よりどれだけ暗いか（rim）
  2. 環境光をとても強くする  → いちばん暗いところの明るさ（dark = V の下位5%）
  3. 接地影を焼き込む        → 物の下に半透明の影があるか（shadow）
  4. 彩度と明度をどちらも高く → 彩度と明度の中央値（sat / val）

**目視で「浮いている」と言わない。** 306枚を並べて見ても、
どれが決まりを外しているかは分からない。数にしてから並べ替える。

  python3 tools/sprites/audit.py            # 外しているものだけ
  python3 tools/sprites/audit.py --all      # 全部を表で
  python3 tools/sprites/audit.py tree-      # 名前で絞る
"""
import json
import os
import sys
import colorsys
from statistics import median

from PIL import Image

SRC = os.path.join(os.path.dirname(__file__), "../../site/public/sprites")

# 物体とみなすアルファ。meta.py の SOLID と同じ
SOLID = 140
# 接地影とみなすアルファの幅。これより濃ければ物体、薄ければ影の外
SHADOW_LO, SHADOW_HI = 12, 120


def measure(path):
    im = Image.open(path).convert("RGBA")
    px = im.load()
    W, H = im.size
    solid = []      # (x, y, r, g, b)
    shadow = 0
    for y in range(H):
        for x in range(W):
            r, g, b, a = px[x, y]
            if a >= SOLID:
                solid.append((x, y, r, g, b))
            elif SHADOW_LO <= a < SHADOW_HI:
                shadow += 1
    if not solid:
        return None

    hs, ss, vs = [], [], []
    for _, _, r, g, b in solid:
        h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
        hs.append(h)
        ss.append(s)
        vs.append(v)
    vs_sorted = sorted(vs)
    dark = vs_sorted[max(0, int(len(vs_sorted) * 0.05))]

    # 縁と中。物体の画素のうち、8近傍に「物体でない」ものがあれば縁
    mask = set((x, y) for x, y, *_ in solid)
    rim_v, in_v = [], []
    for x, y, r, g, b in solid:
        v = max(r, g, b) / 255
        edge = any((x + dx, y + dy) not in mask
                   for dx in (-1, 0, 1) for dy in (-1, 0, 1))
        (rim_v if edge else in_v).append(v)
    # 縁が中よりどれだけ暗いか。輪郭線を引いていれば大きく出る
    rim = (median(in_v) - median(rim_v)) if in_v and rim_v else 0.0

    return {
        "w": W, "h": H,
        "px": len(solid),
        "hue": median(hs), "sat": median(ss), "val": median(vs),
        "dark": dark,
        "rim": rim,
        # 影の広さは物の大きさに対する比で見る。大きい物ほど影も広い
        "shadow": shadow / max(1, len(solid)),
    }


# 外していると呼ぶ線。
#
# **どれも「この値を割ると絵が変わって見える」ところに置いた。**
# 手で決めた見栄えの好みではなく、決まりを外しているかどうか。
LIMITS = {
    # 接地影が物の面積の 8% を切ると、島に置いたとき浮いて見える
    "shadow": ("接地影がうすい", lambda m: m["shadow"] < 0.08),
    # 縁が中より 0.10 以上暗いと、輪郭線を引いたのと同じに見える
    "rim": ("縁が暗い（輪郭線に見える）", lambda m: m["rim"] > 0.10),
    # いちばん暗いところが 0.26 を割ると、環境光が効いていない
    "dark": ("暗く沈んでいる", lambda m: m["dark"] < 0.26),
    # 彩度 0.06 を切ると、階調のある島の中で1枚だけ灰色に見える
    "sat": ("彩度が無い", lambda m: m["sat"] < 0.06),
}


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    show_all = "--all" in sys.argv
    names = sorted(f[:-5] for f in os.listdir(SRC) if f.endswith(".webp"))
    if args:
        names = [n for n in names if any(a in n for a in args)]

    rows = []
    for n in names:
        m = measure(os.path.join(SRC, n + ".webp"))
        if m:
            rows.append((n, m))

    print(f"{'名前':28} {'色相':>6} {'彩度':>6} {'明度':>6} {'暗5%':>6} {'縁差':>6} {'影':>6}")
    bad = 0
    for n, m in rows:
        hits = [msg for key, (msg, f) in LIMITS.items() if f(m)]
        if hits:
            bad += 1
        if not (show_all or hits):
            continue
        print(f"{n:28} {m['hue']:6.3f} {m['sat']:6.3f} {m['val']:6.3f} "
              f"{m['dark']:6.3f} {m['rim']:6.3f} {m['shadow']:6.3f}"
              + ("  ← " + " / ".join(hits) if hits else ""))
    print(f"\n{len(rows)} 枚のうち {bad} 枚が決まりを外している")
    if "--json" in sys.argv:
        with open("/tmp/sprite-audit.json", "w") as fp:
            json.dump({n: m for n, m in rows}, fp)
        print("→ /tmp/sprite-audit.json")


main()
