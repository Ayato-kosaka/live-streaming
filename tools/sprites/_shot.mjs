import { chromium } from "playwright-core";
const PORT = process.env.PORT || "3014";
const OUT = process.argv[2] || "/tmp/shots/isl";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await ctx.route(/googleusercontent\.com/, r => r.fulfill({ path: "/home/user/live-streaming/site/public/characters/ayato.png" }));
const p = await ctx.newPage();
p.on("pageerror", e => console.log("[pageerror]", String(e).slice(0,200)));
await p.addInitScript(() => localStorage.setItem("ayato-island-arrived", "1"));
await p.goto(`http://localhost:${PORT}/`, { waitUntil: "load", timeout: 180000 });
await p.waitForTimeout(4500);
await p.evaluate(() => document.documentElement.dataset.time = "day");
await p.waitForTimeout(600);
const st = await p.$(".stage");
await st.screenshot({ path: OUT + "-close.png" });
// 岸に寄る
await p.evaluate(() => { const s=document.querySelector(".stage-svg"); s.setAttribute("viewBox","120 700 460 420"); });
await p.waitForTimeout(500);
await st.screenshot({ path: OUT + "-shore.png" });
// 草地に寄る
await p.evaluate(() => { const s=document.querySelector(".stage-svg"); s.setAttribute("viewBox","430 620 380 340"); });
await p.waitForTimeout(500);
await st.screenshot({ path: OUT + "-grass.png" });
// 引き
await p.evaluate(() => { const s=document.querySelector(".stage-svg"); s.setAttribute("viewBox","-60 40 1320 1200"); });
await p.waitForTimeout(500);
await st.screenshot({ path: OUT + "-wide.png" });
await b.close();
console.log("saved", OUT);
