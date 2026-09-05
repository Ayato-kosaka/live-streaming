/**
 * 地図の名札を、重ならない場所に置く。
 *
 * 点にそのまま名前を添えると、近い街どうしでぶつかって読めなくなる
 * （ゴリスとタテフ、トビリシとボルジョミ）。上下にずらし、それでも
 * 空かなければ点の反対側へ回す。
 *
 * 名札は地図を寄せても大きさが変わらない（HTML で重ねているため）ので、
 * 当たり判定も px で測る。実際の幅は画面で決まるが、ここでは見当で計算する。
 * 少しずれても「重なって読めない」よりはるかにましなので、これでよい。
 */

/** 名札ひとつぶんの四角。重なりを測るためだけに使う。 */
export type Rect = { x0: number; y0: number; x1: number; y1: number };

/** 当たり判定に使う、地図の幅の見当（px）。実寸ではない。 */
export const NOMINAL_W = 620;

export const hits = (a: Rect, b: Rect) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

/** 逃がす順。真横 → 少し上 → 少し下 → もっと上下。 */
const DY = [0, -13, 13, -26, 26, -40, 40, -54, 54, -68, 68];

export type Dot = { id: string; name: string; x: number; y: number };
export type Placed<T> = { c: T; dy: number; left: boolean };

/**
 * 街の名札の位置を決める。
 *
 * @param cities 名前を出したい街。地図の座標のまま渡す
 * @param toPx 地図の座標を、当たり判定用の px に直す
 * @param taken すでに埋まっている場所（ピン、国の名札など）。この配列に足していく
 * @param preferLeft その街の名札を、まず点の左に出したいか
 * @returns 街ごとの上下のずれ（px）と、左右どちら側に出すか
 */
export function placeCities<T extends Dot>(
  cities: T[],
  toPx: (x: number, y: number) => [number, number],
  taken: Rect[],
  preferLeft: (c: T) => boolean,
): Placed<T>[] {
  const out: Placed<T>[] = [];
  // 北から順に置く。上から読む人の目の動きと同じ順に決まる。
  for (const c of [...cities].sort((a, b) => a.y - b.y)) {
    const [x, y] = toPx(c.x, c.y);
    const w = c.name.length * 10.5 + 6;
    const far = preferLeft(c);
    let put: Placed<T> & { box: Rect } | null = null;
    for (const dy of DY) {
      for (const left of [far, !far]) {
        const x0 = left ? x - 12 - w : x + 12;
        const box: Rect = { x0, y0: y - 7 + dy, x1: x0 + w, y1: y + 7 + dy };
        if (!taken.some((t) => hits(t, box))) {
          put = { c, dy, left, box };
          break;
        }
      }
      if (put) break;
    }
    taken.push(put?.box ?? { x0: x + 12, y0: y - 7, x1: x + 12 + w, y1: y + 7 });
    out.push({ c, dy: put?.dy ?? 0, left: put?.left ?? far });
  }
  return out;
}
