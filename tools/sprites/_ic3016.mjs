/**
 * 印の検品台（/design）を、まとまりごとに撮る道具。一時のもの。
 * 全部を1枚にすると縦 14,000px を超えて目で追えないので、紙1枚ずつに割る。
 *   node _ic3016.mjs [撮りたい紙の番号 ...]
 */
import { chromium } from "playwright-core";
import fs from "node:fs";

const PORT = process.env.PORT || "3016";
const OUT = process.env.OUT || "/tmp/shots/ic";
const only = process.argv.slice(2).map(Number);
fs.mkdirSync(OUT, { recursive: true });

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const ctx = await b.newContext({ viewport: { width: 900, height: 1000 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
p.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 300)));
await p.goto(`http://localhost:${PORT}/design`, { waitUntil: "domcontentloaded", timeout: 600000 });
await p.waitForTimeout(2500);

const secs = await p.$$("main.page section");
console.log("紙の数:", secs.length);
for (let i = 0; i < secs.length; i++) {
  if (only.length && !only.includes(i)) continue;
  const t = (await secs[i].$eval("h2", (n) => n.textContent.trim()).catch(() => `s${i}`)).replace(/\d+$/, "");
  await secs[i].scrollIntoViewIfNeeded();
  await p.waitForTimeout(120);
  await secs[i].screenshot({ path: `${OUT}/${String(i).padStart(2, "0")}-${t}.png` });
  console.log(i, t);
}
await b.close();
