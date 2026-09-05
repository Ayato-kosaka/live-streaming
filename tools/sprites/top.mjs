import { chromium } from "playwright-core";

/** 並列で作業するとき、エージェントごとに別のポートを使う。既定は 3000。 */
const PORT = process.env.PORT || "3000";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--no-sandbox"]});
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await ctx.route(/googleusercontent\.com/, r => r.fulfill({ path: "/home/user/live-streaming/site/public/characters/ayato.webp" }));
const p = await ctx.newPage();
p.on("pageerror", e => console.log("[pageerror]", String(e).slice(0,300)));
await p.addInitScript(() => localStorage.setItem("ayato-island-arrived", "1"));
await p.goto(`http://localhost:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
await p.waitForTimeout(3500);
await p.evaluate(() => document.querySelector(".nextup")?.scrollIntoView());
await p.waitForTimeout(600);
await p.screenshot({ path: "/tmp/shots/top1.png" });
await p.evaluate(() => window.scrollBy(0, 900));
await p.waitForTimeout(500);
await p.screenshot({ path: "/tmp/shots/top2.png" });
console.log(await p.$$eval(".page h2", n => n.map(x=>x.textContent)));
await b.close();
