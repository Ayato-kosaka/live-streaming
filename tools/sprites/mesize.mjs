/**
 * じぶんのこと（/me）の縦の長さを測る。
 *
 *   SPORT=4501 node tools/sprites/mesize.mjs
 *
 * **既定の状態と、ぜんぶ開いた状態の両方を出す。** 畳んでいる面は
 * 「開かなければ短い」ので、畳んだ数字だけでは溜まったときに壊れるかが
 * 分からない。付箋の枚数は `NOTES=` で差し替える（0 / 3 / 40 / 200）。
 *
 * 高さは必ず下まで送ってから読む。`content-visibility: auto` の畳みは
 * 画面の外にいるあいだ 68px と答える（CLAUDE.md）。
 */
import { chromium } from "playwright-core";
import { apply } from "./asme.mjs";
import { offline } from "./route.mjs";

const PORT = process.env.SPORT || 4501;
const PATHS = (process.env.PAGES || "/me").split(",");
const WIDTH = Number(process.env.W || 390);

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});

const bottom = async (p) => {
  let h = 0;
  for (let i = 0; i < 80; i++) {
    await p.evaluate(() => window.scrollBy(0, 2000));
    await p.waitForTimeout(50);
    const n = await p.evaluate(() => document.documentElement.scrollHeight);
    if (n === h) break;
    h = n;
  }
  return h;
};

for (const admin of [true, false]) {
  for (const path of PATHS) {
    const ctx = await b.newContext({ viewport: { width: WIDTH, height: 844 }, deviceScaleFactor: 2 });
    await apply(ctx, { admin });
    await offline(ctx).catch(() => {});
    const p = await ctx.newPage();
    const errs = [];
    p.on("pageerror", (e) => errs.push(String(e)));
    await p.goto(`http://localhost:${PORT}${path}.html`, { waitUntil: "networkidle" });
    await p.waitForTimeout(900);
    const plain = await bottom(p);
    // 畳みを全部開き、「あと◯だす」を押し切る
    await p.evaluate(() => document.querySelectorAll("details").forEach((d) => (d.open = true)));
    for (let i = 0; i < 60; i++) {
      const more = await p.$(".longer:not([hidden])");
      if (!more) break;
      if (/たたむ/.test(await more.innerText().catch(() => "たたむ"))) break;
      await more.click().catch(() => {});
      await p.waitForTimeout(100);
    }
    await p.evaluate(() => document.querySelectorAll("details").forEach((d) => (d.open = true)));
    const open = await bottom(p);
    const o = await p.evaluate(() => {
      const d = document.documentElement;
      return { w: d.scrollWidth, cw: d.clientWidth };
    });
    console.log(
      `${admin ? "あやと" : "ふつう"} ${path.padEnd(12)} 既定=${String(plain).padStart(6)}px ` +
        `全開=${String(open).padStart(6)}px 横=${o.w}/${o.cw} JSエラー=${errs.length}`,
    );
    if (errs.length) console.log("  " + errs.slice(0, 2).join(" | "));
    await ctx.close();
  }
}
await b.close();
