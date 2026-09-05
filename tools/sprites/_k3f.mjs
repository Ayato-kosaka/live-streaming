/** 面の中の字を全部あたって、11.5px 未満と、押しどころ 48px 未満を数える。 */
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";
const PORT = process.env.PORT || "3021";
const W = +(process.env.W || 390), H = +(process.env.H || 844);
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, isMobile: W < 640 });
await offline(ctx);
const p = await ctx.newPage();
await p.addInitScript(() => localStorage.setItem("ayato-island-arrived", "1"));
for (const path of process.argv.slice(2)) {
  await p.goto(`http://localhost:${PORT}${path}`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await p.waitForTimeout(1800);
  const r = await p.evaluate(() => {
    const small = new Map(), hits = [];
    for (const e of document.querySelectorAll("main *")) {
      const t = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      const cs = getComputedStyle(e);
      if (t) {
        const fs = parseFloat(cs.fontSize);
        if (fs < 11.5) {
          const k = `${fs}px ${e.tagName.toLowerCase()}.${e.className || "-"}`.slice(0, 70);
          small.set(k, (small.get(k) ?? 0) + 1);
        }
      }
      if (e.matches("a,button,summary,[role=button]")) {
        const b2 = e.getBoundingClientRect();
        if (b2.height > 0 && b2.height < 48) hits.push(`${Math.round(b2.height)}px ${e.tagName.toLowerCase()}.${String(e.className).slice(0, 30)}`);
      }
    }
    return { small: [...small.entries()], hits: [...new Set(hits)] };
  });
  console.log(path);
  r.small.forEach(([k, n]) => console.log(`  小 ${k} x${n}`));
  r.hits.forEach((k) => console.log(`  当 ${k}`));
  if (!r.small.length && !r.hits.length) console.log("  ok");
}
await b.close();
