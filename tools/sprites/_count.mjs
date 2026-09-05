import { chromium } from "playwright-core";
const PORT = process.env.PORT || "3014";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
await ctx.route(/googleusercontent\.com/, r => r.fulfill({ path: "/home/user/live-streaming/site/public/characters/ayato.png" }));
const p = await ctx.newPage();
await p.addInitScript(() => localStorage.setItem("ayato-island-arrived", "1"));
await p.goto(`http://localhost:${PORT}/`, { waitUntil: "load", timeout: 120000 });
await p.waitForTimeout(4000);
const r = await p.evaluate(() => {
  const svg = document.querySelector(".stage-svg");
  const tally = {};
  svg.querySelectorAll("*").forEach(e => { tally[e.tagName] = (tally[e.tagName]||0)+1; });
  const hrefs = {};
  svg.querySelectorAll("image").forEach(e => {
    const h = (e.getAttribute("href")||"").split("/").pop();
    hrefs[h] = (hrefs[h]||0)+1;
  });
  // パスの点の多さ
  const heavy = [...svg.querySelectorAll("path")].map(e => (e.getAttribute("d")||"").length).sort((a,b)=>b-a).slice(0,15);
  return {
    total: svg.querySelectorAll("*").length,
    tally,
    imgs: Object.entries(hrefs).sort((a,b)=>b[1]-a[1]),
    distinct: Object.keys(hrefs).length,
    heavy,
    dLen: [...svg.querySelectorAll("path")].reduce((s,e)=>s+(e.getAttribute("d")||"").length,0),
    docAll: document.querySelectorAll("*").length,
    allSvg: document.querySelectorAll("svg *").length,
  };
});
console.log("stage-svg total", r.total, "docAll", r.docAll, "allSvg", r.allSvg);
console.log("tally", JSON.stringify(r.tally));
console.log("distinct sprite files", r.distinct);
console.log(r.imgs.map(([k,v])=>`${v} ${k}`).join("\n"));
console.log("total d length", r.dLen, "top d lengths", r.heavy.join(","));
await b.close();
