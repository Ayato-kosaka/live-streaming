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
await p.waitForTimeout(8000);
await p.evaluate(() => {
  const svg = document.querySelector(".stage-svg");
  let t = 0;
  const drive = () => { t += 0.02; svg.setAttribute("viewBox", `${300+Math.sin(t)*60} ${380+Math.cos(t)*40} 620 900`); requestAnimationFrame(drive); };
  requestAnimationFrame(drive);
});
async function measure(label) {
  const f = await p.evaluate(() => new Promise(res => {
    const arr=[]; let last=0; const t0=performance.now();
    const tick=t=>{ if(last)arr.push(t-last); last=t; if(performance.now()-t0<2500) requestAnimationFrame(tick); else res(arr); };
    requestAnimationFrame(tick);
  }));
  const s=f.filter(x=>x>0&&x<600).sort((a,b)=>a-b);
  console.log(label.padEnd(34), "n="+String(s.length).padStart(4), "p50="+(s[Math.floor(s.length/2)]||0).toFixed(1).padStart(6));
}
await measure("基準A");
await measure("基準B");
const info = await p.evaluate(() => {
  const im=[...document.querySelectorAll(".stage-svg image")];
  const small=im.filter(e=>+e.getAttribute("width")<40);
  return { all: im.length, small: small.length, names: [...new Set(small.map(e=>(e.getAttribute("href")||"").split("/").pop()))] };
});
console.log("画像", info.all, "うち小さいの", info.small, info.names.join(" "));
await p.evaluate(() => document.querySelectorAll(".stage-svg image").forEach(e=>{ if(+e.getAttribute("width")<40) e.style.display="none"; }));
await p.waitForTimeout(500); await measure("小さい画像を隠す");
await p.evaluate(() => document.querySelectorAll(".stage-svg image").forEach(e=>{ if(+e.getAttribute("width")<40) e.style.display=""; }));
await p.waitForTimeout(500); await measure("戻す");
await p.evaluate(() => document.querySelectorAll(".stage-svg image").forEach(e=>{ e.removeAttribute("preserveAspectRatio"); }));
await p.waitForTimeout(500); await measure("preserveAspectRatio を外す");
await p.evaluate(() => document.querySelectorAll(".stage-svg image").forEach(e=>{ if(+e.getAttribute("width")>=40) e.style.display="none"; }));
await p.waitForTimeout(500); await measure("大きい画像だけ隠す");
await b.close();
