/**
 * 島を止めてから測るための差し込み（`inkpx.mjs` などの `SEED` に渡す）。
 *
 * 島は rAF で動く。CSS の animation を止めるだけでは足りず、2枚のあいだに
 * 住人が歩きカメラが寄ると、差分に字と関係ない画素が混ざる（`CLAUDE.md`）。
 *
 * `DAY` を渡すと時計も止める。表紙は日付で入れ替わる（`components/isle/Cover.tsx`）
 * ので、**出発後の島は日付を進めないと出てこない。**
 *
 *   SEED=./freeze.mjs node inkpx.mjs
 *   DAY=2026-09-13T12:00:00+09:00 SEED=./freeze.mjs node inkpx.mjs
 */
export async function apply(ctx) {
  const day = process.env.DAY;
  await ctx.addInitScript(`(() => {
    ${day ? `
    const F = ${Date.parse(day)}, R = Date, s = R.now();
    class D extends R {
      constructor(...a) { if (a.length === 0) super(F + (R.now() - s)); else super(...a); }
      static now() { return F + (R.now() - s); }
      static parse(...a) { return R.parse(...a); }
      static UTC(...a) { return R.UTC(...a); }
    }
    Object.defineProperty(D, "name", { value: "Date" });
    globalThis.Date = D;` : ""}
    window.requestAnimationFrame = () => 0;
  })();`);
}
