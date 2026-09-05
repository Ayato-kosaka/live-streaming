// 2周目の担当（/map /about /apps）の実測用。撮って高さと要点を出す。
import { chromium } from "playwright-core";
const PORT = process.env.PORT || "3022";
const W = Number(process.env.W || 390), H = Number(process.env.H || 844);
const pages = (process.env.PAGES || "/about,/map,/apps,/map/france,/apps/nanitabeyo").split(",");
const tag = process.env.TAG || "a";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--no-sandbox"]});
const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: W < 700, hasTouch: W < 700 });
await ctx.route(/googleusercontent\.com|upload\.wikimedia\.org/, (r) => r.fulfill({ path: "/home/user/live-streaming/site/public/characters/ayato.png" }));
const p = await ctx.newPage();
p.on("pageerror", e => console.log("  [pageerror]", String(e).slice(0,200)));
await p.addInitScript(() => localStorage.setItem("ayato-island-arrived", "1"));
for (const path of pages) {
  await p.goto(`http://localhost:${PORT}${path}`, { waitUntil: "networkidle", timeout: 90000 });
  await p.waitForTimeout(1200);
  const info = await p.evaluate(() => {
    const h = document.documentElement.scrollHeight;
    const h1 = document.querySelector("h1")?.textContent?.trim();
    const over = [...document.querySelectorAll("body *")].filter(e => e.getBoundingClientRect().right > innerWidth + 1.5).map(e => e.tagName+"."+[...e.classList].join("."));
    const tabs = [...document.querySelectorAll(".amap-tab")].map(e => { const r = e.getBoundingClientRect(); return `${e.textContent.trim()} ${Math.round(r.width)}x${Math.round(r.height)} @y${Math.round(r.top)}`; });
    const head = document.querySelector(".phead");
    const headBottom = head ? Math.round(head.getBoundingClientRect().bottom + scrollY) : null;
    const panels = [...document.querySelectorAll("main .panel")].map(e => { const r = e.getBoundingClientRect(); return `${(e.querySelector("h2")?.textContent||"?").slice(0,16)} ${Math.round(r.height)}`; });
    return { h, h1, over: [...new Set(over)].slice(0,8), tabs, headBottom, panels };
  });
  console.log(`${path}  h=${info.h} (${(info.h/844).toFixed(1)}画面)  h1=${info.h1}  head底=${info.headBottom}`);
  if (info.tabs.length) console.log("   tabs:", info.tabs.join(" | "));
  if (info.over.length) console.log("   はみ出し:", info.over.join(", "));
  if (info.panels.length) console.log("   panel:", info.panels.join(" / "));
  await p.screenshot({ path: `/tmp/r3/${tag}${path.replace(/\//g,"_")}.png`, fullPage: !process.env.VIEW });
}
await b.close();
