/**
 * 2つの条件を **交互に** 測る。
 *
 * framecpu.mjs は1条件ずつ測るので、隣の担当がビルドを始めた瞬間に
 * 前後の数字が入れ替わる（実測: 同じ島で 15.5ms と 31.0ms）。
 * ProcessTime は「他のプロセスの CPU」は数えないが、
 * **コアを取り合ったときの自分の CPU 秒は伸びる**。混み具合から完全には逃げられない。
 *
 * ここでは A→B→A→B… と交互に測って、**同じ回の A と B の比**だけを見る。
 * 混み具合は A にも B にも同じだけ乗るので、比では消える。
 */
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";
const SPORT = process.env.SPORT || "4120";
const WIDE = process.env.WIDE === "1";
const N = Number(process.env.N || 3);
const SECS = Number(process.env.SECS || 6);
/**
 * 比べる条件。`A` `B` `C` `D` `E` `F` に CSS を入れると、その数だけ交互に回る。
 * `A` を空にしておけば「素のまま」が基準になる。
 */
const CONDS = ["A", "B", "C", "D", "E", "F"]
  .map((k) => [k, process.env[k]])
  .filter(([, v]) => v !== undefined);
const PAGE = process.env.PAGE || "/index.html";

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
    window.__f = 0; window.__vb = 0;
    const sa = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function (n, v) { if (n === "viewBox") window.__vb++; return sa.call(this, n, v); };
    const tick = () => { window.__f++; requestAnimationFrame(tick); }; requestAnimationFrame(tick);
  }, { css });
  await p.goto(`http://localhost:${SPORT}${PAGE}`, { waitUntil: "load", timeout: 60000 });
  await p.waitForTimeout(4000);
  const m = async () => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((x) => [x.name, x.value]));
  const a = await m();
  const s0 = await p.evaluate(() => ({ f: window.__f, vb: window.__vb }));
  await p.evaluate(({ secs }) => { const el = document.querySelector(".stage"); if (!el) return; let n = 0;
    const id = setInterval(() => { const r = el.getBoundingClientRect();
      el.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: r.left + r.width * (0.22 + 0.56 * (n % 2)), clientY: r.top + r.height * (0.35 + 0.2 * (n % 3)) }));
      if (++n > secs * 2 - 1) clearInterval(id); }, 500); }, { secs: SECS });
  const w0 = Date.now();
  await p.waitForTimeout(SECS * 1000);
  const wall = Date.now() - w0;
  const z = await m();
  const s1 = await p.evaluate(() => ({ f: window.__f, vb: window.__vb }));
  await p.close();
  const frames = Math.max(1, s1.f - s0.f);
  return { frames, fps: (frames * 1000) / wall, cpu: ((z.ProcessTime - a.ProcessTime) * 1000) / frames,
    cpuPerSec: ((z.ProcessTime - a.ProcessTime) * 1000) / (wall / 1000), main: ((z.ThreadTime - a.ThreadTime) * 1000) / frames, vb: s1.vb - s0.vb };
}

const runs = CONDS.map(() => []);
for (let i = 0; i < N; i++) for (let j = 0; j < CONDS.length; j++) runs[j].push(await once(CONDS[j][1]));
await b.close();
const med = (r, k) => { const s = r.map((x) => x[k]).sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const line = (name, r) => console.log(`  ${name}  1秒のCPU ${med(r, "cpuPerSec").toFixed(0)} ms  fps ${med(r, "fps").toFixed(1)}  1フレーム ${med(r, "cpu").toFixed(1)}ms(主 ${med(r, "main").toFixed(1)})  焼き直し ${med(r, "vb")}回  [${r.map((x) => x.fps.toFixed(1)).join(" ")}]`);
console.log(`■ ${PAGE} ${WIDE ? "1440×900" : "390×844"}  ${N}往復`);
const base = med(runs[0], "fps");
for (let j = 0; j < CONDS.length; j++) {
  line(CONDS[j][0], runs[j]);
  if (CONDS[j][1]) console.log(`     ${CONDS[j][0]}: ${CONDS[j][1]}   → fps ×${(med(runs[j], "fps") / base).toFixed(2)}`);
}
