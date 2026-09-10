/**
 * 開いてから最初の絵が出るまでの重さ。**スマホ実機に寄せて（CPU 4倍遅）測る。**
 *
 *   SPORT=4502 node loadcost.mjs
 *
 * 絞りそのものが1フレーム 13ms の下駄になるので（CLAUDE.md）、
 * ここでは**フレームの速さは見ない**。見るのは
 *   FCP / LCP … 最初の絵・いちばん大きい絵が出るまで
 *   起動CPU    … 開いてから落ち着くまでに使った CPU
 *   転送        … 落としたバイト数
 * の3つだけ。どれも絞りが同じなら、直す前と後で比べられる。
 */
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";
const SPORT = process.env.SPORT || "4502";
const PAGE = process.env.PAGE || "/index.html";
const WIDE = process.env.WIDE === "1";
const N = Number(process.env.N || 3);
const THROTTLE = Number(process.env.THROTTLE || 4);
const CSS = process.env.CSS || "";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const ctx = await b.newContext(WIDE
  ? { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }
  : { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
await offline(ctx);
const runs = [];
for (let i = 0; i < N; i++) {
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  await cdp.send("Performance.enable");
  if (THROTTLE) await cdp.send("Emulation.setCPUThrottlingRate", { rate: THROTTLE });
  let bytes = 0, reqs = 0;
  p.on("response", async (r) => { try { if (new URL(r.url()).hostname === "localhost") { bytes += (await r.body()).length; reqs++; } } catch {} });
  await p.addInitScript(({ css }) => { if (css) { const st = document.createElement("style"); st.textContent = css; document.documentElement.appendChild(st); } try { localStorage.setItem("ayato-island-arrived", "2026-09-04"); localStorage.setItem("ayato-island-walked", "1"); } catch {}
    window.__lcp = null;
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lcp = e.startTime; }).observe({ type: "largest-contentful-paint", buffered: true }); } catch {} }, { css: CSS });
  await p.goto(`http://localhost:${SPORT}${PAGE}`, { waitUntil: "load", timeout: 90000 });
  await p.waitForTimeout(6000);
  const m = Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((x) => [x.name, x.value]));
  const w = await p.evaluate(() => {
    const g = (t) => performance.getEntriesByType(t);
    const fcp = g("paint").find((e) => e.name === "first-contentful-paint");
    const lcp = (window.__lcp ?? null);
    return { fcp: fcp ? fcp.startTime : 0, lcp: lcp ?? 0,
      dom: document.querySelectorAll("*").length, svg: document.querySelectorAll("svg *").length,
      html: document.documentElement.outerHTML.length };
  });
  await p.close();
  runs.push({ ...w, cpu: m.ProcessTime * 1000, main: m.ThreadTime * 1000, layout: m.LayoutDuration * 1000,
    style: m.RecalcStyleDuration * 1000, script: m.ScriptDuration * 1000, bytes, reqs });
}
await b.close();
const med = (k) => { const s = runs.map((r) => r[k]).sort((a, c) => a - c); return s[Math.floor(s.length / 2)]; };
console.log(`■ ${PAGE} ${WIDE ? "PC" : "スマホ"} CPU${THROTTLE}倍遅 ×${N}回（中央値）${CSS ? "  CSS: " + CSS : ""}`);
console.log(`  FCP ${med("fcp").toFixed(0)}ms   LCP ${med("lcp").toFixed(0)}ms`);
console.log(`  起動CPU ${med("cpu").toFixed(0)}ms（主 ${med("main").toFixed(0)} / 配置 ${med("layout").toFixed(0)} / 字面 ${med("style").toFixed(0)} / JS ${med("script").toFixed(0)}）`);
console.log(`  転送 ${(med("bytes") / 1024).toFixed(0)}KB / ${med("reqs")}本   DOM ${med("dom")} / SVG要素 ${med("svg")}   HTML ${(med("html") / 1024).toFixed(0)}KB`);
