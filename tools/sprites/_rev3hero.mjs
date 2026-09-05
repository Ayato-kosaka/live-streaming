import { chromium } from "playwright-core";
import { offline } from "./route.mjs";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
await offline(ctx);
const p = await ctx.newPage();
for (const path of ["/kitchen/egg-sandwich", "/legends/iran-walk", "/streams/cooking"]) {
  await p.goto("http://localhost:3041" + path, { waitUntil: "domcontentloaded", timeout: 120000 });
  await p.waitForTimeout(2500);
  console.log(path, JSON.stringify(await p.evaluate(() => {
    const sheet = document.querySelector(".zk-sheet, .zk, .panel.paper");
    const hero = document.querySelector(".zk-hero img, .zk-hero svg, .zk-hero-art, .dish-art, .zk-hero picture, .zk-hero-img, .lg-hero img, figure img");
    const b1 = sheet?.getBoundingClientRect(), b2 = hero?.getBoundingClientRect();
    const ih = document.querySelector(".ih")?.getBoundingClientRect();
    return {
      sheet: b1 && { w: Math.round(b1.width), h: Math.round(b1.height) },
      hero: b2 && { w: Math.round(b2.width), h: Math.round(b2.height), cls: hero.className.toString().slice(0, 30), tag: hero.tagName },
      pct: b1 && b2 ? +(b2.height / b1.height * 100).toFixed(1) : null,
      pctVp: b2 ? +(b2.height / 720 * 100).toFixed(1) : null,
      header: ih ? Math.round(ih.height) : null,
      radius: sheet ? getComputedStyle(sheet).borderRadius : null,
      shadow: sheet ? getComputedStyle(sheet).boxShadow.slice(0, 50) : null,
    };
  })));
}
await b.close();
