import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
await p.goto("http://localhost:3015/nordic", { waitUntil: "domcontentloaded", timeout: 90000 });
await p.waitForTimeout(2500);
await p.evaluate(() => { document.querySelectorAll(".rlegs details").forEach(d => d.open = true); });
await p.waitForTimeout(400);
console.log(await p.evaluate(() => {
  const t = document.querySelector(".rleg-when");
  const h = t.closest("h3");
  const cs = getComputedStyle(t), ch = getComputedStyle(h);
  return JSON.stringify({ time: { bg: cs.backgroundColor, td: cs.textDecoration }, h3: { bg: ch.backgroundColor, td: ch.textDecoration, disp: ch.display } });
}));
await b.close();
