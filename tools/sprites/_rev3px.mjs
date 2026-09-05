/** 要素を1つずつ撮って /tmp/r3/px に置く。比の計算は _rev3px.py が画素からやる。 */
import { chromium } from "playwright-core";
import { writeFileSync, mkdirSync } from "fs";
import { offline } from "./route.mjs";

const PORT = process.env.PORT || "3041";
const BASE = `http://localhost:${PORT}`;
const TARGETS = JSON.parse(process.env.TARGETS);
const DIR = "/tmp/r3/px";
mkdirSync(DIR, { recursive: true });

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await offline(ctx);
await ctx.addInitScript(() => { try { localStorage.setItem("ayato-island-arrived", "1"); } catch (e) {} });
const p = await ctx.newPage();
const meta = [];
let n = 0;
for (const [path, sels] of Object.entries(TARGETS)) {
  await p.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 120000 });
  await p.waitForTimeout(2600);
  for (const sel of sels) {
    const els = await p.$$(sel);
    if (!els.length) { meta.push({ path, sel, note: "無い" }); continue; }
    for (const el of els.slice(0, 1)) {
      const f = `${DIR}/${String(++n).padStart(3, "0")}.png`;
      let info;
      try {
        info = await el.evaluate((x) => { const cs = getComputedStyle(x); const r = x.getBoundingClientRect(); return { fs: parseFloat(cs.fontSize), col: cs.color, bgc: cs.backgroundColor, w: Math.round(r.width), h: Math.round(r.height), t: (x.textContent || "").trim().slice(0, 24) }; });
        await el.scrollIntoViewIfNeeded({ timeout: 5000 });
        await el.screenshot({ path: f, animations: "disabled", timeout: 8000 });
      } catch (e) { meta.push({ path, sel, note: "撮れず " + String(e).slice(0, 40) }); continue; }
      meta.push({ path, sel, file: f, ...info });
    }
  }
}
await b.close();
writeFileSync("/tmp/r3/px.json", JSON.stringify(meta, null, 1));
console.log("撮った:", n);
