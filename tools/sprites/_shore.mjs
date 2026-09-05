/** 引きの島を撮って、西の岸を横に切った画素を並べる（docs/ac-reference.md 2章と同じ測り方）。 */
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";
import { PNG } from "pngjs";
import fs from "node:fs";
const OUT = process.env.OUT || "/tmp/acmp/now";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
await offline(ctx, { photo: "/home/user/live-streaming/tools/sprites/photo-480.jpg" });
const p = await ctx.newPage();
await p.addInitScript(() => { try { localStorage.setItem("ayato-island-arrived","2026-09-04"); localStorage.setItem("ayato-island-walked","1"); } catch {} });
await p.goto("http://localhost:4120/index.html", { waitUntil: "load", timeout: 60000 });
await p.waitForTimeout(3000);
await p.click(".stage-view").catch(() => {});   // 「島をながめる」
await p.waitForTimeout(3000);
await p.locator(".stage").screenshot({ path: `${OUT}.png` });
const png = PNG.sync.read(fs.readFileSync(`${OUT}.png`));
const row = Number(process.env.ROW || Math.round(png.height * 0.5));
const px = (x) => { const i = (png.width * row + x) * 4; return [png.data[i], png.data[i + 1], png.data[i + 2]]; };
const hex = (c) => "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
// 左端から中心へ向かって、色が変わったところで区切る
let bands = [], prev = null, start = 0;
for (let x = 0; x < png.width / 2; x++) {
  const c = px(x);
  if (prev && Math.abs(c[0] - prev[0]) + Math.abs(c[1] - prev[1]) + Math.abs(c[2] - prev[2]) < 9) continue;
  if (prev) bands.push({ w: x - start, c: hex(prev) });
  prev = c; start = x;
}
bands.push({ w: Math.round(png.width / 2) - start, c: hex(prev) });
console.log(`${OUT}.png  ${png.width}×${png.height}  y=${row} の横切り（左端→中心）`);
for (const bd of bands) if (bd.w >= 4) console.log(`  ${String(bd.w).padStart(4)}px  ${bd.c}`);
await b.close();
