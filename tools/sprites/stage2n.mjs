/* 夜の島を撮る。確かめ用の一時スクリプト（終わったら消す）。 */
import { chromium } from "playwright-core";

const PORT = process.env.PORT || "3012";
const TIME = process.env.T || "night";
const TINT = process.env.TINT || ""; // 乗算を差し替えて試すとき
const W = +(process.env.W || 390);
const H = +(process.env.H || 844);

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, isMobile: W < 640, hasTouch: W < 640 });
await ctx.route(/googleusercontent\.com/, (r) =>
  r.fulfill({ path: "/home/user/live-streaming/site/public/characters/ayato.png" }),
);
const p = await ctx.newPage();
await p.addInitScript(
  ([t, tint]) => {
    localStorage.setItem("ayato-island-arrived", "2026-09-05");
    localStorage.setItem("ayato-island-walked", "1");
    localStorage.setItem("ayato-island-today", "2026-09-05");
    const set = () => {
      document.documentElement.dataset.time = t;
      if (tint) document.documentElement.style.setProperty("--tint", tint);
    };
    document.addEventListener("DOMContentLoaded", set);
    set();
  },
  [TIME, TINT],
);
await p.goto(`http://localhost:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
await p.waitForTimeout(3000);
await p.evaluate(
  ([t, tint]) => {
    document.documentElement.dataset.time = t;
    if (tint) document.documentElement.style.setProperty("--tint", tint);
  },
  [TIME, TINT],
);
await p.waitForTimeout(2200);
const tag = TINT ? `-${TINT.replace(/[^0-9]/g, "")}` : "";
await p.screenshot({ path: `/tmp/r2b/${TIME}${W}${tag}.png` });
console.log("saved", `/tmp/r2b/${TIME}${W}${tag}.png`);
await b.close();
