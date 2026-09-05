/**
 * 薄い面を、主観ではなく数で見つける道具。
 *
 * 「見応えがない」は人によって答えが変わるので、変わらないものだけ数える。
 *
 *   screens  面の高さ ÷ 画面の高さ。1画面ぶんしか無い面を見つける
 *   body     本文（p / li / dd）の字数。3行しかない面を見つける
 *   repeat   いちばん多い「同じ形の箱」が、面の高さの何割を占めるか。
 *            同じ箱が並んでいるだけの面を見つける
 *   kinds    main の中に出てくる部品の種類数（直下の子の class の種類）
 *   figs     絵（img / svg / canvas）の数
 *
 * **必ず下まで送ってから測る。** `content-visibility: auto` の畳みは
 * 画面の外にいるあいだ 68px と報告する（CLAUDE.md）。
 *
 *   DIST=/path/.next-3170 SPORT=4170 node thin.mjs
 */
import { chromium } from "playwright-core";
import { readdirSync, statSync, writeFileSync } from "fs";
import { join } from "path";

const SPORT = process.env.SPORT || "4321";
const root = process.env.DIST || "/home/user/live-streaming/site/.next-verify";
const W = Number(process.env.W || 390);
const H = Number(process.env.H || 844);

function walk(d, base = "") {
  let out = [];
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (f === "_next" || f === "cache" || f === "server" || f === "static") continue;
    if (statSync(p).isDirectory()) out = out.concat(walk(p, base + "/" + f));
    else if (f.endsWith(".html")) out.push(base + "/" + f);
  }
  return out;
}
const pages = walk(root).sort();

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const ctx = await b.newContext({ viewport: { width: W, height: H }, isMobile: W < 700, hasTouch: W < 700 });
await ctx.route(/googleusercontent\.com|upload\.wikimedia\.org|instagram\.com|ytimg\.com|youtube\.com/,
  r => r.fulfill({ path: "/home/user/live-streaming/site/public/og.png" }));
await ctx.route(/fonts\.googleapis\.com/, r => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
const p = await ctx.newPage();

const rows = [];
for (const page of pages) {
  await p.goto(`http://localhost:${SPORT}` + page, { waitUntil: "domcontentloaded", timeout: 45000 });
  await p.waitForTimeout(500);
  // 畳みを開かせるために、いちばん下まで送る
  await p.evaluate(async () => {
    const step = window.innerHeight * 0.8;
    for (let y = 0; y < document.documentElement.scrollHeight + 2000; y += step) {
      window.scrollTo(0, y);
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    }
    window.scrollTo(0, document.documentElement.scrollHeight);
    await new Promise(r => setTimeout(r, 250));
  });
  await p.waitForTimeout(300);

  const m = await p.evaluate(() => {
    const main = document.querySelector("main") || document.body;
    const docH = document.documentElement.scrollHeight;
    const text = (el) => (el.innerText || "").replace(/\s+/g, "");
    // 本文の字数。見出し・札・パンくずは数えない
    let body = 0;
    for (const el of main.querySelectorAll("p, li, dd, blockquote")) {
      if (el.querySelector("p, li")) continue;
      body += text(el).length;
    }
    const all = text(main).length;
    // 同じ形の箱。親ごとに、直下の子の class 名でまとめる
    let best = { sig: "", n: 0, h: 0 };
    for (const parent of main.querySelectorAll("*")) {
      const kids = [...parent.children];
      if (kids.length < 3) continue;
      const groups = new Map();
      for (const k of kids) {
        const sig = k.tagName + "." + (k.className && k.className.baseVal !== undefined ? k.className.baseVal : k.className || "");
        const g = groups.get(sig) || { n: 0, h: 0 };
        g.n++; g.h += k.getBoundingClientRect().height;
        groups.set(sig, g);
      }
      for (const [sig, g] of groups) {
        if (g.n >= 3 && g.h > best.h) best = { sig, n: g.n, h: g.h };
      }
    }
    // 部品の種類。main の直下の子の class をユニークに数える
    const kinds = new Set([...main.children].map(c =>
      c.tagName + "." + (typeof c.className === "string" ? c.className : "")));
    const figs = main.querySelectorAll("img, svg, canvas").length;
    const sections = main.querySelectorAll("section, article").length;
    const h2 = main.querySelectorAll("h2").length;
    const folds = main.querySelectorAll("details").length;
    const links = main.querySelectorAll("a[href]").length;
    return {
      docH, body, all, sections, h2, folds, figs, links,
      kinds: kinds.size,
      repN: best.n, repH: Math.round(best.h), repSig: best.sig.slice(0, 40),
    };
  });
  m.page = page.replace(/\.html$/, "").replace(/\/index$/, "") || "/";
  m.screens = +(m.docH / H).toFixed(2);
  m.repShare = +(m.repH / m.docH).toFixed(2);
  rows.push(m);
  process.stdout.write(".");
}
await b.close();
console.log("");

// 薄さの点。高いほど薄い
for (const r of rows) {
  let s = 0;
  if (r.screens < 1.6) s += 3; else if (r.screens < 2.4) s += 2; else if (r.screens < 3.2) s += 1;
  if (r.body < 200) s += 3; else if (r.body < 500) s += 2; else if (r.body < 900) s += 1;
  if (r.repShare > 0.6) s += 2; else if (r.repShare > 0.45) s += 1;
  if (r.kinds <= 3) s += 2; else if (r.kinds <= 5) s += 1;
  if (r.figs < 3) s += 1;
  r.thin = s;
}
rows.sort((a, b2) => b2.thin - a.thin || a.docH - b2.docH);
const pad = (s, n) => String(s).padEnd(n);
console.log(pad("thin", 5) + pad("page", 34) + pad("docH", 7) + pad("scr", 6) + pad("body", 7) + pad("kinds", 6) + pad("figs", 6) + pad("h2", 4) + pad("rep", 6) + "repSig");
for (const r of rows) {
  console.log(pad(r.thin, 5) + pad(r.page, 34) + pad(r.docH, 7) + pad(r.screens, 6) + pad(r.body, 7) + pad(r.kinds, 6) + pad(r.figs, 6) + pad(r.h2, 4) + pad(r.repShare, 6) + `${r.repN}x ${r.repSig}`);
}
writeFileSync(process.env.OUT || "/tmp/thin.json", JSON.stringify(rows, null, 1));
console.log("\npages:", rows.length, " → ", process.env.OUT || "/tmp/thin.json");
