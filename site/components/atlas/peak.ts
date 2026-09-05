/**
 * 山の印。
 *
 * まるい点を並べると、山脈が数珠つなぎのビーズに見えてしまう。
 * 地図の山は、小さな三角をたくさん重ねたほうが山脈に見える。
 *
 * 3枚のパスに分けて返す。ぜんぶの山の胴を先に描き、そのあとに
 * 明るい面、いちばん最後に雪の頭を重ねると、重なった山が
 * ひとつづきの尾根に見える。
 */

/**
 * 山ひとつぶんの [x, y, 半径] の並びを、胴・明るい面・雪の3本にまとめる。
 *
 * @param peaks [x, y, 半径] の並び
 * @param z 大きさの掛け率。地図を k 倍に寄せるときは 1/k を渡す。
 *          塗りは線と違って `strokeWidth` で直せないので、形そのものを縮めておく。
 */
export function peakPaths(peaks: number[][], z = 1): { body: string; face: string; cap: string } {
  const body: string[] = [];
  const face: string[] = [];
  const cap: string[] = [];
  // 南（下）にあるものを後から描く。手前の山が奥の山を隠すようにするため。
  for (const [x, y, r0] of [...peaks].sort((a, b) => a[1] - b[1])) {
    const r = r0 * z;
    const w = r * 1.3;
    const h = r * 1.75;
    const b = y + r * 0.45;
    const top = y - h;
    body.push(
      `M${x - w} ${b}L${x - w * 0.3} ${top + h * 0.3}Q${x} ${top} ${x + w * 0.3} ${top + h * 0.3}L${x + w} ${b}Z`,
    );
    face.push(
      `M${x - w} ${b}L${x - w * 0.3} ${top + h * 0.3}Q${x} ${top} ${x} ${top + h * 0.06}L${x} ${b}Z`,
    );
    if (r0 >= 7) {
      const cw = w * 0.36;
      cap.push(
        `M${x - cw} ${top + h * 0.36}L${x - w * 0.11} ${top + h * 0.1}Q${x} ${top} ${x + w * 0.11} ${top + h * 0.1}L${x + cw} ${top + h * 0.36}Q${x + cw * 0.4} ${top + h * 0.22} ${x} ${top + h * 0.34}Q${x - cw * 0.4} ${top + h * 0.46} ${x - cw} ${top + h * 0.36}Z`,
      );
    }
  }
  return { body: body.join(""), face: face.join(""), cap: cap.join("") };
}
