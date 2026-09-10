/**
 * 「◯◯で見たいもの」の段を撮る。
 *
 *   SPORT=4506 OUT=/tmp/want/after node tools/sprites/wantshot.mjs
 *
 * **北欧の写真を1枚に潰さない。** `route.mjs` の `offline()` は
 * upload.wikimedia.org をまとめて `og.png` に差し替えるので、見どころが
 * 何件並んでも全部おなじ絵で写る。それでは「写真の付いた一覧」を見ても
 * 並びの良し悪しが分からない（住人を ayato.png に潰していたのと同じ失敗）。
 *
 * ここは URL ごとに落としてある本物を返す。先に落としておく:
 *
 *   python3 tools/sprites/wikiphotos.py
 *
 * 落ちていないものだけ `offline()` の1枚に落ちる。
 */
import { createHash } from "crypto";
import { existsSync, mkdirSync } from "fs";
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";

const SPORT = process.env.SPORT || "4506";
const OUT = process.env.OUT || "/tmp/want";
const W = Number(process.env.W || 390);
const PAGES = (process.env.PAGES || "/nordic/day/1").split(",");
const PHOTOS = "/tmp/wiki";

mkdirSync(OUT, { recursive: true });

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const ctx = await b.newContext({
  viewport: { width: W, height: 900 },
  deviceScaleFactor: 2,
  isMobile: W < 700,
  hasTouch: W < 700,
});
await offline(ctx);
// **`offline()` より後に登録する。** Playwright は後から登録した route を先に当てる
await ctx.route(/upload\.wikimedia\.org/, (r) => {
  const key = createHash("sha1").update(r.request().url()).digest("hex");
  const local = `${PHOTOS}/${key}.img`;
  if (existsSync(local)) r.fulfill({ path: local });
  else r.fallback();
});

const p = await ctx.newPage();
for (const path of PAGES) {
  const url = `http://localhost:${SPORT}${path}.html`;
  await p.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  await p.waitForTimeout(600);
  // 下まで送ってから撮る。畳み（`content-visibility`）は画面の外だと背を偽る
  await p.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    for (let y = 0; y <= document.body.scrollHeight; y += 400) {
      window.scrollTo(0, y);
      await wait(20);
    }
    window.scrollTo(0, 0);
    await wait(200);
  });
  const secs = await p.$$('section[id^="want-"]');
  const name = path.replace(/\//g, "-").replace(/^-/, "");
  for (const [i, s] of secs.entries()) {
    await s.scrollIntoViewIfNeeded();
    await p.waitForTimeout(400);
    const file = `${OUT}/${name}${secs.length > 1 ? `-${i + 1}` : ""}.png`;
    await s.screenshot({ path: file });
    const h = Math.round((await s.boundingBox()).height);
    console.log(`${file}  ${h}px`);
  }
}
await b.close();
