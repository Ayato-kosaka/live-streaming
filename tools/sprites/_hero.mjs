/** PC で、島の札とヒーローの看板ロゴがどれだけ重なるかを撮って測る。 */
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";
const SPORT = process.env.SPORT || "4120";
const OUT = process.env.OUT || "/tmp/hero";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
await offline(ctx, { photo: "/home/user/live-streaming/tools/sprites/photo-480.jpg" });
const p = await ctx.newPage();
await p.addInitScript(() => { try { localStorage.setItem("ayato-island-arrived","2026-09-04"); localStorage.setItem("ayato-island-walked","1"); } catch {} });
await p.goto(`http://localhost:${SPORT}/index.html`, { waitUntil: "load", timeout: 60000 });
await p.waitForTimeout(3500);
/* 「これから」の札を、看板ロゴのまん中へ寄せていく。
   カメラはあやとを追うので、札を左上へ動かすにはあやとを右下…ではなく
   「札を動かしたい向きの逆」へ歩かせる。画面の中心から、そのぶんずらして押す。 */
const WANT = { x: 150, y: 120 };
const findMark = () => p.evaluate(() => {
  for (const m of document.querySelectorAll(".spot-mark")) {
    if (!m.textContent.includes("これから")) continue;
    const r = m.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  return null;
});
for (let i = 0; i < 10; i++) {
  const m = await findMark();
  if (!m) break;
  const d = Math.hypot(m.x - WANT.x, m.y - WANT.y);
  if (d < 26) break;
  const cx = Math.max(60, Math.min(1380, 720 + (m.x - WANT.x)));
  const cy = Math.max(80, Math.min(820, 450 + (m.y - WANT.y)));
  await p.mouse.click(cx, cy);
  await p.waitForTimeout(1500);
}
await p.waitForTimeout(900);
const dbg = await p.evaluate(() => {
  const st = document.querySelector(".stage");
  const logo = st?.parentElement?.querySelector(".hero-logo");
  const l = logo && logo.getBoundingClientRect();
  const h = st && st.getBoundingClientRect();
  return { attr: st?.getAttribute("data-logo"), logo: l && { x: l.left - h.left, y: l.top - h.top, r: l.right - h.left, b: l.bottom - h.top, w: l.width },
    op: logo && getComputedStyle(logo).opacity };
});
console.log("data-logo:", JSON.stringify(dbg));
const rects = await p.evaluate(() => {
  const logo = document.querySelector(".hero-logo-full");
  const lr = logo ? logo.getBoundingClientRect() : null;
  const out = [];
  for (const m of document.querySelectorAll(".spot-mark")) {
    const r = m.getBoundingClientRect();
    if (r.width < 2 || getComputedStyle(m).visibility === "hidden") continue;
    const ov = lr ? Math.max(0, Math.min(r.right, lr.right) - Math.max(r.left, lr.left)) * Math.max(0, Math.min(r.bottom, lr.bottom) - Math.max(r.top, lr.top)) : 0;
    out.push({ t: m.textContent.trim().slice(0, 14), x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), ov: Math.round(ov), pct: r.width * r.height ? Math.round((ov / (r.width * r.height)) * 100) : 0 });
  }
  return { logo: lr && { x: Math.round(lr.left), y: Math.round(lr.top), w: Math.round(lr.width), h: Math.round(lr.height) }, spots: out };
});
console.log("看板ロゴ:", JSON.stringify(rects.logo));
for (const s of rects.spots) if (s.pct > 0) console.log(`  重なり ${s.pct}%  「${s.t}」 ${s.x},${s.y} ${s.w}×${s.h}`);
if (!rects.spots.some((s) => s.pct > 0)) console.log("  （この立ち位置では重なっていない）");
console.log("札ぜんぶ:", rects.spots.map((s) => `${s.t}(${s.x},${s.y})`).join(" "));
await p.screenshot({ path: `${OUT}.png` });
await b.close();
