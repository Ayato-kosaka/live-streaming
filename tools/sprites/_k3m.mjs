// 要素の実寸を測る。「大きくしたつもり」を数字で確かめるため。
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
const out = await p.evaluate((ss) => ss.map((s) => {
  const e = document.querySelector(s);
  if (!e) return `${s}: none`;
  const r = e.getBoundingClientRect();
  return `${s}: ${Math.round(r.width)}x${Math.round(r.height)} @y${Math.round(r.top + scrollY)}`;
}), sels);
console.log(`${W}px ${path}`);
out.forEach((l) => console.log("  " + l));
await b.close();
