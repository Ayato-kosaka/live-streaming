/**
 * 何も押さずに置いたときの CPU を、A と B で **交互に** 測る。
 *
 * `_ab.mjs` は島を歩かせて測るが、入口の面は「開いて、ただ見ている」時間の
 * ほうが長い。歩かせない状態の代金を、同じ交互測定で読む。
 *
 *   SPORT=4502 A="" B=".surf{animation:none}" node abidle.mjs
 */
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";
const SPORT = process.env.SPORT || "4502";
const WIDE = process.env.WIDE === "1";
const N = Number(process.env.N || 3);
const SECS = Number(process.env.SECS || 5);
const PAGE = process.env.PAGE || "/index.html";
const CONDS = ["A", "B", "C", "D", "E", "F"].map((k) => [k, process.env[k]]).filter(([, v]) => v !== undefined);

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const ctx = await b.newContext(WIDE
  ? { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }
  : { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
await offline(ctx, { photo: "/home/user/live-streaming/tools/sprites/photo-480.jpg" });

async function once(css) {
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  await cdp.send("Performance.enable");
  await p.addInitScript(({ css }) => {
    try { localStorage.setItem("ayato-island-arrived", "2026-09-04"); localStorage.setItem("ayato-island-walked", "1"); localStorage.setItem("ayato-island-today", "2026-09-05"); } catch {}
    if (css) document.addEventListener("DOMContentLoaded", () => { const s = document.createElement("style"); s.textContent = css; document.head.appendChild(s); });
    window.__f = 0;
    const tick = () => { window.__f++; requestAnimationFrame(tick); }; requestAnimationFrame(tick);
  }, { css });
  const t0 = Date.now();
  await p.goto(`http://localhost:${SPORT}${PAGE}`, { waitUntil: "load", timeout: 60000 });
  await p.waitForTimeout(4000);
  const boot = (await m(cdp)).ProcessTime * 1000;
  const a = await m(cdp);
  const f0 = await p.evaluate(() => window.__f);
  const w0 = Date.now();
  await p.waitForTimeout(SECS * 1000);
  const wall = Date.now() - w0;
  const z = await m(cdp);
  const f1 = await p.evaluate(() => window.__f);
  await p.close();
  const frames = Math.max(1, f1 - f0);
  return { boot, load: Date.now() - t0, frames, fps: (frames * 1000) / wall,
    cpuPerSec: ((z.ProcessTime - a.ProcessTime) * 1000) / (wall / 1000),
    mainPerSec: ((z.ThreadTime - a.ThreadTime) * 1000) / (wall / 1000),
    cpu: ((z.ProcessTime - a.ProcessTime) * 1000) / frames };
}
const m = async (cdp) => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((x) => [x.name, x.value]));

const runs = CONDS.map(() => []);
for (let i = 0; i < N; i++) for (let j = 0; j < CONDS.length; j++) runs[j].push(await once(CONDS[j][1]));
await b.close();
const med = (r, k) => { const s = r.map((x) => x[k]).sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
console.log(`■ ${PAGE} ${WIDE ? "1440×900" : "390×844"}  何も押さずに${SECS}秒  ${N}往復`);
const base = med(runs[0], "cpuPerSec");
for (let j = 0; j < CONDS.length; j++) {
  const r = runs[j];
  console.log(`  ${CONDS[j][0]}  1秒のCPU ${med(r, "cpuPerSec").toFixed(0)}ms(主 ${med(r, "mainPerSec").toFixed(0)})  fps ${med(r, "fps").toFixed(1)}  起動4秒のCPU ${med(r, "boot").toFixed(0)}ms  → CPU ×${(med(r, "cpuPerSec") / base).toFixed(2)}`);
  if (CONDS[j][1]) console.log(`     ${CONDS[j][1]}`);
}
