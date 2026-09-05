/**
 * 実際に描かれた画素から、字と地のコントラストを測る。
 * 要素を1枚ずつ撮って、いちばん多い色を地・暗いほうの3%点を字とする。
 * 地がグラデーションでも、影が入っていても、これなら効く。
 */
import { chromium } from "playwright-core";
import { PNG } from "pngjs";
import { offline } from "./route.mjs";

const PORT = process.env.PORT || "3021";
const W = +(process.env.W || 390), H = +(process.env.H || 844);
const [path, ...sels] = process.argv.slice(2);

const lum = (r, g, b) => {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: W < 640 });
await offline(ctx);
const p = await ctx.newPage();
await p.addInitScript(() => localStorage.setItem("ayato-island-arrived", "1"));
await p.goto(`http://localhost:${PORT}${path}`, { waitUntil: "domcontentloaded", timeout: 120000 });
await p.waitForTimeout(2000);
console.log(path);
for (const sel of sels) {
  const els = await p.$$(sel);
  if (!els.length) { console.log(`  ${sel}: none`); continue; }
  const el = els[0];
  const fs = await el.evaluate((e) => getComputedStyle(e).fontSize);
  let buf;
  try { buf = await el.screenshot({ type: "png" }); } catch { console.log(`  ${sel}: 撮れず`); continue; }
  const png = PNG.sync.read(buf);
  const hist = new Map(); const px = [];
  for (let i = 0; i < png.data.length; i += 4) {
    const r = png.data[i], g = png.data[i + 1], bl = png.data[i + 2], a = png.data[i + 3];
    if (a < 200) continue;
    const k = `${r},${g},${bl}`;
    hist.set(k, (hist.get(k) ?? 0) + 1);
    px.push([lum(r, g, bl), r, g, bl]);
  }
  if (!px.length) { console.log(`  ${sel}: 透明`); continue; }
  px.sort((a2, b2) => a2[0] - b2[0]);
  const ink = px[Math.floor(px.length * 0.03)];
  const bgk = [...hist.entries()].sort((a2, b2) => b2[1] - a2[1])[0][0].split(",").map(Number);
  const L1 = Math.max(lum(...bgk), ink[0]), L2 = Math.min(lum(...bgk), ink[0]);
  const ratio = (L1 + 0.05) / (L2 + 0.05);
  const hex = (a2) => "#" + a2.map((v) => v.toString(16).padStart(2, "0")).join("");
  console.log(`  ${ratio < 4.5 ? "NG" : "ok"} ${ratio.toFixed(2)} : 1  ${sel}  字${hex([ink[1], ink[2], ink[3]])} 地${hex(bgk)} ${fs}`);
}
await b.close();
