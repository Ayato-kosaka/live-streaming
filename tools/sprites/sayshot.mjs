/**
 * 視聴者さんの字が出ている面を、**書き出したものから**撮る。
 *
 *   SPORT=5000 OUT=/tmp/say/before node tools/sprites/sayshot.mjs
 *
 * 撮るのは「その字の入っている箱だけ」と「面ぜんぶ」の2枚。
 * 面ぜんぶだけだと、直前と直後で1,000px 下にずれた字を見比べることになる。
 *
 * 幅は 360 と 390 の2つ。360 はこの島でいちばん狭い端末の幅で、
 * **横あふれが最初に出るのはここ。**
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "fs";
import { offline } from "./route.mjs";

const SPORT = process.env.SPORT || "5000";
const OUT = process.env.OUT || "/tmp/say/shot";
const BASE = `http://127.0.0.1:${SPORT}`;

/** 撮る面と、その面で「視聴者さんの字」を指す当たり。 */
const TARGETS = [
  { path: "/nordic/day/3.html", name: "day3", sel: ".ndsp.is-want" },
  { path: "/nordic/day/4.html", name: "day4", sel: ".ndsp.is-want" },
  { path: "/board.html", name: "board", sel: ".idea-body" },
  { path: "/about.html", name: "about", sel: ".avoice" },
];

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
  const page = await ctx.newPage();
  for (const t of TARGETS) {
    await page.goto(BASE + t.path, { waitUntil: "networkidle" });
    // 畳みは開いてから撮る。畳んだままだと、見せたい字が画面の外にいる
    for (const label of ["もっと見る", "ぜんぶ見る", "もっと"]) {
      for (const btn of await page.locator(`button:has-text("${label}")`).all()) {
        await btn.click({ timeout: 1500 }).catch(() => {});
      }
    }
    await page.waitForTimeout(400);
    // 横あふれは**いちばん下まで送ってから**見る（畳みは畳んだまま 68px と答える）
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 600) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 30));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(300);
    const over = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    console.log(`${t.name} ${w}px  scrollWidth=${over.scroll} clientWidth=${over.client} over=${over.scroll - over.client}`);
    await page.screenshot({ path: `${OUT}/${t.name}-${w}-full.png`, fullPage: true });
    const box = page.locator(t.sel).first();
    if (await box.count()) {
      await box.scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);
      await box.screenshot({ path: `${OUT}/${t.name}-${w}-box.png` }).catch(() => {});
    }
  }
  await ctx.close();
}
await b.close();
console.log("→", OUT);
