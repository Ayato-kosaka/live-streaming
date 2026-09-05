import { chromium } from "playwright-core";
/** 地図の章タブを押してから撮る。 */
const PORT = process.env.PORT || "3022";
const [url, out, w, tab] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--no-sandbox"]});
const ctx = await b.newContext({ viewport: { width: +(w||1100), height: 1200 }, deviceScaleFactor: 2 });
await ctx.route(/googleusercontent\.com/, r => r.fulfill({ path: "/home/user/live-streaming/site/public/characters/ayato.png" }));
const p = await ctx.newPage();
p.on("pageerror", e => console.log("[pageerror]", String(e).slice(0,300)));
await p.addInitScript(() => localStorage.setItem("ayato-island-arrived", "1"));
await p.goto(`http://localhost:${PORT}` + url, { waitUntil: "domcontentloaded", timeout: 60000 });
await p.waitForTimeout(2200);
const tabs = await p.$$(".amap-tab");
if (tabs[+tab]) { await tabs[+tab].click(); await p.waitForTimeout(900); }
const el = await p.$(".amap");
await el.screenshot({ path: out });
await b.close();
