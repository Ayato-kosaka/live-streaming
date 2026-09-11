/**
 * 島の名前（h1 = `.isle-sign`）が、**最初の1文字から読めるか**を測る（1/2。撮るほう）。
 *
 *   SPORT=4310 TAG=before node tools/sprites/isletop.mjs
 *   python3 tools/sprites/isletop.py before
 *
 * **重なりを箱で判定しない。** 箱が重なっていても字にかかっていないことが
 * あるし、`pointer-events: none` の看板は `elementFromPoint` に出てこない
 * （そのまま測ると「全部隠れている」と出る）。
 * だから `inkpx` と同じやり方で、**同じ面を2枚撮る**:
 *
 *   1枚目 … そのまま
 *   2枚目 … 島の名前だけ消す（`visibility: hidden`）
 *
 * 2枚の差が「その字が画面に出ている画素」。上に不透明なものが乗っていれば、
 * 消しても画素は1つも変わらない ＝ **その字は読めない**。
 *
 * 島は rAF で動くので、撮る前に止める（`CLAUDE.md`）。
 */
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";
import { offline } from "./route.mjs";

const SPORT = process.env.SPORT || "4310";
const WS = (process.env.W || "360,390,430,768,1024").split(",").map(Number);
const PAGES = (process.env.PAGES || "/island/nordic.html,/island/caucasus.html,/island/albania.html,/island/europe.html").split(",");
const TAG = process.env.TAG || "now";
const OUT = process.env.OUT || `/tmp/isletop/${TAG}`;
const DPR = Number(process.env.DPR || 2);
const WAIT = Number(process.env.WAIT || 2400);
const WIDE = process.env.WIDE === "1";
mkdirSync(OUT, { recursive: true });

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const rows = [];

for (const W of WS) {
  const ctx = await b.newContext({
    viewport: { width: W, height: 844 },
    deviceScaleFactor: DPR,
    isMobile: W < 700,
    hasTouch: W < 700,
  });
  await offline(ctx);
  await ctx.addInitScript(() => { try { localStorage.setItem("ayato-island-arrived", "2026-09-04"); localStorage.setItem("ayato-island-walked", "1"); } catch {} });
  const p = await ctx.newPage();
  for (const path of PAGES) {
    let ok = false;
    for (let i = 0; i < 4 && !ok; i++) {
      try { await p.goto(`http://localhost:${SPORT}${path}`, { waitUntil: "networkidle", timeout: 60000 }); ok = true; }
      catch { await p.waitForTimeout(1500); }
    }
    if (!ok) { console.log(W, path, "取れず"); continue; }
    await p.waitForTimeout(WAIT);
    // 引き（島ぜんぶ）も見る。隅の道具は引きで名前つきの札に伸びる
    if (WIDE) { await p.click(".isle-view").catch(() => {}); await p.waitForTimeout(1600); }
    // 2枚のあいだに島が動くと、差が字と関係ない画素で埋まる
    await p.evaluate(() => { window.requestAnimationFrame = () => 0; });
    await p.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important}" });
    await p.waitForTimeout(150);

    const info = await p.evaluate(() => {
      const box = (el) => { if (!el) return null; const q = el.getBoundingClientRect(); return [Math.round(q.x), Math.round(q.y), Math.round(q.width), Math.round(q.height)]; };
      const h1 = document.querySelector("h1.isle-sign");
      const chars = [];
      if (h1) {
        const walk = document.createTreeWalker(h1, NodeFilter.SHOW_TEXT);
        let n, li = 0;
        while ((n = walk.nextNode())) {
          const line = n.parentElement?.tagName === "B" ? "名" : "一";
          for (let i = 0; i < n.data.length; i++) {
            const rg = document.createRange();
            rg.setStart(n, i); rg.setEnd(n, i + 1);
            const q = rg.getBoundingClientRect();
            if (q.width < 1 || q.height < 1) continue;
            chars.push({ c: n.data[i], line, x: q.x, y: q.y, w: q.width, h: q.height, i: li++ });
          }
        }
      }
      return {
        sign: box(h1), view: box(document.querySelector(".isle-view")),
        atlas: box(document.querySelector(".isle-atlas")), hint: box(document.querySelector(".isle-hint")),
        cam: document.querySelector(".isle")?.getAttribute("data-cam") || "",
        chars,
      };
    });
    const name = `${W}${path.replace(/\//g, "_").replace(/\.html$/, "")}${WIDE ? "-wide" : ""}`;
    await p.screenshot({ path: `${OUT}/${name}.shot.png` });
    await p.evaluate(() => { const h = document.querySelector("h1.isle-sign"); if (h) h.style.setProperty("visibility", "hidden", "important"); });
    await p.waitForTimeout(80);
    await p.screenshot({ path: `${OUT}/${name}.bg.png` });
    writeFileSync(`${OUT}/${name}.json`, JSON.stringify({ dpr: DPR, w: W, path, ...info }, null, 1));
    rows.push(name);
    console.log(`${String(W).padStart(4)} ${path.padEnd(22)} cam=${info.cam} 看板${JSON.stringify(info.sign)} 引き寄り${JSON.stringify(info.view)} 地図${JSON.stringify(info.atlas)} 字${info.chars.length}`);
  }
  await ctx.close();
}
await b.close();
