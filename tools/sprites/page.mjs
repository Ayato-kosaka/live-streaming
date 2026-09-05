import { chromium } from "playwright-core";

/** 並列で作業するとき、エージェントごとに別のポートを使う。既定は 3000。 */
const PORT = process.env.PORT || "3000";
const [url, out, w, h, scroll] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--no-sandbox"]});
const ctx = await b.newContext({ viewport: { width: +(w||390), height: +(h||900) }, deviceScaleFactor: 2, isMobile: (+(w||390))<640 });
await ctx.route(/googleusercontent\.com/, r => r.fulfill({ path: "/home/user/live-streaming/site/public/characters/ayato.png" }));
await ctx.route(/upload\.wikimedia\.org/, r => r.fulfill({ path: "/home/user/live-streaming/site/public/og.png" }));
const p = await ctx.newPage();
p.on("pageerror", e => console.log("[pageerror]", String(e).slice(0,300)));
await p.addInitScript(() => localStorage.setItem("ayato-island-arrived", "1"));
await p.goto(`http://localhost:${PORT}` + url, { waitUntil: "domcontentloaded", timeout: 60000 });
await p.waitForTimeout(2600);
if (scroll) { await p.evaluate(y => window.scrollTo(0, y), +scroll); await p.waitForTimeout(600); }
await p.screenshot({ path: out });
await b.close();
