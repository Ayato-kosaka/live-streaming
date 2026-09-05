import { chromium } from "playwright-core";

/** 並列で作業するとき、エージェントごとに別のポートを使う。既定は 3000。 */
const PORT = process.env.PORT || "3000";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--no-sandbox"]});
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await ctx.route(/fonts\.googleapis\.com/, r => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
const p = await ctx.newPage();
await p.addInitScript(() => localStorage.setItem("ayato-island-arrived", "1"));
await p.goto(`http://localhost:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
await p.waitForTimeout(4000);
const view1 = await p.getAttribute(".stage", "data-view");
await p.screenshot({ path: "/tmp/shots/m-close.png" });
const z = await p.$(".bar-zoom");
if (!z) throw new Error("no .bar-zoom");
await z.click();
await p.waitForTimeout(2500);
const view2 = await p.getAttribute(".stage", "data-view");
await p.screenshot({ path: "/tmp/shots/m-wide.png" });
console.log("views", view1, view2);

const d = await b.newPage({ viewport: { width: 1280, height: 900 } });
await d.addInitScript(() => localStorage.setItem("ayato-island-arrived", "1"));
await d.goto(`http://localhost:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
await d.waitForTimeout(4000);
await d.screenshot({ path: "/tmp/shots/d.png" });
await b.close();
