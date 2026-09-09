/**
 * 掲示板の付箋の札が、日によってどう並び替わるかを見る。
 *
 * **静的書き出しは、ビルドした日を焼き込む**（`CLAUDE.md`）。企画の札を
 * 「これから／行ってきた」に分けるのは画面が出てからなので、時計を動かして
 * 両方の見え方を確かめないと、出発の翌日に嘘が出ていても気づけない。
 *
 *   SPORT=4130 node shelfday.mjs 2026-09-05 2026-09-09 2026-09-12
 */
import { chromium } from "playwright-core";

const SPORT = process.env.SPORT || "4321";
const days = process.argv.slice(2);
if (!days.length) days.push("2026-09-09");

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
for (const day of days) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  // 画面が見る「今」を止める。`new Date()` も `Date.now()` も同じ日を返す
  await ctx.addInitScript((iso) => {
    const R = Date;
    const at = new R(iso).getTime();
    class D extends R {
      constructor(...a) {
        super(...(a.length ? a : [at]));
      }
      static now() {
        return at;
      }
    }
    window.Date = D;
  }, `${day}T12:00:00+09:00`);
  const p = await ctx.newPage();
  await p.goto(`http://localhost:${SPORT}/board.html`, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(1200);
  const rows = await p.$$eval(".nb-group", (gs) =>
    gs.map((g) => [
      g.querySelector(".nb-glabel")?.textContent?.trim(),
      [...g.querySelectorAll(".nb-tab b")].map((x) => x.textContent.trim()),
    ]),
  );
  console.log(day);
  for (const [label, tabs] of rows) console.log(`  ${label}: ${tabs.join(" / ")}`);
  await ctx.close();
}
await b.close();
