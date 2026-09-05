import { chromium } from "playwright-core";
const SPORT = process.env.SPORT || "4914";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
await ctx.route(/googleusercontent\.com/, r => r.fulfill({ path: "/home/user/live-streaming/tools/sprites/avatar-160.png" }));
await ctx.route(/upload\.wikimedia\.org|instagram\.com|ytimg\.com|youtube\.com/, r => r.fulfill({ path: "/home/user/live-streaming/site/public/og.png" }));
const p = await ctx.newPage();
const rows = [];
p.on("response", r => { const len = +(r.headers()["content-length"]||0); rows.push({ u: r.url().replace(/^https?:\/\//,"").slice(0,80), len }); });
await p.goto(`http://localhost:${SPORT}/index.html`, { waitUntil: "load", timeout: 180000 });
await p.waitForTimeout(4000);
rows.sort((a,c)=>c.len-a.len);
console.log("TOTAL", (rows.reduce((s,r)=>s+r.len,0)/1024).toFixed(0), "KB /", rows.length, "reqs");
const grp = {};
for (const r of rows) { const k = r.u.includes("/sprites/")?"sprites":r.u.includes("woff2")?"font":r.u.includes("wikimedia")||r.u.includes("ytimg")||r.u.includes("youtube")||r.u.includes("instagram")?"外の写真(og.png代用)":r.u.includes("googleusercontent")?"住人アイコン":r.u.endsWith(".js")?"js":"その他"; grp[k]=(grp[k]||0)+r.len; }
console.log(Object.entries(grp).sort((a,c)=>c[1]-a[1]).map(([k,v])=>`${k} ${(v/1024).toFixed(0)}KB`).join("  |  "));
console.log("--- top 20 ---");
for (const r of rows.slice(0,20)) console.log((r.len/1024).toFixed(1).padStart(8), r.u);
const c = await p.evaluate(() => {
  const s = document.querySelector(".stage-svg");
  return { stage: s ? s.querySelectorAll("*").length : 0, stageImg: s ? s.querySelectorAll("image").length : 0,
           doc: document.querySelectorAll("*").length, svg: document.querySelectorAll("svg *").length };
});
console.log("島のSVG要素", c.stage, "うち画像", c.stageImg, "／ ページ全体 node", c.doc, "svg", c.svg);
await b.close();
