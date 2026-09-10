#!/usr/bin/env python3
"""住人のキャラクターの絵の中で、**実際に描かれている範囲**を測って焼く。

キャラクターの絵はどれも 640×640 の枠だが、中に描かれた figure の大きさは
人によって違う（幅 47% しか使っていない人もいれば、高さ 59% の人もいる）。
枠で置くと、枠は同じでも**島に立ったときの大きさが人によって倍近く違う**。

島のスプライト（`content/sprites.json`）と同じ考え方で、
「絵の中で物体がどこにあるか」を先に測っておく。置くほうはこれを見て、
どの人も同じ大きさに見えるように寸法を決める（`components/island/Sprite.tsx`）。

  python3 tools/sprites/charbox.py

絵は `tools/sprites/avatars.py` が /tmp/avatars に落としたものを使う。
出力は `site/content/characterBox.ts`（自動生成。手で直さない）。
"""
import json
import os
import re
import sys

from PIL import Image

AV = "/tmp/avatars"
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "site", "content", "characterBox.ts")
RES = os.path.join(ROOT, "site", "content", "residents.ts")

# residents.ts に載っている人だけを焼く。載っていない絵は島に立たない
ids = re.findall(r'icon:\s*"([^"]+)"', open(RES, encoding="utf-8").read())

rows = []
for i in ids:
    p = os.path.join(AV, i + ".png")
    if not os.path.exists(p):
        print(f"  絵が無い: {i}（avatars.py を先に走らせる）", file=sys.stderr)
        continue
    im = Image.open(p).convert("RGBA")
    bb = im.split()[3].getbbox()
    if not bb:
        continue
    x0, y0, x1, y1 = bb
    w, h = im.size
    rows.append((i, round(x0 / w, 4), round(y0 / h, 4), round((x1 - x0) / w, 4), round((y1 - y0) / h, 4), round(w / h, 4)))

body = "\n".join(
    f'  "{i}": [{x}, {y}, {ww}, {hh}, {ar}],' for i, x, y, ww, hh, ar in rows
)
open(OUT, "w", encoding="utf-8").write(
    """/**
 * キャラクターの絵の中で、**実際に描かれている範囲**。
 *
 * **自動生成。手で直さない。** 作り直す:
 *   python3 tools/sprites/avatars.py && python3 tools/sprites/charbox.py
 *
 * 枠はどれも 640×640 だが、中の figure は人によって幅 47%〜100%、
 * 高さ 59%〜100% とばらばら。枠で置くと、島に立った大きさが倍近く違う
 * （あやと「大きさも不揃い」2026-09-10）。島のスプライトが
 * `content/sprites.json` に物体の範囲を持っているのと同じ理由で、
 * ここに測った値を持っておいて、置くほうがそれを見て寸法を決める。
 *
 * 値は元の絵に対する割合 `[左, 上, 幅, 高さ]` と、元の絵の縦横比 `ar`（幅÷高さ）。
 */
export type CharBox = readonly [x: number, y: number, w: number, h: number, ar: number];

const BOX: Record<string, CharBox> = {
"""
    + body
    + """
};

/**
 * その絵の、描かれている範囲。測っていない絵は「枠いっぱい」として返す。
 *
 * **測っていない人を、誰かの値で埋めない。** 埋めると、その人だけ
 * 別人の形で置かれることになる。枠いっぱいなら、少なくとも嘘はつかない。
 */
export function charBox(icon: string): CharBox {
  return BOX[icon] ?? [0, 0, 1, 1, 1];
}

/**
 * 島に立てるときの寸法。**どの人も同じ大きさに見えるようにそろえる。**
 *
 * 高さでそろえると、寝そべった絵（描かれた高さが枠の 59%）が横に 1.7 倍へ
 * 伸びて巨大になる。幅でそろえると、細長い絵（幅 47%）が背だけ高くなる。
 * **見た目の大きさは面積で決まる**ので、描かれた部分の幅と高さの
 * 相乗平均が `figure` になるようにそろえる。
 * それでも背丈が極端に離れないよう、高さに上下の頭打ちを付ける。
 *
 * @param icon    どの絵か
 * @param figure  そろえたい「描かれた部分」の大きさ（ワールド単位）
 * @returns 貼る矩形。足元の中央が (0, 0) に来る。元の絵の比のままなので
 *          `preserveAspectRatio` は効かせなくてよい。
 */
export function charPlace(icon: string, figure: number) {
  const [bx, by, bw, bh, ar] = charBox(icon);
  /* 描かれた部分の相乗平均を figure にそろえる枠の高さ。
     描かれた幅 = bw*h*ar、高さ = bh*h なので、
     √(幅×高さ) = h√(bw·bh·ar) = figure から逆算する。 */
  let h = figure / Math.sqrt(Math.max(0.05, bw * bh * ar));
  // 背丈の頭打ち。面積をそろえきると、細長い人だけ頭ひとつ抜ける
  const hi = (figure * 1.25) / bh;
  const lo = (figure * 0.85) / bh;
  h = Math.min(hi, Math.max(lo, h));
  const w = h * ar;
  return {
    /** 貼る矩形（足元の中央が原点） */
    x: -(bx + bw / 2) * w,
    y: -(by + bh) * h,
    w,
    h,
    /** 描かれた部分の見た目の幅・高さ。影と当たり判定はこちらに合わせる */
    fw: bw * w,
    fh: bh * h,
  };
}

/**
 * 島の外（`<img>` で出すところ）で、同じそろえ方をする。
 *
 * 器いっぱいに `object-fit: contain` で置いたものを、拡げたり寄せたりする
 * `transform` を返す。**器は正方形にしておくこと**（正方形でないと、
 * 絵の描かれる位置と % のもとになる箱がずれる）。
 *
 * @param icon   どの絵か
 * @param want   器に対して、描かれた部分をどれくらいの大きさにしたいか
 * @param bottom 足元を器の底に合わせる（地面に立たせるとき）
 */
export function charFit(icon: string, want: number, bottom = false): { transform: string } {
  const [bx, by, bw, bh, ar] = charBox(icon);
  let k = want / Math.sqrt(Math.max(0.05, bw * bh * ar));
  k = Math.min((want * 1.25) / bh, Math.max((want * 0.85) / bh, k));
  /* `translate(t) scale(k)` は「拡大してから動かす」ので、中心から c にある点は
     k·c へ動く。t = ねらい − k·c。単位は**拡大前の器**に対する割合。 */
  const cx = (bx + bw / 2 - 0.5) * ar;
  const cy = bottom ? by + bh - 0.5 : by + bh / 2 - 0.5;
  const tx = -k * cx;
  const ty = (bottom ? 0.5 : 0) - k * cy;
  return { transform: `translate(${(tx * 100).toFixed(1)}%, ${(ty * 100).toFixed(1)}%) scale(${k.toFixed(3)})` };
}
"""
)
print(f"{len(rows)}人ぶん焼いた → {OUT}")
json.dump({i: [x, y, ww, hh, ar] for i, x, y, ww, hh, ar in rows}, open("/tmp/avatars/box.json", "w"))
