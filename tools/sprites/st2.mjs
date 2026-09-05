import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--no-sandbox"]});
const ctx = await b.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, isMobile:true, hasTouch:true });
await ctx.route(/googleusercontent\.com/, r=>r.fulfill({path:"/home/user/live-streaming/site/public/characters/ayato.png"}));
const p = await ctx.newPage();
p.on("pageerror", e=>console.log("[pageerror]", String(e).slice(0,200)));
await p.addInitScript(()=>{localStorage.setItem("ayato-island-arrived","2026-09-05");localStorage.setItem("ayato-island-walked","1");localStorage.setItem("ayato-island-today","2026-09-05");localStorage.setItem("ayato-island-met","2026-08-01");});
await p.goto("http://localhost:3012/",{waitUntil:"domcontentloaded"});
await p.waitForTimeout(3000);
console.log("光の残り:", await p.evaluate(()=>{
  const on=[...document.querySelectorAll(".who")].filter(e=>e.className.includes("is-calling")).length;
  const g=[...document.querySelectorAll(".who-hit")].map(e=>getComputedStyle(e,"::before").content).filter(c=>c&&c!=="none");
  return {isCalling:on, hitBefore:g.length};
}));
// 住人を押して、喋るか
for (let i=0;i<10;i++){
  const hit = await p.evaluate(()=>{const c=document.querySelector(".who-hit"); if(!c) return null; const b=c.getBoundingClientRect(); return b.top>70&&b.bottom<620?{x:Math.round(b.left+b.width/2),y:Math.round(b.top+b.height/2)}:null;});
  if(hit){ await p.mouse.click(hit.x,hit.y); await p.waitForTimeout(2500); }
  else await p.waitForTimeout(900);
  const t = await p.evaluate(()=>document.querySelector(".talkbox p")?.textContent??null);
  if(t){ console.log("押したら:", JSON.stringify(t)); break; }
}
await p.screenshot({ path:"/tmp/r2b/noglow.png" });
console.log("横あふれ:", await p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth));
await b.close();
