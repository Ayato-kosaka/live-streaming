import { chromium } from "playwright-core";

/** 並列で作業するとき、エージェントごとに別のポートを使う。既定は 3000。 */
const PORT = process.env.PORT || "3000";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--no-sandbox"]});
const ctx = await b.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2, isMobile: true });
const p = await ctx.newPage();
p.on("pageerror", e => console.log("[pageerror]", String(e).slice(0,300)));
await p.goto(`http://localhost:${PORT}/nordic`, { waitUntil: "domcontentloaded", timeout: 60000 });
await p.waitForTimeout(2500);
const el = await p.$(".nmap");
if (!el) throw new Error("no .nmap");
await el.scrollIntoViewIfNeeded();
await p.waitForTimeout(400);
await el.screenshot({ path: "/tmp/shots/nmap.png" });
console.log("box", JSON.stringify(await el.boundingBox()));
await b.close();
