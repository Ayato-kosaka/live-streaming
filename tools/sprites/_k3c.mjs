/**
 * 実際に描かれた画素から、字と地のコントラストを測る。
 * 要素を1枚ずつ撮って、いちばん多い色を地・暗いほうの3%点を字とする。
 * 地がグラデーションでも、影が入っていても、これなら効く。
 * PNG の読み出しはブラウザの canvas にやらせる（リポジトリに画像ライブラリが無い）。
 */
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";

const PORT = process.env.PORT || "3021";
const W = +(process.env.W || 390), H = +(process.env.H || 844);
const [path, ...sels] = process.argv.slice(2);

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: W < 640 });
await offline(ctx);
const p = await ctx.newPage();
await p.addInitScript(() => localStorage.setItem("ayato-island-arrived", "1"));
await p.goto(`http://localhost:${PORT}${path}`, { waitUntil: "domcontentloaded", timeout: 120000 });
await p.waitForTimeout(2000);
const lab = await ctx.newPage();
await lab.goto("about:blank");
console.log(`${path}  (${W}px)`);
for (const sel of sels) {
  const el = await p.$(sel);
  if (!el) { console.log(`  ${sel}: none`); continue; }
  const fs = await el.evaluate((e) => getComputedStyle(e).fontSize);
  let b64;
  try { b64 = (await el.screenshot({ type: "png" })).toString("base64"); } catch { console.log(`  ${sel}: 撮れず`); continue; }
  const r = await lab.evaluate(async (data) => {
    const img = new Image();
    img.src = "data:image/png;base64," + data;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    const g = c.getContext("2d");
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const L = (r2, g2, b2) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r2) + 0.7152 * f(g2) + 0.0722 * f(b2); };
    const hist = new Map(); const px = [];
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 200) continue;
      const k = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
      hist.set(k, (hist.get(k) ?? 0) + 1);
      px.push([L(d[i], d[i + 1], d[i + 2]), k]);
    }
    if (!px.length) return null;
    px.sort((a, b2) => a[0] - b2[0]);
    const ink = px[Math.floor(px.length * 0.03)];
    const bg = [...hist.entries()].sort((a, b2) => b2[1] - a[1])[0][0];
    const bl = L((bg >> 16) & 255, (bg >> 8) & 255, bg & 255);
    const hi = Math.max(bl, ink[0]), lo = Math.min(bl, ink[0]);
    return { ratio: (hi + 0.05) / (lo + 0.05), ink: "#" + ink[1].toString(16).padStart(6, "0"), bg: "#" + bg.toString(16).padStart(6, "0") };
  }, b64);
  if (!r) { console.log(`  ${sel}: 透明`); continue; }
  console.log(`  ${r.ratio < 4.5 ? "NG" : "ok"} ${r.ratio.toFixed(2)} : 1  ${sel}  字${r.ink} 地${r.bg} ${fs}`);
}
await b.close();
