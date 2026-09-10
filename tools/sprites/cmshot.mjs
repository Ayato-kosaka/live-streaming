/**
 * 街の地図を撮る。**見て確かめるため。**
 *
 *   SPORT=4170 node tools/sprites/cmshot.mjs           # 行く街ぜんぶ
 *   SPORT=4170 ONLY=warszawa node tools/sprites/cmshot.mjs
 *
 * 地図そのもの（枠だけ）と、面の中でどう見えるか（1画面）の2枚を撮る。
 * どちらも本番と同じ 390px 幅で、dpr は 2（1 だと字が2〜3割うすく写る）。
 */
import { chromium } from "playwright-core";
import { mkdirSync, readFileSync } from "fs";

const PORT = process.env.SPORT || 4170;
const OUT = process.env.OUT || "/tmp/cmap";
mkdirSync(OUT, { recursive: true });
const DAYS = JSON.parse(readFileSync(new URL("./cmdays.json", import.meta.url), "utf8"));
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
p.on("console", (m) => m.type() === "error" && bad.push(m.text()));
p.on("pageerror", (e) => bad.push(String(e)));

for (const [slug, day, city] of DAYS) {
  if (only && slug !== only) continue;
  await p.goto(`http://localhost:${PORT}/nordic/day/${day}.html`, { waitUntil: "networkidle" });
  await p.evaluate(() => document.querySelectorAll("details").forEach((x) => (x.open = true)));
  await p.waitForTimeout(600);
  const sec = await p.$(`section[id="want-${city}"]`);
  if (!sec) { console.log(`${slug}: 面が無い（day/${day}）`); continue; }
  await sec.scrollIntoViewIfNeeded();
  await p.waitForTimeout(400);
  const frame = await p.$(`section[id="want-${city}"] .cmap-frame`);
  if (!frame) { console.log(`${slug}: 地図が無い（day/${day}）`); continue; }
  await frame.screenshot({ path: `${OUT}/${slug}.png` });
  await sec.screenshot({ path: `${OUT}/${slug}-sec.png` });
  const info = await p.evaluate((c) => {
    const s = document.querySelector(`section[id="want-${c}"]`);
    const f = s.querySelector(".cmap-frame");
    const img = s.querySelector(".cmap-base");
    const r = f.getBoundingClientRect();
    return {
      w: Math.round(r.width), h: Math.round(r.height),
      pins: s.querySelectorAll(".cm-pin").length,
      marks: s.querySelectorAll(".cm-mark").length,
      labels: [...s.querySelectorAll(".cm-label text")].map((t) => t.textContent),
      rows: s.querySelectorAll(".cm-row").length,
      loaded: img.complete && img.naturalWidth > 0,
    };
  }, city);
  console.log(
    `${slug.padEnd(10)} day/${day} ${info.w}x${info.h} 点${info.pins} 目印${info.marks} ` +
      `一覧${info.rows} 土台${info.loaded ? "○" : "×"} 名前:${info.labels.join("・")}`,
  );
}
if (bad.length) console.log("JSエラー:", bad.slice(0, 5));
await b.close();
