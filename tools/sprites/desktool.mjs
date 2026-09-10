/**
 * 机（`/me/desk`）を、道具を1つずつ開いて測る。
 *
 *   SPORT=4501 NOTES=200 node tools/sprites/desktool.mjs
 *
 * 開いていない道具は作られないので、**開いてからでないと本当の背は出ない。**
 * 高さは下まで送ってから読む（`content-visibility: auto` の畳みは画面の外に
 * いるあいだ 68px と答える）。
 */
import { chromium } from "playwright-core";
import { apply } from "./asme.mjs";
import { offline } from "./route.mjs";
const PORT = process.env.SPORT || 4501;
const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await apply(ctx, { admin: true });
await offline(ctx).catch(() => {});
const p = await ctx.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(String(e)));
await p.goto(`http://localhost:${PORT}/me/desk.html`, { waitUntil: "networkidle" });
await p.waitForTimeout(900);
const tabs = await p.$$(".mp-tabs.is-4 .mp-tab");
for (let i = 0; i < tabs.length; i++) {
  const label = (await tabs[i].innerText()).replace(/\s+/g, "");
  await tabs[i].click();
  await p.waitForTimeout(1400);
  let h = 0;
  for (let k = 0; k < 60; k++) {
    await p.evaluate(() => window.scrollBy(0, 2000));
    await p.waitForTimeout(50);
    const n = await p.evaluate(() => document.documentElement.scrollHeight);
    if (n === h) break;
    h = n;
  }
  const o = await p.evaluate(() => {
    const d = document.documentElement;
    return { w: d.scrollWidth, cw: d.clientWidth };
  });
  await p.screenshot({ path: `/tmp/claude-0/me/desk-${i}.png`, fullPage: true });
  console.log(`${label.padEnd(6)} 高さ=${String(h).padStart(5)}px 横=${o.w}/${o.cw}`);
  await p.evaluate(() => window.scrollTo(0, 0));
}
console.log(errs.length ? `JSエラー ${errs.length}: ${errs[0]}` : "JSエラーなし");
await b.close();
