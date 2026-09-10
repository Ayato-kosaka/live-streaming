/**
 * 初回表示までに、実際に落としているものを全部出す。
 *
 *   SPORT=4502 node wire.mjs [/index.html]
 *
 * 「書き出したものの合計」ではなく、**その面を開いた人が払う転送量**。
 * 種類ごとの合計と、大きいもの上位を出す。
 */
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";
const SPORT = process.env.SPORT || "4502";
const PAGE = process.env.PAGE || "/index.html";
const WIDE = process.env.WIDE === "1";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const ctx = await b.newContext(WIDE
  ? { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }
  : { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
await offline(ctx);
const p = await ctx.newPage();
const seen = new Map();
p.on("response", async (r) => {
  const u = new URL(r.url());
  if (u.hostname !== "localhost") return;
  try { const bd = await r.body(); seen.set(u.pathname, bd.length); } catch {}
});
await p.addInitScript(() => { try { localStorage.setItem("ayato-island-arrived", "2026-09-04"); localStorage.setItem("ayato-island-walked", "1"); } catch {} });
await p.goto(`http://localhost:${SPORT}${PAGE}`, { waitUntil: "load", timeout: 60000 });
await p.waitForTimeout(5000);
const kind = (u) => u.endsWith(".js") ? "js" : u.endsWith(".css") ? "css" : /\.(woff2?|ttf)$/.test(u) ? "font"
  : /\.(webp|png|jpg|jpeg|svg|avif)$/.test(u) ? "img" : "other";
const sum = {};
for (const [u, n] of seen) sum[kind(u)] = (sum[kind(u)] ?? 0) + n;
const total = [...seen.values()].reduce((a, v) => a + v, 0);
console.log(`■ ${PAGE} ${WIDE ? "PC" : "スマホ"}  ${seen.size}本  合計 ${(total / 1024).toFixed(0)}KB`);
for (const [k, v] of Object.entries(sum).sort((a, x) => x[1] - a[1])) console.log(`   ${k.padEnd(6)} ${(v / 1024).toFixed(0).padStart(6)}KB`);
console.log("  ---- 大きいもの ----");
for (const [u, n] of [...seen].sort((a, x) => x[1] - a[1]).slice(0, 20)) console.log(`   ${(n / 1024).toFixed(1).padStart(8)}KB  ${u}`);
await b.close();
