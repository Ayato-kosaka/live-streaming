import { chromium, devices } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import { offline } from "./route.mjs";
const PORT = process.env.SPORT || "4351";
const b = await chromium.launch();
for (const [name, dev] of [["phone", { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }], ["wide", { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }]]) {
  const ctx = await b.newContext(dev);
  await offline(ctx);
  const p = await ctx.newPage();
  for (const path of ["/", "/friends"]) {
    await p.goto(`http://127.0.0.1:${PORT}${path}`, { waitUntil: "networkidle" });
    await p.waitForTimeout(1500);
    const r = await p.evaluate(() => {
      const out = [];
      for (const i of document.querySelectorAll("img")) {
        const src = i.getAttribute("src") || "";
        if (!/lh3|characters/.test(src)) continue;
        const b = i.getBoundingClientRect();
        out.push({ src: src.slice(-24), w: Math.round(b.width), h: Math.round(b.height) });
      }
      return out;
    });
    const uniq = {};
    for (const x of r) uniq[`${x.w}x${x.h}`] = (uniq[`${x.w}x${x.h}`] || 0) + 1;
    console.log(name, path, JSON.stringify(uniq));
  }
  await ctx.close();
}
await b.close();
