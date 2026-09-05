import { chromium } from "playwright-core";
const PORT = process.env.PORT || "3015";
const TAG = process.env.TAG || "a";
const SHOTS = JSON.parse(process.env.SHOTS || '[["/nordic","top",0],["/nordic","legs",1500],["/nordic/finland","fi",0]]');
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await ctx.route(/upload\.wikimedia\.org/, r => r.fulfill({ path: "/home/user/live-streaming/site/public/og.png" }));
await ctx.route(/lh3\.googleusercontent\.com/, r => r.fulfill({ path: "/home/user/live-streaming/site/public/og.png" }));
const p = await ctx.newPage();
p.on("pageerror", e => console.log("[pageerror]", String(e).slice(0, 240)));
for (const [url, name, scroll, open] of SHOTS) {
  await p.goto(`http://localhost:${PORT}${url}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await p.waitForTimeout(2400);
  if (open) await p.evaluate((sel) => { document.querySelectorAll(sel).forEach(d => d.open = true); }, open);
  if (scroll) { await p.evaluate(y => window.scrollTo(0, y), scroll); await p.waitForTimeout(600); }
  await p.screenshot({ path: `/tmp/n2/${TAG}-${name}.png` });
  console.log("shot", name);
}
await b.close();
