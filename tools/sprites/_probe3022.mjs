import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--no-sandbox"]});
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile:true, hasTouch:true });
const p = await ctx.newPage();
await p.goto("http://localhost:3022/map", { waitUntil:"networkidle" });
await p.waitForTimeout(600);
const tabs = await p.$$(".amap-tab");
for (let i=0;i<tabs.length;i++){
  await tabs[i].click(); await p.waitForTimeout(1200);
  const r = await p.evaluate(() => {
    const st = document.querySelector(".amap-stage").getBoundingClientRect();
    const vis = [...document.querySelectorAll(".apin.is-named .apin-name, .acity b:not(.is-off)")]
      .filter(e => getComputedStyle(e).opacity !== "0");
    const cut = vis.filter(e => { const r=e.getBoundingClientRect(); return r.left < st.left-1 || r.right > st.right+1 || r.top < st.top-1 || r.bottom > st.bottom+1; });
    return { n: vis.length, cut: cut.map(e=>e.textContent) };
  });
  console.log(`tab${i}`, JSON.stringify(r));
  const el = await p.$(".amap"); await el.scrollIntoViewIfNeeded(); await p.waitForTimeout(300); await el.screenshot({ path:`/tmp/r3/tab${i}.png` });
}
await b.close();
