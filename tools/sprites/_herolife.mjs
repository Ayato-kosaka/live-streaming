/** ふつうに歩き回ったとき、看板が引いている時間の割合を数える。 */
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
for (const [name, vp] of [["PC", { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }],
                          ["スマホ", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]]) {
  const ctx = await b.newContext(vp);
  await offline(ctx, { photo: "/home/user/live-streaming/tools/sprites/photo-480.jpg" });
  const p = await ctx.newPage();
  await p.addInitScript(() => { try { localStorage.setItem("ayato-island-arrived","2026-09-04"); localStorage.setItem("ayato-island-walked","1"); } catch {} });
  await p.goto("http://localhost:4120/index.html", { waitUntil: "load", timeout: 60000 });
  await p.waitForTimeout(3500);
  await p.evaluate(() => {
    window.__n = 0; window.__away = 0; window.__flip = 0; let prev = null;
    const st = document.querySelector(".stage");
    setInterval(() => { const a = st.getAttribute("data-logo") === "away"; window.__n++; if (a) window.__away++; if (prev !== null && a !== prev) window.__flip++; prev = a; }, 100);
    let n = 0;
    setInterval(() => { const r = st.getBoundingClientRect();
      st.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: r.left + r.width * (0.15 + 0.7 * Math.random()), clientY: r.top + r.height * (0.2 + 0.6 * Math.random()) })); n++; }, 1800);
  });
  await p.waitForTimeout(26000);
  const r = await p.evaluate(() => ({ n: window.__n, away: window.__away, flip: window.__flip }));
  console.log(`${name}  看板が引いていた時間 ${Math.round((r.away / r.n) * 100)}%   引いたり戻ったりした回数 ${r.flip} / 26秒`);
  await p.close(); await ctx.close();
}
await b.close();
