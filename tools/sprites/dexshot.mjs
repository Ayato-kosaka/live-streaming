/**
 * 図鑑の面の「1画面目」を、前と後で並べて撮るための道具。
 *
 * 住人のキャラクターと北欧の写真はこの箱のブラウザから届かないので、
 * `route.mjs` の `offline()` を通す。落としていないと22人が全員おなじ顔で写って、
 * 「絵が主役になったか」を見ても何も分からない。
 *
 *   SPORT=4140 node tools/sprites/dexshot.mjs /tmp/dex/before 390 844
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "fs";
import { offline } from "./route.mjs";

const SPORT = process.env.SPORT || "4140";
const out = process.argv[2] || "/tmp/dex/x";
const W = Number(process.argv[3] || 390);
const H = Number(process.argv[4] || 844);
const PAGES = (process.env.PAGES || "/friends,/now,/streams/cooking,/legends/iran-walk").split(",");
/** 面ぜんぶを1枚に撮るときは FULL=1。既定は1画面目だけ。 */
const FULL = process.env.FULL === "1";

mkdirSync(out, { recursive: true });
const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const ctx = await b.newContext({
  viewport: { width: W, height: H },
  isMobile: W < 700,
  hasTouch: W < 700,
  deviceScaleFactor: 2,
});
await offline(ctx);
const p = await ctx.newPage();
for (const path of PAGES) {
  await p.goto(`http://localhost:${SPORT}${path}.html`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await p.waitForTimeout(1400);
  const name = path.replace(/\//g, "_").replace(/^_/, "") || "top";
  await p.screenshot({ path: `${out}/${name}-${W}.png`, fullPage: FULL });
}
await b.close();
console.log("→", out);
