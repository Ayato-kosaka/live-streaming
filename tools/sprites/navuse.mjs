/**
 * 部品が**実際に使っている幅**を、幅ごとに出す（`navcap.mjs` の対象を渡せる版）。
 *
 *   SPORT=4140 W=390,1440,1920 node navuse.mjs
 *
 * 入れる上限が 390px で1pxも効かないことを、入れる前に確かめるための道具。
 * `navcap.mjs` は対象が中に書いてあるので、こちらは面と部品を渡す形にした
 * （前の担当の測定が再現できなくなるので、あちらは書き換えていない）。
 */
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";
import { readFileSync } from "fs";

const SPORT = process.env.SPORT || "4140";
const WIDTHS = (process.env.W || "390,1440,1920").split(",").map(Number);
const SELS = (process.env.SEL || ".zk-lead|.panel p|.nwords p|.nwhy p|.phead-lead").split("|");
const PAGES = (process.env.PAGES ||
  readFileSync("/home/user/live-streaming/tools/sprites/pcpages.txt", "utf8")
    .split("\n").map((x) => x.trim()).filter(Boolean).join(",")).split(",");

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
console.log("| 幅 | 部品 | 数 | 使われている幅 いちばん広い | その面 | 入れた上限 | 上限に当たっている数 |");
console.log("| --- | --- | ---: | ---: | --- | ---: | --- |");
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
  const acc = new Map(SELS.map((s) => [s, { n: 0, w: 0, path: "", cap: "", hit: 0 }]));
  for (const path of PAGES) {
    await p.goto(`http://localhost:${SPORT}${path === "/" ? "/index" : path}.html`, {
      waitUntil: "domcontentloaded", timeout: 60000,
    });
    await p.waitForTimeout(250);
    const got = await p.evaluate((SELS) => {
      const out = {};
      for (const sel of SELS) {
        const els = [...document.querySelectorAll(sel)];
        let w = 0, cap = "", hit = 0;
        for (const el of els) {
          const cs = getComputedStyle(el);
          if (cs.display === "none") continue;
          const bw = el.getBoundingClientRect().width;
          if (bw > w) w = bw;
          cap = cs.maxWidth;
          const mx = parseFloat(cs.maxWidth);
          if (!Number.isNaN(mx) && Math.abs(bw - mx) < 1.5) hit++;
        }
        out[sel] = { n: els.length, w, cap, hit };
      }
      return out;
    }, SELS);
    for (const sel of SELS) {
      const a = acc.get(sel), g = got[sel];
      a.n += g.n;
      a.hit += g.hit;
      if (g.cap) a.cap = g.cap;
      if (g.w > a.w) { a.w = g.w; a.path = path; }
    }
  }
  for (const [sel, a] of acc)
    console.log(`| ${W} | \`${sel}\` | ${a.n} | ${Math.round(a.w)}px | ${a.path} | ${a.cap || "(なし)"} | ${a.hit ? `当たっている ${a.hit}件` : "**1件も当たっていない＝効いていない**"} |`);
  await ctx.close();
}
await b.close();
