/**
 * 島の上の押せるものを、**名前つきで**1つずつ測る。
 *
 *   SPORT=4310 node tools/sprites/islehit.mjs
 *   SPORT=4310 W=390 WIDE=1 node tools/sprites/islehit.mjs
 *
 * `hitbox.mjs` と同じ測り方（中心から1pxずつ外へ伸ばして `elementFromPoint` が
 * まだ自分を返すか）だが、島には同じ形の押しどころが10個並ぶので、
 * **どれが削られているか**が分からないと直す先が決まらない。
 * ここは `aria-label` と札の文言を添えて出し、削られているものには
 * **上に乗っている相手**も出す。
 *
 * 見えていない札（寄りでは近づいた1軒以外、引きでは看板の6つ以外）は
 * `opacity: 0; pointer-events: none` なので**押せるもののうちに数えない。**
 * 数えると、出ていない札が 1x1 で並んで、本当に削られたものが埋もれる。
 */
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";

const SPORT = process.env.SPORT || "4310";
const WS = (process.env.W || "390").split(",").map(Number);
const PAGES = (process.env.PAGES || "/island/nordic.html,/island/caucasus.html,/island/albania.html,/island/europe.html").split(",");
const WIDE = process.env.WIDE === "1";
const MIN = Number(process.env.MIN || 48);

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
let bad = 0, n = 0;
for (const W of WS) {
  const ctx = await b.newContext({ viewport: { width: W, height: 844 }, deviceScaleFactor: 1, isMobile: W < 700, hasTouch: W < 700, reducedMotion: "reduce" });
  await offline(ctx);
  await ctx.addInitScript(() => { try { localStorage.setItem("ayato-island-arrived", "2026-09-04"); localStorage.setItem("ayato-island-walked", "1"); } catch {} });
  const p = await ctx.newPage();
  for (const path of PAGES) {
    let ok = false;
    for (let i = 0; i < 4 && !ok; i++) {
      try { await p.goto(`http://localhost:${SPORT}${path}`, { waitUntil: "networkidle", timeout: 60000 }); ok = true; }
      catch { await p.waitForTimeout(1500); }
    }
    if (!ok) { console.log(path, "取れず"); continue; }
    await p.waitForTimeout(2400);
    if (WIDE) { await p.click(".isle-view").catch(() => {}); await p.waitForTimeout(1800); }
    await p.evaluate(() => { window.requestAnimationFrame = () => 0; });
    await p.waitForTimeout(150);
    const rows = await p.evaluate(() => {
      const sel = ".isle-hit, .isle-mark, .isle-view, .isle-atlas, .isle-who button, .crumbs a";
      const out = [];
      for (const el of document.querySelectorAll(sel)) {
        if (el.checkVisibility && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
        if (getComputedStyle(el).pointerEvents === "none") continue;
        el.scrollIntoView({ block: "center" });
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) continue;
        const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
        /* **画面の外にいるものは測らない。** 寄りのカメラはあやとを追うので、
           島の反対側の建物も住人も画面の外にいる。`elementFromPoint` は
           そこへ届かないので、測ると全部 0x0 と出て、
           **本当に覆われているもの**がその中に埋もれる。 */
        if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) continue;
        const hit = (x, y) => { const e = document.elementFromPoint(x, y); return e && (e === el || el.contains(e) || e.closest?.("a,button") === el); };
        const grow = (dx, dy) => { let k = 0; while (k < 200 && hit(cx + dx * (k + 1), cy + dy * (k + 1))) k++; return k; };
        const mid = hit(cx, cy);
        const w = mid ? grow(-1, 0) + grow(1, 0) + 1 : 0;
        const h = mid ? grow(0, -1) + grow(0, 1) + 1 : 0;
        let by = "";
        if (w < 48 || h < 48) {
          const e = document.elementFromPoint(cx, cy);
          const o = e && e !== el && !el.contains(e) ? e : document.elementFromPoint(cx, r.y + 2);
          if (o && o !== el && !el.contains(o)) by = o.tagName + (typeof o.className === "string" && o.className ? "." + o.className.split(" ")[0] : "");
        }
        out.push({
          t: (el.getAttribute("aria-label") || el.textContent || "").trim().replace(/\s+/g, "").slice(0, 16),
          cls: (typeof el.className === "string" ? el.className.split(" ")[0] : ""),
          box: [Math.round(r.width), Math.round(r.height)], hit: [w, h], by,
        });
      }
      return out;
    });
    for (const r of rows) {
      n++;
      const ng = r.hit[0] < MIN || r.hit[1] < MIN;
      if (ng) bad++;
      console.log(`${ng ? "×" : "○"} ${String(W).padStart(4)} ${path.replace(".html", "").padEnd(18)} ${r.cls.padEnd(10)} ${r.t.padEnd(18)} 見た目 ${r.box[0]}x${r.box[1]}  当たり ${r.hit[0]}x${r.hit[1]}${r.by ? `  上にいるの: ${r.by}` : ""}`);
    }
  }
  await ctx.close();
}
await b.close();
console.log(`\n${MIN}px を割ったもの: ${bad} / ${n}`);
