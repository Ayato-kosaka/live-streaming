import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--no-sandbox"]});
const ctx = await b.newContext({ viewport: { width: 1200, height: 716 }, deviceScaleFactor: 1 });
await ctx.route(/googleusercontent\.com/, r => r.fulfill({ path: "/home/user/live-streaming/site/public/characters/ayato.png" }));
const p = await ctx.newPage();
await p.addInitScript(() => localStorage.setItem("ayato-island-arrived", "1"));
await p.goto("http://localhost:3000/", { waitUntil: "domcontentloaded", timeout: 60000 });
await p.waitForTimeout(4500);
// 昼の色で撮る。時間帯で色が変わるので固定する。
await p.evaluate(() => document.documentElement.setAttribute("data-time", "day"));
// バーと歩き方の案内は共有画像には要らない
await p.addStyleTag({ content: ".island-bar,.walk-hint,.scroll-cue,.chatter,.who-call{display:none!important}" });
await p.waitForTimeout(800);
const el = await p.$(".stage");
await el.screenshot({ path: "/tmp/og-new.png" });
console.log("ok");
await b.close();
