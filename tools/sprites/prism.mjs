/**
 * PRISM Live（あやとの配信アプリ、スマホ）の**縮み方**を、撮る・測るページに入れる共通の部品。
 * 投げ銭アラート（`app/alertbox`）を撮る道具（`alert-*.mjs`）は、全部これを通す。
 *
 *   import { prism, prismNote } from "./prism.mjs";
 *   console.log(prismNote());                  // 何の条件で撮ったかを1行（数に必ず添える）
 *   const ctx = await browser.newContext({ ... });
 *   await prism(ctx);                          // ページを開く前に。--no-prism なら何もしない
 *
 * ## なぜ要るか（2026-11-02。#1078 / `docs/island-misses.md` #311）
 *
 * PRISM のウィジェットでは `visualViewport.scale` が **0.5**。react-native-web の `Dimensions`
 * （`useWindowDimensions` も同じ）は幅・高さを `visualViewport.width × scale` で出すので、
 * PRISM では**ページの半分**を返す。アラートの中で、どの物差しを使うかが部品ごとに違う:
 *
 * | 部品 | 物差し | PRISM では |
 * | --- | --- | --- |
 * | 豚（`PiggyGauge` / `ThemedGauge`） | `useStableWindow`（Dimensions） | **半分に描かれる** |
 * | 季節の貯金箱（`KuroBank`）・段の演出・字・キャラ絵 | `useBoxSize`（`<html>` の clientWidth） | 縮まない |
 * | 絵文字の雨（`components.tsx` の `RainEffect`） | `Dimensions.get("window").height` | 落ちる先が半分の高さ |
 *
 * ふつうの Chromium では scale は 1 なので、入れずに撮ると**豚だけが PRISM の2倍に写る**
 * （箱 436×776 で、豚の幅が 41% のはずが 82%）。2026-11-02 にそれで「ハロウィンの貯金箱は
 * 豚より小さい」と報告した。実際は面積で豚の約4.6倍あった。
 *
 * ## 何をするか
 *
 * `VisualViewport.prototype.scale` を 0.5 を返すものに差し替える。
 *
 * - **init script で入れる。** Dimensions は読み込みの最初に1回読まれ、あとは resize の知らせ
 *   でしか読み直さない。ページを開いてから入れても豚は縮まない
 * - **context に入れる。** iframe の中にも効く（init script は frame ごとに走る。
 *   `alert-record.mjs` はアラートを舞台の iframe に入れて録る）
 * - 幅・高さ（`visualViewport.width` / `height`）は触らない。管理側が実機の条件として
 *   確かめたのは「scale が 0.5」だけなので、それだけを写す
 *
 * ## 外すとき
 *
 * `--no-prism` を渡すと何もしない（scale は 1 のまま）。**外した数は対照で、それで判断しない。**
 * 「この道具なしで測ると豚が2倍に写る」を見せるためだけに使う。
 */

/** PRISM で測った `visualViewport.scale` */
export const PRISM_SCALE = 0.5;

/** `--no-prism` が渡されたか（外すのは対照だけ） */
export const prismOff = (argv = process.argv) => argv.includes("--no-prism");

/**
 * 撮る context（か page）に、PRISM の縮み方を入れる。**ページを開く前に呼ぶ。**
 * @param {import("playwright-core").BrowserContext | import("playwright-core").Page} target
 * @param {{ off?: boolean }} [o]
 * @returns {Promise<number>} 入れた scale（外したなら 1）
 */
export async function prism(target, { off = prismOff() } = {}) {
  if (off) return 1;
  await target.addInitScript((s) => {
    const VV = globalThis.VisualViewport;
    if (!VV) return;
    Object.defineProperty(VV.prototype, "scale", { get: () => s, configurable: true });
  }, PRISM_SCALE);
  return PRISM_SCALE;
}

/** 何の条件で撮ったかの1行。**数を出すときは必ず添える**（#311 の決めごと3） */
export function prismNote(off = prismOff()) {
  return off
    ? "PRISM の縮み方: 外した（--no-prism。visualViewport.scale = 1。豚が PRISM の2倍に写る。対照の数で、これで判断しない）"
    : `PRISM の縮み方: 入れた（visualViewport.scale = ${PRISM_SCALE}。豚は本物の配信と同じ大きさ。外すのは --no-prism）`;
}

/**
 * 開いたページで、本当に効いているかを読む（Dimensions が返している幅と、`<html>` の幅）。
 * `prism()` を呼び忘れた・開いたあとに呼んだ、を見分けるため。
 * @returns {Promise<{ scale: number|null, dimW: number|null, boxW: number }>}
 */
export async function prismProbe(page) {
  return page.evaluate(() => {
    const vv = window.visualViewport;
    return {
      scale: vv ? vv.scale : null,
      dimW: vv ? Math.round(vv.width * vv.scale) : null,
      boxW: document.documentElement.clientWidth,
    };
  });
}
