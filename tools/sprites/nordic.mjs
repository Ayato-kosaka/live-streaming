import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--no-sandbox"]});
const ctx = await b.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await ctx.route(/upload\.wikimedia\.org/, r => r.fulfill({ path: "/home/user/live-streaming/site/public/og.png" }));
const p = await ctx.newPage();
p.on("pageerror", e => console.log("[pageerror]", String(e).slice(0,300)));
for (const [url, name, scroll] of [["/nordic","n-top",0],["/nordic","n-route",1300],["/nordic","n-countries",2900],["/nordic/poland","n-poland",900],["/nordic/guide","n-guide",600]]) {
  await p.goto("http://localhost:3000"+url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await p.waitForTimeout(2200);
  if (scroll) { await p.evaluate(y => window.scrollTo(0,y), scroll); await p.waitForTimeout(500); }
  await p.screenshot({ path: `/tmp/shots/${name}.png` });
}
console.log("ok");
await b.close();
