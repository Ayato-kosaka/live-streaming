/**
 * 島の地図（/atlas）の模型を撮る。
 *
 *   SPORT=4340 node atlasshot.mjs
 *
 * `PICK` に章の slug を並べると、その島を順に出して1枚ずつ撮る。
 * 矢印を押して切り替えるので、**切り替えたあとの絵**が撮れる。
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "fs";
import { offline } from "./route.mjs";

const SPORT = process.env.SPORT || "4340";
const BASE = `http://localhost:${SPORT}`;
const OUT = process.env.OUT || "/tmp/atlas";
const PICK = (process.env.PICK || "caucasus,europe,middle-east,nordic,iran-walk").split(",");

mkdirSync(OUT, { recursive: true });

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});

for (const wide of [false, true]) {
  const ctx = await b.newContext(
    wide
      ? { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }
      : { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 },
  );
  await offline(ctx, { photo: "/home/user/atlas-wt/tools/sprites/photo-480.jpg" });
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  await p.goto(`${BASE}/atlas.html`, { waitUntil: "load", timeout: 60000 });
  await p.waitForTimeout(1800);
  const tag = wide ? "pc" : "sp";

  for (const slug of PICK) {
    // 航路の丸から選ぶ。矢印より確実で、枝の島にも一発で行ける
    const name = await p.evaluate((s) => {
      const el = document.querySelector(`.atl-pin[aria-label]`);
      return el ? true : false;
    }, slug);
    await p.evaluate((s) => {
      const map = {
        europe: "ヨーロッパ周遊",
        "middle-east": "中東周遊",
        caucasus: "コーカサス周遊",
        "iran-walk": "イランまで歩く",
        nordic: "北欧周遊",
      };
      const b = [...document.querySelectorAll(".atl-pin")].find(
        (x) => x.getAttribute("aria-label") === `${map[s]}を見る`,
      );
      b?.click();
    }, slug);
    await p.waitForTimeout(1100);
    await p.screenshot({ path: `${OUT}/${tag}-${slug}.png` });
  }

  // 面ぜんぶ（紙のところまで）
  await p.screenshot({ path: `${OUT}/${tag}-full.png`, fullPage: true });
  if (errs.length) console.log(tag, "JSエラー", errs);
  await ctx.close();
}
await b.close();
console.log("撮った:", OUT);
