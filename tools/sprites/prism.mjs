/**
 * PRISM Live（あやとの配信アプリ、スマホ）の**縮み方**を、撮る・測るページに入れる共通の部品。
 * 投げ銭アラート（`app/alertbox`）を撮る道具（`alert-*.mjs`）は、全部これを通す。
 *
 *   import { prism, prismNote } from "./prism.mjs";
 *   console.log(prismNote());                  // 何の条件で撮ったかを1行（数に必ず添える）
 *   const ctx = await browser.newContext({ ... });
 *   await prism(ctx);                          // ページを開く前に。--no-prism なら何もしない
 *   await prism(ctx, { scale: 0.36 });         // PRISM 100% の scale（--prism-scale 0.36 でも同じ）
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
 *
 * ## scale は PRISM の % で変わる（2026-11-02。#1078）
 *
 * あやとのスマホで測ると、**PRISM 100% のとき scale は 0.36**、140% のとき 0.5。% に比例する。
 * PRISM の % は「ページを何倍に拡げて見せるか」で、枠の見た目の大きさは変わらない（`nov-ref/prism-100.jpg`
 * と `prism-160.jpg` で、枠は同じ大きさのまま豚だけが 1.6 倍に写っている）。なので
 *
 * - `<html>` の幅（CSS px）は % に反比例する（140% で 436 なら、100% で約 606）
 * - Dimensions の幅（`<html>` の幅 × scale）は % に依らずほぼ一定（約 218）。**豚は CSS px で同じ大きさに描かれ、
 *   それが % 倍に拡げて見える**
 * - `<html>` の幅で大きさを決める部品（ハロウィンの貯金箱）は、% に依らず枠に対して同じ割合に見える。
 *   だから **% を変えると、豚との比が変わる**（100% では 140% のときの 1.4 倍、豚より大きく見える）
 *
 * `--prism-scale 0.36` で scale を選べる（既定は 0.5）。箱の大きさは道具の側で合わせる
 * （`boxAt`。140% の箱 436×776 を、Dimensions の幅が同じになるように拡げる）。
 */

/** PRISM で測った `visualViewport.scale`（140%。今までの既定） */
export const PRISM_SCALE = 0.5;

/** PRISM の % ごとに測った scale（あやとのスマホ。100% は `/alert/perf` の「拡大 0.36」、140% は `/alert/probe`） */
export const PRISM_SCALES = Object.freeze({ 100: 0.36, 140: 0.5 });

/** `--no-prism` が渡されたか（外すのは対照だけ） */
export const prismOff = (argv = process.argv) => argv.includes("--no-prism");

/**
 * `--prism-scale <s>` で選んだ scale（無ければ 0.5）。0 より大きく 1 以下でなければ止める
 * （打ち間違いのまま、別の条件で撮った数を出さない）
 */
export function prismScale(argv = process.argv) {
  const i = argv.indexOf("--prism-scale");
  if (i < 0) return PRISM_SCALE;
  const v = Number(argv[i + 1]);
  if (!(v > 0 && v <= 1)) {
    console.error(`--prism-scale は 0 より大きく 1 以下の数で（${argv[i + 1]}）`);
    process.exit(2);
  }
  return v;
}

/**
 * scale `s` のときの箱の大きさ。`[w, h]` は scale 0.5（PRISM 140%）のときの箱で、
 * **Dimensions の幅（箱の幅 × scale）が同じになるように**拡げる（枠の見た目の大きさは % で変わらないので）。
 * 例: 436×776 → scale 0.36 で 606×1078
 */
export function boxAt(s, [w, h]) {
  const k = PRISM_SCALE / s;
  return [Math.round(w * k), Math.round(h * k)];
}

/**
 * 撮る context（か page）に、PRISM の縮み方を入れる。**ページを開く前に呼ぶ。**
 * @param {import("playwright-core").BrowserContext | import("playwright-core").Page} target
 * @param {{ off?: boolean }} [o]
 * @returns {Promise<number>} 入れた scale（外したなら 1）
 */
export async function prism(target, { off = prismOff(), scale = prismScale() } = {}) {
  if (off) return 1;
  await target.addInitScript((s) => {
    const VV = globalThis.VisualViewport;
    if (!VV) return;
    Object.defineProperty(VV.prototype, "scale", { get: () => s, configurable: true });
  }, scale);
  return scale;
}

/** scale から PRISM の何%か（測った2点を通る比例。表に無い値は「約」） */
const zoomOf = (s) => {
  const hit = Object.entries(PRISM_SCALES).find(([, v]) => v === s);
  return hit ? `${hit[0]}%` : `約${Math.round((s / PRISM_SCALES[100]) * 100)}%`;
};

/** 何の条件で撮ったかの1行。**数を出すときは必ず添える**（#311 の決めごと3） */
export function prismNote(off = prismOff(), scale = prismScale()) {
  return off
    ? "PRISM の縮み方: 外した（--no-prism。visualViewport.scale = 1。豚が PRISM の2倍に写る。対照の数で、これで判断しない）"
    : `PRISM の縮み方: 入れた（visualViewport.scale = ${scale}＝PRISM ${zoomOf(scale)}。豚は本物の配信と同じ大きさ。外すのは --no-prism）`;
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
