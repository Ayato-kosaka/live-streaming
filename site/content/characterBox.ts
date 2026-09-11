/**
 * キャラクターの絵の中で、**実際に描かれている範囲**。
 *
 * **自動生成。手で直さない。** 作り直す:
 *   python3 tools/sprites/charbox.py
 *
 * 枠はどれも正方形だが、中の figure は人によって幅 47%〜100%、
 * 高さ 59%〜100% とばらばら。枠で置くと、島に立った大きさが倍近く違う
 * （あやと「大きさも不揃い」2026-09-10）。島のスプライトが
 * `content/sprites.json` に物体の範囲を持っているのと同じ理由で、
 * ここに測った値を持っておいて、置くほうがそれを見て寸法を決める。
 *
 * **島に立つ22人だけでなく、図鑑に並ぶ全員ぶん入っている。**
 * 図鑑（`/friends`）は口から取った全員を同じ大きさで並べるので、
 * 22人ぶんしか無いと残りが既定値（枠いっぱい）になって不揃いになる。
 *
 * 値は元の絵に対する割合 `[左, 上, 幅, 高さ]` と、元の絵の縦横比 `ar`（幅÷高さ）。
 */
export type CharBox = readonly [x: number, y: number, w: number, h: number, ar: number];

const BOX: Record<string, CharBox> = {
  "1_G_v2sdY7ByT2Cp5C5E8wZKiAv3FzBZT": [0.1172, 0.0016, 0.8828, 0.9969, 1.0],
  "10hbypXDmWLEcat6gTZz3TuotslN8EiSb": [0.0, 0.0922, 1.0, 0.8156, 1.0],
  "11ygwplCCuzh5OItBynAVyglM1eZyVUO-": [0.0, 0.0875, 0.9984, 0.8234, 1.0],
  "12NyHkOji0ABdZtMPS1WAMoyfF_iKCZaj": [0.0, 0.0, 1.0, 0.9953, 1.0],
  "14yZusInfAgY955RYurL3ADJ9hN6H2Bac": [0.0141, 0.0297, 0.9859, 0.9703, 1.0],
  "151HenpNq4kKoXxiccsiALtKGPIDIxGGl": [0.0328, 0.0187, 0.8781, 0.9812, 1.0],
  "16YSWedIKcZkW3LIDqF3A3lNLSP2uJMfK": [0.0141, 0.2609, 0.9719, 0.5188, 1.0],
  "18-GR9oQLMF6V_qEY2q9D0HO2ggdXsCsC": [0.0453, 0.0031, 0.825, 0.9969, 1.0],
  "18F1UehNd5efpQztgrRqHOGnibXJQYuda": [0.1141, 0.0109, 0.8094, 0.9766, 1.0],
  "18okO58dwMaci-9R1go0Rj1dTqliSWlz3": [0.0, 0.0, 0.9844, 0.9797, 1.0],
  "18wPo2-X4hht-JKaX0Vnk-SwryEP3INL3": [0.1516, 0.0047, 0.8031, 0.9906, 1.0],
  "1a5RFkHtQVQhVENchDxOEWbrQnJpRozM_": [0.0, 0.0, 1.0, 1.0, 1.3333],
  "1AGGCwvD2ZSwlL69Gff_EvVnunRvKq9qp": [0.0, 0.1109, 1.0, 0.8703, 1.0],
  "1AzM8uFWB67nZ6SyinVeHHIK9OiWoXR9Y": [0.0328, 0.05, 0.9359, 0.8583, 0.6667],
  "1b0Xiz4G4ITGoNeTsNFkzUTXO_xNQd-LU": [0.0203, 0.0312, 0.9797, 0.9297, 1.0],
  "1bGBB3GDn6UUEwC0sjhuFXjs3FllDHV12": [0.0, 0.0, 1.0, 1.0, 0.7642],
  "1bGJUOx4NJU112oix9BwSVrZQJgsakGIq": [0.1078, 0.0156, 0.8922, 0.9688, 1.0],
  "1cF2q6-hrVZA87JfNiqhFtntT7e0XMcSp": [0.1578, 0.0016, 0.6969, 0.9906, 1.0],
  "1cLFhOOGK9vHibsqRwbMcqXE9-28bELI1": [0.0078, 0.0344, 0.9859, 0.9078, 1.0],
  "1Cz7Cr3eJl2lODLngdjVTTjIX34yrcq5k": [0.1391, 0.0, 0.6641, 0.9984, 1.0],
  "1DcjL-_voO7I_JOlQrlKi2ixieBh7KSBA": [0.0016, 0.0547, 0.9859, 0.8797, 1.0],
  "1dr5dfJRm-nozyGBLyiTSFPSxo8Fl_624": [0.1016, 0.0063, 0.825, 0.9891, 1.0],
  "1e3c_PP-qNYQf1B3ZIYX_CoJolVZkCQ2D": [0.0, 0.0234, 1.0, 0.9531, 1.0],
  "1E73m2i7IyzhqXKYMDCbM0_nSSQpKRE4w": [0.0078, 0.0375, 0.9797, 0.9031, 1.0],
  "1E8Qm7sgAKmznob7FNDzBEB78zvPfJi86": [0.0953, 0.0063, 0.8531, 0.9906, 1.0],
  "1EDpfnUuIpgzv_xTNg1iLYjOSBtxPD8bd": [0.1906, 0.0089, 0.6359, 0.9839, 1.1429],
  "1EjhtLAwDDBF_8sr60802BeCtebKXbc_Y": [0.0016, 0.0047, 0.9297, 0.9953, 1.0],
  "1ekFUI08fLxau-_-f3YOlizDLLYpYi21x": [0.0016, 0.0016, 0.9703, 0.9969, 1.0],
  "1Exzjd1XGvm_kzdNpjY2z8GxSanZ4u_Bp": [0.0484, 0.0, 0.9422, 1.0, 1.0],
  "1F9mvP0wZ0hjX4S3bzcfytUd4jBxKuAXk": [0.0781, 0.0016, 0.8422, 0.9984, 1.0],
  "1FAAUlc3rR5uYgM7PiZbpjodmsi9iMKY7": [0.0328, 0.0547, 0.9469, 0.9016, 1.0],
  "1FQFqrRn7Rx8mTT4KOs36_-H2LHeA4uWz": [0.2609, 0.0063, 0.475, 0.9875, 1.0],
  "1fYawzTx6XSW3LHc22AQwkyNHM1kS07WN": [0.0, 0.0, 1.0, 1.0, 1.0],
  "1gLXDXki9i7UGr83PQ_DyluvwNtXz7S16": [0.0828, 0.0641, 0.8453, 0.8719, 1.0],
  "1gMkpXBjdoaF2h_fwbByRXhvFZcJ8ulzK": [0.0, 0.0187, 1.0, 0.9812, 1.0],
  "1gq-yA-KAErasYCpLqIxGTqafjv2GCaqJ": [0.1313, 0.0114, 0.6375, 0.9875, 0.7298],
  "1h-O2B6oLncxDyQYVDwEsELSdGdajIc37": [0.1156, 0.0016, 0.7688, 0.9969, 1.0],
  "1h6oOLYFl6J1jb5_dGWcokkKw_bE78Pt_": [0.0047, 0.0031, 0.9953, 0.9875, 1.0],
  "1h8-hyQRdUyqKWSfrQlz55VJLTUN2ibiB": [0.1281, 0.0, 0.6828, 0.9828, 1.0],
  "1I_M6D8cTyv3YHJn2WTNSyQrkF8tNTMsZ": [0.0, 0.0594, 0.9094, 0.8828, 1.0],
  "1itaFtShGqKKOPGGFVYzdSJC-kFMCmHus": [0.0281, 0.0031, 0.9422, 0.9953, 1.0],
  "1iulEsJGApOYA9XtHb4bwhJKljDHOcA4Q": [0.0547, 0.0031, 0.8781, 0.9953, 1.0],
  "1jwbRGK_RzFoeH1ndJhetdc9U9_0oS_vz": [0.1187, 0.0016, 0.7766, 0.9984, 1.0],
  "1K1XvtfAgLrWvBGZlWS5EWW62TjXD_4H3": [0.1031, 0.0, 0.8422, 0.9062, 1.0],
  "1kp3UJGRiwJsLqoZ97zjmc0RZcChX6Eo5": [0.0203, 0.0625, 0.95, 0.8984, 1.0],
  "1ktHGXN-50Z7akUp_PLVjq99zaIKT3Emn": [0.1125, 0.0031, 0.8406, 0.9938, 1.0],
  "1kxRf8LuchvjgHBbWJ0Kjm0N2Ho3FOOfm": [0.0063, 0.05, 0.9859, 0.9031, 1.0],
  "1kzs_Lm8VmHXkfcW3_7LfssXu2P6sDA47": [0.0, 0.0, 1.0, 0.9805, 0.9624],
  "1L3c-p3QtcO5HLqCPUtGisxI-_SpwEaZt": [0.0, 0.0797, 0.9969, 0.9203, 1.0],
  "1lMatgwohGSKOXMGRMO0UFrusGh8D9KgN": [0.0, 0.0094, 0.9406, 0.9812, 1.0],
  "1LtULnvCDROj6p-_lVx6_QaSgfVxDuUEx": [0.0, 0.1609, 0.9516, 0.5953, 1.0],
  "1m_QE_hV46Ppy50vh5ic2H89AdkRVWMLG": [0.0172, 0.0781, 0.9781, 0.8625, 1.0],
  "1m9fsDVHh22IM1L6QFc3MohhmF-hGPrlf": [0.025, 0.0422, 0.9406, 0.8781, 1.0],
  "1mh-UiLxDgcMIpuIhbPmQ1Br3JSC9cRR-": [0.0, 0.0469, 1.0, 0.9531, 1.0],
  "1nF1nRExuVTiueUaYIXNRR9tijr564qNV": [0.1547, 0.0167, 0.6875, 0.9125, 0.6667],
  "1Ngr31whwrzOnlOah0MctMlsACXsMbIgM": [0.0391, 0.0016, 0.925, 0.9969, 1.0],
  "1NLsB-D-jeUxQ3viqwhJu2GkRRXsYXAaQ": [0.0437, 0.0109, 0.9109, 0.9875, 1.0],
  "1NylyE8cpHLq-Mw_ehq2OpBlbYmcLmKIw": [0.0484, 0.0453, 0.9516, 0.8906, 1.0],
  "1oiHs-Ayika6g2ePt2Y4AIfgrWrMMJQf7": [0.0406, 0.0479, 0.8016, 0.8385, 0.6667],
  "1oRv9hYOkvlbBvDepLcDWEd6CWm19BJkS": [0.1078, 0.0109, 0.8719, 0.9781, 1.0],
  "1p46JvC_wbKo-rDEzE2pRMZh2neekNvta": [0.0125, 0.0391, 0.9719, 0.9391, 1.0],
  "1PBmqkQtcTeuNPIfILna1FLh9W7VtNliX": [0.0125, 0.05, 0.9766, 0.925, 1.0],
  "1pnLoE5eN_KBshkVkc-im25pkffjC3mwc": [0.0, 0.0375, 1.0, 0.9234, 1.0],
  "1Pnz3C3qVkoCCF7aAeqJqYJS3BQcv5kpG": [0.0531, 0.0063, 0.8938, 0.9859, 1.0],
  "1q2o_EF4oe2MgyDBzZj3sB52n_jcf-QWk": [0.0531, 0.0, 0.8891, 0.9969, 1.0],
  "1qh1cX0_JBfrJ5DcoLY2ZmRVdRRSOGLRh": [0.0047, 0.0375, 0.9906, 0.9625, 1.0],
  "1QKJBnvPkBcoi235RWZ0THbe4D5Bly4_D": [0.0, 0.0406, 1.0, 0.9594, 1.0],
  "1qWjhGcv3Y--7hTEnrzOZk_rzud3qdzqb": [0.0, 0.0, 0.9984, 0.9895, 0.9624],
  "1qXh-o-wpSd_lHP6CjiUgsW56QDK9TbDp": [0.0031, 0.0453, 0.9922, 0.9078, 1.0],
  "1RAzLmaR8Kk8UZYDqUl85uNQEdd4QFu9C": [0.1422, 0.0063, 0.8578, 0.9875, 1.0],
  "1rBAIvw3q0oxlgnGd9TJUNHKnIrYwr-bE": [0.0719, 0.0063, 0.8219, 0.9938, 1.0],
  "1rJ2HWtuTb6yME_OSJ4mK6jipz08cJlXq": [0.0047, 0.0187, 0.9906, 0.9656, 1.0],
  "1rkhrzVUpkZGXfSpDbyxzOKoHLUZKy8VL": [0.0609, 0.0, 0.8766, 1.0, 1.0],
  "1rKI8QR7dLexTBoM8E3LjTCzQCXvzpHlB": [0.0422, 0.0, 0.8703, 1.0, 1.0],
  "1SOyFgrSquG1pFNDYj_A8-vn6E_yC49xi": [0.0312, 0.0, 0.8969, 0.9922, 1.0],
  "1t-p13QOO6AKU1hfzLERn9UtQi7KaCkj_": [0.0187, 0.0, 0.9766, 1.0, 1.0],
  "1T0NAqeh241mWWnQlV6zmnbflznFtxLkr": [0.0063, 0.0219, 0.9906, 0.9297, 1.0],
  "1tfS_fQYCUkkbVCyRwdYeqGPZ3rACU4VX": [0.0, 0.0, 0.9969, 0.9953, 1.0],
  "1TS5HWkC1AmGnn3yLqoppPuhq1V_8p3Q7": [0.0, 0.0063, 0.95, 0.9844, 1.0],
  "1TSM9fNbI4Zg8ga6OdDqjPhma-n7W-wLQ": [0.0719, 0.0122, 0.8625, 0.9878, 0.7776],
  "1TuP7g7puRFr5geCJpi6II9YFBeQrWXYN": [0.0078, 0.1406, 0.9828, 0.8281, 1.0],
  "1U4OS9WR37dE3rBLZf4oVBpmOZVkPsKfE": [0.0, 0.0375, 0.95, 0.9625, 1.0],
  "1vGDZvd5HVIcMuRvmWRySHZrby1u_otDV": [0.0063, 0.0906, 0.9656, 0.8797, 1.0],
  "1vSGLidkOCS4jkjbBrUYbJETo3wkGd3yD": [0.0047, 0.0609, 0.9844, 0.9094, 1.0],
  "1wj98nVodWV6j-5pPdrP4YVQUEJsO072j": [0.0, 0.1016, 1.0, 0.8984, 1.0],
  "1wQzpWPNZKnty7DIiEkrSyib145QIWy4K": [0.0109, 0.0109, 0.9859, 0.9219, 1.0],
  "1xBrE8SUvCt4P9jwrrVv-Ok1dA0AaXCf4": [0.0047, 0.0203, 0.9891, 0.9766, 1.0],
  "1Xe4pfpOYsRBZqnZtZpXnydZiOm-ijzn9": [0.225, 0.0172, 0.675, 0.9641, 1.0],
  "1xsgHUd1SDC049DHL7yLWAIfal8DQvT8Z": [0.1688, 0.0031, 0.7094, 0.9938, 1.0],
  "1XUYZEts8lz9SFqQmKuBd4G8KMRfBmPL-": [0.1016, 0.0016, 0.7953, 0.9969, 1.0],
  "1y17p0D56itwNXWWEzo94jF4ThNETczQg": [0.0391, 0.0016, 0.9203, 0.9984, 1.0],
  "1Y1UY-zSP4LrjEvWXvFKXkhJ0JCTD8LFS": [0.0844, 0.0781, 0.8422, 0.8516, 1.0],
  "1Y8b2L9Y6uZSNFcv9PVLR6aDqKuAdnZE7": [0.0141, 0.0203, 0.9734, 0.9094, 1.0],
  "1Ypw31n_0wRri-oEhRpqAB3p6jZFtN7BN": [0.0656, 0.0234, 0.8047, 0.9484, 1.0],
  "1yzAcYk81VKiWiONNJnyLvTTjIv5VgpDO": [0.0266, 0.0141, 0.9703, 0.975, 1.0],
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
