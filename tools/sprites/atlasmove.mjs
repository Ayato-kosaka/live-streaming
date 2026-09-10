/** 島を切り替えている途中と、渡る舟が出ている途中を撮る。 */
import { chromium } from "playwright-core";
import { mkdirSync } from "fs";
import { offline } from "./route.mjs";
const SPORT = process.env.SPORT || "4340";
const OUT = "/tmp/atlas";
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });

for (const [tag, opt] of [
  ["sp", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 }],
  ["pc", { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }],
  ["reduce", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, reducedMotion: "reduce" }],
]) {
  const ctx = await b.newContext(opt);
  await offline(ctx, { photo: "/home/user/atlas-wt/tools/sprites/photo-480.jpg" });
  const p = await ctx.newPage();
  await p.goto(`http://localhost:${SPORT}/atlas.html`, { waitUntil: "load" });
  await p.waitForTimeout(1600);
  // 切り替えの途中
  await p.click(".atl-arm.is-right");
  await p.waitForTimeout(190);
  await p.screenshot({ path: `${OUT}/${tag}-move.png` });
  await p.waitForTimeout(1200);
  await p.screenshot({ path: `${OUT}/${tag}-after.png` });
  // 渡る舟
  await p.click(".atl-tag");
  await p.waitForTimeout(330);
  await p.screenshot({ path: `${OUT}/${tag}-sail.png` });
  await ctx.close();
}
await b.close();
console.log("ok");
