/**
 * 街の地図を撮る。**見て確かめるため。**
 *
 *   SPORT=4170 node tools/sprites/cmshot.mjs           # 行く街ぜんぶ
 *   SPORT=4170 ONLY=warszawa node tools/sprites/cmshot.mjs
 *
 * どの街がどの面に出るかは `cmdays.json`（`cmdays.mjs` が書き出すもの）。
 * 地図だけの1枚と、面の中でどう見えるかの1枚を撮る。
 * **dpr は 2**（1 だと同じ字が2〜3割うすく写る。`CLAUDE.md`）。
 */
import { chromium } from "playwright-core";
import { mkdirSync, readFileSync } from "fs";

const PORT = process.env.SPORT || 4170;
const OUT = process.env.OUT || "/tmp/cmap";
mkdirSync(OUT, { recursive: true });
const ROWS = JSON.parse(readFileSync(new URL("./cmdays.json", import.meta.url), "utf8"));
const only = process.env.ONLY;

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const ctx = await b.newContext({
  viewport: { width: 390, height: 900 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const p = await ctx.newPage();
const bad = [];
p.on("pageerror", (e) => bad.push(String(e)));

for (const [slug, path, city] of ROWS) {
  if (only && slug !== only) continue;
  await p.goto(`http://localhost:${PORT}${path}`, { waitUntil: "networkidle" });
  await p.evaluate(() => document.querySelectorAll("details").forEach((x) => (x.open = true)));
  await p.waitForTimeout(700);
  // 国の面は id を URL 用に符号化してある（`city-%E3%82%AB…`）。両方を見る
  const sel = `section[id="want-${city}"], section[id="city-${city}"], ` +
    `section[id="city-${encodeURIComponent(city)}"]`;
  const sec = await p.$(sel);
  if (!sec) { console.log(`${slug}: 面が無い（${path}）`); continue; }
  const frame = await sec.$(".cmap-frame");
  if (!frame) { console.log(`${slug}: 地図が無い（${path}）`); continue; }
  await frame.scrollIntoViewIfNeeded();
  await p.waitForTimeout(400);
  await frame.screenshot({ path: `${OUT}/${slug}.png` });
  await sec.screenshot({ path: `${OUT}/${slug}-sec.png` });
  const info = await p.evaluate((s) => {
    const sec = document.querySelector(s);
    const f = sec.querySelector(".cmap-frame");
    const img = sec.querySelector(".cmap-base");
    const r = f.getBoundingClientRect();
    return {
      w: Math.round(r.width), h: Math.round(r.height),
      pins: sec.querySelectorAll(".cm-pin").length,
      marks: sec.querySelectorAll(".cm-mark").length,
      labels: [...sec.querySelectorAll(".cm-label text")].map((t) => t.textContent),
      rows: sec.querySelectorAll(".cm-row").length,
      far: sec.querySelectorAll(".cm-far").length,
      loaded: img.complete && img.naturalWidth > 0,
    };
  }, sel);
  console.log(
    `${slug.padEnd(10)} ${String(path).padEnd(20)} ${info.w}x${info.h} 点${String(info.pins).padStart(2)} ` +
      `目印${String(info.marks).padStart(2)} 一覧${String(info.rows).padStart(2)} ひと足${info.far} ` +
      `土台${info.loaded ? "○" : "×"} 名前:${info.labels.join("・")}`,
  );
}
if (bad.length) console.log("JSエラー:", bad.slice(0, 5));
await b.close();
