import { chromium } from "playwright-core";
import { offline } from "./route.mjs";
const PORT = process.env.PORT || "3041";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await offline(ctx);
await ctx.addInitScript(() => { try { localStorage.setItem("ayato-island-arrived", "1"); localStorage.setItem("ayato-island-walked", "1"); } catch (e) {} });
const p = await ctx.newPage();
await p.goto(`http://localhost:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 120000 });
await p.waitForTimeout(3500);
const r = await p.evaluate(() => {
  const box = (n) => { const b = n.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height), x: Math.round(b.left), y: Math.round(b.top) }; };
  const spots = [...document.querySelectorAll(".spot")].map((s) => {
    const hit = s.querySelector(".spot-hit"), mark = s.querySelector(".spot-mark"), go = s.querySelector(".spot-go"), img = s.querySelector("img");
    const cs = mark && getComputedStyle(mark);
    return {
      id: s.className.toString(),
      hit: hit ? { ...box(hit), tag: hit.tagName, href: hit.getAttribute("href") } : null,
      mark: mark ? { ...box(mark), tag: mark.tagName, href: mark.getAttribute("href"), vis: cs.visibility, op: cs.opacity, sh: cs.boxShadow.slice(0, 50), bg: cs.backgroundImage.slice(0, 60), anim: cs.animation.slice(0, 40) } : null,
      go: !!go, img: img ? box(img) : null,
    };
  });
  const bar = document.querySelector(".island-bar");
  const barSpots = [...document.querySelectorAll(".bar-spot")].map((n) => ({ tag: n.tagName, href: n.getAttribute("href"), ...box(n) }));
  const st = document.querySelector(".stage");
  const who = [...document.querySelectorAll(".who")].map((n) => ({ cls: n.className.toString().slice(0, 40), ...box(n), hit: n.querySelector(".who-hit") ? box(n.querySelector(".who-hit")) : null }));
  return { stage: st ? box(st) : null, bar: bar ? box(bar) : null, barSpots, spots, who: who.length, whoSample: who.slice(0, 3), whoBang: document.querySelectorAll(".who-bang, .who-hi, .is-call, .who-call").length };
});
console.log(JSON.stringify(r, null, 1));
await b.close();
