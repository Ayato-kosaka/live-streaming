/**
 * 読む字の行の長さを直す前後を、同じ条件で撮る。
 *
 *   SPORT=4140 TAG=before node tools/sprites/lenshot.mjs
 *
 * **数字を結論にする前に、絵を1枚見る**（`docs/island-misses.md` #78 追記）。
 * 「45ch を超えている」は測定で、「だから読みにくい」は別の話。
 *
 * 足元の砂浜（`is-here` の札）だけは**拡大して**撮る。平らな札の字が
 * 読めるかどうかは、面ぜんぶの絵では分からない。
 */
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";
import { mkdirSync } from "fs";

const SPORT = process.env.SPORT || "4140";
const TAG = process.env.TAG || "before";
const OUT = "/tmp/lenreport";
mkdirSync(OUT, { recursive: true });

/** [出す名前, 面, 幅] */
const SHOTS = [
  ["about", "/about", 1440],
  ["nordic", "/nordic", 1440],
  ["legend", "/legends/iwashi-festival", 1440],
  ["stream", "/streams/cooking", 1440],
  ["day7", "/nordic/day/7", 1440],
];

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
for (const [name, path, W] of SHOTS) {
  const ctx = await b.newContext({
    viewport: { width: W, height: 1000 },
    deviceScaleFactor: 2,
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
  await p.goto(`http://localhost:${SPORT}${path}.html`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await p.waitForTimeout(900);
  /* **畳みを開けない。** 開けた絵を撮ったら `/nordic` の「会いに行く理由」が
     中身の無い空箱になった。測るほう（`navch.mjs`）も畳んだままで測っている
     ので、撮るほうも同じ姿にする。ここは「読む人が最初に見る絵」を見るための
     道具で、畳みの中は測りの表が受け持つ。 */
  await p.evaluate(async () => {
    const h = document.body.scrollHeight;
    for (let i = 0, y = 0; i < 120 && y < h; i++, y += 700) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 30));
    }
    window.scrollTo(0, 0);
  });
  // 島は rAF で動く。2枚を見比べるので止めてから撮る
  await p.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await p.waitForTimeout(600);
  await p.screenshot({ path: `${OUT}/${name}-${TAG}.png`, fullPage: true });
  console.log(`${name}-${TAG}.png`);
  await ctx.close();
}

/* 足元の砂浜だけ、拡大して撮る。`is-here` の札が写るように、
   その札を画面の真ん中へ送ってから、その周りだけを切り出す。 */
{
  const ctx = await b.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 3,
    reducedMotion: "reduce",
  });
  await offline(ctx);
  const p = await ctx.newPage();
  await p.goto(`http://localhost:${SPORT}/about.html`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await p.waitForTimeout(900);
  await p.evaluate(() => {
    document.querySelector(".ifoot-door.is-here")?.scrollIntoView({ block: "center" });
    window.requestAnimationFrame = () => 0;
  });
  await p.waitForTimeout(600);
  const box = await p.evaluate(() => {
    const el = document.querySelector(".ifoot-doors");
    const r = el.getBoundingClientRect();
    return { x: Math.max(0, r.x - 20), y: Math.max(0, r.y - 20), width: r.width + 40, height: r.height + 40 };
  });
  await p.screenshot({ path: `${OUT}/sand-${TAG}.png`, clip: box });
  console.log(`sand-${TAG}.png`);
  await ctx.close();
}
await b.close();
