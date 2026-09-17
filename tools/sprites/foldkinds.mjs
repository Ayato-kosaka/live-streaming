/**
 * **`<details>` ではない畳みが、島にいくつあるか**を数える。
 *
 *   SPORT=4270 DIST=site/.next-3270 node tools/sprites/foldkinds.mjs
 *   SPORT=4270 PAGES=/,/board node tools/sprites/foldkinds.mjs
 *
 * ## なぜ要るか
 *
 * 押しどころを測る道具は 2026-09-14 に「閉じた `<details>` を開いてから測る」に
 * 直した。**`<details>` の穴は塞がったが、同じ穴の別の形が残っている。**
 * 島の畳みは3通りある。
 *
 *   1. `<details>` … `components/ui/Fold.tsx`。**開ける。測れる**
 *   2. `hidden` 属性 / `display:none` で開け閉め … `Today.tsx` の `.today-fold`、
 *      `Board.tsx` の `.bd-pane`。**中身は DOM にいる。開けば測れる**
 *   3. 押すまで DOM に無い（条件で描かない）… **開けない。DOM を見ても数に出ない**
 *
 * ここが数えるのは 1 と 2。**3 は DOM からは見えない**ので、ここの数は
 * 「島の畳みの全部」ではない。3 は元のコードを読んで数える（報告に書く）。
 *
 * ## 数えたからといって、開いて測ってよいとは限らない
 *
 * 2 には**畳み**（押すと下に伸びる。`.today-fold`）と**札**（同時に1つしか
 * 出ない。`.bd-pane` `.mp-tab`）が混ざっている。札を全部いっぺんに開くと、
 * **どの視聴者さんも見ない姿**ができあがる。そこで測った 48px は別の嘘になる
 * （`docs/island-misses.md` #13「測る仕掛けが、測る対象を変えている」）。
 * だから**札は、本物の押しどころを1つずつ押して測る**（`mesweep.mjs` の
 * 場面表がそれ）。ここは「どちらなのか」まで出す。
 */
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";
import { mkdirSync, writeFileSync } from "fs";
import { collect, banner, tally } from "./pages.mjs";
import { SEL_ALL } from "./hitbox.mjs";

const SPORT = process.env.SPORT || "4270";
const OUT = process.env.OUT || "/tmp/foldkinds";
const WIDTHS = (process.env.WIDTHS || "390x844,1280x800").split(",").map((s) => s.split("x").map(Number));
const C = collect();

/** 面の中で数える。**外の変数は使えない** */
const COUNT = (SEL) => {
  const nm = (e) =>
    e.tagName.toLowerCase() +
    (e.className && typeof e.className === "string" && e.className.trim()
      ? "." + e.className.trim().split(/\s+/).join(".")
      : "") +
    (e.id ? "#" + e.id : "");

  /* 隠れている入れ物のうち、**いちばん外側**だけを数える。
     入れ子のぶんまで数えると、1つの畳みが中身の数だけ増える。 */
  const hiddenTop = [];
  const walk = (el) => {
    for (const c of el.children) {
      const cs = getComputedStyle(c);
      const off = cs.display === "none" || c.hasAttribute("hidden");
      if (off) {
        // 中に押しどころがあるものだけ「畳み」とみなす。
        // 飾りだけの display:none（印の出し分けなど）は畳みではない
        const taps = c.querySelectorAll(SEL).length;
        if (taps) hiddenTop.push({ what: nm(c), taps, attr: c.hasAttribute("hidden") ? "hidden属性" : "display:none" });
        continue; // 中はこれ以上たどらない（いちばん外側だけ）
      }
      walk(c);
    }
  };
  walk(document.body);

  /* **畳みと札を、印で分ける。**
       `aria-expanded="false"` … 押すと下が開く**畳み**。押せば開く
       `role="tab"` / `aria-selected`  … 同時に1つしか出ない**札**。
                                         全部いっぺんに開くと、誰も見ない姿になる */
  const expandable = [...document.querySelectorAll('[aria-expanded]')].map((e) => ({
    what: nm(e), open: e.getAttribute("aria-expanded") === "true",
  }));
  const tabs = document.querySelectorAll('[role="tab"],[aria-selected]').length;

  const det = document.querySelectorAll("details");
  return {
    details: det.length,
    detailsClosed: [...det].filter((d) => !d.open).length,
    hidden: hiddenTop,
    expandable,
    tabs,
  };
};

mkdirSync(OUT, { recursive: true });
console.log(banner(C) + "\n");
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const byWidth = new Map();
for (const [W, H] of WIDTHS) {
  const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, isMobile: W < 900, hasTouch: W < 900, reducedMotion: "reduce" });
  await offline(ctx);
  await ctx.addInitScript(() => {
    try { localStorage.setItem("ayato-island-arrived", "2026-09-04"); localStorage.setItem("ayato-island-walked", "1"); } catch {}
  });
  const p = await ctx.newPage();
  const rows = [];
  for (const path of C.pages) {
    try {
      await p.goto(`http://localhost:${SPORT}${path === "/" ? "/index" : path}.html`, { waitUntil: "domcontentloaded", timeout: 60000 });
    } catch {
      rows.push({ path, measured: false });
      continue;
    }
    await p.waitForTimeout(600);
    await p.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 25)); }
      window.scrollTo(0, 0);
    });
    await p.waitForTimeout(300);
    const got = await p.evaluate(COUNT, SEL_ALL);
    rows.push({ path, measured: true, ...got });
  }
  byWidth.set(W, rows);
  await ctx.close();
}
await b.close();
writeFileSync(`${OUT}/report.json`, JSON.stringify([...byWidth], null, 1));

for (const [W, rows] of byWidth) {
  const ok = rows.filter((r) => r.measured);
  const sum = (f) => ok.reduce((a, r) => a + f(r), 0);
  const kinds = new Map();
  for (const r of ok) for (const h of r.hidden) {
    const k = `${h.what}  (${h.attr})`;
    const v = kinds.get(k) || { n: 0, taps: 0, pages: new Set() };
    v.n++; v.taps += h.taps; v.pages.add(r.path);
    kinds.set(k, v);
  }
  console.log(`\n幅 ${W}: ${tally(C, ok.length)}`);
  console.log(`  <details> ${sum((r) => r.details)}個（うち閉じている ${sum((r) => r.detailsClosed)}個）  ← いまの道具が開いて測っているぶん`);
  /* **「隠れている」と「畳んである」は違う。**
     `hidden` 属性は JS が開け閉めしている印（`Today.tsx` の `.today-fold`、
     `Board.tsx` の `.bd-pane`）。素の `display:none` は、その多くが
     **幅での出し分け**（看板の `nav.ih-nav` は PC でだけ出す）で、
     狭い画面には開く道具そのものが無い。開ける畳みではないので、
     一緒に数えると「測っていない押しどころが 749個ある」ように見える。 */
  const byAttr = (k) => ok.reduce((a, r) => a + r.hidden.filter((h) => h.attr === k).length, 0);
  const tapsBy = (k) => ok.reduce((a, r) => a + r.hidden.filter((h) => h.attr === k).reduce((b, h) => b + h.taps, 0), 0);
  console.log(
    `  <details> ではない畳み: JS が開け閉めするもの（hidden属性）${byAttr("hidden属性")}個 / 中の押しどころ ${tapsBy("hidden属性")}個`,
  );
  console.log(
    `                          素の display:none ${byAttr("display:none")}個 / 中の押しどころ ${tapsBy("display:none")}個` +
      `  ← 多くは幅での出し分け。狭い画面には開く道具が無い`,
  );
  const exp = ok.flatMap((r) => r.expandable);
  console.log(`  押すと開く畳み（aria-expanded）${exp.length}個（うち閉じている ${exp.filter((e) => !e.open).length}個）  ← 本物の押しどころを押せば開く`);
  console.log(`  札（role=tab / aria-selected）${sum((r) => r.tabs)}個  ← いっぺんに開くと、誰も見ない姿になる。1枚ずつ押して測るしかない`);
  console.log(`  内訳:`);
  for (const [k, v] of [...kinds].sort((a, b) => b[1].n - a[1].n))
    console.log(`    ${String(v.n).padStart(4)}個  押しどころ ${String(v.taps).padStart(4)}個  ${k}  （${v.pages.size}面）`);
  if (!kinds.size) console.log("    （なし）");
}
