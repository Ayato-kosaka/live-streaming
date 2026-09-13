/**
 * 買う節の**字の濃さ**を、本番の画素から測る（撮るほう。読むのは `inkpx.py`）。
 *
 *   TAG=shop390 node tools/sprites/shopink.mjs
 *   python3 tools/sprites/inkpx.py shop390 _nordic_day_3
 *
 * `inkpx.mjs` は localhost の面を丸ごと撮る道具で、2つ都合が悪い:
 *
 *   1. **本番を撮れない**（この箱のブラウザは届かない。curl で横取りが要る）
 *   2. 日ページは 14,772px ある。dpr2 で丸ごと撮ると 29,544px になり、
 *      **絵の端が白く抜けて、読める字が「割れている」と出る**（`island-misses.md` #80）
 *
 * なので**買う節だけ**を切り取って撮る。切り取ると座標がずれるので、
 * 箱の位置も切り取りの左上ぶん引いてから書き出す。
 *
 * `NOW=` で時計を差し込めば、「いま開いてる」の札も測れる。
 * 夜に測ると閉まっている札しか出ないので、緑の字は測れないまま合格になる。
 */
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "fs";
import { viaCurl, ORIGIN } from "./prod.mjs";
import { offline } from "./route.mjs";

/* 出す前に自分の箱で測るための口。`BASE=http://127.0.0.1:4210` で
   書き出したものを開く。**渡さなければ本番。** */
const BASE = process.env.BASE || "";

const PATH = process.env.PAGE || "/nordic/day/3";
const ROOT = process.env.ROOT || ".nshop";
const TAG = process.env.TAG || "shop";
const W = Number(process.env.W || 390);
const DPR = Number(process.env.DPR || 2);
const NOW = process.env.NOW || "";
const OPENALL = process.env.OPENALL === "1";
const OUT = `/tmp/ink/${TAG}`;
mkdirSync(OUT, { recursive: true });

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const ctx = await b.newContext({
  viewport: { width: W, height: 900 },
  deviceScaleFactor: DPR,
  isMobile: W < 700,
  hasTouch: W < 700,
  reducedMotion: "reduce",
});
if (BASE) await offline(ctx).catch(() => {});
else await viaCurl(ctx);
if (NOW) {
  await ctx.addInitScript(`(() => {
    const base = new Date(${JSON.stringify(NOW)}).getTime();
    const Real = Date;
    class Fake extends Real {
      constructor(...a) { super(...(a.length ? a : [base])); }
      static now() { return base; }
    }
    window.Date = Fake;
  })()`);
}
const p = await ctx.newPage();
await p.goto(BASE ? `${BASE}${PATH}.html` : `${ORIGIN}${PATH}`, { waitUntil: "domcontentloaded" });
await p.waitForTimeout(BASE ? 3000 : 9000);
/* 島と同じで、2枚のあいだに動かれると差分に字でない画素が混ざる。 */
await p.evaluate(() => {
  window.requestAnimationFrame = () => 0;
});
await p.evaluate((sel) => {
  for (const d of document.querySelectorAll(`${sel} details`)) d.open = true;
}, ROOT);
if (OPENALL) {
  for (let i = 0; i < 40; i++) {
    const btns = await p.$$(`${ROOT} .longer`);
    let pressed = false;
    for (const btn of btns) {
      const t = (await btn.textContent()) || "";
      if (/だす/.test(t)) { await btn.click().catch(() => {}); pressed = true; }
    }
    if (!pressed) break;
    await p.waitForTimeout(250);
  }
}
await p.waitForTimeout(1200);

const boxes = await p.evaluate((sel) => {
  const root = document.querySelector(sel);
  const rr = root.getBoundingClientRect();
  const ox = rr.left + window.scrollX;
  const oy = rr.top + window.scrollY;
  const out = [];
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const t = (n.textContent || "").trim();
    if (!t) continue;
    const el = n.parentElement;
    if (!el || seen.has(el)) continue;
    seen.add(el);
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || cs.opacity === "0") continue;
    if (el.checkVisibility?.({ opacityProperty: true, visibilityProperty: true,
      checkOpacity: true, checkVisibilityCSS: true }) === false) continue;
    const svg = el.ownerSVGElement != null || el.tagName === "text";
    out.push({
      t: t.slice(0, 24),
      c: el.className?.baseVal ?? (typeof el.className === "string" ? el.className : ""),
      tag: el.tagName,
      color: svg ? cs.fill : cs.color,
      opacity: cs.opacity,
      size: cs.fontSize,
      // 切り取った絵の中での座標にする
      x: r.x + window.scrollX - ox,
      y: r.y + window.scrollY - oy,
      w: r.width, h: r.height,
    });
    el.setAttribute("data-inkmark", String(out.length - 1));
  }
  return out;
}, ROOT);

const name = PATH.replace(/\//g, "_") || "_";
const el = await p.$(ROOT);
await el.screenshot({ path: `${OUT}/${name}.shot.png` });
await p.evaluate(() => {
  for (const e of document.querySelectorAll("[data-inkmark]")) {
    e.style.setProperty("color", "transparent", "important");
    e.style.setProperty("text-shadow", "none", "important");
    e.style.setProperty("-webkit-text-stroke-color", "transparent", "important");
    if (e.ownerSVGElement || e.tagName === "text") {
      e.style.setProperty("fill", "transparent", "important");
      e.style.setProperty("stroke", "transparent", "important");
    }
  }
});
await el.screenshot({ path: `${OUT}/${name}.bg.png` });
writeFileSync(`${OUT}/${name}.json`, JSON.stringify({ dpr: DPR, boxes }, null, 1));
console.log(`${PATH} ${ROOT}  ${boxes.length}か所  →  python3 tools/sprites/inkpx.py ${TAG} ${name}`);
await b.close();
