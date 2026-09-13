/**
 * 図鑑（`/me/desk` の「キャラ」）の寸法を、**4つの状態ごと**に測る。
 *
 * `mesweep.mjs` は面ぜんぶを撮って数える道具なので、図鑑のマス1枚・骨1枚が
 * 何ピクセルで並んでいるかまでは出ない。厚みを外したあとに
 * **押しどころが縮んでいないか**、骨がマスと同じ形で並んでいるかは、
 * その2つを並べて見ないと分からない。ここはそれだけを出す。
 *
 *   tools/build.sh 3900
 *   python3 -m http.server 4900 --directory site/.next-3900 &
 *   SPORT=4900 node tools/sprites/chgeo.mjs
 *
 * 出るもの（標準出力）: 幅ごとに
 *   骨   … `.ch-wait > span` の箱。**6枚とも同じ大きさで並んでいること**
 *   マス … `.ch-cell` の箱と、`elementFromPoint` で伸ばした当たり
 *   厚み … `.ch-cell` の `box-shadow` に外向きの影が残っていないか
 *
 * **当たりは見た目の箱で測らない**（`CLAUDE.md`）。`::after` で広げた当たりも、
 * 隣に取られた場所も `getBoundingClientRect` には出ない。
 */
import { chromium } from "playwright-core";
import { seed } from "./meseed.mjs";
import { offline } from "./route.mjs";

const PORT = process.env.SPORT || "4900";
const MODES = (process.env.MEMODES || "ok,wait").split(",");

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});

for (const MODE of MODES) {
  for (const W of [360, 390]) {
    const ctx = await b.newContext({
      viewport: { width: W, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      reducedMotion: "reduce",
    });
    await seed(ctx, { admin: true, mode: MODE });
    await offline(ctx).catch(() => {});
    const p = await ctx.newPage();
    /* 待ちを撮るときは読み込みの終わりを待たない（返らない口で時間切れになる） */
    await p
      .goto(`http://localhost:${PORT}/me/desk.html`, {
        waitUntil: MODE === "wait" ? "domcontentloaded" : "networkidle",
        timeout: 60000,
      })
      .catch(() => {});
    await p.waitForTimeout(MODE === "wait" ? 2500 : 1500);
    await p
      .locator(".mp-tab", { hasText: /^キャラ/ })
      .first()
      .click({ timeout: 5000 })
      .catch(() => {});
    await p.waitForTimeout(MODE === "wait" ? 2000 : 1600);

    const r = await p.evaluate(() => {
      const box = (e) => {
        const q = e.getBoundingClientRect();
        return [Math.round(q.width * 10) / 10, Math.round(q.height * 10) / 10];
      };
      /* `hitbox.mjs` と同じ measure。中心から1pxずつ外へ伸ばす */
      const hit = (el) => {
        el.scrollIntoView({ block: "center" });
        const q = el.getBoundingClientRect();
        const cx = Math.round(q.x + q.width / 2);
        const cy = Math.round(q.y + q.height / 2);
        if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) return null;
        const mine = (x, y) => {
          const e2 = document.elementFromPoint(x, y);
          return !!e2 && (e2 === el || el.contains(e2) || e2.closest?.("a,button,label") === el);
        };
        if (!mine(cx, cy)) return null;
        let l = 0, rr = 0, up = 0, dn = 0;
        while (l < 300 && cx - l - 1 >= 0 && mine(cx - l - 1, cy)) l++;
        while (rr < 300 && cx + rr + 1 < innerWidth && mine(cx + rr + 1, cy)) rr++;
        while (up < 300 && cy - up - 1 >= 0 && mine(cx, cy - up - 1)) up++;
        while (dn < 300 && cy + dn + 1 < innerHeight && mine(cx, cy + dn + 1)) dn++;
        return [l + rr + 1, up + dn + 1];
      };
      const bones = [...document.querySelectorAll(".ch-wait > span")].map(box);
      const cells = [...document.querySelectorAll(".ch-cell")];
      /* 外向きの影（厚み）が残っていないか。`inset` は彫りなので数えない */
      const pops = cells
        .map((e) => getComputedStyle(e).boxShadow)
        .filter((s) => s && s !== "none" && s.split(/,(?![^(]*\))/).some((one) => !one.includes("inset")));
      return {
        bones,
        cells: cells.length,
        cellBox: cells.slice(0, 3).map(box),
        cellHit: cells.slice(0, 3).map(hit),
        pops: pops.length,
        longer: document.querySelector(".longer")?.textContent ?? null,
        blank: [...document.querySelectorAll(".blank")].map((e) => e.textContent),
      };
    });
    console.log(
      `[${MODE}] ${W}px  骨 ${JSON.stringify(r.bones)}  マス ${r.cells}枚 ` +
        `箱 ${JSON.stringify(r.cellBox)} 当たり ${JSON.stringify(r.cellHit)} ` +
        `厚みの残り ${r.pops}  ${r.longer ? `畳み「${r.longer}」` : ""} ${r.blank.length ? JSON.stringify(r.blank) : ""}`,
    );
    await ctx.close();
  }
}
await b.close();
