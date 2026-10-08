/**
 * **直した面を、自分の目で見るために撮る。**
 *
 *   PORT=4180 PAGES=/island/nordic/streams,/nordic/day/8 OUT=/tmp/tapshot node tools/sprites/tapshot.mjs
 *
 * 押しどころを直したときは、**当たりが広がったことと、絵が1pxも動いて
 * いないこと**の両方を見たい。数字（`hitbox.mjs`）は当たりしか言わない
 * ので、絵はここで撮る。
 *
 * `--tap-inline` のような「当たりだけ伸ばす」手当ては、**効いていても
 * 絵には出ない**（`position: relative` を足した回がそれ）。だから
 * **当たりの帯を赤く塗った1枚も一緒に撮る。** 塗らないと、撮った絵を
 * 並べても「直った」ことがどこにも写らない。
 *
 * 落ち先は `<OUT>/<面>.png`（素）と `<OUT>/<面>.hit.png`（当たりを塗ったもの）。
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { offline } from "./route.mjs";
import { openChecked, reportMissing } from "./served.mjs";
import { openFolds, SEL_ALL } from "./hitbox.mjs";

const PORT = process.env.PORT || "4180";
const PAGES = (process.env.PAGES || "/").split(",").filter(Boolean);
const OUT = process.env.OUT || "/tmp/tapshot";
const W = Number(process.env.W || 390);
const H = Number(process.env.H || 844);
const DPR = Number(process.env.DPR || 2);
/** 塗る札。既定は「当たりが怪しいもの」ではなく**渡した札だけ**（絞って見る） */
const SEL = process.env.SEL || ".chain-foot a,.chap-note a,.phead-go,.longer";

mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const ctx = await b.newContext({
  viewport: { width: W, height: H }, deviceScaleFactor: DPR,
  isMobile: W < 700, hasTouch: W < 700, reducedMotion: "reduce",
});
await offline(ctx);
if (process.env.SEED) await (await import(process.env.SEED)).apply(ctx);
await ctx.addInitScript(() => {
  try {
    localStorage.setItem("ayato-island-arrived", "2026-09-04");
    localStorage.setItem("ayato-island-walked", "1");
  } catch {}
});

const miss = [];
let shot = 0;
for (const path of PAGES) {
  const p = await ctx.newPage();
  const got = await openChecked(p, `http://localhost:${PORT}`, path, { miss, waitUntil: "networkidle", timeout: 60000 });
  if (!got.ok) { await p.close(); continue; }
  await p.waitForTimeout(1000);
  await openFolds(p);
  const nm = path.replace(/\//g, "_").replace(/^_$/, "top") || "top";
  // まず素の絵。**当たりを塗る前に撮る**（塗ったあとでは絵が変わる）
  const near = await p.evaluate((sel) => {
    const el = document.querySelector(sel.split(",")[0]) || document.querySelector(sel);
    if (el) el.scrollIntoView({ block: "center" });
    return !!el;
  }, SEL);
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${OUT}/${nm}.png` });
  // 当たりの帯を塗る。実寸は測らない（それは hitbox.mjs の仕事）。
  // ここは「どこを指が押せるのか」を目で見るためだけの上塗り
  const n = await p.evaluate(({ sel, selAll }) => {
    let k = 0;
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      const d = document.createElement("div");
      d.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;`
        + "outline:2px solid #e0245e;background:rgba(224,36,94,.18);z-index:2147483646;pointer-events:none";
      document.body.appendChild(d);
      k++;
    }
    void selAll;
    return k;
  }, { sel: SEL, selAll: SEL_ALL });
  await p.waitForTimeout(200);
  await p.screenshot({ path: `${OUT}/${nm}.hit.png` });
  console.log(`${path}  撮った（塗った札 ${n} 個${near ? "" : " / 札が1つも無い"}）`);
  shot++;
  await p.close();
}
await b.close();
console.log(`\n── 数えたもの`);
console.log(`  撮れた面 ${shot} / ${PAGES.length} → ${OUT}`);
if (miss.length) { reportMissing(miss); process.exit(2); }
if (!shot) { console.log("1面も撮れませんでした。数えるものがありません。"); process.exit(2); }
process.exit(0);
