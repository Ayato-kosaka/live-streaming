import { chromium } from "playwright-core";
const PORT = process.env.PORT || "3014";
const OUT = process.argv[2] || "/tmp/shots/ip";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await ctx.route(/googleusercontent\.com/, r => r.fulfill({ path: "/home/user/live-streaming/tools/sprites/avatar-160.png" }));
const p = await ctx.newPage();
p.setDefaultTimeout(600000);
p.on("pageerror", e => console.log("[pageerror]", String(e).slice(0,200)));
await p.addInitScript(() => localStorage.setItem("ayato-island-arrived", "1"));
await p.goto(`http://localhost:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 600000 });
await p.waitForSelector(".stage-svg", { timeout: 600000 });
await p.waitForTimeout(6000);
await p.evaluate(() => { document.documentElement.dataset.time = "day"; });
await p.waitForTimeout(800);
const st = await p.$(".stage");
const views = [["close", null], ["shore", "120 700 460 420"], ["grass", "430 600 400 360"], ["wide", "-60 40 1320 1200"]];
for (const [name, vb] of views) {
  if (vb) { await p.evaluate(v => document.querySelector(".stage-svg").setAttribute("viewBox", v), vb); await p.waitForTimeout(700); }
  await st.screenshot({ path: `${OUT}-${name}.png`, timeout: 600000 });
  console.log("saved", name);
}
await b.close();
