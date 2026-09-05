import { chromium } from "playwright-core";

/** 並列で作業するとき、エージェントごとに別のポートを使う。既定は 3000。 */
const PORT = process.env.PORT || "3000";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--no-sandbox"]});
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true });
const p = await ctx.newPage();
p.on("requestfailed", r => { if (r.url().includes("googleusercontent")) console.log("FAIL", r.url().slice(0,80), r.failure()?.errorText); });
p.on("response", r => { if (r.url().includes("googleusercontent")) console.log("RESP", r.status(), r.url().slice(0,70)); });
await p.addInitScript(() => localStorage.setItem("ayato-island-arrived", "1"));
await p.goto(`http://localhost:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
await p.waitForTimeout(5000);
await b.close();
