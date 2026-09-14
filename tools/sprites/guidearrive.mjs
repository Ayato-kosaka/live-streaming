/** 面をまたいで `#souvenir` へ来た人の着地を見る。**押す回数と、見出しの位置。**
 *
 *   BASE=http://127.0.0.1:4220 node tools/sprites/guidearrive.mjs
 *
 * 日ページの「しおりの、おみやげ13品」を押して、しおりへ渡る。
 * 出るのは「着いたとき章が開いているか」「見出しが看板の下に潜っていないか」。
 */
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";
import { viaCurl, ORIGIN } from "./prod.mjs";
const BASE = process.env.BASE || "";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
for (const W of [390, 1280]) {
  const ctx = await b.newContext({ viewport: { width: W, height: 844 }, deviceScaleFactor: 2, isMobile: W < 700, hasTouch: W < 700 });
  if (BASE) await offline(ctx).catch(() => {});
  else await viaCurl(ctx);
  const p = await ctx.newPage();
  await p.goto(BASE ? `${BASE}/nordic/day/3.html` : `${ORIGIN}/nordic/day/3`, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(BASE ? 3000 : 9000);
  const a = await p.$(".nshop-book a");
  if (!a) { console.log(W, "日ページに しおりへの道が無い"); await ctx.close(); continue; }
  await a.scrollIntoViewIfNeeded();
  await p.screenshot({ path: `/tmp/guideprod/arrive-${W}-from.png` });
  await a.click();
  await p.waitForTimeout(BASE ? 3000 : 9000);
  const r = await p.evaluate(() => {
    const sec = document.getElementById("souvenir");
    const h = sec?.querySelector("summary");
    const rc = h.getBoundingClientRect();
    let cover = 0;
    for (const el of document.querySelectorAll("body *")) {
      const pos = getComputedStyle(el).position;
      if (pos !== "fixed" && pos !== "sticky") continue;
      const bb = el.getBoundingClientRect();
      if (bb.top <= 1 && bb.bottom > 0 && bb.bottom < window.innerHeight / 2 && bb.width > window.innerWidth / 2) cover = Math.max(cover, Math.round(bb.bottom));
    }
    const first = sec.querySelector(".gcard b");
    return { 場所: location.pathname + location.hash, 章が開いた: !!sec.querySelector("details")?.open,
      見出しの上端: Math.round(rc.top), 貼りつき: cover, 隠れている: rc.top < cover,
      いちばん上の品: first?.textContent.trim(), その国: sec.querySelector(".gcard i")?.textContent.trim() };
  });
  console.log(W, JSON.stringify(r, null, 0));
  await p.screenshot({ path: `/tmp/guideprod/arrive-${W}-to.png` });
  await ctx.close();
}
await b.close();
