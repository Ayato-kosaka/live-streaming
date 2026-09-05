import { chromium } from "playwright-core";
import sharp from "/home/user/live-streaming/site/node_modules/sharp/lib/index.js";

const PORT = process.env.PORT || "3015";
const PAGES = (process.env.PAGES || "/nordic,/nordic/finland,/nordic/guide").split(",");
const OUT = process.env.OUT || "/tmp/n2";

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await ctx.route(/upload\.wikimedia\.org/, r => r.fulfill({ path: "/home/user/live-streaming/site/public/og.png" }));
await ctx.route(/lh3\.googleusercontent\.com/, r => r.fulfill({ path: "/home/user/live-streaming/site/public/og.png" }));
const p = await ctx.newPage();
const errs = [];
p.on("pageerror", e => errs.push(String(e).slice(0, 200)));

function lum(r, g, b) {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function ratio(a, b) { const l1 = lum(...a), l2 = lum(...b); const [h, l] = l1 > l2 ? [l1, l2] : [l2, l1]; return (h + 0.05) / (l + 0.05); }

for (const url of PAGES) {
  await p.goto(`http://localhost:${PORT}${url}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await p.waitForTimeout(2600);
  const data = await p.evaluate(() => {
    const out = { h: document.documentElement.scrollHeight, panels: 0, paper: 0, thickNoPress: [], small: [], texts: [] };
    const press = (el) => el.closest("a,button,summary,label,input,select,textarea,[role=button]") != null;
    document.querySelectorAll(".panel").forEach(e => { out.panels++; if (e.classList.contains("paper")) out.paper++; });
    const seen = new Map();
    document.querySelectorAll("*").forEach(el => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;
      const sh = cs.boxShadow;
      // 「厚み」= ぼかし 0 の下向きオフセット
      if (sh && sh !== "none" && /\brgb/.test(sh)) {
        const m = [...sh.matchAll(/(-?\d+(?:\.\d+)?)px (-?\d+(?:\.\d+)?)px (-?\d+(?:\.\d+)?)px/g)];
        // 厚みは真下。接地影（--shadow-1 = 1px 3px 0）は横にずれているので別物。
        const thick = m.some(x => +x[1] === 0 && +x[2] >= 3 && +x[3] === 0);
        if (thick && !press(el)) {
          const k = el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).join(".") : el.tagName;
          out.thickNoPress.push(k);
        }
      }
      const fs = parseFloat(cs.fontSize);
      const t = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join("").trim();
      if (t && fs < 11.5) {
        const k = (el.tagName.toLowerCase()) + (el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).join(".") : "");
        out.small.push(`${fs}px ${k}`);
      }
      const closed = el.closest("details:not([open])");
      const vis = typeof el.checkVisibility === "function" ? el.checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true }) : true;
      if (t && t.length > 0 && r.width > 4 && r.height > 4 && !closed && vis) {
        const k = (el.tagName.toLowerCase()) + (el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).join(".") : "");
        if (!seen.has(k)) { seen.set(k, true); out.texts.push({ k, fs, x: r.x, y: r.y + window.scrollY, w: Math.min(r.width, 360), h: Math.min(r.height, 40), color: cs.color }); }
      }
    });
    const c = {}; out.thickNoPress.forEach(k => c[k] = (c[k] || 0) + 1); out.thickNoPress = c;
    const s = {}; out.small.forEach(k => s[k] = (s[k] || 0) + 1); out.small = s;
    return out;
  });

  // 実際に描かれた画素から比を測る。
  // 1枚だけ全面を撮って、あとは 文書座標で切り出す
  // （clip は viewport の中しか撮れないので、下のほうの字が測れない）。
  const full = await p.screenshot({ fullPage: true, scale: "css" });
  const bad = [];
  for (const t of data.texts) {
    if (t.h < 6 || t.w < 6) continue;
    let px, info;
    try {
      const r = await sharp(full).ensureAlpha()
        .extract({ left: Math.max(0, Math.round(t.x)), top: Math.max(0, Math.round(t.y)), width: Math.round(t.w), height: Math.round(t.h) })
        .raw().toBuffer({ resolveWithObject: true });
      px = r.data; info = r.info;
    } catch { continue; }
    const counts = new Map(); const lums = [];
    for (let i = 0; i < px.length; i += 4) {
      const r = px[i], g = px[i + 1], bl = px[i + 2], a = px[i + 3];
      if (a < 200) continue;
      const key = (r >> 3) + "," + (g >> 3) + "," + (bl >> 3);
      const e = counts.get(key) || { n: 0, r: 0, g: 0, b: 0 };
      e.n++; e.r += r; e.g += g; e.b += bl; counts.set(key, e);
      lums.push({ l: lum(r, g, bl), c: [r, g, bl] });
    }
    if (lums.length < 40) continue;
    let top = null; for (const v of counts.values()) if (!top || v.n > top.n) top = v;
    const bg = [Math.round(top.r / top.n), Math.round(top.g / top.n), Math.round(top.b / top.n)];
    // 字が暗いか明るいかは決めうちできない（琥珀の丸に白抜きの数字もある）。
    // パーセンタイルで取ると、小さい字ではフチのぼけた画素を拾って
    // 実際より悪い数字が出る。だから「まとまった数のある色」の中から、
    // 地からいちばん遠いものを字とする。
    const min = Math.max(4, Math.floor(lums.length * 0.006));
    let ink = bg, cr = 1;
    for (const v of counts.values()) {
      if (v.n < min) continue;
      const c = [Math.round(v.r / v.n), Math.round(v.g / v.n), Math.round(v.b / v.n)];
      const rr = ratio(c, bg);
      if (rr > cr) { cr = rr; ink = c; }
    }
    // 字がまったく描かれていないところは、地と地を比べて 1.0 になる。測らない。
    if (cr < 1.35) continue;
    if (cr < 4.5) bad.push({ k: t.k, fs: t.fs, cr: +cr.toFixed(2), ink: ink.join(","), bg: bg.join(",") });
  }
  bad.sort((a, b) => a.cr - b.cr);
  console.log("=== " + url + " ===");
  console.log("height", data.h, "panels", data.panels, "paper", data.paper);
  console.log("厚みがあるのに押せない:", JSON.stringify(data.thickNoPress, null, 0));
  console.log("11.5px未満:", JSON.stringify(data.small, null, 0));
  console.log("4.5:1未満:", JSON.stringify(bad, null, 0));
  if (errs.length) console.log("JSエラー:", errs);
}
await b.close();
