// 折りたたみの「開いた状態」を撮るための一時スクリプト（コミットしない）
import { chromium } from "playwright-core";
const PORT = process.env.PORT || "3000";
const [url, out, w, h, scroll, nopen] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--no-sandbox"]});
const ctx = await b.newContext({ viewport: { width: +(w||390), height: +(h||900) }, deviceScaleFactor: 2, isMobile: (+(w||390))<640 });
await ctx.route(/googleusercontent\.com/, r => r.fulfill({ path: "/home/user/live-streaming/site/public/characters/ayato.webp" }));
await ctx.route(/upload\.wikimedia\.org/, r => r.fulfill({ path: "/home/user/live-streaming/site/public/og.png" }));
const p = await ctx.newPage();
p.on("pageerror", e => console.log("[pageerror]", String(e).slice(0,300)));
await p.addInitScript(() => localStorage.setItem("ayato-island-arrived", "1"));
await p.goto(`http://localhost:${PORT}` + url, { waitUntil: "domcontentloaded", timeout: 60000 });
await p.waitForTimeout(2200);
const n = +(nopen||2);
await p.evaluate((n) => {
  const ds = [...document.querySelectorAll("details.fold")];
  ds.slice(0, n).forEach(d => d.open = true);
}, n);
await p.waitForTimeout(900);
if (scroll) { await p.evaluate(y => window.scrollTo(0, y), +scroll); await p.waitForTimeout(700); }
const ov = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
console.log("横あふれ:", ov);
await p.screenshot({ path: out });
await b.close();
