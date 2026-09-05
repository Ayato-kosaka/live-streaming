import { chromium } from "playwright-core";
const PORT = process.env.PORT || "3014";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
await ctx.route(/googleusercontent\.com/, r => r.fulfill({ path: "/home/user/live-streaming/site/public/characters/ayato.png" }));
const p = await ctx.newPage();
const cdp = await ctx.newCDPSession(p);
await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
await p.addInitScript(() => localStorage.setItem("ayato-island-arrived", "1"));
await p.goto(`http://localhost:${PORT}/`, { waitUntil: "load", timeout: 180000 });
await p.waitForTimeout(9000);
await p.evaluate(() => {
  const svg = document.querySelector(".stage-svg");
  let t = 0;
  const drive = () => { t += 0.02; svg.setAttribute("viewBox", `${300+Math.sin(t)*60} ${380+Math.cos(t)*40} 620 900`); requestAnimationFrame(drive); };
  requestAnimationFrame(drive);
  window.__hide = (sel, on) => document.querySelectorAll(sel).forEach(e => e.style.display = on ? "none" : "");
  window.__hideSmall = (on) => document.querySelectorAll(".stage-svg image").forEach(e => { if (+e.getAttribute("width") < 40) e.style.display = on ? "none" : ""; });
});
async function measure() {
  const f = await p.evaluate(() => new Promise(res => {
    const arr=[]; let last=0; const t0=performance.now();
    const tick=t=>{ if(last)arr.push(t-last); last=t; if(performance.now()-t0<2200) requestAnimationFrame(tick); else res(arr); };
    requestAnimationFrame(tick);
  }));
  const s=f.filter(x=>x>0&&x<600).sort((a,b)=>a-b);
  return s[Math.floor(s.length/2)]||0;
}
const info = await p.evaluate(() => {
  const im=[...document.querySelectorAll(".stage-svg image")];
  const small=im.filter(e=>+e.getAttribute("width")<40);
  return { all: im.length, small: small.length, names: [...new Set(small.map(e=>(e.getAttribute("href")||"").split("/").pop()))] };
});
console.log("画像", info.all, "うち幅40未満", info.small, info.names.join(" "));
const rows = [];
for (let i=0;i<3;i++) {
  await p.evaluate(() => window.__hideSmall(false)); await p.waitForTimeout(400);
  const a = await measure();
  await p.evaluate(() => window.__hideSmall(true)); await p.waitForTimeout(400);
  const c = await measure();
  rows.push([a,c]);
  console.log(`回${i+1}  そのまま p50=${a.toFixed(1)}   小を隠す p50=${c.toFixed(1)}`);
}
await p.evaluate(() => window.__hideSmall(false)); await p.waitForTimeout(400);
console.log("--- ほかの候補 ---");
for (const [label, sel] of [["島の影(4枚)", '.stage-svg g[fill="#06364a"]'], ["草パターン2枚", '.stage-svg rect[fill^="url(#grassTex"]'], ["泡レース", ".stage-svg .surf"], ["海きらめき", ".stage-svg .sea-glint"], ["木など大きい画像", null]]) {
  const base = await measure();
  if (sel) await p.evaluate(s => window.__hide(s, true), sel);
  else await p.evaluate(() => document.querySelectorAll(".stage-svg image").forEach(e=>{ if(+e.getAttribute("width")>=40) e.style.display="none"; }));
  await p.waitForTimeout(400);
  const after = await measure();
  if (sel) await p.evaluate(s => window.__hide(s, false), sel);
  else await p.evaluate(() => document.querySelectorAll(".stage-svg image").forEach(e=>{ e.style.display=""; }));
  await p.waitForTimeout(400);
  console.log(label.padEnd(18), `前 ${base.toFixed(1)} → 隠すと ${after.toFixed(1)}`);
}
await b.close();
