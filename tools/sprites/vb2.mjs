import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--no-sandbox"]});
const ctx = await b.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:1, isMobile:true, hasTouch:true });
await ctx.route(/googleusercontent\.com/, r=>r.fulfill({path:"/home/user/live-streaming/site/public/characters/ayato.png"}));
const p = await ctx.newPage();
await p.addInitScript(()=>{localStorage.setItem("ayato-island-arrived","2026-09-05");localStorage.setItem("ayato-island-walked","1");localStorage.setItem("ayato-island-today","2026-09-05");});
await p.goto("http://localhost:3012/",{waitUntil:"domcontentloaded"});
for (const t of [400,1200,2600,4000]) { await p.waitForTimeout(t===400?400:t- (t===1200?400:t===2600?1200:2600));
  console.log(t, await p.evaluate(()=>({view:document.querySelector(".stage").dataset.view, mode:document.querySelector(".stage").dataset.mode, vb:document.querySelector(".stage-svg").getAttribute("viewBox")})));
}
await b.close();
