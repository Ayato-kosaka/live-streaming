/**
 * 横あふれだけを、7つの幅で全面ぶん数える。
 *
 *   SPORT=4141 node navover.mjs
 *
 * **ページが横に動くかどうかで見る**（`scrollWidth > clientWidth`）。
 * SVG の中の `<path>` を数えて「横あふれ20件」と誤報した前例があるので、
 * 数えるのは `documentElement` 1つだけにする（`docs/island-standards.md` 13）。
 */
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";
import { readFileSync } from "fs";

const SPORT = process.env.SPORT || "4141";
const WIDTHS = (process.env.W || "390,600,820,900,1200,1440,1920").split(",").map(Number);
const PAGES = readFileSync(process.env.LIST || "/tmp/pclen.txt", "utf8")
  .split("\n").map((x) => x.trim()).filter(Boolean);

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
for (const W of WIDTHS) {
  const ctx = await b.newContext({
    viewport: { width: W, height: 900 },
    deviceScaleFactor: 1,
    isMobile: W < 900,
    hasTouch: W < 900,
    reducedMotion: "reduce",
  });
  await offline(ctx);
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem("ayato-island-arrived", "2026-09-04");
      localStorage.setItem("ayato-island-walked", "1");
    } catch {}
  });
  const p = await ctx.newPage();
  const bad = [];
  for (const path of PAGES) {
    await p.goto(`http://localhost:${SPORT}${path === "/" ? "/index" : path}.html`, {
      waitUntil: "domcontentloaded", timeout: 60000,
    });
    await p.waitForTimeout(220);
    const over = await p.evaluate(() => {
      const de = document.documentElement;
      return de.scrollWidth - de.clientWidth;
    });
    if (over > 1) bad.push(`${path} +${over}px`);
  }
  console.log(`${W}px … ${PAGES.length}面中 横あふれ ${bad.length}件${bad.length ? "  " + bad.join(" / ") : ""}`);
  await ctx.close();
}
await b.close();
