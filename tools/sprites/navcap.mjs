/**
 * **入れた上限（max-width）が、スマホでは1pxも効いていない**ことを見せる。
 *
 *   SPORT=5800 node navcap.mjs
 *
 * 「390 で1文字も変わっていない」を、前後の字数をつき合わせる以外にもう1本で
 * 押さえる。**上限より中身のほうが狭ければ、その規則はそこに何もしていない。**
 * 各要素の「実際に使われている幅」と「入れた上限」を並べて、
 * 上限に当たっているものがあれば挙げる。
 *
 * 逆に PC 幅（1440）では、当たっていなければ効いていないので、そちらも出す。
 */
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";

const SPORT = process.env.SPORT || "5800";
const WIDTHS = (process.env.W || "390,1440").split(",").map(Number);
const TARGETS = [
  ["/privacy", ".ppol"],
  ["/privacy", ".ppol .phead-lead"],
  ["/privacy", ".ppol .panel p"],
  ["/nordic/day/3", ".ndrs-lead"],
  ["/nordic/day/3", "p.nday-lead"],
  ["/nordic/day/3", ".nday-detour li"],
  ["/nordic/day/1", ".ndhh-l dd"],
  ["/nordic/day/2", "p.nday-note"],
  ["/kitchen/gyoza", ".ifoot-note"],
];

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
console.log("| 幅 | 面 | 部品 | 使われている幅 | 入れた上限 | 上限に当たっているか |");
console.log("| --- | --- | --- | ---: | ---: | --- |");
for (const W of WIDTHS) {
  const ctx = await b.newContext({
    viewport: { width: W, height: 900 },
    deviceScaleFactor: 1,
    isMobile: W < 900,
    hasTouch: W < 900,
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
  let last = null;
  for (const [path, sel] of TARGETS) {
    if (path !== last) {
      await p.goto(`http://localhost:${SPORT}${path === "/" ? "/index" : path}.html`, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
      await p.waitForTimeout(500);
      last = path;
    }
    const got = await p.evaluate((sel) => {
      const els = [...document.querySelectorAll(sel)];
      if (!els.length) return null;
      let maxw = 0, cap = "", hit = 0;
      for (const el of els) {
        const cs = getComputedStyle(el);
        const w = el.getBoundingClientRect().width;
        if (w > maxw) maxw = w;
        cap = cs.maxWidth;
        // 上限そのものに当たっている＝その規則が幅を決めている
        const mx = parseFloat(cs.maxWidth);
        if (!Number.isNaN(mx) && Math.abs(w - mx) < 1.5) hit++;
      }
      return { n: els.length, w: Math.round(maxw), cap, hit };
    }, sel);
    if (!got) { console.log(`| ${W} | ${path} | ${sel} | （無い） | | |`); continue; }
    console.log(
      `| ${W} | ${path} | ${sel} | ${got.w}px | ${got.cap} | ${got.hit ? `当たっている（${got.hit}/${got.n}）` : "当たっていない＝効いていない"} |`,
    );
  }
  await ctx.close();
}
await b.close();
