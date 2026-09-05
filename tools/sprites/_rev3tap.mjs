/** 48px（島の決めごと）を割る押しどころと、厚みの付き方を21面で数える。 */
import { chromium } from "playwright-core";
import { writeFileSync } from "fs";
import { offline } from "./route.mjs";
const PORT = process.env.PORT || "3041";
const PAGES = ["/", "/about", "/friends", "/streams", "/streams/cooking", "/kitchen", "/kitchen/egg-sandwich", "/legends", "/legends/iran-walk", "/apps", "/apps/nanitabeyo", "/now", "/next", "/next/new", "/nordic", "/nordic/finland", "/nordic/guide", "/board", "/map", "/map/france", "/design"];
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await offline(ctx);
await ctx.addInitScript(() => { try { localStorage.setItem("ayato-island-arrived", "1"); localStorage.setItem("ayato-island-walked", "1"); } catch (e) {} });
const p = await ctx.newPage();
const out = [];
for (const path of PAGES) {
  await p.goto(`http://localhost:${PORT}` + path, { waitUntil: "domcontentloaded", timeout: 120000 });
  await p.waitForTimeout(2500);
  out.push(await p.evaluate((path) => {
    const key = (el) => el.tagName.toLowerCase() + (typeof el.className === "string" && el.className.trim() ? "." + el.className.trim().split(/\s+/).slice(0, 3).join(".") : "");
    /** 「0 Npx 0」の厚み。色は rgb でも color(srgb …) でも来るので、色を消してから数を読む */
    const isPop = (bs) => {
      if (!bs || bs === "none") return false;
      const nocolor = bs.replace(/(rgba?|color|hsla?|lab|oklch|lch|oklab)\([^()]*(\([^()]*\))?[^()]*\)/g, "C");
      for (const part of nocolor.split(/,(?![^(]*\))/)) {
        if (/inset/.test(part)) continue;
        const m = part.match(/(-?[\d.]+)px\s+(-?[\d.]+)px\s+(-?[\d.]+)px/);
        if (m && +m[3] === 0 && +m[2] >= 2) return true;
      }
      return false;
    };
    const small = {}, flat = {}, fakePop = {};
    for (const el of document.querySelectorAll("a[href], button, [role=button], summary, input, select, textarea")) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none") continue;
      const w = Math.round(r.width), h = Math.round(r.height), k = key(el);
      if (w < 48 || h < 48) { const e = small[k] ||= { w, h, n: 0 }; e.n++; e.w = Math.min(e.w, w); e.h = Math.min(e.h, h); }
      if (!isPop(cs.boxShadow)) { const e = flat[k] ||= { n: 0, w, h }; e.n++; }
    }
    for (const el of document.querySelectorAll("body *")) {
      if (el.closest("a[href],button,[role=button],summary,label,input,select,textarea")) continue;
      const cs = getComputedStyle(el);
      if (!isPop(cs.boxShadow)) continue;
      const k = key(el);
      const e = fakePop[k] ||= { n: 0, bs: cs.boxShadow.slice(0, 46) }; e.n++;
    }
    return { path, small, flat, fakePop };
  }, path));
}
await b.close();
writeFileSync("/tmp/r3/tap.json", JSON.stringify(out, null, 1));
console.log("ok");
