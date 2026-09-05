/* 起動直後、島の SVG を何回描き直したかを数える。確かめ用の一時スクリプト（終わったら消す）。
   viewBox が書き換わるたびに 152 枚のスプライトがまるごと描き直されるので、
   その回数が「起動直後の重さ」そのものになる。 */
import { chromium } from "playwright-core";

const PORT = process.env.PORT || "3012";
const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const ctx = await b.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});
await ctx.route(/googleusercontent\.com/, (r) =>
  r.fulfill({ path: "/home/user/live-streaming/tools/sprites/avatar-160.png" }),
);
const p = await ctx.newPage();
const cdp = await ctx.newCDPSession(p);
// 手元の速いマシンで測るとスマホのカクつきが出ない。CPU を4倍遅くする（perf.mjs と同じ）
await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
await p.addInitScript(() => {
  localStorage.setItem("ayato-island-arrived", "2026-09-05");
  localStorage.setItem("ayato-island-walked", "1");
  localStorage.setItem("ayato-island-today", "2026-09-05");
  window.__vb = [];
  window.__long = [];
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) window.__long.push(Math.round(e.duration));
  }).observe({ entryTypes: ["longtask"] });
  const start = performance.now();
  const hook = () => {
    const svg = document.querySelector(".stage-svg");
    if (!svg) return setTimeout(hook, 30);
    new MutationObserver(() => {
      window.__vb.push(Math.round(performance.now() - start));
    }).observe(svg, { attributes: true, attributeFilter: ["viewBox"] });
  };
  hook();
});
await p.goto(`http://localhost:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
await p.waitForTimeout(8000);
const r = await p.evaluate(() => {
  const vb = window.__vb;
  return {
    描き直し: vb.length,
    最後の描き直し: vb.length ? vb[vb.length - 1] : null,
    最初の6秒ぶん: vb.filter((t) => t < 6000).length,
    longtask合計: window.__long.reduce((a, c) => a + c, 0),
    longtask最大: Math.max(0, ...window.__long),
    longtask本数: window.__long.length,
    viewBox: document.querySelector(".stage-svg").getAttribute("viewBox"),
    ノード: document.querySelectorAll("*").length,
    svg要素: document.querySelectorAll(".stage-svg *").length,
  };
});
console.log(JSON.stringify(r, null, 1));
await b.close();
