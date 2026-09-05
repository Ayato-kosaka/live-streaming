import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--no-sandbox"]});
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
const p = await ctx.newPage();
await p.goto("http://localhost:3022/apps", { waitUntil:"load", timeout: 90000 });
await p.waitForTimeout(700);
const el = await p.$(".panel"); await el.scrollIntoViewIfNeeded(); await p.waitForTimeout(300);
await el.screenshot({ path: "/tmp/r3/pc_panel.png" });
await b.close();
