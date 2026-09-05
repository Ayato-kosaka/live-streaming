import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
await p.goto("http://localhost:3015/nordic", { waitUntil: "domcontentloaded", timeout: 90000 });
await p.waitForTimeout(2500);
console.log(await p.evaluate(() => {
  const bs = [...document.querySelectorAll(".bpost")];
  return JSON.stringify(bs.slice(0,2).map(x => ({ t: x.textContent, dis: x.disabled, c: getComputedStyle(x).color, op: getComputedStyle(x).opacity })));
}));
await b.close();
