import { chromium } from "playwright-core";
import { offline } from "./route.mjs";
const T = JSON.parse(process.env.T);
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true });
await offline(ctx);
await ctx.addInitScript(() => { try { localStorage.setItem("ayato-island-arrived", "1"); localStorage.setItem("ayato-island-walked", "1"); } catch (e) {} });
const p = await ctx.newPage();
for (const [path, sels] of Object.entries(T)) {
  await p.goto("http://localhost:3041" + path, { waitUntil: "domcontentloaded", timeout: 120000 });
  await p.waitForTimeout(2600);
  console.log("###", path);
  const rows = await p.evaluate((sels) => sels.map((s) => {
    const n = document.querySelector(s);
    if (!n) return s + " 無い";
    const cs = getComputedStyle(n); const r = n.getBoundingClientRect();
    let bg = "透明", el = n;
    while (el && el !== document.documentElement) { const c = getComputedStyle(el); if (c.backgroundColor !== "rgba(0, 0, 0, 0)") { bg = c.backgroundColor + " ← " + (el.className || el.tagName).toString().slice(0, 26); break; } if (c.backgroundImage !== "none") { bg = "画 " + c.backgroundImage.slice(0, 46) + " ← " + (el.className || el.tagName).toString().slice(0, 26); break; } el = el.parentElement; }
    return `${s}  ${Math.round(r.width)}x${Math.round(r.height)} y=${Math.round(r.top)} 字${cs.color} ${parseFloat(cs.fontSize)}px 地:${bg}`;
  }), sels); console.log(rows.join("\n"));
}
await b.close();
