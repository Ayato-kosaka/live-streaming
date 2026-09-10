/**
 * 動いているものを、**外接矩形の大きさ順**に並べる。
 *
 * 島の描き直しの代金は、要素の数でも画素でもぼかしでもなく
 * **動かした形の外接矩形**で決まる（CLAUDE.md）。足す前・削る前に、
 * 「どれがいちばん大きい形で動いているか」を先に見るための道具。
 *
 *   SPORT=4502 node animbox.mjs [パス]
 */
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";

const SPORT = process.env.SPORT || "4502";
const PAGE = process.env.PAGE || "/index.html";
const WIDE = process.env.WIDE === "1";

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const ctx = await b.newContext(WIDE
  ? { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }
  : { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
await offline(ctx);
const p = await ctx.newPage();
await p.addInitScript(() => {
  try { localStorage.setItem("ayato-island-arrived", "2026-09-04"); localStorage.setItem("ayato-island-walked", "1"); localStorage.setItem("ayato-island-today", "2026-09-05"); } catch {}
});
await p.goto(`http://localhost:${SPORT}${PAGE}`, { waitUntil: "load", timeout: 60000 });
await p.waitForTimeout(4500);
const rows = await p.evaluate(() => {
  const vw = innerWidth, vh = innerHeight;
  const out = [];
  for (const a of document.getAnimations()) {
    const el = a.effect && a.effect.target;
    if (!el || !el.getBoundingClientRect) continue;
    // 終わるものは代金にならない。無限に回っているものだけ
    const t = a.effect.getComputedTiming();
    if (t.iterations !== Infinity && a.playState !== "running") continue;
    const r = el.getBoundingClientRect();
    const inW = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0));
    const inH = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
    out.push({
      name: (a.animationName || (a.effect.getKeyframes()[0] && "?") || "?"),
      sel: el.tagName.toLowerCase() + (el.getAttribute("class") ? "." + String(el.getAttribute("class")).split(/\s+/).join(".") : ""),
      w: Math.round(r.width), h: Math.round(r.height),
      area: Math.round(r.width * r.height),
      onScreen: Math.round(inW * inH),
      inf: t.iterations === Infinity,
    });
  }
  const smil = [...document.querySelectorAll("animate,animateTransform,animateMotion")].length;
  return { out: out.sort((a, b) => b.onScreen - a.onScreen), smil, vw, vh };
});
console.log(`■ ${PAGE} ${rows.vw}×${rows.vh}  動いているもの ${rows.out.length}件  SMIL ${rows.smil}件`);
const px = rows.vw * rows.vh;
let sum = 0;
for (const r of rows.out.slice(0, 30)) {
  sum += r.onScreen;
  console.log(`  ${String(Math.round((r.onScreen / px) * 100)).padStart(4)}%画面  ${String(r.w).padStart(5)}×${String(r.h).padStart(5)}  ${r.name.padEnd(14)} ${r.sel.slice(0, 70)}`);
}
console.log(`  合計 ${(rows.out.reduce((a, r) => a + r.onScreen, 0) / px).toFixed(1)} 画面ぶん`);
await b.close();
