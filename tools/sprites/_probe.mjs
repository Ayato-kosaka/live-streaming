/** 何が重いのかを実測する。要素を消しては fps を測る。 */
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
await p.waitForTimeout(6000);

// カメラを常に動かし続ける（viewBox を毎フレーム書き換える状況を再現）
await p.evaluate(() => {
  const svg = document.querySelector(".stage-svg");
  window.__stop = false;
  let t = 0;
  const drive = () => {
    if (window.__stop) return;
    t += 0.02;
    const x = 300 + Math.sin(t) * 60, y = 380 + Math.cos(t) * 40;
    svg.setAttribute("viewBox", `${x} ${y} 620 900`);
    requestAnimationFrame(drive);
  };
  requestAnimationFrame(drive);
});

async function measure(label) {
  const f = await p.evaluate(() => new Promise(res => {
    const arr = []; let last = 0; const t0 = performance.now();
    const tick = t => { if (last) arr.push(t - last); last = t;
      if (performance.now() - t0 < 2500) requestAnimationFrame(tick); else res(arr); };
    requestAnimationFrame(tick);
  }));
  const s = f.filter(x=>x>0&&x<500).sort((a,b)=>a-b);
  const p50 = s[Math.floor(s.length/2)]||0, p95 = s[Math.floor(s.length*0.95)]||0;
  console.log(label.padEnd(30), "n="+String(s.length).padStart(4), "p50="+p50.toFixed(1).padStart(6), "p95="+p95.toFixed(1).padStart(6));
}

await measure("そのまま");
const cases = [
  ["画像ぜんぶ消す", () => document.querySelectorAll(".stage-svg image").forEach(e=>e.remove())],
];
// 段階的に消す
const steps = [
  ["小さい画像(<=34)を消す", () => { document.querySelectorAll(".stage-svg image").forEach(e=>{ if (+e.getAttribute("width") < 40) e.remove(); }); }],
  ["島の影4枚を消す", () => { const g=[...document.querySelectorAll(".stage-svg g")].find(x=>x.getAttribute("fill")==="#06364a"); g&&g.remove(); }],
  ["草のパターン2枚を消す", () => { document.querySelectorAll('.stage-svg rect[fill^="url(#grassTex"]').forEach(e=>e.remove()); }],
  ["泡のレース12本を消す", () => { document.querySelectorAll(".stage-svg .surf").forEach(e=>e.remove()); }],
  ["海のきらめきを消す", () => { document.querySelectorAll(".stage-svg .sea-glint").forEach(e=>e.remove()); }],
  ["残りの画像ぜんぶ消す", () => { document.querySelectorAll(".stage-svg image").forEach(e=>e.remove()); }],
  ["浅瀬4枚を消す", () => { document.querySelectorAll(".stage-svg > path").forEach(e=>e.remove()); }],
];
for (const [label, fn] of steps) { await p.evaluate(fn); await p.waitForTimeout(400); await measure(label); }
await b.close();
