/**
 * 本番（出したバイト列）で、パンくずの押しどころを測る。
 *
 *   node tools/sprites/crumbprod.mjs
 *
 * **不具合だと言う前に、本番で同じ判定が出るかを見る**
 * （`docs/island-standards.md` 13）。ローカルの書き出しだけで測ると、
 * 測るために作った仕掛けのほうが原因のことがある。
 * ブラウザは本番に届かないので `prod.mjs` の `viaCurl` で curl に回す。
 */
import { chromium } from "playwright-core";
import { viaCurl, ORIGIN } from "./prod.mjs";

const PAGES = (process.env.PAGES || "/apps/nanitabeyo,/apps/spelieve,/apps/nanikore,/streams/cooking,/streams/walk,/streams/making,/streams/meeting,/streams/monthly,/nordic/sweden").split(",");
const W = Number(process.env.W || 390);
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: W, height: 900 }, deviceScaleFactor: 1, isMobile: W < 700, hasTouch: W < 700 });
await viaCurl(ctx);
const p = await ctx.newPage();
await p.addInitScript(() => localStorage.setItem("ayato-island-arrived", "1"));
let bad = 0;
for (const path of PAGES) {
  await p.goto(`${ORIGIN}${path}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await p.waitForTimeout(3000);
  const rows = await p.evaluate((LIMIT) => {
    const out = [];
    for (const nav of document.querySelectorAll(".crumbs")) {
      const nr = nav.getBoundingClientRect();
      if (nr.width <= 2 || nr.height <= 2) continue;
      const links = [...nav.querySelectorAll("a")];
      const afterBox = (el) => {
        const cs = getComputedStyle(el, "::after");
        const r = el.getBoundingClientRect();
        const w = parseFloat(cs.width) || r.width, h = parseFloat(cs.height) || r.height;
        return { x: r.x + r.width / 2 - w / 2, y: r.y + r.height / 2 - h / 2, w, h };
      };
      const bx = links.map(afterBox);
      let ov = 0;
      for (let i = 0; i + 1 < bx.length; i++) {
        const a = bx[i], c = bx[i + 1];
        if (Math.min(a.x + a.w, c.x + c.w) - Math.max(a.x, c.x) > 0.01 &&
            Math.min(a.y + a.h, c.y + c.h) - Math.max(a.y, c.y) > 0.01) ov++;
      }
      links.forEach((el, i) => {
        el.scrollIntoView({ block: "center" });
        const r = el.getBoundingClientRect();
        const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
        const hits = (x, y) => { const e = document.elementFromPoint(x, y); return e && (e === el || el.contains(e) || e.closest?.("a,button,label") === el); };
        if (!hits(cx, cy)) { out.push({ t: el.textContent.trim(), why: "覆われている" }); return; }
        const grow = (dx, dy) => { let n = 0; while (n < LIMIT && hits(cx + dx * (n + 1), cy + dy * (n + 1))) n++; return n; };
        const l = grow(-1, 0), rr = grow(1, 0), u = grow(0, -1), dn = grow(0, 1);
        out.push({ t: el.textContent.trim().slice(0, 12), hit: [l + rr + 1, u + dn + 1], sat: [l, rr, u, dn].some((n) => n >= LIMIT), ov: i === 0 ? ov : undefined });
      });
    }
    return out;
  }, 200);
  for (const r of rows) {
    if (r.why) { bad++; console.log(`${path}  ${r.t}  測れず（${r.why}）`); continue; }
    const ng = r.hit[0] < 48 || r.hit[1] < 48;
    if (ng) bad++;
    console.log(`${path}  ${r.t}  当たり ${r.hit[0]}x${r.hit[1]}${r.sat ? " 【飽和】" : ""}${ng ? "  ← 48px 未満" : ""}${r.ov !== undefined ? `  かぶり ${r.ov}` : ""}`);
  }
}
console.log(bad ? `\n本番でも 48px を割っている: ${bad} 本` : "\n本番も 48px 以上");
await b.close();
