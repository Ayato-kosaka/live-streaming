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

/*
 * ## 歩いているときの絵（ぱらぱら漫画）
 *
 * 初めて歩くまでは上の1枚。歩き出したら、**3段×4コマ**を並べた1枚（シート）を
 * 窓1コマぶんずつずらして見せる（`components/isle/AyatoSprite.tsx`）。
 * 段が向き（横・正面・背中）、段の中の4コマが歩く足の運び。
 *
 * **シートの寸法も、ここにしか書かない。** 突き合わせは止まった絵と同じ
 * `site/selftest/ayatoart_selftest.mjs`（シートの横 = `AYATO_WALK_FW × AYATO_WALK_FRAMES`、
 * 縦 = `AYATO_WALK_FH × AYATO_WALK_ROWS`）。
 *
 * コマの約束（描く側と合わせてある。#895）:
 *  - 全コマ同じ寸法の枠。**足の下端は枠の下端にそろえる**（止まった絵と同じ行に立つ）
 *  - 横の段は左を向いている（止まった絵と同じ。右へは外側の `<g>` が反転する）。
 *    正面・背中の段は反転しない
 *  - 体の上下の弾みは絵に描かない（描かれていなかった）。部品が `AYATO_WALK_LIFT` ぶん
 *    持ち上げる。歩いているあいだ CSS の `hop`（1枚絵の弾み）は外す
 *  - **止まったら、最後に歩いた向きの段の2コマ目**（`AYATO_WALK_REST`）で立つ
 */

/** シートの道。 */
export const AYATO_WALK_SRC = "/characters/ayato-walk.webp";

/** 1段に並んでいるコマの数。コマ送りの `steps()` もここから組む（`AyatoSprite.tsx`）。 */
export const AYATO_WALK_FRAMES = 4;

/**
 * 段の並び（上から）。**横＝左向き / 正面＝こちら向き（下へ歩く）/ 背中（上へ歩く）。**
 * 島の y は画面の下へ増えるので、y が増える向き（下）へ歩くと正面を見せる。
 */
export const AYATO_WALK_ROW = { side: 0, front: 1, back: 2 } as const;

/** 段の数。シートの縦はコマの高さのこの倍。 */
export const AYATO_WALK_ROWS = 3;

/** 止まったときに出す、段の中のコマ（0 始まり）。立ち姿として描いてもらった1枚。 */
export const AYATO_WALK_REST = 1;

/**
 * コマ1枚の寸法（px）。シートは横にこの4つぶん、縦に3段ぶん（528×576）。
 * 描き直して寸法が変わったら、ここを直す。直し忘れたら selftest が落ちる。
 */
export const AYATO_WALK_FW = 132;
export const AYATO_WALK_FH = 192;

/**
 * コマの中で、**立っているときのあやとの背**（px）。
 *
 * 島は「この背 = 止まった絵の背（`AYATO_H`）」になる倍率でシートを置く。
 * 枠の上に余白を取って描いた絵なら、その余白を除いた背にする
 * （枠の高さをそのまま `AYATO_H` に合わせると、余白ぶん歩き出した瞬間に縮む）。
 * いまのシートは**横の段が4コマとも枠の上端から下端まで**描いてあるので、枠の高さと同じ。
 */
export const AYATO_WALK_BODY_H = 192;

/**
 * 歩いているあいだ、**両足がそろったコマ（2・4コマ目＝index 1 と 3）で体を上げる高さ**
 * （コマの px。島の背に直すのは `AyatoSprite.tsx`）。
 *
 * 描いてもらったシートは、頭の高さが4コマとも同じ（上下の弾みが描かれていない）。
 * それだけだと足だけ動いて体が床を滑って見えるので、コマ送りと同じ時計で
 * 窓ごと少し持ち上げる。**止まっているときは上げない**（立つコマは index 1 だが、
 * 立ったら足は地面）。
 */
export const AYATO_WALK_LIFT = 5;
