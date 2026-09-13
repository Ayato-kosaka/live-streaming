/**
 * ログインが要る面（`/me` の付箋と、あやとの「返す」欄）を絵で見る。
 *
 *   SPORT=5000 OUT=/tmp/say/after node tools/sprites/sayme.mjs
 *
 * `/me` は入った人にしか出ない。**一度も絵で見ないまま「全面を見た」と
 * 言わない**（`docs/island-misses.md` #77）。`asme.mjs` が「前に入った人」の
 * 控えを置いてくれるので、そこから先は本番と同じ道を通る。
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "fs";
import { offline } from "./route.mjs";
import { apply } from "./asme.mjs";

const SPORT = process.env.SPORT || "5000";
const OUT = process.env.OUT || "/tmp/say/me";
mkdirSync(OUT, { recursive: true });

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
for (const w of [360, 390]) {
  const ctx = await b.newContext({
    viewport: { width: w, height: 900 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  await offline(ctx);
  await apply(ctx);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("PAGEERROR", String(e).slice(0, 200)));
  await page.goto(`http://127.0.0.1:${SPORT}/me.html`, { waitUntil: "networkidle" });
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 500) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 60));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(1800);
  const o = await page.evaluate(() => ({
    s: document.documentElement.scrollWidth,
    c: document.documentElement.clientWidth,
    n: document.querySelectorAll(".mp-note-text, .mp-care-text, .mp-reply").length,
  }));
  console.log(`me ${w}px  付箋 ${o.n} 個  scrollWidth=${o.s} clientWidth=${o.c} over=${o.s - o.c}`);
  await page.screenshot({ path: `${OUT}/me-${w}-full.png`, fullPage: true });
  const box = page.locator(".mp-notes li").first();
  if (await box.count()) {
    await box.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await box.screenshot({ path: `${OUT}/me-${w}-box.png` });
  }
  await ctx.close();
}
await b.close();
console.log("→", OUT);
