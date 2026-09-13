/**
 * 空の時刻と景色を決め打ちして、島を止める（`inkpx.mjs` などの `SEED` に渡す）。
 *
 *   TIME=day THEME=nordic SEED=./skyset.mjs node inkpx.mjs
 *
 * **字の濃さは、時刻で変わる。** 海の色は `[data-time]` で持ち替えていて
 * （`app/css/tokens.css`）、朝と昼と夜で明るさが 2.4 倍ちがう。
 * 箱の時計は UTC なので、何も言わずに測ると**いつも夜の海**で測ることになり、
 * 昼に見ている人の画面が測れない。
 *
 * `layout.tsx` の頭のスクリプトが時計から `data-time` を入れ、そのあと
 * `IslandTheme` が `data-theme` を本物の値で上書きする。どちらもあとから
 * 書き替わるので、**見張って入れ直す**。1回入れて終わりにすると、
 * 画面が出たあとに元へ戻る。
 *
 * `freeze.mjs` と同じく rAF も止める。2枚のあいだに地図が動くと、
 * 差分に字と関係ない画素が混ざる（`CLAUDE.md`）。
 */
export async function apply(ctx) {
  const time = process.env.TIME || "day";
  const theme = process.env.THEME || "";
  await ctx.addInitScript(`(() => {
    window.requestAnimationFrame = () => 0;
    const time = ${JSON.stringify(time)}, theme = ${JSON.stringify(theme)};
    const put = () => {
      const d = document.documentElement;
      if (!d) return;
      if (d.dataset.time !== time) d.dataset.time = time;
      if (theme) { if (d.dataset.theme !== theme) d.dataset.theme = theme; }
      else if (d.dataset.theme) delete d.dataset.theme;
    };
    // 差し込みは <html> が出来る前に走る。出来るまで待ってから見張りを付ける。
    const start = () => {
      if (!document.documentElement) return void setTimeout(start, 0);
      put();
      new MutationObserver(put).observe(document.documentElement, { attributes: true });
    };
    start();
    document.addEventListener("DOMContentLoaded", put);
  })();`);
}
