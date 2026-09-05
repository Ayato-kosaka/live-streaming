import { chromium } from "playwright-core";

/** 並列で作業するとき、エージェントごとに別のポートを使う。既定は 3000。 */
const PORT = process.env.PORT || "3000";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--no-sandbox"]});
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
// このサンドボックスからは lh3.googleusercontent.com に出られないので、
// 住人の絵はローカル画像で差し替えて動きだけ確かめる。
await ctx.route(/googleusercontent\.com/, (r) => r.fulfill({ path: "/home/user/live-streaming/site/public/characters/ayato.png" }));
const p = await ctx.newPage();
p.on("pageerror", e => console.log("[pageerror]", String(e).slice(0,300)));
await p.addInitScript(() => localStorage.setItem("ayato-island-arrived", "1"));
await p.goto(`http://localhost:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
await p.waitForTimeout(4000);
console.log("residents drawn:", await p.$$eval(".stage-svg image", n => n.filter(i=>i.getAttribute("href")?.includes("googleusercontent")).length));
console.log("calls:", await p.$$eval(".who-call", n=>n.length));
const c = await p.$(".who-call");
if (c) {
  await c.click({ force: true });
  await p.waitForTimeout(3800);
  console.log("bubble:", await p.$$eval(".chatter", n=>n.map(x=>x.textContent)));
  await p.screenshot({ path: "/tmp/shots/talk.png" });
  const more = await p.$(".chatter-more");
  if (more) { await more.click({ force: true }); await p.waitForTimeout(500); console.log("after more:", await p.$$eval(".chatter p", n=>n.map(x=>x.textContent))); }
  await p.click(".chatter-x", { force: true });
  await p.waitForTimeout(400);
  console.log("after close:", await p.$$eval(".chatter", n=>n.length));
} else { await p.screenshot({ path: "/tmp/shots/talk.png" }); }
await b.close();
