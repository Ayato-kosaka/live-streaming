/**
 * 地面の飾り（森・砂丘・海のきらめき）を、少ないパスで描くための道具。
 *
 * 1000個を `<circle>` で並べると DOM が重いうえ、地図を寄せたときに
 * 大きさを直せない。長さゼロの線を丸い端で描くと「点」になるので、
 * 太さ（＝半径×2）だけで大きさを変えられる。
 */

/**
 * [x, y, 半径] の並びを、半径ごとにまとめて数本のパスにする。
 *
 * @param dots 点の並び
 * @param levels いくつの太さに分けるか。多いほど本物に近いが、パスが増える
 * @returns [その束の半径, パス] の並び
 */
export function bucket(dots: number[][], levels: number): [number, string][] {
  if (!dots.length) return [];
  const rs = dots.map((d) => d[2]);
  const lo = Math.min(...rs);
  const hi = Math.max(...rs);
  const out: [number, string[]][] = [];
  for (let i = 0; i < levels; i += 1) {
    out.push([lo + ((hi - lo) * (i + 0.5)) / levels, []]);
  }
  for (const [x, y, r] of dots) {
    const i = hi === lo ? 0 : Math.min(levels - 1, Math.floor(((r - lo) / (hi - lo)) * levels));
    out[i][1].push(`M${x} ${y}l0 0`);
  }
  return out.filter((b) => b[1].length).map((b) => [b[0], b[1].join("")] as [number, string]);
}
