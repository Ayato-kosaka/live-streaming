/**
 * **表紙を撮る。** 島の寄り／引き・「今日の島」の開閉・幅を渡して1枚ずつ。
 *
 *   SPORT=4400 OUT=/tmp/cover.png node tools/sprites/covershot.mjs
 *   SPORT=4400 WIDE=1 OPEN=1 W=1280 H=800 OUT=/tmp/c.png node covershot.mjs
 *
 * 島の上に何が乗っているか（板・案内・札）は、数だけ見ても分からない。
 * **出す前に自分の目で見る**（`docs/island-standards.md` 1章）ための道具。
 *
 * 住人の絵は先に落としておく（`python3 tools/sprites/avatars.py`）。
 * 落としていないと22人が全員おなじ顔で写って、並びを見ても何も分からない。
 */
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";

const SPORT = process.env.SPORT || "4400";
const W = Number(process.env.W || 390);
const H = Number(process.env.H || 844);
const OPEN = process.env.OPEN === "1";
const WIDE = process.env.WIDE === "1";
const FULL = process.env.FULL === "1";
const OUT = process.env.OUT || "/tmp/cover.png";
const PATHNAME = process.env.PATHNAME || "/index.html";

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
await offline(ctx);
const pg = await ctx.newPage();
await pg.goto(`http://127.0.0.1:${SPORT}${PATHNAME}`, { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
await pg.waitForTimeout(2500);
if (WIDE) {
  await pg.click(".isle-view").catch(() => {});
  await pg.waitForTimeout(2200);
}
// 住人が喋っていると、島の上が吹き出しで埋まる。先に閉じる
if (await pg.$(".isle.is-talking")) {
  await pg.mouse.click(4, 4).catch(() => {});
  await pg.waitForTimeout(400);
}
if (OPEN !== (await pg.evaluate(() => !!document.querySelector(".today.is-open")))) {
  await pg.click(".today-tab").catch(() => {});
  await pg.waitForTimeout(800);
}
/* **島を止めてから撮る。** 住人は rAF で歩くので、CSS の animation を
   止めるだけでは止まらない（`docs/island-standards.md`「文字の濃さは…」）。 */
await pg.evaluate(() => {
  window.requestAnimationFrame = () => 0;
});
await pg.waitForTimeout(200);
await pg.screenshot({ path: OUT, fullPage: FULL });
console.log(
  OUT,
  "cam=" + (await pg.evaluate(() => document.querySelector(".isle")?.getAttribute("data-cam"))),
  "今日の板=" + ((await pg.evaluate(() => !!document.querySelector(".today.is-open"))) ? "開" : "閉"),
);
await b.close();
