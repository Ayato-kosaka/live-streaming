/**
 * 面を1枚ずつ撮って、直す前と直したあとを並べられるようにする。
 *
 *   OUT=/tmp/inkreport/before PORT=4170 PAGES=/streams.html node tools/sprites/redpage.mjs
 *   SEL='.wk-days' CROP=1 ...   # その相手のまわりだけ、寄って撮る
 *
 * **飾りの面も撮る。** 直したのが字だけであることは、同じ赤を飾りに使っている面が
 * 1画素も動いていないことで見せる（`diff` は `redpage.py`）。
 * 島は rAF で動くので止めてから撮る（`CLAUDE.md`）。止めないと、前後で
 * 住人の位置が違うだけの差が出て、比べものにならない。
 */
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";
import { mkdirSync } from "fs";

const PORT = process.env.PORT || "4170";
const PATHS = (process.env.PAGES || "/streams.html").split(",");
const OUT = process.env.OUT || "/tmp/inkreport/shot";
const W = Number(process.env.W || 390);
const H = Number(process.env.H || 844);
const DPR = Number(process.env.DPR || 2);
const SEL = process.env.SEL || "";
const PAD = Number(process.env.PAD || 12);
mkdirSync(OUT, { recursive: true });

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const ctx = await b.newContext({
  viewport: { width: W, height: H },
  deviceScaleFactor: DPR,
  isMobile: W < 700,
  hasTouch: W < 700,
  reducedMotion: "reduce",
});
await offline(ctx);
if (process.env.SEED) await (await import(process.env.SEED)).apply(ctx);
await ctx.addInitScript(() => {
  try {
    localStorage.setItem("ayato-island-arrived", "2026-09-04");
    localStorage.setItem("ayato-island-walked", "1");
  } catch {}
});
const p = await ctx.newPage();

for (const path of PATHS) {
  await p.goto(`http://localhost:${PORT}${path}`, { waitUntil: "networkidle", timeout: 60000 });
  await p.waitForTimeout(1500);
  if (process.env.OPEN) {
    await p.evaluate(() => { for (const d of document.querySelectorAll("details")) d.open = true; });
  }
  if (process.env.CLICK) {
    for (const sel of process.env.CLICK.split("|")) {
      await p.click(sel, { force: true, timeout: 8000 }).catch(() => {});
      await p.waitForTimeout(Number(process.env.GAP || 1200));
    }
  }
  if (process.env.JS) await p.evaluate(process.env.JS);
  await p.waitForTimeout(1200);
  await p.evaluate(() => { window.requestAnimationFrame = () => 0; });
  const name = path.replace(/\//g, "_").replace(/\.html$/, "") || "_";
  if (SEL) {
    const box = await p.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      el.scrollIntoView({ block: "center" });
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    }, SEL);
    await p.waitForTimeout(400);
    if (box) {
      await p.screenshot({
        path: `${OUT}/${name}.png`,
        clip: {
          x: Math.max(0, box.x - PAD), y: Math.max(0, box.y - PAD),
          width: Math.min(W, box.w + PAD * 2), height: box.h + PAD * 2,
        },
      });
      console.log(`${path}  寄り ${Math.round(box.w)}x${Math.round(box.h)}`);
      continue;
    }
    console.log(`${path}  «${SEL}» が出ていないので通しで撮る`);
  }
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  console.log(`${path}  通し`);
}
await b.close();
