/**
 * 全部の面をまわって、**焼いてある画素より大きく描かれているスプライト**を数える。
 *
 * 「まだ焼けていない絵」は目で探すものではない。引き伸ばしているところが、
 * そのまま「もう1枚大きいのが要るところ」になる。
 *   SPORT=4171 node _stretchall.mjs
 */
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";
const SPORT = process.env.SPORT || "4171";
const PAGES = (process.env.PAGES || "/,/about,/friends,/streams,/streams/cooking,/streams/walk,/streams/making,/streams/meeting,/streams/monthly,/kitchen,/kitchen/tamagoyaki,/legends,/legends/iran-walk,/apps,/apps/nanitabeyo,/now,/next,/board,/map,/map/georgia,/atlas,/nordic,/nordic/guide,/design").split(",");
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const worst = new Map();
for (const [W, H] of [[390, 844], [1440, 900]]) {
  const ctx = await b.newContext({ viewport: { width: W, height: H }, isMobile: W < 700, hasTouch: W < 700, deviceScaleFactor: 2 });
  await offline(ctx);
  const p = await ctx.newPage();
  for (const path of PAGES) {
    await p.goto(`http://localhost:${SPORT}${path === "/" ? "/index" : path}.html`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await p.waitForTimeout(1500);
    await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 50)); } });
    await p.waitForTimeout(1200);
    const rows = await p.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll("img")) {
        const src = el.currentSrc || el.src;
        if (!/\/sprites\//.test(src) || !el.naturalWidth) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 2) continue;
        const cs = getComputedStyle(el);
        let dw = r.width;
        if (cs.objectFit === "contain") dw = el.naturalWidth * Math.min(r.width / el.naturalWidth, r.height / el.naturalHeight);
        out.push({ src: src.split("/sprites/")[1], k: +(dw * devicePixelRatio / el.naturalWidth).toFixed(2), css: Math.round(dw) });
      }
      return out;
    });
    for (const r of rows) {
      const cur = worst.get(r.src);
      if (!cur || r.k > cur.k) worst.set(r.src, { ...r, page: path, W });
    }
  }
  await ctx.close();
}
await b.close();
const list = [...worst.values()].filter((x) => x.k > 1.0).sort((a, b2) => b2.k - a.k);
console.log("| 絵 | 何倍に伸ばしているか | 出ている大きさ | いちばん伸びる面 |");
console.log("| --- | --- | --- | --- |");
for (const x of list) console.log(`| ${x.src} | ${x.k} | ${x.css}px | ${x.page} (${x.W}) |`);
console.log(`\n引き伸ばしている絵 ${list.length} 種 / 出ている絵 ${worst.size} 種`);
