/**
 * 図鑑のマスを、**厚みを付けたまま／外したあと**の2枚で撮って並べる。
 *
 * `docs/island-design.md` 3-3 の例外——「一面に並ぶマスが全部押せるときは
 * 1枚ずつに厚みを付けない」——を当てたのが正しいかは、**並べないと見えない。**
 * 面ぜんぶの絵を2つ出しても、マスは1枚 96px なので差が読めない。
 * ここは棚だけを切り出して、左右に並べる。
 *
 * 2枚とも**同じ書き出し**から撮る。片方だけ古いビルドで撮ると、
 * 他の担当の直しが混ざって「厚み以外も変わった絵」になる。
 * 厚みのほうを**その場で差し戻して**撮る。
 *
 *   SPORT=4900 node tools/sprites/chpop.mjs
 *
 * 出るもの: /tmp/chpop/grid-{was,now}.png と、並べた grid-cmp.png
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "fs";
import { seed } from "./meseed.mjs";
import { offline } from "./route.mjs";

const PORT = process.env.SPORT || "4900";
const W = Number(process.env.W || 390);
const OUT = "/tmp/chpop";
mkdirSync(OUT, { recursive: true });

/** 外す前の厚み（`site/app/me/me.css` の元の `.ch-cell`）。 */
const WAS = `
.ch-cell {
  box-shadow: inset 0 1.5px 0 rgba(255,255,255,0.8),
              0 4px 0 color-mix(in srgb, var(--frame) 62%, var(--frame-dark)) !important;
}`;

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});

for (const [tag, css] of [["was", WAS], ["now", null]]) {
  const ctx = await b.newContext({
    viewport: { width: W, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    reducedMotion: "reduce",
  });
  await seed(ctx, { admin: true, mode: "ok" });
  await offline(ctx).catch(() => {});
  const p = await ctx.newPage();
  await p.goto(`http://localhost:${PORT}/me/desk.html`, { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(1400);
  await p.locator(".mp-tab", { hasText: /^キャラ/ }).first().click({ timeout: 5000 }).catch(() => {});
  await p.waitForTimeout(1400);
  if (css) await p.addStyleTag({ content: css });
  await p.waitForTimeout(400);
  /* 棚だけを切り出す。**さがす欄から畳みまで**入れる（棚の中に押せない
     ものが混ざっていないかも、この1枚で見える） */
  const box = await p.evaluate(() => {
    const a = document.querySelector(".ch-top");
    const z = document.querySelector(".longer") ?? document.querySelector(".ch-grid");
    const ra = a.getBoundingClientRect();
    const rz = z.getBoundingClientRect();
    return {
      x: Math.max(0, ra.x - 8),
      y: ra.y + window.scrollY - 8,
      width: Math.min(innerWidth, ra.width + 16),
      height: rz.bottom + window.scrollY - (ra.y + window.scrollY) + 16,
    };
  });
  await p.screenshot({ path: `${OUT}/grid-${tag}.png`, clip: box });
  console.log(`${OUT}/grid-${tag}.png`);
  await ctx.close();
}
await b.close();
