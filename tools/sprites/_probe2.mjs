import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--no-sandbox"]});
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile:true, hasTouch:true });
const p = await ctx.newPage();
await p.goto("http://localhost:3022/map/georgia", { waitUntil:"networkidle" });
await p.waitForTimeout(600);
console.log(await p.evaluate(() => ({
  scrollW: document.documentElement.scrollWidth, inner: innerWidth,
  chips: document.querySelectorAll(".panel .chips .chip").length,
  chipsH: Math.round(document.querySelector(".panel:last-of-type .chips")?.getBoundingClientRect().height||0),
  cities: document.querySelectorAll(".city").length,
  folds: document.querySelectorAll(".hlist .fold").length,
})));
const el = await p.$$(".panel"); const last = el[el.length-1];
await last.scrollIntoViewIfNeeded(); await p.waitForTimeout(300);
await last.screenshot({ path: "/tmp/r3/gefood.png" });
await b.close();
