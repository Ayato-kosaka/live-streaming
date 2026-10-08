/**
 * 島に立っているあやとの絵、1枚ぶんの寸法。
 *
 * **数は、ここにしか書かない。** 島（`components/isle/IsleStage.tsx`）も、
 * トップの島（`components/island/IslandStage.tsx`）も、ステッカーの欄
 * （`content/goods.ts`）も、ここを読む。
 *
 * ## なぜ1か所に集めたか
 *
 * 2026-10-08 に絵を描き直したとき、**縦横比が 0.856 から 0.691 へ変わった。**
 * そのとき島の2枚は `AYATO_H * 0.86`（＝ 273/319）を**それぞれ別に**
 * 持っていて、ステッカーの欄も `w: 273, h: 319` を持っていた。
 * 3か所とも手で直さないと、あやとが横に伸びたまま島を歩く。
 *
 * **絵とこの数がずれていないかは `site/selftest/ayatoart_selftest.mjs` が見る**
 * （`site/public/characters/ayato.webp` を実際に開いて、縦横比を突き合わせる）。
 * 絵を焼き直すのは `tools/characters/charbake.py`。
 *
 * ## 比がそのまま絵の比でよい理由
 *
 * 焼くときに**透明なふちを落として、中身で切っている**ので、
 * ファイルの縦横比＝絵の中の人の縦横比になっている。余白を当て込む
 * 下駄が要らないのはそのため。
 */

/** 配っている絵の道。 */
export const AYATO_SRC = "/characters/ayato.webp";

/** 配っている絵の寸法（px）。`tools/characters/charbake.py` が焼いた実寸。 */
export const AYATO_W = 442;
export const AYATO_H_PX = 640;

/**
 * 縦横比（横 ÷ 縦）。
 *
 * 島は背（`AYATO_H`）で大きさを決めるので、横幅はこれを掛けて出す。
 * 横に置く半分（中央寄せ）は `AYATO_ASPECT / 2`。
 */
export const AYATO_ASPECT = AYATO_W / AYATO_H_PX;
