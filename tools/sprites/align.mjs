import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--no-sandbox"]});
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await ctx.route(/googleusercontent\.com/, r => r.fulfill({ path: "/home/user/live-streaming/site/public/characters/ayato.png" }));
const p = await ctx.newPage();
await p.addInitScript(() => localStorage.setItem("ayato-island-arrived", "1"));
await p.goto("http://localhost:3000/", { waitUntil: "domcontentloaded", timeout: 60000 });
await p.waitForTimeout(3000);
// 引き（島ぜんぶ）にする
const z = await p.$(".bar-zoom"); if (z) await z.click();
await p.waitForTimeout(2500);

console.log(await p.evaluate(() => {
  const out = [];
  const glows = [...document.querySelectorAll(".spot-glow")];
  const hits  = [...document.querySelectorAll(".spot-hit")];
  const imgs  = [...document.querySelectorAll(".stage-svg image")];
  // 建物スプライトを href で拾う
  const names = ["tower-studio","hut-kitchen","hut-workshop","signpost","hall-museum","mailbox","tent","signboard","campfire"];
  for (const n of names) {
    const img = imgs.find(i => i.getAttribute("href")?.includes(`/${n}.webp`));
    const gi = names.indexOf(n);
    if (!img) { out.push([n, "no img"]); continue; }
    const ir = img.getBoundingClientRect();
    // 対応する glow を中心距離で探す
    let best = null, bd = 1e9;
    for (const g of glows) { const gr = g.getBoundingClientRect();
      const d = Math.hypot(gr.x+gr.width/2 - (ir.x+ir.width/2), gr.y+gr.height/2 - (ir.y+ir.height));
      if (d < bd) { bd = d; best = gr; } }
    out.push({
      n,
      imgCx: Math.round(ir.x + ir.width/2), imgBottom: Math.round(ir.y + ir.height),
      glowCx: Math.round(best.x + best.width/2), glowCy: Math.round(best.y + best.height/2),
      dx: Math.round(best.x + best.width/2 - (ir.x + ir.width/2)),
    });
  }
  return JSON.stringify(out, null, 1);
}));
await b.close();
