#!/usr/bin/env python3
"""手元で動く。ChatGPT から持ち帰った透過 PNG を、島に出せる形に整える。

    python3 .claude/skills/chatgpt-image/tidy.py <入力.png> <出力.png> [--pad 24] [--square]

- **中の透明度を 255 にそろえる。** ChatGPT の絵は中身が 254 で入ってくる（2026-10-12 に 🃏 と地球の絵の両方で）。
  見た目は変わらないが、「完全に不透明か」で判定する道具（SUZURI の透過の確かめなど）がずれる
- **余白を足す。** ChatGPT は絵を端ぎりぎりまで描くことがあり、頼んでも余白は守られない
  （「余白をとって」と頼み直したら、下と左がかえって切れ、中身も描き直された）
- `--square` で正方形の台紙に置く（ステッカーの `art` / `file` を正方形にそろえるとき）
"""
import argparse
import numpy as np
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument("src")
ap.add_argument("out")
ap.add_argument("--pad", type=int, default=24)
ap.add_argument("--square", action="store_true")
o = ap.parse_args()

a = np.array(Image.open(o.src).convert("RGBA"))
before = [int((x > 0).sum()) for x in (a[0, :, 3], a[-1, :, 3], a[:, 0, 3], a[:, -1, 3])]
al = a[..., 3]
al[al >= 250] = 255
im = Image.fromarray(a)
im = im.crop(im.getbbox())
W, H = im.width + 2 * o.pad, im.height + 2 * o.pad
if o.square:
    W = H = max(W, H)
out = Image.new("RGBA", (W, H), (0, 0, 0, 0))
out.paste(im, ((W - im.width) // 2, (H - im.height) // 2))
out.save(o.out, optimize=True)
b = np.array(out)[..., 3]
print(f"端に掛かっていた画素（上・下・左・右）{before} → {out.size[0]}×{out.size[1]}、"
      f"見えている画素のうち完全に不透明 {(b[b > 0] == 255).mean() * 100:.1f}%")
