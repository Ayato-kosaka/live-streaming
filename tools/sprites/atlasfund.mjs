/**
 * 次の島の建ちぐあい（更地→鉄筋→壁と屋根→完成）を4枚撮る。
 *
 *   SPORT=4340 node atlasfund.mjs
 *
 * 足代は `/island-api/fund` から読む。この箱からは出られないので、
 * **本番と同じ形の答えを差し込む**（`docs/island-misses.md` 決めごと2）。
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "fs";
import { offline } from "./route.mjs";
const SPORT = process.env.SPORT || "4340";
const OUT = "/tmp/atlas";
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
for (const [tag, yen] of [["bare", 0], ["frame", 6000], ["walls", 30000], ["done", 52000]]) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
  await offline(ctx, { photo: "/home/user/atlas-wt/tools/sprites/photo-480.jpg" });
  if (yen > 0)
    await ctx.route(/\/island-api\/fund/, (r) =>
      r.fulfill({ contentType: "application/json", body: JSON.stringify({ total: yen, given: yen, targetAmount: 50000, people: 12 }) }),
    );
  const p = await ctx.newPage();
  await p.goto(`http://localhost:${SPORT}/atlas.html`, { waitUntil: "load" });
  await p.waitForTimeout(1500);
  await p.evaluate(() => {
    const el = [...document.querySelectorAll(".atl-pin")].find((x) => x.getAttribute("aria-label") === "北欧周遊を見る");
    el?.click();
  });
  await p.waitForTimeout(1200);
  await p.screenshot({ path: `${OUT}/fund-${tag}.png` });
  await ctx.close();
}
await b.close();
console.log("ok");
