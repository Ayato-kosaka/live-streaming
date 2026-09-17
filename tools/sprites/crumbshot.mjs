/**
 * パンくずを撮る。直す前（旧の値に差し戻す）と、直したあとを並べる。
 *
 *   SPORT=4230 OUT=/tmp/crumbs node tools/sprites/crumbshot.mjs
 *
 * 旧の値は CSS で差し戻す（`OLD` の3行）。**差し戻した状態で測り直して、
 * 本物の「直す前」と同じ数字（島 40px / 46px）が出ることを確かめている。**
 * 出ないなら差し戻しが違うので、その絵は「直す前」ではない。
 *
 * `MARK=1` を付けると、押しどころ（`a::after`）の箱を朱で囲って撮る。
 * 隣とぶつかっているかが、絵で見える。
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "fs";
import { repoPath } from "./repo.mjs";

const SPORT = process.env.SPORT || "4230";
const OUT = process.env.OUT || "/tmp/crumbs";
const W = Number(process.env.W || 390);
const MARK = process.env.MARK === "1";
mkdirSync(OUT, { recursive: true });

/** 直す前の値。`site/app/css/pages.css` の 2026-09-13 以前。 */
const OLD = `
  .crumbs { row-gap: var(--sp-2) !important; column-gap: var(--sp-2) !important; }
  .crumbs i { margin: 0 var(--sp-1) !important; }
  .crumbs > span:first-of-type:has(> a) > i { margin: 0 var(--sp-1) !important; }
`;
/** 押しどころを見せる。`::after` そのものには枠を描けないので、同じ箱を重ねる。 */
const MARKCSS = `
  .crumbs a::after { outline: 2px solid rgba(200,60,40,.85); outline-offset: -1px;
    background: rgba(200,60,40,.13); }
`;

const PAGES = (process.env.PAGES || "/apps/nanitabeyo.html,/streams/cooking.html,/nordic/sweden.html,/nordic/day/3.html,/me/desk.html,/map/hungary.html").split(",");

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
for (const when of ["before", "after"]) {
  const ctx = await b.newContext({ viewport: { width: W, height: 900 }, deviceScaleFactor: 2, isMobile: W < 700, hasTouch: W < 700, reducedMotion: "reduce" });
  await ctx.route(/googleusercontent\.com|upload\.wikimedia\.org|instagram\.com|ytimg\.com|youtube\.com/,
    (r) => r.fulfill({ path: repoPath("site/public/og.png") }));
  await ctx.route(/fonts\.googleapis\.com/, (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  const p = await ctx.newPage();
  await p.addInitScript(() => localStorage.setItem("ayato-island-arrived", "1"));
  for (const path of PAGES) {
    await p.goto(`http://localhost:${SPORT}${path}`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await p.waitForTimeout(400);
    if (when === "before") await p.addStyleTag({ content: OLD });
    if (MARK) await p.addStyleTag({ content: MARKCSS });
    await p.waitForTimeout(200);
    const el = await p.$(".wayrow");
    const name = path.replace(/\.html$/, "").replace(/\//g, "_").replace(/^_/, "");
    if (!el) { console.log("パンくずなし", path); continue; }
    const box = await el.boundingBox();
    // まわりの地も入れて撮る。行だけ切ると、まわりとの間が分からない。
    await p.screenshot({
      path: `${OUT}/${name}-${when}${MARK ? "-mark" : ""}.png`,
      clip: { x: 0, y: Math.max(0, box.y - 16), width: W, height: Math.min(box.height + 32, 200) },
    });
  }
  await ctx.close();
}
console.log("→", OUT);
await b.close();
