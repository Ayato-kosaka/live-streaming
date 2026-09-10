/**
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
  "18okO58dwMaci-9R1go0Rj1dTqliSWlz3": [0.0, 0.0, 0.9203, 0.9766, 1.0],
  "1wQzpWPNZKnty7DIiEkrSyib145QIWy4K": [0.0141, 0.0141, 0.9797, 0.9156, 1.0],
  "1oRv9hYOkvlbBvDepLcDWEd6CWm19BJkS": [0.1109, 0.0125, 0.8672, 0.9734, 1.0],
  "1y17p0D56itwNXWWEzo94jF4ThNETczQg": [0.0391, 0.0016, 0.9203, 0.9969, 1.0],
  "1NLsB-D-jeUxQ3viqwhJu2GkRRXsYXAaQ": [0.0469, 0.0141, 0.9047, 0.9812, 1.0],
  "1XUYZEts8lz9SFqQmKuBd4G8KMRfBmPL-": [0.1047, 0.0047, 0.7906, 0.9906, 1.0],
  "1FQFqrRn7Rx8mTT4KOs36_-H2LHeA4uWz": [0.2641, 0.0078, 0.4703, 0.9828, 1.0],
  "1L3c-p3QtcO5HLqCPUtGisxI-_SpwEaZt": [0.0016, 0.0828, 0.9922, 0.9172, 1.0],
  "11ygwplCCuzh5OItBynAVyglM1eZyVUO-": [0.0031, 0.0906, 0.9938, 0.8172, 1.0],
  "1b0Xiz4G4ITGoNeTsNFkzUTXO_xNQd-LU": [0.0234, 0.0344, 0.9766, 0.9234, 1.0],
  "1rJ2HWtuTb6yME_OSJ4mK6jipz08cJlXq": [0.0078, 0.0187, 0.9844, 0.9625, 1.0],
  "1t-p13QOO6AKU1hfzLERn9UtQi7KaCkj_": [0.0219, 0.0016, 0.9703, 0.9984, 1.0],
  "1Exzjd1XGvm_kzdNpjY2z8GxSanZ4u_Bp": [0.0484, 0.0016, 0.9391, 0.9969, 1.0],
  "1pnLoE5eN_KBshkVkc-im25pkffjC3mwc": [0.0, 0.0375, 1.0, 0.9203, 1.0],
  "1kzs_Lm8VmHXkfcW3_7LfssXu2P6sDA47": [0.0, 0.0, 1.0, 1.0, 0.9625],
  "1kxRf8LuchvjgHBbWJ0Kjm0N2Ho3FOOfm": [0.0094, 0.0531, 0.9797, 0.8969, 1.0],
  "1ekFUI08fLxau-_-f3YOlizDLLYpYi21x": [0.0047, 0.0047, 0.9672, 0.9906, 1.0],
  "1LtULnvCDROj6p-_lVx6_QaSgfVxDuUEx": [0.0, 0.1641, 0.95, 0.5891, 1.0],
  "1E8Qm7sgAKmznob7FNDzBEB78zvPfJi86": [0.0953, 0.0063, 0.8531, 0.9891, 1.0],
  "1qh1cX0_JBfrJ5DcoLY2ZmRVdRRSOGLRh": [0.0047, 0.0375, 0.9891, 0.9625, 1.0],
  "1bGJUOx4NJU112oix9BwSVrZQJgsakGIq": [0.1109, 0.0172, 0.8891, 0.9641, 1.0],
  "1jwbRGK_RzFoeH1ndJhetdc9U9_0oS_vz": [0.1219, 0.0047, 0.7703, 0.9953, 1.0],
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
