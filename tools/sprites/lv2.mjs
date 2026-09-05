import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--no-sandbox"]});
const shot = async (label, fresh, when) => {
  const ctx = await b.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, isMobile:true, hasTouch:true });
  await ctx.route(/googleusercontent\.com/, r=>r.fulfill({path:"/home/user/live-streaming/site/public/characters/ayato.png"}));
  if (when) await ctx.clock.setSystemTime(new Date(when));
  const p = await ctx.newPage();
  p.on("pageerror", e=>console.log("[pageerror]", String(e).slice(0,200)));
  if (!fresh) await p.addInitScript(()=>{localStorage.setItem("ayato-island-arrived","2026-09-05");localStorage.setItem("ayato-island-walked","1");localStorage.setItem("ayato-island-today","2026-09-05");});
  await p.goto("http://localhost:3012/",{waitUntil:"domcontentloaded"});
  await p.waitForTimeout(7000);
  console.log(label, JSON.stringify(await p.evaluate(()=>({
    カモメ: !!document.querySelector(".talkbox.is-guide"),
    板が開いた: !!document.querySelector(".today.is-open"),
    今日の1行: document.querySelector(".today-line")?.textContent ?? null,
    arrived: localStorage.getItem("ayato-island-arrived"),
  }))));
  await p.screenshot({ path:`/tmp/r2b/${label}.png` });
  await ctx.close();
};
await shot("初回-配信中", true,  "2026-09-05T13:30:00Z");
await shot("初回-ふつうの日", true, null);
await shot("2回目-配信中", false, "2026-09-05T13:30:00Z");
await shot("2回目-ふつうの日", false, null);
await b.close();
