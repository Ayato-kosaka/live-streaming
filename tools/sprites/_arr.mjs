import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 390, height: 700 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
await p.goto("http://localhost:3015/nordic", { waitUntil: "domcontentloaded", timeout: 90000 });
await p.waitForTimeout(2500);
await p.evaluate(() => document.querySelector(".rlegs").scrollIntoView({ block: "start" }));
await p.waitForTimeout(600);
console.log(await p.evaluate(() => {
  const i = document.querySelector(".rleg-arrow");
  const cs = getComputedStyle(i);
  return JSON.stringify({ t: i.textContent, color: cs.color, fs: cs.fontSize, r: i.getBoundingClientRect().width });
}));
await p.screenshot({ path: "/tmp/n2/legs2.png" });
await b.close();
