/**
 * **旅のしおり（`/nordic/guide`）を、本番そのもので見る。**
 *
 *   node tools/sprites/guideprod.mjs
 *   W=1280 node tools/sprites/guideprod.mjs
 *   BASE=http://127.0.0.1:4220 node tools/sprites/guideprod.mjs   # 直したものを自分の箱で
 *
 * ローカルの書き出しではなく、**出したバイト列**を開く（`docs/island-standards.md` 4）。
 * この箱のブラウザは本番に届かないので、`prod.mjs` の `viaCurl` で横取りする。
 *
 * 撮る順番は、**路上のあやとがやる順番**:
 *
 *   head   … 開いた瞬間（`scrollY=0`）。何の面で何ができるか分かるか
 *   toc    … 目次のところ
 *   jump   … 目次から章へ飛んだ直後。**見出しが看板の下に潜っていないか**
 *   open   … その章を開いたところ
 *   ph     … ことばの章（いまの国のぶんが先に出ているか）
 *
 * 絵だけで済ませない。同時に出す数:
 *   横あふれ / 押しどころの実寸 / 絵文字 / 畳みの数 / 面の背（下まで送ってから）
 *
 * 字の濃さは `inkpx.py` に渡せる形（/tmp/ink/<TAG>/）で2枚撮る。
 */
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "fs";
import { viaCurl, ORIGIN } from "./prod.mjs";
import { offline } from "./route.mjs";

const BASE = process.env.BASE || "";
const W = Number(process.env.W || 390);
const TAG = process.env.TAG || (BASE ? `guide-local-${W}` : `guide-prod-${W}`);
const OUT = process.env.OUT || `/tmp/guideprod/${TAG}`;
const INK = `/tmp/ink/${TAG}`;
const PATH = process.env.PATH_ || "/nordic/guide";
const DPR = Number(process.env.DPR || 2);
mkdirSync(OUT, { recursive: true });
mkdirSync(INK, { recursive: true });

/** 押しどころの実寸。中心から1pxずつ外へ伸ばして、まだ自分が返るかで測る。 */
const HIT = `(el) => {
  const CAP = 300;
  const r = el.getBoundingClientRect();
  const cx = Math.round(r.left + r.width / 2), cy = Math.round(r.top + r.height / 2);
  const mine = (x, y) => { const e = document.elementFromPoint(x, y); return !!e && (e === el || el.contains(e)); };
  if (!mine(cx, cy)) return null;
  const grow = (dx, dy) => { let n = 0; while (n < CAP && mine(cx + dx * (n + 1), cy + dy * (n + 1))) n += 1; return n; };
  const l = grow(-1, 0), rt = grow(1, 0), u = grow(0, -1), d = grow(0, 1);
  const out = { w: l + rt + 1, h: u + d + 1 };
  if (l === CAP || rt === CAP || u === CAP || d === CAP) out.sat = true;
  return out;
}`;

/** 絵文字。記号（→ ① ◎）は絵文字ではない（`island-design.md` 1章）。 */
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F0FF}\u{FE0F}]/u;

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const ctx = await b.newContext({
  viewport: { width: W, height: 844 },
  deviceScaleFactor: DPR,
  isMobile: W < 700,
  hasTouch: W < 700,
});
if (BASE) await offline(ctx).catch(() => {});
else await viaCurl(ctx);
const p = await ctx.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));
await p.goto(BASE ? `${BASE}${PATH}.html` : `${ORIGIN}${PATH}`, { waitUntil: "domcontentloaded" });
await p.waitForTimeout(BASE ? 2500 : 9000);
/* 島は rAF で動く。止めないと2枚のあいだで絵が変わる。 */
await p.evaluate(() => { window.requestAnimationFrame = () => 0; });

const out = { W, DPR, 出どころ: BASE || ORIGIN };

/* ---- 1. 開いた瞬間 ---- */
await p.evaluate(() => window.scrollTo(0, 0));
await p.waitForTimeout(400);
await p.screenshot({ path: `${OUT}/head.png` });
out.頭 = await p.evaluate(() => {
  const vh = window.innerHeight;
  const seen = (el) => { const r = el.getBoundingClientRect(); return r.top < vh && r.bottom > 0; };
  const vis = [];
  for (const el of document.querySelectorAll("h1,h2,h3,summary,.gtoc a,a,p,b")) {
    if (!seen(el)) continue;
    const t = (el.textContent || "").replace(/\s+/g, " ").trim();
    if (!t || t.length > 60) continue;
    vis.push(`${el.tagName}${el.className && typeof el.className === "string" ? "." + el.className.split(/\s+/)[0] : ""} «${t.slice(0, 40)}»`);
  }
  return { 画面の高さ: vh, 見えている: vis.slice(0, 24) };
});

/* ---- 2. 面ぜんぶ ---- */
out.面 = await p.evaluate(() => ({
  畳みの数: document.querySelectorAll("details").length,
  章の数: document.querySelectorAll(".gchap").length,
  目次の項目: document.querySelectorAll(".gtoc a").length,
}));

/* ---- 3. 目次を撮る ---- */
const toc = await p.$(".gtoc");
if (toc) {
  await p.evaluate(() => document.querySelector(".gtoc").scrollIntoView({ block: "start" }));
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${OUT}/toc.png` });
  out.目次 = await p.evaluate(({ hitSrc }) => {
    const hit = eval(hitSrc);
    const rows = [...document.querySelectorAll(".gtoc a")];
    const hs = [];
    for (const el of rows) { el.scrollIntoView({ block: "center" }); const h = hit(el); if (h) hs.push({ t: el.textContent.trim().slice(0, 14), ...h }); }
    return { 件: rows.length, 最小高: hs.length ? Math.min(...hs.map((h) => h.h)) : null, 最小幅: hs.length ? Math.min(...hs.map((h) => h.w)) : null, 未満48: hs.filter((h) => h.h < 48 || h.w < 48).map((h) => `${h.t} ${h.w}x${h.h}`) };
  }, { hitSrc: HIT });
}

/* ---- 3b. 頭の近道（いまの国のことば）を押す。**飛んだ先が看板の下に潜っていないか** ---- */
const nowA = await p.$(".gnow a");
if (nowA) {
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.waitForTimeout(300);
  out.近道 = await p.evaluate(({ hitSrc }) => {
    const hit = eval(hitSrc);
    const a = document.querySelector(".gnow a");
    return { 字: a.textContent.replace(/\s+/g, " ").trim(), 行き先: a.getAttribute("href"), 上端: Math.round(a.getBoundingClientRect().top), 当たり: hit(a) };
  }, { hitSrc: HIT });
  await nowA.click();
  await p.waitForTimeout(1200);
  out.近道の着地 = await p.evaluate(() => {
    const h = document.querySelector(".gphrase .gsub[id]");
    const r = h.getBoundingClientRect();
    let cover = 0;
    for (const el of document.querySelectorAll("body *")) {
      const pos = getComputedStyle(el).position;
      if (pos !== "fixed" && pos !== "sticky") continue;
      const b = el.getBoundingClientRect();
      if (b.top <= 1 && b.bottom > 0 && b.bottom < window.innerHeight / 2 && b.width > window.innerWidth / 2) cover = Math.max(cover, Math.round(b.bottom));
    }
    return { 見出し: h.textContent.trim(), id: h.id, 上端: Math.round(r.top), 貼りつき: cover, 隠れている: r.top < cover, 章が開いた: !!h.closest("details")?.open };
  });
  await p.screenshot({ path: `${OUT}/gnow.png` });
  await p.evaluate(() => { const d = document.querySelector("#phrases > details"); if (d) d.open = false; });
}

/* ---- 4. 目次から章へ飛ぶ。**見出しが貼りつきの下に潜っていないか** ---- */
const JUMPS = (process.env.JUMPS || "phrases,money,souvenir").split(",");
out.飛び先 = {};
for (const id of JUMPS) {
  const a = await p.$(`.gtoc a[href="#${id}"]`);
  if (!a) { out.飛び先[id] = "目次に無い"; continue; }
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.waitForTimeout(300);
  await a.click();
  await p.waitForTimeout(1200);
  out.飛び先[id] = await p.evaluate((cid) => {
    const sec = document.getElementById(cid);
    const h = sec?.querySelector("summary") || sec;
    if (!h) return null;
    const r = h.getBoundingClientRect();
    /* 貼りついている帯そのものを数える。見出しの位置とは無関係に測る。 */
    let cover = 0;
    for (const el of document.querySelectorAll("body *")) {
      const pos = getComputedStyle(el).position;
      if (pos !== "fixed" && pos !== "sticky") continue;
      const b = el.getBoundingClientRect();
      if (b.top <= 1 && b.bottom > 0 && b.bottom < window.innerHeight / 2 && b.width > window.innerWidth / 2) cover = Math.max(cover, Math.round(b.bottom));
    }
    return { 見出し: (h.textContent || "").replace(/\s+/g, " ").trim().slice(0, 26), 上端: Math.round(r.top), 貼りつき: cover, 隠れている: r.top < cover, 章が開いた: !!sec?.querySelector("details")?.open };
  }, id);
  await p.screenshot({ path: `${OUT}/jump-${id}.png` });
  /* 開いたときに見出しが飛ばないか */
  const sum = await p.$(`#${id} > details > summary`);
  if (sum) {
    await sum.click();
    await p.waitForTimeout(900);
    out.飛び先[id + "-開いた"] = await p.evaluate((cid) => {
      const h = document.querySelector(`#${cid} > details > summary`);
      const r = h.getBoundingClientRect();
      return { 上端: Math.round(r.top), 画面外: r.top < 0 || r.top > window.innerHeight };
    }, id);
    await p.screenshot({ path: `${OUT}/open-${id}.png` });
    await p.evaluate((cid) => { const d = document.querySelector(`#${cid} > details`); if (d) d.open = false; }, id);
  }
}

/* ---- 5. ことばの章の並び ---- */
await p.evaluate(() => { const d = document.querySelector("#phrases > details"); if (d) d.open = true; });
await p.waitForTimeout(600);
out.ことば = await p.evaluate(() => [...document.querySelectorAll("#phrases .gsub")].map((h) => (h.textContent || "").replace(/\s+/g, " ").trim()));
await p.evaluate(() => document.querySelector("#phrases").scrollIntoView({ block: "start" }));
await p.waitForTimeout(400);
await p.screenshot({ path: `${OUT}/ph.png` });

/* ---- 6. 全部開いてから、下まで送って測る ---- */
await p.evaluate(() => { for (const d of document.querySelectorAll("details")) d.open = true; });
await p.waitForTimeout(800);
await p.evaluate(async () => {
  const s = document.scrollingElement;
  for (let y = 0; y < s.scrollHeight; y += window.innerHeight) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); }
  window.scrollTo(0, s.scrollHeight);
});
await p.waitForTimeout(900);
out.開き切り = await p.evaluate(() => {
  const s = document.scrollingElement;
  return { 背: s.scrollHeight, 横あふれ: s.scrollWidth - s.clientWidth, 幅: s.clientWidth };
});
out.あふれ要素 = await p.evaluate(() => {
  const res = [];
  const lim = document.scrollingElement.clientWidth;
  for (const el of document.querySelectorAll("body *")) {
    if (el.ownerSVGElement) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    if (r.right > lim + 1 || r.left < -1) res.push({ tag: el.tagName, c: (typeof el.className === "string" ? el.className : "").slice(0, 30), l: Math.round(r.left), r: Math.round(r.right) });
  }
  return res.slice(0, 14);
});
out.絵文字 = await p.evaluate((re) => {
  const rx = new RegExp(re, "u");
  const res = [];
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) { const t = (n.textContent || "").trim(); if (t && rx.test(t)) res.push(t.slice(0, 30)); }
  return res.slice(0, 10);
}, EMOJI.source);
/* 開き切ったときの押しどころ（畳みの summary と、中のリンク） */
out.押しどころ = await p.evaluate(({ hitSrc }) => {
  const hit = eval(hitSrc);
  const bad = [];
  let n = 0, min = 9999;
  for (const el of document.querySelectorAll("summary, .gbook a, .gtoc a")) {
    el.scrollIntoView({ block: "center" });
    const h = hit(el);
    if (!h) continue;
    n++;
    min = Math.min(min, h.h);
    if (h.h < 48 || h.w < 48) bad.push(`${el.tagName}.${(typeof el.className === "string" ? el.className : "").split(/\s+/)[0]} «${(el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 16)}» ${h.w}x${h.h}`);
  }
  return { 測った数: n, 最小高: min, 未満48: bad.slice(0, 20), 未満48の数: bad.length };
}, { hitSrc: HIT });

/* ---- 7. 字の濃さ。**通しの1枚では測らない。** 面は 25,000px あって、
   dpr2 の通し撮りは 51,000px になる。その大きさだと2枚のあいだで
   描き直しがそろわず、**同じ字が 390px では「ink=#cdc104 地=#f3ecc9」、
   1280px では「ink=#ffffff 地=#cdc104」と逆に出た**（判定のほうの間違い。
   `docs/island-standards.md` 13）。画面ぶんずつ、その場で2枚撮る。 */
const SPOTS = (process.env.SPOTS || "0,head,gtoc,money,phrases,souvenir,trouble").split(",");
let inkN = 0;
const inkBoxes = [];
for (const spot of SPOTS) {
  if (spot === "0" || spot === "head") await p.evaluate(() => window.scrollTo(0, 0));
  else await p.evaluate((s) => {
    const el = document.getElementById(s) || document.querySelector("." + s);
    if (el) el.scrollIntoView({ block: "start" });
  }, spot);
  await p.waitForTimeout(600);
  const bs = await p.evaluate(() => {
    const res = [];
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const seen = new Set();
    const vh = window.innerHeight, vw = window.innerWidth;
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const t = (n.textContent || "").trim();
      if (!t) continue;
      const el = n.parentElement;
      if (!el || seen.has(el)) continue;
      seen.add(el);
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      // 画面に入っているぶんだけ。はみ出しているものは切って測る
      if (r.bottom <= 0 || r.top >= vh || r.right <= 0 || r.left >= vw) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none" || cs.opacity === "0") continue;
      if (el.checkVisibility?.({ opacityProperty: true, visibilityProperty: true, checkOpacity: true, checkVisibilityCSS: true }) === false) continue;
      let clipped = false;
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        const ac = getComputedStyle(a);
        if (ac.overflow === "visible" && ac.overflowY === "visible" && ac.overflowX === "visible") continue;
        const ar = a.getBoundingClientRect();
        if (r.bottom <= ar.top + 1 || r.top >= ar.bottom - 1 || r.right <= ar.left + 1 || r.left >= ar.right - 1) { clipped = true; break; }
      }
      if (clipped) continue;
      const svg = el.ownerSVGElement != null || el.tagName === "text";
      res.push({ t: t.slice(0, 24), c: el.className?.baseVal ?? (typeof el.className === "string" ? el.className : ""), tag: el.tagName, color: svg ? cs.fill : cs.color, opacity: cs.opacity, size: cs.fontSize, x: Math.max(0, r.x), y: Math.max(0, r.y), w: Math.min(vw, r.right) - Math.max(0, r.x), h: Math.min(vh, r.bottom) - Math.max(0, r.y) });
      el.setAttribute("data-inkmark", "1");
    }
    return res;
  });
  const nm = `_s${inkN}`;
  await p.screenshot({ path: `${INK}/${nm}.shot.png` });
  await p.evaluate(() => {
    for (const el of document.querySelectorAll("[data-inkmark]")) {
      el.style.setProperty("color", "transparent", "important");
      el.style.setProperty("text-shadow", "none", "important");
      el.style.setProperty("-webkit-text-stroke-color", "transparent", "important");
      if (el.ownerSVGElement || el.tagName === "text") { el.style.setProperty("fill", "transparent", "important"); el.style.setProperty("stroke", "transparent", "important"); }
    }
  });
  await p.waitForTimeout(250);
  await p.screenshot({ path: `${INK}/${nm}.bg.png` });
  writeFileSync(`${INK}/${nm}.json`, JSON.stringify({ dpr: DPR, boxes: bs }, null, 1));
  // 元に戻す。次の画面で字が透明のままだと、全部「差が無い」になる
  await p.evaluate(() => {
    for (const el of document.querySelectorAll("[data-inkmark]")) {
      el.style.removeProperty("color"); el.style.removeProperty("text-shadow");
      el.style.removeProperty("-webkit-text-stroke-color"); el.style.removeProperty("fill"); el.style.removeProperty("stroke");
      el.removeAttribute("data-inkmark");
    }
  });
  inkBoxes.push({ spot, 字: bs.length, file: nm });
  inkN++;
}
out.字 = inkBoxes;
out.JSエラー = errs;

writeFileSync(`${OUT}/report.json`, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
console.log(`\n絵は ${OUT}/ ／ 字の濃さ: for i in ${inkBoxes.map((b) => b.file).join(" ")}; do python3 tools/sprites/inkpx.py ${TAG} $i; done`);
await ctx.close();
await b.close();
