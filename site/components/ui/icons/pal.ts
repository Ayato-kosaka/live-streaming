/**
 * アイコンの色。
 *
 * どうぶつの森の色は「彩度も明度もどちらも高い」（`docs/ac-reference.md`）。
 * 影まで明るい。だから影色は黒を混ぜず、同じ色相のまま暗くしたものを使う。
 * 接地影だけは黒ではなく暖かい灰緑（`sh`）にして、真下ではなく右下へずらす。
 *
 * 1つの絵で 2〜4 色まで。それ以上使うと、小さくしたときに濁って見える。
 */

/** 使える色の名前。増やすときはここに足す。 */
export type ColorKey =
  | "ink" | "sh" | "hl"
  | "w" | "wd" | "cr" | "crd"
  | "wo" | "wod" | "wol"
  | "rd" | "rdd" | "rdl"
  | "pk" | "pkd"
  | "or" | "ord"
  | "yl" | "yld"
  | "gd" | "gdd"
  | "gr" | "grd" | "grl"
  | "tl" | "tld"
  | "bl" | "bld" | "nv"
  | "sk" | "skd"
  | "pu" | "pud"
  | "br" | "brd"
  | "gy" | "gyd"
  | "sn" | "snd"
  | "bk";

export type Pal = Record<ColorKey, string> & {
  /** 単色で描くとき true。接地影とハイライトを省く合図にする。 */
  flat: boolean;
};

export const C: Pal = {
  // 輪郭線は引かない決まりなので、ink は目や取っ手のような「本当に黒いもの」だけに使う
  ink: "#4b4335",
  sh: "#5c6b52",
  hl: "#ffffff",

  w: "#ffffff",
  wd: "#dfe5e9",
  cr: "#fcefd2",
  crd: "#e6cfa2",

  wo: "#d79a5b",
  wod: "#a9703a",
  wol: "#efc793",

  rd: "#f2635a",
  rdd: "#c93f38",
  rdl: "#ff9083",

  pk: "#ff9eb8",
  pkd: "#e4718f",

  or: "#ffa945",
  ord: "#e07d1c",

  yl: "#ffd54f",
  yld: "#e8ab1e",

  gd: "#f7c63e",
  gdd: "#cc9a1e",

  gr: "#6cc85f",
  grd: "#42984a",
  grl: "#a3e389",

  tl: "#4fc8d2",
  tld: "#2c99a5",

  bl: "#5fa0f2",
  bld: "#3a6cc9",
  nv: "#3c4b78",

  sk: "#8cdaf7",
  skd: "#55b7e6",

  pu: "#ac90e4",
  pud: "#7d61b7",

  br: "#8e5b31",
  brd: "#68411f",

  gy: "#cdd2d8",
  gyd: "#98a1aa",

  sn: "#f7cfa8",
  snd: "#dcaa7c",

  bk: "#3b3730",

  flat: false,
};

/**
 * 単色版。文章の中に置く印（矢印など）と、CSS で色を変えている場所で使う。
 * すべて currentColor になるので、重ねた影とハイライトは消える（`flat` で判定する）。
 */
export const INK: Pal = (() => {
  const o = {} as Pal;
  for (const k of Object.keys(C) as ColorKey[]) o[k] = "currentColor";
  o.flat = true;
  return o;
})();
