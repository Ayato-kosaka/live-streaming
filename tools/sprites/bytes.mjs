/**
 * 1枚の画面が実際に取りに行ったスプライトの合計バイト数を測る。
 *
 *   PORT=3150 node bytes.mjs [パス] [幅] [高さ]
 *
 * 「焼いた絵ぜんぶで何MB」ではなく、**その画面を開いた人が実際に払う量**を出す。
 * 島は画面に入ったものだけ読むので、フォルダの合計とは桁が違う。
 * dpr は 3（スマホの高精細）と 1 の両方で回して、srcset の効きも見る。
 */
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";

const PORT = process.env.PORT || "3000";
const [url = "/", w = "390", h = "844"] = process.argv.slice(2);

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});

for (const dpr of [1, 3]) {
  const ctx = await b.newContext({
    viewport: { width: +w, height: +h },
    deviceScaleFactor: dpr,
    isMobile: +w < 640,
  });
  await offline(ctx);
  const seen = new Map();
  const p = await ctx.newPage();
  p.on("response", async (r) => {
    const u = new URL(r.url()).pathname;
    if (!u.startsWith("/sprites/")) return;
    try {
      seen.set(u, (await r.body()).length);
    } catch { /* 途中で捨てられた */ }
  });
  await p.addInitScript(() => localStorage.setItem("ayato-island-arrived", "1"));
  await p.goto(`http://localhost:${PORT}${url}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await p.waitForTimeout(4000);
  // 遅れて出てくるものを拾うため、下まで一度流す
  await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await p.waitForTimeout(2500);
  const total = [...seen.values()].reduce((a, v) => a + v, 0);
  console.log(`dpr${dpr}  ${url}  ${seen.size}枚  ${(total / 1024).toFixed(1)}KB`);
  for (const [u, n] of [...seen].sort((a, x) => x[1] - a[1]).slice(0, 8)) {
    console.log(`   ${(n / 1024).toFixed(1).padStart(7)}KB  ${u}`);
  }
  await ctx.close();
}
await b.close();
