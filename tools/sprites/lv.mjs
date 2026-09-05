import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--no-sandbox"]});
const ctx = await b.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, isMobile:true, hasTouch:true });
await ctx.route(/googleusercontent\.com/, r=>r.fulfill({path:"/home/user/live-streaming/site/public/characters/ayato.png"}));
// 配信中（JST 22:30 = UTC 13:30）に、初めて島へ降りた人
await ctx.clock.setSystemTime(new Date("2026-09-05T13:30:00Z"));
const p = await ctx.newPage();
p.on("pageerror", e=>console.log("[pageerror]", String(e).slice(0,200)));
await p.goto("http://localhost:3012/",{waitUntil:"domcontentloaded"});
await p.waitForTimeout(6000);
console.log(JSON.stringify(await p.evaluate(()=>({
  talk: document.querySelector(".talkbox p")?.textContent ?? null,
  todayOpen: !!document.querySelector(".today.is-open"),
  line: document.querySelector(".today-line")?.textContent ?? null,
  toggle: !!document.querySelector(".bar-toggle") && getComputedStyle(document.querySelector(".bar-toggle")).display,
  barH: Math.round(document.querySelector(".island-bar").getBoundingClientRect().height),
}))));
await p.screenshot({ path:"/tmp/r2b/liveday.png" });
await b.close();
