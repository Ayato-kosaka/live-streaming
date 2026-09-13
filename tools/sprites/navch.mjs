/**
 * **読む字の1行が何文字か**を、幅ごとに測る。
 *
 *   SPORT=5600 PAGES=/privacy,/nordic/day/3 node navch.mjs
 *   SPORT=5600 PAGES=/privacy W=390 TAG=after node navch.mjs
 *   SPORT=5600 PROBE=1 PAGES=/privacy node navch.mjs      # 自己確認だけ
 *
 * 測り方は `pcsweep.mjs` と同じ。**同じ穴に4回はまっているので、そのまま写す。**
 *
 *  1. **要素の箱で測らない。字の箱（`Range.getClientRects()`）で測る。**
 *     `<p>` の箱は、字が40字しか無くても親の幅がそのまま出る。
 *     それで数えたとき、109面が109面とも「123.4ch」と揃って出た。
 *     **揃っている数字は、たいてい字ではなく入れ物を測っている。**
 *  2. **外接矩形で割らない。行ごとの箱のいちばん広いもので測る。**
 *     割ると、2行に折り返した段落が「1行ぶんの倍の字数」と出る。
 *  3. **字の流れていない箱（`display:flex` の行）を混ぜない。**
 *     左に日付・右に題、のような行は箱が行ぜんぶの幅になる。
 *  4. **日本語は全角なので、1文字 ≒ `font-size`。** `ch` は "0"（半角）の幅なので、
 *     混ぜて数えると欧文まじりの面だけ倍に出る。全角の割合から1文字の幅を出す。
 *
 * **面の高さと、読む字の総文字数も出す。** 390px で「1文字も変わっていない」を
 * 言うには、行の長さだけでは足りない（折り返しが変われば高さが変わる）。
 */
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";
import { mkdirSync, writeFileSync } from "fs";

const SPORT = process.env.SPORT || "5600";
const PAGES = (process.env.PAGES || "/privacy,/nordic/day/3,/kitchen/gyoza").split(",");
const WIDTHS = (process.env.W || "390,1440,1920").split(",").map(Number);
const TAG = process.env.TAG || "before";
const LIMIT = Number(process.env.LIMIT || 45);
const OUT = `/tmp/navch/${TAG}`;
mkdirSync(OUT, { recursive: true });

const PROSE = "p,li,dd,blockquote,figcaption,.blurb,summary";

/** 仕込み。**数え方が届いているかを毎回出す**（`docs/island-misses.md` #19）。
    120字ぶんの1行を紙の中に置いて、その面が「45ch 超」として挙がるか見る。 */
const PROBE = `(() => {
  const host = document.querySelector("main") || document.body;
  const d = document.createElement("p");
  d.id = "navchprobe";
  d.style.cssText = "width:3000px;font-size:16px";
  d.textContent = "あ".repeat(120);
  host.appendChild(d);
})()`;

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});

const all = [];
for (const W of WIDTHS) {
  const ctx = await b.newContext({
    viewport: { width: W, height: 900 },
    deviceScaleFactor: 1,
    isMobile: W < 900,
    hasTouch: W < 900,
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
    await p.waitForTimeout(600);
    await p.evaluate(async () => {
      const h = document.body.scrollHeight;
      for (let i = 0, y = 0; i < 80 && y < h; i++, y += 600) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 30));
      }
      window.scrollTo(0, 0);
    });
    await p.waitForTimeout(400);
    if (process.env.PROBE) await p.evaluate(PROBE);

    const info = await p.evaluate((PROSE) => {
      const de = document.documentElement;
      const lines = [];
      let chars = 0;
      for (const el of document.querySelectorAll(PROSE)) {
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden") continue;
        if (el.checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true }) === false) continue;
        const txt = (el.textContent || "").trim();
        if (txt.length < 12) continue;
        if (el.querySelector(PROSE)) continue;               // 内側だけ数える
        if (!/^(block|list-item|inline-block)$/.test(cs.display)) continue;
        let flow = true;                                      // 字の流れている箱だけ
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
        const cw = fs * (zen * 1.0 + (1 - zen) * 0.5);
        chars += txt.length;
        lines.push({
          ch: +(widest.width / cw).toFixed(1),
          px: Math.round(widest.width),
          rows: rects.length,
          fs: +fs.toFixed(1),
          n: txt.length,
          c: typeof el.className === "string" ? el.className.split(/\s+/)[0] : "",
          t: txt.slice(0, 24),
        });
      }
      return {
        lines,
        chars,
        height: Math.round(de.scrollHeight),
        over: de.scrollWidth - de.clientWidth,
      };
    }, PROSE);
    all.push({ W, path, ...info });
  }
  await ctx.close();
}
await b.close();
writeFileSync(`${OUT}/all.json`, JSON.stringify(all, null, 1));

console.log(`読む字の1行（${TAG}。上限 ${LIMIT}ch）`);
console.log("| 幅 | 面 | 本文の本数 | 最長 | " + LIMIT + "ch超 | 字数 | 面の高さ | 横あふれ |");
console.log("| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |");
for (const r of all) {
  const mx = r.lines.length ? Math.max(...r.lines.map((l) => l.ch)) : 0;
  const over = r.lines.filter((l) => l.ch > LIMIT);
  console.log(
    `| ${r.W} | ${r.path} | ${r.lines.length} | ${mx}ch | ${over.length} | ${r.chars} | ${r.height}px | ${r.over > 1 ? "+" + r.over : "0"} |`,
  );
}
console.log(`\n${LIMIT}ch を超えている行:`);
for (const r of all) {
  const over = r.lines.filter((l) => l.ch > LIMIT).sort((a, c) => c.ch - a.ch);
  if (!over.length) continue;
  console.log(`  ${r.W}px ${r.path}`);
  for (const l of over.slice(0, 12))
    console.log(`     ${String(l.ch).padStart(6)}ch  ${String(l.px).padStart(4)}px  ${l.fs}px  ${l.rows}行  .${l.c || "(なし)"}  ${l.t}`);
}
if (process.env.PROBE) {
  console.log("\n仕込みの確認（120字ぶんの1行を、幅3000pxの段落で置いた）:");
  for (const r of all) {
    const hit = r.lines.find((l) => l.n >= 120 && l.ch > 100);
    console.log(`  ${r.W}px ${r.path}  ${hit ? `挙がった（${hit.ch}ch）` : "!! 挙がらない。数え方が届いていない"}`);
  }
}
