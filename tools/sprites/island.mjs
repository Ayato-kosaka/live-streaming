import { chromium } from "playwright-core";

/** 並列で作業するとき、エージェントごとに別のポートを使う。既定は 3000。 */
const PORT = process.env.PORT || "3000";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--no-sandbox"]});
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await ctx.route(/googleusercontent\.com/, r => r.fulfill({ path: "/home/user/live-streaming/site/public/characters/ayato.png" }));
const p = await ctx.newPage();
p.on("pageerror", e => console.log("[pageerror]", String(e).slice(0,300)));
await p.addInitScript(() => localStorage.setItem("ayato-island-arrived", "1"));
await p.goto(`http://localhost:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
await p.waitForTimeout(4000);
console.log("view", await p.getAttribute(".stage","data-view"), "marks", await p.$$eval(".spot-mark", n=>n.length), "badge", await p.$$eval(".spot-badge", n=>n.map(x=>x.textContent)));
await p.screenshot({ path: "/tmp/shots/i-close.png" });
// 引き
const z = await p.$(".bar-zoom"); if (z) { await z.click(); await p.waitForTimeout(2500); }
await p.screenshot({ path: "/tmp/shots/i-wide.png" });
// フレームレート
const fps = await p.evaluate(() => new Promise(res => {
  let n = 0; const t0 = performance.now();
  const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(Math.round(n / ((performance.now()-t0)/1000))); };
  requestAnimationFrame(f);
}));
console.log("fps", fps);
await b.close();
