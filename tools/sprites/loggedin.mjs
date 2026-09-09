/**
 * ログインした人の面を、**畳みを全部開いてから**測る。
 *
 *   SPORT=4141 node tools/sprites/loggedin.mjs          # ふつうの人
 *   SPORT=4141 ADMIN=1 node tools/sprites/loggedin.mjs  # あやと
 *
 * 巡回（`crawl.mjs`）はログインしていないので、じぶんのこと（`/me`）も
 * カードも掲示板も**中身が出ないまま通ってしまう。** 差し込み（`asme.mjs`）を
 * かぶせて、実際に人が見る形で測る。
 *
 * ## 「あと◯出す」を押し切ってから測る
 *
 * `components/ui/Longer.tsx` は最初の数枚しか出さない。畳んだまま測ると
 * 「短くなった」しか見えず、**溜まったときに横があふれるかどうかが分からない。**
 * 押せるあいだ押してから測る。
 *
 * 高さは下まで送ってから読む。`content-visibility: auto` の畳みは画面の外に
 * いるあいだ 68px と答えるので、送らずに読むと本当の高さにならない
 * （CLAUDE.md「面の高さを、畳んだまま測らない」）。
 */
import { chromium } from "playwright-core";
import { apply } from "./asme.mjs";

const PORT = process.env.SPORT || 4141;
const admin = process.env.ADMIN === "1";
const PAGES = (process.env.PAGES || "/me,/cards,/board,/next,/nordic/photos").split(",");

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await apply(ctx, { admin });
const p = await ctx.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(String(e)));

let bad = 0;
for (const path of PAGES) {
  errs.length = 0;
  await p.goto(`http://localhost:${PORT}${path}.html`, { waitUntil: "networkidle" });
  for (let i = 0; i < 40; i++) {
    const more = await p.$(".longer button:not([hidden])");
    if (!more) break;
    if (/たたむ/.test(await more.innerText().catch(() => "たたむ"))) break;
    await more.click().catch(() => {});
    await p.waitForTimeout(120);
  }
  let h = 0;
  for (let i = 0; i < 60; i++) {
    await p.evaluate(() => window.scrollBy(0, 2000));
    await p.waitForTimeout(60);
    const n = await p.evaluate(() => document.documentElement.scrollHeight);
    if (n === h) break;
    h = n;
  }
  const o = await p.evaluate(() => {
    const d = document.documentElement;
    return { w: d.scrollWidth, cw: d.clientWidth, over: d.scrollWidth > d.clientWidth + 1 };
  });
  if (o.over || errs.length) bad++;
  console.log(
    `${admin ? "あやと" : "ふつう"} ${path.padEnd(16)} 高さ=${String(h).padStart(6)}px ` +
      `横=${o.w}/${o.cw} あふれ=${o.over} JSエラー=${errs.length}`,
  );
  if (errs.length) console.log("   " + errs.slice(0, 2).join(" | "));
}
await b.close();
console.log(bad ? `だめな面 ${bad}` : "あふれ・JSエラーなし");
