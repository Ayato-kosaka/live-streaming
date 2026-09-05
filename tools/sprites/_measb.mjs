import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import { offline } from "./route.mjs";
const PORT = process.env.SPORT || "4351";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
await offline(ctx);
const p = await ctx.newPage();
for (const path of ["/", "/friends"]) {
  await p.goto(`http://127.0.0.1:${PORT}${path}`, { waitUntil: "networkidle" });
  await p.waitForTimeout(2000);
  const r = await p.evaluate(() => {
    const out = [];
    for (const i of document.querySelectorAll("img, image")) {
      const src = i.getAttribute("src") || i.getAttribute("href") || i.getAttribute("xlink:href") || "";
      const b = i.getBoundingClientRect();
      out.push(`${src.slice(-30)} ${Math.round(b.width)}x${Math.round(b.height)}`);
    }
    return out;
  });
  console.log("==", path, r.length);
  console.log(r.slice(0, 40).join("\n"));
}
await b.close();
