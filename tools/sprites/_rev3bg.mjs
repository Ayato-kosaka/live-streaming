/**
 * 字を透明にしてから同じ枠を撮る。残った画素が「本当の地」。
 * 大きい太字は、字そのものが最頻色になってしまって地を取り違えるので、この形で測る。
 */
import { chromium } from "playwright-core";
import { writeFileSync, mkdirSync } from "fs";
import { offline } from "./route.mjs";
const PORT = process.env.PORT || "3041";
const TARGETS = JSON.parse(process.env.TARGETS);
const DIR = "/tmp/r3/bg";
mkdirSync(DIR, { recursive: true });
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await offline(ctx);
await ctx.addInitScript(() => { try { localStorage.setItem("ayato-island-arrived", "1"); } catch (e) {} });
const p = await ctx.newPage();
const meta = []; let n = 0;
for (const [path, sels] of Object.entries(TARGETS)) {
  await p.goto(`http://localhost:${PORT}` + path, { waitUntil: "domcontentloaded", timeout: 120000 });
  await p.waitForTimeout(2600);
  for (const sel of sels) {
    const els = await p.$$(sel);
    if (!els.length) { meta.push({ path, sel, note: "無い" }); continue; }
    const el = els[0];
    try {
      const info = await el.evaluate((x) => { const cs = getComputedStyle(x); return { fs: parseFloat(cs.fontSize), col: cs.color, t: (x.textContent || "").trim().slice(0, 22) }; });
      try { await el.scrollIntoViewIfNeeded({ timeout: 4000 }); } catch (e) {}
      const box = await el.boundingBox();
      if (!box) throw new Error("box無し");
      await el.evaluate((x) => { x.dataset.oldc = x.style.color; x.style.setProperty("color", "transparent", "important"); x.style.setProperty("text-shadow", "none", "important"); });
      const f = `${DIR}/${String(++n).padStart(3, "0")}.png`;
      await p.screenshot({ path: f, clip: box, animations: "disabled", timeout: 10000 });
      await el.evaluate((x) => { x.style.removeProperty("color"); x.style.removeProperty("text-shadow"); });
      meta.push({ path, sel, file: f, w: Math.round(box.width), h: Math.round(box.height), ...info });
    } catch (e) { meta.push({ path, sel, note: "撮れず " + String(e).slice(0, 40) }); }
  }
}
await b.close();
writeFileSync("/tmp/r3/px.json", JSON.stringify(meta, null, 1));
console.log("撮った:", n);
