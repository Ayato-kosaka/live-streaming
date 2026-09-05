import { chromium } from "playwright-core";

/** 並列で作業するとき、エージェントごとに別のポートを使う。既定は 3000。 */
const PORT = process.env.PORT || "3000";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--no-sandbox"]});
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await ctx.route(/googleusercontent\.com/, r => r.fulfill({ path: "/home/user/live-streaming/site/public/characters/ayato.png" }));
const p = await ctx.newPage();
p.on("pageerror", e => console.log("[pageerror]", String(e).slice(0,500)));
await p.addInitScript(() => localStorage.setItem("ayato-island-arrived", "1"));
await p.goto(`http://localhost:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
await p.waitForTimeout(4000);
const info = await p.evaluate(() => {
  const c = document.querySelector(".who-call");
  if (!c) return "no call";
  const r = c.getBoundingClientRect();
  const cx = r.x + r.width/2, cy = r.y + r.height/2;
  const top = document.elementFromPoint(cx, cy);
  return JSON.stringify({ rect: [Math.round(r.x),Math.round(r.y)], top: top?.className?.toString?.() || top?.tagName });
});
console.log("hit test:", info);
// DOM 経由で直接クリック
await p.evaluate(() => document.querySelector(".who-call")?.dispatchEvent(new MouseEvent("click", {bubbles:true})));
await p.waitForTimeout(4000);
console.log("bubbles:", await p.$$eval(".chatter p", n=>n.map(x=>x.textContent)));
await p.screenshot({ path: "/tmp/shots/talk.png" });
await b.close();
