import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import { offline } from "./route.mjs";
const PORT = process.env.SPORT || "4351";
const b = await chromium.launch();
for (const [n, dev] of [["wide", { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }], ["tablet", { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2 }]]) {
  const ctx = await b.newContext(dev);
  await offline(ctx);
  const p = await ctx.newPage();
  await p.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "networkidle" });
  await p.waitForTimeout(2000);
  const r = await p.evaluate(() => [...document.querySelectorAll("image, img")].filter(i => /=s\d+/.test(i.getAttribute("src") || i.getAttribute("href") || "")).map(i => Math.round(i.getBoundingClientRect().width)));
  console.log(n, "dpr", dev.deviceScaleFactor, "css px:", r.join(","));
  await ctx.close();
}
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
await offline(ctx); const p = await ctx.newPage();
await p.goto(`http://127.0.0.1:${PORT}/friends`, { waitUntil: "networkidle" });
await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await p.waitForTimeout(1500);
console.log("friends phone dpr3:", await p.evaluate(() => [...document.querySelectorAll("img")].filter(i => /=s\d+/.test(i.src)).map(i => `${Math.round(i.getBoundingClientRect().width)}|${i.src.match(/=s\d+/)[0]}`).slice(0,8).join(",")));
await b.close();
