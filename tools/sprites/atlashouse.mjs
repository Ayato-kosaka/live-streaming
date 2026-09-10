/**
 * 建設中の家と、できあがった家の**寸法を突き合わせる。**
 *
 *   SPORT=4340 node atlashouse.mjs
 *
 * 「50%が100%より大きい」を目で気づけなかったので、数で出す
 * （`docs/island-misses.md` #10）。SVG のユーザ単位でそのまま比べる。
 */
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";
const SPORT = process.env.SPORT || "4340";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
for (const [tag, yen] of [["frame", 6000], ["walls", 30000], ["done", 52000]]) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await offline(ctx, { photo: "/home/user/atlas-wt/tools/sprites/photo-480.jpg" });
  await ctx.route(/\/island-api\/fund/, (r) =>
    r.fulfill({ contentType: "application/json", body: JSON.stringify({ total: yen, given: yen, targetAmount: 50000, people: 12 }) }),
  );
  const p = await ctx.newPage();
  await p.goto(`http://localhost:${SPORT}/atlas.html`, { waitUntil: "load" });
  await p.waitForTimeout(1400);
  await p.evaluate(() => {
    const el = [...document.querySelectorAll(".atl-pin")].find((x) => x.getAttribute("aria-label") === "北欧周遊を見る");
    el?.click();
  });
  await p.waitForTimeout(900);
  const r = await p.evaluate(() => {
    const svg = document.querySelector(".atl-isle.is-at .dio");
    const g = svg?.querySelector(".dio-house");
    const img = svg?.querySelector("image[href*='hut-home']");
    const bb = (e) => { const k = e.getBBox(); return { x: +k.x.toFixed(1), y: +k.y.toFixed(1), w: +k.width.toFixed(1), h: +k.height.toFixed(1) }; };
    return { build: g ? bb(g) : null, hut: img ? bb(img) : null };
  });
  console.log(tag, JSON.stringify(r));
  await ctx.close();
}
await b.close();
