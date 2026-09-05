// 面を上から順に、1画面ずつ撮る。長い面を見るとき用。
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";
const PORT = process.env.PORT || "3021";
const OUT = process.env.OUT || "/tmp/k3";
const W = +(process.env.W || 390), H = +(process.env.H || 844);
const [path, ...ys] = process.argv.slice(2);
const name = path === "/" ? "top" : path.slice(1).replace(/\//g, "_");
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1.5, isMobile: W < 640 });
await offline(ctx);
const p = await ctx.newPage();
await p.addInitScript(() => localStorage.setItem("ayato-island-arrived", "1"));
await p.goto(`http://localhost:${PORT}${path}`, { waitUntil: "domcontentloaded", timeout: 120000 });
await p.waitForTimeout(2200);
for (const y of ys) {
  await p.evaluate((n) => window.scrollTo(0, n), +y);
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${OUT}/${name}-${y}.png` });
}
await b.close();
