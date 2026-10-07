/**
 * **「測れなかった」を「合格」と言わないための、ひとつの関門。**
 *
 * 字の濃さを測る道具（`inkpx.mjs`）は、長い面で**何も測らないまま
 * 「割れ 0」を返していた**（2026-10-07）。`content-visibility: auto` の段は
 * 画面の外にいるあいだ描かれないので、面ぜんぶを1枚に撮ると**白と白を
 * 比べる**ことになる。白どうしは「字の画素が足りない」で落ちるので、
 * 測れた字が 0 になり、**割れも 0 になって緑で返る。**
 *
 *   /island/caucasus/streams   拾った字 1,461 / 測れた 0   → 「割れ 0」＝緑
 *
 * `docs/island-standards.md` §13 §15:
 * 「満たしようのない見張りは、いつも通る見張りと同じだけ悪い」
 * 「**0 と 1 と 2 を同じ顔で返さない**」。
 *
 * 撮りかたを直すだけでは足りない。**次に撮りかたが壊れたとき、また緑で返る。**
 * だから、撮りかたとは別に**分母を見る関門**を置く。
 *
 * ## なぜ 1（割れあり）ではなく 2（数えられなかった）なのか
 *
 * 1 にすると「直すものがある」と言うことになるが、直すものは**画面の側に
 * 無い。** 道具の側が数えられていないだけで、人を画面の直しに向かわせると
 * 狼少年になる。0 にすると、測っていないのに緑になる。だから 2。
 *
 * ## 計算を道具の中に書かない理由
 *
 * `inkpx.mjs` はブラウザを起こすので、毎 PR では回せない
 * （`tools/sprites/node_modules` は CI に入らない）。関門の計算をあちらに
 * 書くと、**腐っても誰も気づかない**。ここはブラウザを1行も使わないので、
 * `tools/sprites/inkpx_selftest.mjs` から毎 PR で回せる。
 */

/** 測れた割合の既定の下限。根拠は `inkpx.mjs` の「下限を 0.9 にした根拠」 */
export const FLOOR = 0.9;

/**
 * 1面ぶんの「測れた割合」。**拾っていなければ 0**（1 ではない）。
 *
 * 拾った字が 0 の面は、割合が出ない。そこを 1（ぜんぶ測れた）に倒すと、
 * **何も見ていない面がいちばん良い点を取る**。
 *
 * @param {number} picked 拾った字の数
 * @param {number} measured 測れた字の数
 * @returns {number} 0〜1
 */
export function rate(picked, measured) {
  if (!(picked > 0)) return 0;
  return Math.max(0, Math.min(1, measured / picked));
}

/**
 * 測れた割合の足りない面を並べる。
 *
 * @param {{path: string, picked: number, measured: number}[]} pages
 * @param {number} floor 下限（0 を渡すと素通り。`BREAK=nofloor` 用）
 * @returns {{path: string, picked: number, measured: number, rate: number}[]}
 */
export function thin(pages, floor = FLOOR) {
  if (!(floor > 0)) return [];
  const out = [];
  for (const p of pages) {
    const r = rate(p.picked, p.measured);
    if (r < floor) out.push({ ...p, rate: r });
  }
  return out;
}

/**
 * 終了コードを決める。**0 と 1 と 2 を取り違えないための1か所。**
 *
 * 並び順そのものが決めごと:
 *   1. 開けなかった面がある → 2
 *   2. **測れた割合が足りない → 2**（割れの数より先に見る。
 *      測れていない面の「割れ 0」も「割れ 3」も、どちらも読めない）
 *   3. 1か所も測れていない → 2
 *   4. 割れがある → 1
 *   5. それ以外 → 0
 *
 * @param {{missing?: number, thin?: number, measured: number, bad: number}} a
 * @returns {0|1|2}
 */
export function exitCode({ missing = 0, thin: nThin = 0, measured, bad }) {
  if (missing > 0) return 2;
  if (nThin > 0) return 2;
  if (!(measured > 0)) return 2;
  if (bad > 0) return 1;
  return 0;
}
