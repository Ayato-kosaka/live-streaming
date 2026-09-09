/**
 * 面が縦にどこまで伸びているかを測る（#225）。
 *
 *   SPORT=4140 PAGES=/me,/board,/next ADMIN=0 \
 *   SEED=/home/user/live-streaming/tools/sprites/asme.mjs node tools/sprites/tallpage.mjs
 *
 * **いちばん下まで送ってから測る。** `content-visibility: auto` を持つ畳みは
 * 画面の外にいるあいだ `contain-intrinsic-size` の値で報告されるので、
 * 送らずに測ると本当の高さより 1,000px 以上短く出る（`CLAUDE.md`）。
 * ここでは高さが増えなくなるまで送りつづけ、止まってから読む。
 *
 * 面ぜんぶの高さと、`h2` を持つ節ごとの高さを出す。どの節が伸びているかが
 * 分からないと、「長い」を直しようがない。
 */
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";

const SPORT = process.env.SPORT || "4140";
const PAGES = (process.env.PAGES || "/me").split(",");
const W = Number(process.env.W || 390);
const H = Number(process.env.H || 844);

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const ctx = await b.newContext({
  viewport: { width: W, height: H },
  isMobile: W < 700,
  hasTouch: W < 700,
});
await offline(ctx);
if (process.env.SEED) {
  await (await import(process.env.SEED)).apply(ctx, { admin: process.env.ADMIN === "1" });
}
const p = await ctx.newPage();

for (const path of PAGES) {
  const url = `http://localhost:${SPORT}${path === "/" ? "/index" : path}.html`;
  await p.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  await p.waitForTimeout(1600);
  // 高さが増えなくなるまで送る。1周で止めると、送った先でまた伸びる面を取り逃がす
  const tall = await p.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    let last = 0;
    for (let round = 0; round < 8; round++) {
      for (let y = 0; y <= document.body.scrollHeight; y += 400) {
        window.scrollTo(0, y);
        await wait(30);
      }
      window.scrollTo(0, document.body.scrollHeight);
      await wait(250);
      const now = document.documentElement.scrollHeight;
      if (now === last) break;
      last = now;
    }
    window.scrollTo(0, 0);
    return last;
  });
  const parts = await p.evaluate(() =>
    [...document.querySelectorAll("main section, main details, main > div")]
      .map((el) => ({
        t: (el.querySelector("h2, summary") || el).textContent?.trim().slice(0, 22) ?? "",
        h: Math.round(el.getBoundingClientRect().height),
      }))
      .filter((x) => x.h > 40),
  );
  console.log(`\n${path}  ${tall}px  (${W}×${H})`);
  for (const x of parts) console.log(`   ${String(x.h).padStart(5)}px  ${x.t}`);
}
await b.close();
