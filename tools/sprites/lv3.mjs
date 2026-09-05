import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--no-sandbox"]});
const ctx = await b.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:1, isMobile:true, hasTouch:true });
await ctx.route(/googleusercontent\.com/, r=>r.fulfill({path:"/home/user/live-streaming/site/public/characters/ayato.png"}));

const p = await ctx.newPage();
p.on("pageerror", e=>console.log("[pageerror]", String(e).slice(0,200)));
// 66日空けて帰ってきた人。今日ぶんの板はまだ見ていない
await p.addInitScript(()=>{localStorage.setItem("ayato-island-arrived","2026-07-01");localStorage.setItem("ayato-island-walked","1");});
await p.goto("http://localhost:3012/",{waitUntil:"domcontentloaded",timeout:90000});
await p.waitForTimeout(9000);
console.log("久しぶり-ふつうの日:", JSON.stringify(await p.evaluate(()=>({
  カモメ: !!document.querySelector(".talkbox.is-guide"),
  板が開いた: !!document.querySelector(".today.is-open"),
}))));
await b.close();
