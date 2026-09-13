/**
 * **45ch を超えている行が、どの部品なのか**を名指しする。
 *
 *   SPORT=5800 PAGES=/nordic/day/3 node navwho.mjs
 *
 * `navch.mjs` は字数を出すが、クラスの無い `<p>` や `<li>` は「.(なし)」としか
 * 言わない。直す側はそこから探し直すことになるので、**祖先のクラスを辿って
 * セレクタの形で出す。** 測り方（行の箱・全角の割合）は `navch.mjs` と同じ。
 */
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";

const SPORT = process.env.SPORT || "5800";
const PAGES = (process.env.PAGES || "/privacy,/nordic/day/3").split(",");
const W = Number(process.env.W || 1440);
const LIMIT = Number(process.env.LIMIT || 45);
const PROSE = "p,li,dd,blockquote,figcaption,.blurb,summary";

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const ctx = await b.newContext({
  viewport: { width: W, height: 900 },
  deviceScaleFactor: 1,
  reducedMotion: "reduce",
});
await offline(ctx);
await ctx.addInitScript(() => {
  try {
    localStorage.setItem("ayato-island-arrived", "2026-09-04");
    localStorage.setItem("ayato-island-walked", "1");
  } catch {}
});
const p = await ctx.newPage();
for (const path of PAGES) {
  await p.goto(`http://localhost:${SPORT}${path === "/" ? "/index" : path}.html`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await p.waitForTimeout(500);
  await p.evaluate(async () => {
    const h = document.body.scrollHeight;
    for (let i = 0, y = 0; i < 80 && y < h; i++, y += 600) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 25));
    }
    window.scrollTo(0, 0);
  });
  await p.waitForTimeout(300);
  const got = await p.evaluate(
    ([PROSE, LIMIT]) => {
      const out = [];
      for (const el of document.querySelectorAll(PROSE)) {
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden") continue;
        if (el.checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true }) === false) continue;
        const txt = (el.textContent || "").trim();
        if (txt.length < 12) continue;
        if (el.querySelector(PROSE)) continue;
        if (!/^(block|list-item|inline-block)$/.test(cs.display)) continue;
        let flow = true;
        for (const c of el.children) {
          const d2 = getComputedStyle(c).display;
          if (!d2.startsWith("inline") && d2 !== "ruby" && d2 !== "contents") { flow = false; break; }
        }
        if (!flow) continue;
        const rg = document.createRange();
        rg.selectNodeContents(el);
        const rects = [...rg.getClientRects()].filter((q) => q.width > 4 && q.height > 4);
        rg.detach?.();
        if (!rects.length) continue;
        const widest = rects.reduce((a, q) => (q.width > a.width ? q : a));
        const fs = parseFloat(cs.fontSize) || 16;
        const zen = (txt.match(/[^\x00-\xff]/g) || []).length / txt.length;
        const ch = widest.width / (fs * (zen * 1.0 + (1 - zen) * 0.5));
        if (ch <= LIMIT) continue;
        // 祖先を6段まで辿って、クラスのあるものだけ残す
        const chain = [];
        for (let a = el; a && a !== document.body && chain.length < 6; a = a.parentElement) {
          const cls = typeof a.className === "string" && a.className ? "." + a.className.trim().split(/\s+/).join(".") : "";
          chain.unshift(a.tagName.toLowerCase() + cls);
        }
        out.push({
          ch: +ch.toFixed(1),
          px: Math.round(widest.width),
          fs: +fs.toFixed(1),
          /** 45ch に収めるのに要る幅（px と、その要素の font-size 基準の em） */
          need: Math.floor(LIMIT * (fs * (zen * 1.0 + (1 - zen) * 0.5))),
          em: +((LIMIT * (zen * 1.0 + (1 - zen) * 0.5))).toFixed(1),
          sel: chain.join(" > "),
          t: txt.slice(0, 26),
        });
      }
      return out.sort((a, c) => c.ch - a.ch);
    },
    [PROSE, LIMIT],
  );
  console.log(`\n== ${path} @${W}px — ${LIMIT}ch 超え ${got.length}本`);
  for (const g of got)
    console.log(`  ${String(g.ch).padStart(6)}ch ${String(g.px).padStart(4)}px  ${LIMIT}ch に収める幅 ${g.need}px(${g.em}em)  ${g.sel}\n        ${g.t}`);
}
await b.close();
