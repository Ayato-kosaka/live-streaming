import { chromium } from "playwright-core";
import { offline } from "/home/user/live-streaming/tools/sprites/route.mjs";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true });
await offline(ctx);
const p = await ctx.newPage();
await p.goto("http://localhost:3041/board", { waitUntil: "domcontentloaded", timeout: 120000 });
await p.waitForTimeout(3000);
console.log(JSON.stringify(await p.evaluate(() => [...document.querySelectorAll(".signin-go, .signin, .signin-link, .signin-skip, .signin-warn")].map(n => {
  const cs = getComputedStyle(n); const r = n.getBoundingClientRect();
  return { cls: n.className, tag: n.tagName, dis: n.disabled, txt: (n.textContent||"").trim().slice(0,26), color: cs.color, bg: cs.backgroundColor, bgi: cs.backgroundImage.slice(0,40), w: Math.round(r.width), h: Math.round(r.height), sh: cs.boxShadow.slice(0,60) };
})), null, 1));
await b.close();
