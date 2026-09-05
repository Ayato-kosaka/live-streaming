import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
await ctx.route(/upload\.wikimedia\.org/, r => r.fulfill({ path: "/home/user/live-streaming/site/public/og.png" }));
const p = await ctx.newPage();
p.on("pageerror", e => console.log("[pageerror]", String(e).slice(0, 200)));
for (const [url, name, y] of [["/nordic", "pc-top", 0], ["/nordic", "pc-map", 700]]) {
  await p.goto("http://localhost:3015" + url, { waitUntil: "domcontentloaded", timeout: 90000 });
  await p.waitForTimeout(2400);
  if (y) { await p.evaluate(v => window.scrollTo(0, v), y); await p.waitForTimeout(400); }
  await p.screenshot({ path: `/tmp/n2/${name}.png` });
}
console.log("横あふれ", await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth));
await b.close();
