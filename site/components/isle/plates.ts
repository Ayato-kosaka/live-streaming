/**
 * 引き（島ぜんぶ）の札を、**建物のそばに置く**ための決めごと。
 *
 * 手で作った島（`components/island/IslandStage.tsx`）と章の島
 * （`components/isle/IsleStage.tsx`）が、同じ逃がし方を別々に持っていた。
 * 直すなら両方（`docs/island-misses.md` 決めごと5）なので、判断はここに1つ置く。
 *
 * ## なぜ要るか
 *
 * 逃がし方が「上下へずらす」だけだったので、混んでいる島では札が
 * **建物から離れたところまで運ばれていた。** 実測（390px・引き・章の島）:
 *
 *     企画をだす 49px / これから 49px / アプリ 49px / となりの島へ 49px / 配信 61px
 *     歩いた国  148px（建物のはるか上、木の上）
 *     あやとのこと 249px（島から外れた海の上。差し棒は何も指していない）
 *
 * `docs/island-design.md` 3-1 は「押す場所は物そのもの。ヒットエリアが絵から
 * ずれていると、人は壊れていると感じる」と決めている。**海に浮いた札は、
 * 名前が読めても行き先を指していない。**
 *
 * ## 決めたこと
 *
 * 1. ふさがっていたら、**まず建物のまわりを回る**（上・下・右・左）。
 *    上下へ運ぶのは、まわりが全部ふさがっていたときだけ
 * 2. それでも建物から `MAX_LEAD` より遠くなるなら、**その札は出さない。**
 *    出さないぶん、建物そのものは押せるように戻す（`data-far`）
 */

export type Box = { x: number; y: number; w: number; h: number };

/**
 * 札が建物から離れてよい上限（札の中心 → 建物の足元。px）。
 *
 * 建物の真上に出たときの距離が、引きでは 40〜50px。まわりへ回した札で
 * 70〜100px になる。**そこから先は、指している先が読み取れない。**
 * 実測でいちばん遠かった「あやとのこと」は 220px（島の外の海）だった。
 *
 * ここを 92 まで詰めたら、390px の引きで6枚のうち3枚が消えた。
 * **消すのは最後の手**なので、まわりを回れる場所を増やして（下の `around`）、
 * 上限は「隣の建物1つぶん」に置く。
 */
export const MAX_LEAD = 108;

/** 箱どうしが重なっているか */
export function hits(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** 札の中心から、建物の足元までの距離 */
export function lead(b: Box, fx: number, fy: number): number {
  return Math.hypot(b.x + b.w / 2 - fx, b.y + b.h / 2 - fy);
}

/**
 * 建物のまわりの置き場所を、近い順に返す。
 *
 * `rect` は「建物の真上」（既定の置き場所）。そこがふさがっているときに、
 * 下・右・左の順で試す。**離れるのではなく、回る。**
 *
 * @param rect 既定の置き場所（建物の真上）
 * @param fx,fy 建物の足元
 * @param artW 建物の絵の幅（px）
 * @param mh   建物の絵の高さ（px。札はこの上に出ている）
 */
export function around(rect: Box, fx: number, fy: number, artW: number, mh: number): Box[] {
  /* 建物の当たりは指で押せる最小（48px）まで広げてあるので、絵が小さくても
     **半分（24px）は必ず空ける。** 空けないと、横へ回した札の上に隣の建物の
     見えない当たりが乗って、札が 40x26px まで削られる（実測） */
  const gapX = Math.max(artW / 2, 24) + 10;
  const midY = fy - mh / 2 - rect.h / 2;
  const below = fy + 10;
  // 斜めにずらす量。札半分ぶん。真上・真下が埋まっていても、肩なら空いていることが多い
  const sx = rect.w / 2 + 6;
  return [
    rect,
    // 建物の肩（真上の左右）。いちばん近い逃げ場
    { ...rect, x: rect.x - sx },
    { ...rect, x: rect.x + sx },
    // 建物の下。足元から少し下げる（接地影とかぶらない程度）
    { ...rect, y: below },
    { ...rect, x: rect.x - sx, y: below },
    { ...rect, x: rect.x + sx, y: below },
    // 右と左。建物の胴の高さに合わせる
    { ...rect, x: fx + gapX, y: midY },
    { ...rect, x: fx - gapX - rect.w, y: midY },
  ];
}
