import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--no-sandbox"]});
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile:true, hasTouch:true });
const p = await ctx.newPage();
await p.goto(process.env.U || "http://localhost:3022/map", { waitUntil:"load", timeout: 90000 });
await p.waitForTimeout(700);
const el = await p.$(process.env.S || ".panel:last-of-type"); await el.scrollIntoViewIfNeeded(); await p.waitForTimeout(400);
await el.screenshot({ path: process.env.O || "/tmp/r3/el.png" });
await b.close();
