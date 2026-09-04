import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--no-sandbox"]});
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
await p.addInitScript(() => localStorage.setItem("ayato-island-arrived", "1"));
await p.goto("http://localhost:3000/", { waitUntil: "domcontentloaded", timeout: 60000 });
await p.waitForTimeout(3500);
console.log(await p.evaluate(() => {
  const gs = [...document.querySelectorAll(".spot-glow")];
  return JSON.stringify(gs.slice(0,3).map(g => {
    const cs = getComputedStyle(g);
    const r = g.getBoundingClientRect();
    return { cls: g.getAttribute("class"), op: cs.opacity, fill: g.getAttribute("fill"), rect: [Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)] };
  }), null, 1) + "\ncount=" + gs.length + " defs=" + !!document.getElementById("spotG");
}));
await b.close();
