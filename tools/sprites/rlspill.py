"""輪の札が扇からはみ出していないかを、**描かれた画素**で測る（`rlfit.mjs` の続き）。

    SPORT=4700 TAG=after node tools/sprites/rlfit.mjs
    python3 tools/sprites/rlspill.py after

## なぜ画素で測るか

`getBBox()` が返すのは字の「em 箱」で、上下に下駄（アセンダ・ディセンダ）が
入っている。実測で **1.38em**（見えている字は 1.0em ほど）。あれで測ると、
扇にちゃんと入っている札も 1.1〜1.3 倍の「はみ出し」と出る。

札を出した絵と、**札だけ透明にした絵**の2枚を撮って、差の出た画素が字の画素
（`inkpx.mjs` と同じやり方）。字の画素ひとつひとつについて、

  - 輪の中心から見た**角度**が、いちばん近い扇のまん中から半扇ぶんの中か
  - 輪の中心からの**距離**が、扇の縁（246）の中か

を見る。**札の置きかたを知らずに測れる**ので、置きかたを変えた前後を
同じ物差しで比べられる。
"""
import json, sys
import numpy as np
from PIL import Image

tag = sys.argv[1] if len(sys.argv) > 1 else "after"
base = f"/tmp/rl/{tag}"
rep = json.load(open(f"{base}/fit.json"))
# 扇の縁。`wheel.ts` の `wedgePath` の既定値
R_WEDGE = 246

print(f"■ 輪の札のはみ出し（描かれた画素で）  [{tag}]")
worst_a = worst_r = worst_e = 0.0
bad = 0
for key in sorted(rep, key=lambda k: (int(k.split("-")[0]), int(k.split("-")[1]))):
    n, w = (int(x) for x in key.split("-"))
    r = rep[key]
    shot = np.asarray(Image.open(f"{base}/n{n}-{w}.png").convert("RGB"), dtype=np.int16)
    bg = np.asarray(Image.open(f"{base}/n{n}-{w}.bg.png").convert("RGB"), dtype=np.int16)
    # 撮ったのは dpr 2。json の座標は CSS の px なので倍にする
    dpr = shot.shape[1] / w
    mask = np.abs(shot - bg).sum(axis=2) > 40
    ys, xs = np.nonzero(mask)
    if len(xs) == 0:
        print(f"  {n}件 / {w}px … 字の画素が見つからない（撮り直し）")
        continue
    cx, cy, sc = r["cx"] * dpr, r["cy"] * dpr, r["scale"] * dpr
    dx, dy = xs - cx, ys - cy
    rad = np.hypot(dx, dy) / sc
    # 12時を 0 度、時計回り
    ang = (np.degrees(np.arctan2(dx, -dy)) + 360) % 360
    step = 360.0 / n
    # いちばん近い扇のまん中からのずれ ÷ 半扇。1.00 以下なら扇の中
    off = np.abs(((ang + step / 2) % step) - step / 2)
    ratio = off / (step / 2)
    # 中心に近い画素は角度が暴れる。輪の字は r>100 にしかいない
    keep = rad > 60
    ratio, rad2 = ratio[keep], rad[keep]
    # 1画素のはずれ値（にじみ）で落とさない。上位 0.2% を切って見る
    a99 = float(np.quantile(ratio, 0.998))
    rmax = float(np.quantile(rad2, 0.9995))
    # **扇の境に乗っている字**。ここが本命の数。
    # 「まん中からのずれ」だけを見ると、隣の扇まではみ出した字は
    # 「隣の扇のまん中に近い字」として数えられてしまい、**1.00 で頭打ちになる**。
    # 境（＝隣との切れめ）から半扇の 0.5% 以内にいる画素を数えると、
    # 札が境をまたいでいるかどうかがそのまま出る。
    edge = float((ratio > 0.995).mean())
    worst_e = max(worst_e, edge)
    ng = edge > 0.002 or rmax > R_WEDGE
    bad += ng
    worst_a = max(worst_a, a99)
    worst_r = max(worst_r, rmax)
    print(
        f"  {'✗' if ng else '○'} {n:>2}件 / {w}px  "
        f"境をまたいだ字の画素 {edge * 100:6.2f}%  "
        f"まん中から遠いほうの字 {a99:.2f}倍  "
        f"いちばん外の字 r={rmax:.1f}（扇の縁 {R_WEDGE}）  字の画素 {len(xs):,}"
    )
print(f"── はみ出している場面 {bad} / {len(rep)}  境またぎ 最大 {worst_e * 100:.2f}%・r={worst_r:.1f}")
