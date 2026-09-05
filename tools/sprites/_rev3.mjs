/**
 * 3周目のレビュー用。全21面を1本のブラウザで回して、実測値を JSON に出す。
 * ブラウザは1本だけ立てる（並列で立てると落ちる）。
 */
import { chromium } from "playwright-core";
import { writeFileSync, mkdirSync } from "fs";
import { offline } from "./route.mjs";

const PORT = process.env.PORT || "3041";
const BASE = `http://localhost:${PORT}`;
const OUT = process.env.OUT || "/tmp/r3";
mkdirSync(OUT, { recursive: true });

const PAGES = process.argv.slice(2).length ? process.argv.slice(2) : [
  "/", "/about", "/friends", "/streams", "/streams/cooking",
  "/kitchen", "/kitchen/egg-sandwich", "/legends", "/legends/iran-walk",
  "/apps", "/apps/nanitabeyo", "/now", "/next", "/next/new",
  "/nordic", "/nordic/finland", "/nordic/guide", "/board",
  "/map", "/map/france", "/design",
];

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await offline(ctx);
await ctx.addInitScript(() => { try { localStorage.setItem("ayato-island-arrived", "1"); } catch (e) {} });
const p = await ctx.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));

const measure = () => {
  // ---- 色まわりの道具 ----
  const lum = ([r, g, b]) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  const parse = (s) => { const m = /rgba?\(([^)]+)\)/.exec(s); if (!m) return null; const v = m[1].split(",").map(Number); return v.length > 3 && v[3] === 0 ? null : [v[0], v[1], v[2]]; };
  const bgOf = (el) => {
    let n = el;
    while (n && n !== document.documentElement) {
      const cs = getComputedStyle(n);
      const c = parse(cs.backgroundColor);
      if (c) return c;
      if (cs.backgroundImage && cs.backgroundImage !== "none") return "grad:" + n.className;
      n = n.parentElement;
    }
    return [255, 255, 255];
  };
  const key = (el) => el.tagName.toLowerCase() + (el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).slice(0, 3).join(".") : "");

  const out = { url: location.pathname, h: document.documentElement.scrollHeight, small: {}, contrast: [], tap: [], panels: { total: 0, paper: 0 }, gaps: {}, popNoLink: [], linkNoPop: [] };

  // ---- 字の大きさとコントラスト ----
  const seen = new Map();
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none") continue;
    // 直の文字を持つ要素だけ
    const own = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).map((n) => n.textContent.trim()).join(" ");
    if (!own) continue;
    const fs = parseFloat(cs.fontSize);
    if (fs < 11.5) out.small[fs] = (out.small[fs] || 0) + 1;
    const fg = parse(cs.color);
    const bg = bgOf(el);
    const k = key(el) + "|" + cs.color + "|" + fs;
    if (seen.has(k)) continue;
    seen.set(k, 1);
    if (fg && Array.isArray(bg)) {
      const cr = ratio(fg, bg);
      if (cr < 4.5) out.contrast.push({ sel: key(el), fs, w: cs.fontWeight, fg: cs.color, bg: `rgb(${bg.join(",")})`, r: +cr.toFixed(2), t: own.slice(0, 28) });
    } else if (!Array.isArray(bg)) {
      out.contrast.push({ sel: key(el), fs, fg: cs.color, bg: String(bg), r: null, t: own.slice(0, 28) });
    }
  }

  // ---- 押しどころ ----
  const tapSeen = new Map();
  for (const el of document.querySelectorAll("a[href], button, [role=button], input, select, textarea, summary")) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden") continue;
    const k = key(el);
    const w = Math.round(r.width), h = Math.round(r.height);
    if (w < 44 || h < 44) {
      const e = tapSeen.get(k) || { sel: k, w, h, n: 0 };
      e.n++; e.w = Math.min(e.w, w); e.h = Math.min(e.h, h);
      tapSeen.set(k, e);
    }
    // 押せるのに厚みが無い
    if (!/inset|px/.test(cs.boxShadow) || cs.boxShadow === "none") out.linkNoPop.push(k);
  }
  out.tap = [...tapSeen.values()].sort((a, b) => b.n - a.n);
  out.linkNoPop = [...new Set(out.linkNoPop)];

  // ---- 押せないのに厚み ----
  const popSeen = new Set();
  for (const el of document.querySelectorAll("body *")) {
    if (el.closest("a[href],button,[role=button],summary,label")) continue;
    const cs = getComputedStyle(el);
    const bs = cs.boxShadow;
    if (!bs || bs === "none") continue;
    // 「0 Npx 0」の厚み型だけ拾う
    if (/rgba?\([^)]+\) 0px \d+(\.\d+)?px 0px 0px/.test(bs) || /^rgba?\([^)]+\) 0px \d+px 0px/.test(bs)) {
      const k = key(el);
      if (!popSeen.has(k)) { popSeen.add(k); out.popNoLink.push({ sel: k, bs: bs.slice(0, 60) }); }
    }
  }

  // ---- panel / paper ----
  out.panels.total = document.querySelectorAll(".panel").length;
  out.panels.paper = document.querySelectorAll(".panel.paper").length;

  // ---- 余白の段 ----
  const STEPS = [0, 4, 8, 12, 16, 24, 32];
  for (const el of document.querySelectorAll("body *")) {
    const cs = getComputedStyle(el);
    for (const prop of ["rowGap", "columnGap"]) {
      const v = parseFloat(cs[prop]);
      if (!v || Number.isNaN(v)) continue;
      if (!STEPS.includes(Math.round(v * 10) / 10)) out.gaps[v] = (out.gaps[v] || 0) + 1;
    }
  }

  // ---- 見出しとパンくず ----
  const h1 = document.querySelector("h1");
  out.h1 = h1 ? h1.textContent.trim() : null;
  out.crumbs = [...document.querySelectorAll(".crumbs a, .crumbs span, .crumbs li")].map((n) => n.textContent.trim()).filter(Boolean);
  const phead = document.querySelector(".phead");
  out.pheadBottom = phead ? Math.round(phead.getBoundingClientRect().bottom + window.scrollY) : null;
  const say = document.querySelector(".phead-say");
  out.say = say ? say.textContent.trim().slice(0, 60) : null;
  const ih = document.querySelector(".ih");
  out.ihH = ih ? Math.round(ih.getBoundingClientRect().height) : null;
  return out;
};

const all = [];
for (const path of PAGES) {
  errs.length = 0;
  try {
    await p.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 120000 });
  } catch (e) { all.push({ url: path, err: String(e).slice(0, 120) }); continue; }
  await p.waitForTimeout(2800);
  const r = await p.evaluate(measure);
  r.errs = [...errs];
  all.push(r);
  await p.screenshot({ path: `${OUT}/first${path.replace(/\//g, "_") || "_top"}.png` });
  console.log(path, "h=", r.h, "panel=", r.panels.total + "/" + r.panels.paper, "低比=", r.contrast.length, "小字=", Object.keys(r.small).length);
}
writeFileSync(`${OUT}/measure.json`, JSON.stringify(all, null, 1));
await b.close();
console.log("done ->", OUT + "/measure.json");
