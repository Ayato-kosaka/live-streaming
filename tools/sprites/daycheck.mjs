/** 日ページを、畳みを全部ひらいてから 390px で測る。 */
import { chromium } from "playwright-core";
const PORT = process.env.SPORT || 4160;
const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(String(e)));
let bad = 0;
for (const d of ["depart", "1", "2", "3", "4", "5", "6", "7", "8", "9"]) {
  errs.length = 0;
  await p.goto(`http://localhost:${PORT}/nordic/day/${d}.html`, { waitUntil: "networkidle" });
  await p.evaluate(() => document.querySelectorAll("details").forEach((x) => (x.open = true)));
  for (let i = 0; i < 40; i++) {
    const more = await p.$(".longer button:not([hidden])");
    if (!more) break;
    if (/たたむ/.test(await more.innerText().catch(() => "たたむ"))) break;
    await more.click().catch(() => {});
    await p.waitForTimeout(100);
  }
  let h = 0;
  for (let i = 0; i < 60; i++) {
    await p.evaluate(() => window.scrollBy(0, 2000));
    await p.waitForTimeout(50);
    const n = await p.evaluate(() => document.documentElement.scrollHeight);
    if (n === h) break; h = n;
  }
  const o = await p.evaluate(() => {
    const el = document.documentElement;
    const wants = [...document.querySelectorAll("h2")].filter((x) => /で見たいもの/.test(x.textContent||"")).length;
    return { over: el.scrollWidth > el.clientWidth + 1, w: el.scrollWidth, wants };
  });
  if (o.over || errs.length) bad++;
  console.log(`day/${d.padEnd(6)} 高さ=${String(h).padStart(5)}px 横=${o.w} あふれ=${o.over} 見たいもの欄=${o.wants} JSエラー=${errs.length}`);
}
await b.close();
console.log(bad ? `だめな面 ${bad}` : "あふれ・JSエラーなし");
