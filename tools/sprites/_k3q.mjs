import { chromium } from "playwright-core";
import { offline } from "./route.mjs";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true });
await offline(ctx);
const p = await ctx.newPage();
await p.goto("http://localhost:3021/legends", { waitUntil: "domcontentloaded", timeout: 120000 });
await p.waitForTimeout(1800);
console.log(await p.evaluate(() => [...document.querySelectorAll(".zk-hr")].map(h => {
  const hi = h.querySelector(".zk-hi"), zh = h.querySelector(".zk-h");
  const cs = zh ? getComputedStyle(zh) : null;
  return { text: zh?.textContent.slice(0,16), hr: Math.round(h.getBoundingClientRect().height),
    hiTop: hi ? Math.round(hi.getBoundingClientRect().top) : null,
    hTop: zh ? Math.round(zh.getBoundingClientRect().top) : null,
    hW: zh ? Math.round(zh.getBoundingClientRect().width) : null,
    flex: cs?.flex, minw: cs?.minWidth, disp: cs?.display };
})));
await b.close();
