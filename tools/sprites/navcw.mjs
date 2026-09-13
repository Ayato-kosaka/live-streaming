/**
 * **入れる上限（max-width）を、勘ではなく実測から逆算する。**
 *
 *   SPORT=4140 node navcw.mjs
 *
 * `em` の値は、字の数と一致しない。`.zk-lead` には既に `max-width: 46em` が
 * 入っているのに実測 61.0ch だった。島の字は和文・かな・欧文が混ざるので、
 * **1文字あたりの幅は `1em` ではない。**
 *
 * そこで、部品ごとに「描かれた1文字あたりの px」を全109面ぶん集めて、
 * **いちばん狭いもの**から上限を出す。狭い字（欧文まじり）ほど同じ px に
 * 多く入るので、そこで 45ch に収まれば、他の行は必ず収まる。
 *
 * 数え方（行の箱・全角の割合・流れている箱だけ）は `navch.mjs` と同じ。
 * **中央寄せの段落も出す。** `max-width` を入れると箱が狭まるので、
 * 中の字が真ん中寄せだと位置がずれる。入れる前に居るかどうかを見る。
 */
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";
import { readFileSync } from "fs";

const SPORT = process.env.SPORT || "4140";
const PAGES = (process.env.PAGES ||
  readFileSync("/home/user/live-streaming/tools/sprites/pcpages.txt", "utf8")
    .split("\n").map((x) => x.trim()).filter(Boolean).join(",")).split(",");
const W = Number(process.env.W || 1440);
const LIMIT = Number(process.env.LIMIT || 45);
const GROUPS = (process.env.SEL || ".zk-lead|.panel p|.nwords p|.nwhy p|.phead-lead").split("|");
const PROSE = "p,li,dd,blockquote,figcaption,.blurb,summary";

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
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
const hits = new Map(GROUPS.map((g) => [g, []]));
const centred = [];
for (const path of PAGES) {
  await p.goto(`http://localhost:${SPORT}${path === "/" ? "/index" : path}.html`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await p.waitForTimeout(300);
  await p.evaluate(async () => {
    const h = document.body.scrollHeight;
    for (let i = 0, y = 0; i < 80 && y < h; i++, y += 600) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 20));
    }
    window.scrollTo(0, 0);
  });
  await p.waitForTimeout(200);
  const got = await p.evaluate(([PROSE, GROUPS]) => {
    const out = [];
    const mid = [];
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
      const g = GROUPS.find((s) => el.matches(s));
      if (!g) continue;
      const rg = document.createRange();
      rg.selectNodeContents(el);
      const rects = [...rg.getClientRects()].filter((q) => q.width > 4 && q.height > 4);
      rg.detach?.();
      if (!rects.length) continue;
      const widest = rects.reduce((a, q) => (q.width > a.width ? q : a));
      const fs = parseFloat(cs.fontSize) || 16;
      const zen = (txt.match(/[^\x00-\xff]/g) || []).length / txt.length;
      const cw = fs * (zen * 1.0 + (1 - zen) * 0.5);
      out.push({ g, cw: +cw.toFixed(3), fs: +fs.toFixed(1),
        ch: +(widest.width / cw).toFixed(1), px: Math.round(widest.width),
        t: txt.slice(0, 20) });
      if (cs.textAlign === "center") mid.push({ g, t: txt.slice(0, 20) });
    }
    return { out, mid };
  }, [PROSE, GROUPS]);
  for (const r of got.out) hits.get(r.g).push({ ...r, path });
  for (const m of got.mid) centred.push({ ...m, path });
}
await b.close();

console.log(`@${W}px — 部品ごとの「描かれた1文字ぶん」と、そこから逆算した ${LIMIT}文字ぶんの幅\n`);
console.log("| 部品 | 本数 | 超えている行の 1文字ぶん いちばん狭い | その行 | いちばん長い行 | 45文字ぶん（切り下げ） | 参考 |");
console.log("| --- | ---: | ---: | --- | ---: | ---: | --- |");
for (const [g, rows] of hits) {
  if (!rows.length) { console.log(`| \`${g}\` | 0 | | | | |`); continue; }
  /* **上限は、いま 45文字を超えている行だけから出す。**
     全部の行から出すと、鍵や URL の混ざった半角だらけの1行（1文字 7px）に
     引っぱられて、和文の段落まで 33文字の細い柱になる。
     いま 45文字に収まっている行は、上限を入れても広がらないので、
     そちらを基準に置く必要が無い。
     こう決めると「上限 = 45 × （超えている行のいちばん狭い1文字）」で、
     超えていた行は必ず 45文字以下になり、超えていなかった行は
     上限より狭いままか、上限で切られて短くなるかのどちらかになる。 */
  const over = rows.filter((r) => r.ch > LIMIT);
  const base = (over.length ? over : rows).reduce((a, r) => (r.cw < a.cw ? r : a));
  const min = rows.reduce((a, r) => (r.cw < a.cw ? r : a));
  const mx = rows.reduce((a, r) => (r.ch > a.ch ? r : a));
  console.log(
    `| \`${g}\` | ${rows.length}（うち ${LIMIT}超 ${over.length}） | ${base.cw}px（${base.fs}px の字） | ${base.path} «${base.t}» | ${mx.ch}ch (${mx.path}) | **${Math.floor(LIMIT * base.cw)}px** | 全体のいちばん狭い 1文字 ${min.cw}px |`,
  );
}
console.log("\n中央寄せの段落（max-width を入れると位置がずれる）:");
console.log(centred.length ? centred.map((c) => `  ${c.path} ${c.g} «${c.t}»`).join("\n") : "  無し");
