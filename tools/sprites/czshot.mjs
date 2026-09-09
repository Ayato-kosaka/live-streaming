/** 街の地図を撮る。**見て確かめるため。** */
import { chromium } from "playwright-core";
const PORT = process.env.SPORT || 4170;
const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const ctx = await b.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
for (const [day, name] of [["1", "warszawa"], ["4", "vilnius"], ["7", "tallinn"], ["8", "helsinki"]]) {
  await p.goto(`http://localhost:${PORT}/nordic/day/${day}.html`, { waitUntil: "networkidle" });
  await p.evaluate(() => document.querySelectorAll("details").forEach((x) => (x.open = true)));
  await p.waitForTimeout(700);
  const el = await p.$(".czoom");
  if (!el) { console.log(`day/${day} 地図が無い`); continue; }
  await el.scrollIntoViewIfNeeded();
  await p.waitForTimeout(300);
  await el.screenshot({ path: `/tmp/claude-0/cz-${name}.png` });
  const info = await p.evaluate(() => {
    const s = document.querySelector(".czoom-map");
    return {
      pins: document.querySelectorAll(".cz-pin").length,
      water: document.querySelectorAll(".cz-water").length,
      green: document.querySelectorAll(".cz-green").length,
      old: document.querySelectorAll(".cz-old").length,
      vb: s?.getAttribute("viewBox"),
    };
  });
  console.log(`day/${day} ${name.padEnd(9)} ピン${info.pins} 水${info.water} 緑${info.green} 旧${info.old}  ${info.vb}`);
}
await b.close();
