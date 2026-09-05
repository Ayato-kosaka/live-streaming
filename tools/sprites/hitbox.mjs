/**
 * 押しどころの実寸を測る。
 *
 *   PORT=3130 SEL=".crumbs a" PAGES=/nordic/finland,/map/france node tools/sprites/hitbox.mjs
 *   PORT=3130 W=1000 SEL=".ih-link" PAGES=/about node tools/sprites/hitbox.mjs
 *
 * **見た目の箱（getBoundingClientRect）では測らない。**
 * `::after` で広げてある当たり判定はそこに出ないし、
 * 隣の要素に取られている場所も出ない。
 * 中心から1pxずつ外へ伸ばして、`elementFromPoint` がまだ自分を返すかで測る。
 *
 * `docs/island-design.md` 3-2 は「指で押せる最小 48px」。
 * パンくずの「島」は見た目 13x21px で、当たり 22x46px だった
 * （`docs/island-world.md` 7.10）。
 */
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";
const PORT = process.env.PORT || "3130";
const SEL = process.env.SEL || ".crumbs a";
const PAGES = (process.env.PAGES || "/nordic/finland").split(",");
const W = Number(process.env.W || 390);
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: W, height: 900 }, deviceScaleFactor: 1, isMobile: W < 700, hasTouch: W < 700, reducedMotion: "reduce" });
await offline(ctx);
const p = await ctx.newPage();
await p.addInitScript(() => localStorage.setItem("ayato-island-arrived", "1"));
for (const path of PAGES) {
  let ok = false;
  for (let i = 0; i < 4 && !ok; i++) {
    try { await p.goto(`http://localhost:${PORT}${path}`, { waitUntil: "networkidle", timeout: 60000 }); ok = true; } catch { await p.waitForTimeout(2000); }
  }
  if (!ok) { console.log(path, "取れず"); continue; }
  await p.waitForTimeout(600);
  const rows = await p.evaluate((sel) => {
    const out = [];
    for (const el of document.querySelectorAll(sel)) {
      // 画面の外にあるものは elementFromPoint が届かない。砂浜の一覧のように
      // ページの終わりにあるものを測ると、全部 1x1 と出る。先に送っておく。
      el.scrollIntoView({ block: "center" });
      const r = el.getBoundingClientRect();
      if (r.width < 1) continue;
      const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
      const hits = (x, y) => { const e = document.elementFromPoint(x, y); return e && (e === el || el.contains(e) || e.closest?.("a,button") === el); };
      const grow = (dx, dy) => { let n = 0; while (n < 60 && hits(cx + dx * (n + 1), cy + dy * (n + 1))) n++; return n; };
      const l = grow(-1, 0), rr = grow(1, 0), u = grow(0, -1), dn = grow(0, 1);
      out.push({ t: (el.textContent || "").trim().slice(0, 12), box: [Math.round(r.width), Math.round(r.height)], hit: [l + rr + 1, u + dn + 1] });
    }
    return out;
  }, SEL);
  for (const r of rows) console.log(`${path}  ${r.t}  見た目 ${r.box[0]}x${r.box[1]}  当たり ${r.hit[0]}x${r.hit[1]}`);
}
await b.close();
