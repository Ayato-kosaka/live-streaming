import { chromium } from "playwright-core";
/** 地図だけを大きく撮る。形を本物と見比べるための道具。 */
const PORT = process.env.PORT || "3022";
const [url, out, w, sel] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--no-sandbox"]});
const ctx = await b.newContext({ viewport: { width: +(w||1100), height: 1200 }, deviceScaleFactor: 2 });
await ctx.route(/googleusercontent\.com/, r => r.fulfill({ path: "/home/user/live-streaming/site/public/characters/ayato.png" }));
await ctx.route(/upload\.wikimedia\.org/, r => r.fulfill({ path: "/home/user/live-streaming/site/public/og.png" }));
const p = await ctx.newPage();
p.on("pageerror", e => console.log("[pageerror]", String(e).slice(0,300)));
await p.addInitScript(() => localStorage.setItem("ayato-island-arrived", "1"));
await p.goto(`http://localhost:${PORT}` + url, { waitUntil: "domcontentloaded", timeout: 60000 });
await p.waitForTimeout(2200);
const el = await p.$(sel || ".amap");
if (!el) { console.log("no element", sel); process.exit(1); }
await el.screenshot({ path: out });
await b.close();
