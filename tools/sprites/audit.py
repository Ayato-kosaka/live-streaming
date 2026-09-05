"""焼いたスプライトを1枚ずつ測って、島から浮いているものを名指しする。

`docs/island-design.md` 2章の「絵の原則」は、そのまま数で測れる。

  1. 輪郭線を引かない        → 縁が、そのすぐ内側よりどれだけ暗いか（rim）
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

    # 足元の幅。物体のいちばん下から 12% の帯の横幅
    ys = [y for _, y, *_ in solid]
    lo, hi = min(ys), max(ys)
    band = hi - max(lo, hi - max(2, (hi - lo) * 0.12))
    foot_xs = [x for x, y, *_ in solid if y >= hi - band]
    foot = (max(foot_xs) - min(foot_xs) + 1) if foot_xs else 1

    hs, ss, vs = [], [], []
    for _, _, r, g, b in solid:
        h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
        hs.append(h)
        ss.append(s)
        vs.append(v)
    vs_sorted = sorted(vs)
    dark = vs_sorted[max(0, int(len(vs_sorted) * 0.05))]

    # 縁が暗いか。
    #
    # **縁の明るさを「絵ぜんたいの中央値」と比べてはいけない。**
    # 最初そう測って、誕生日ケーキ（下段がチョコ）やパン（耳が茶色）が
    # 「輪郭線あり」に出た。物の中に暗い部分があるだけで引っかかる。
    #
    # 輪郭線というのは「縁だけが、そのすぐ内側より暗い」ことなので、
    # 1画素ずつ、内側へ3px 入ったところと比べる。
    mask = {}
    for x, y, r, g, b in solid:
        mask[(x, y)] = max(r, g, b) / 255
    steps = []
    for x, y, r, g, b in solid:
        # 内向き。8近傍のうち物体側へ向くベクトルの平均
        dx = dy = 0
        miss = False
        for ox in (-1, 0, 1):
            for oy in (-1, 0, 1):
                if (x + ox, y + oy) in mask:
                    dx += ox
                    dy += oy
                else:
                    miss = True
        if not miss:
            continue                       # 縁ではない
        n = (dx * dx + dy * dy) ** 0.5
        if n < 0.5:
            continue                       # 内向きが決まらない（棘の先など）
        ix = x + round(dx / n * 3)
        iy = y + round(dy / n * 3)
        if (ix, iy) in mask:
            steps.append(mask[(ix, iy)] - mask[(x, y)])
    rim = median(steps) if steps else 0.0

    return {
        "w": W, "h": H,
        "px": len(solid),
        "hue": median(hs), "sat": median(ss), "val": median(vs),
        "dark": dark,
        "rim": rim,
        # 影の広さは、物の面積ではなく**足元の幅**で割る。
        # 面積で割ると、岩のように「広くて平べったい物」が
        # 影を持っているのに「影がうすい」に出る（実際そうなっていた）。
        # 影は足元にできるので、比べる相手は横幅のほう
        "shadow": shadow / max(1, foot),
    }


# 外していると呼ぶ線。
#
# **どれも「この値を割ると絵が変わって見える」ところに置いた。**
# 手で決めた見栄えの好みではなく、決まりを外しているかどうか。
LIMITS = {
    # 接地影の画素が、足元の幅の 2倍を切ると、島に置いたとき浮いて見える
    # （きちんと影のある岩で 6〜10、影を焼き忘れた絵で 0〜1）
    "shadow": ("接地影がうすい", lambda m: m["shadow"] < 2.0),
    # 縁が、そのすぐ内側より 0.06 以上暗いと、輪郭線を引いたのと同じに見える
    "rim": ("縁が暗い（輪郭線に見える）", lambda m: m["rim"] > 0.06),
    # いちばん暗いところが 0.26 を割ると、環境光が効いていない
    "dark": ("暗く沈んでいる", lambda m: m["dark"] < 0.26),
    # 彩度 0.06 を切ると、階調のある島の中で1枚だけ灰色に見える
    "sat": ("彩度が無い", lambda m: m["sat"] < 0.06),
}


# そう焼いてあるのが正しいもの。
#
# **消すのではなく、理由を添えて別に出す。** 黙って外すと、あとから
# 同じところが本当に壊れたときに気づけない。
# 名前の前方一致で拾う。
EXCUSED = [
    (("villager-",), "dark",
     "住人。髪と服が黒い人がいる。キットの素の色で、暗いのが本人の姿"),
    (("food-avocado", "food-maki", "food-cookie-chocolate", "food-sushi-egg",
      "food-cake-birthday", "food-rice-ball"), "dark",
     "食べもの側が暗い（海苔・チョコ・アボカドの種）。地の明るさの話ではない"),
    (("food-bowl", "food-cup-", "food-plate", "food-glass", "food-egg-cooked",
      "food-pizza-box", "food-rice-ball"), "sat",
     "白い器と白身。彩度が無いのが本来の色"),
    (("food-bacon", "food-egg-cooked"), "shadow",
     "地面に貼り付いて寝ている物。高さが無いので影の出る場所が無い"),
    (("food-pizza", "food-sub"), "rim",
     "縁が耳（パンの皮・ピザの耳）。輪郭線ではなく、物のかたち"),
]


def excused(name, key):
    for pres, k, why in EXCUSED:
        if k == key and any(name.startswith(p) for p in pres):
            return why
    return None


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
    ok_reasons = {}
    for n, m in rows:
        hits, waived = [], []
        for key, (msg, f) in LIMITS.items():
            if not f(m):
                continue
            why = excused(n, key)
            (waived if why else hits).append(why or msg)
        for w in waived:
            ok_reasons.setdefault(w, []).append(n)
        if hits:
            bad += 1
        if not (show_all or hits):
            continue
        print(f"{n:28} {m['hue']:6.3f} {m['sat']:6.3f} {m['val']:6.3f} "
              f"{m['dark']:6.3f} {m['rim']:6.3f} {m['shadow']:6.3f}"
              + ("  ← " + " / ".join(hits) if hits else ""))
    print(f"\n{len(rows)} 枚のうち {bad} 枚が決まりを外している")
    if ok_reasons:
        print("\nそう焼いてあるのが正しいもの:")
        for why, ns in ok_reasons.items():
            print(f"  {len(ns):3}枚  {why}")
            print(f"        {', '.join(ns[:6])}{' …' if len(ns) > 6 else ''}")
    if "--json" in sys.argv:
        with open("/tmp/sprite-audit.json", "w") as fp:
            json.dump({n: m for n, m in rows}, fp)
        print("→ /tmp/sprite-audit.json")


main()
