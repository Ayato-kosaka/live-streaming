/**
 * **表紙が入れ替わったあとも「今日」が出ているか**を、時計を進めて数える。
 *
 *   PORT=4630 OUT=/tmp/covertoday node covertoday.mjs
 *
 * 数えるのは絵ではなく DOM。撮った絵だけでは「島が出ている」までしか分からず、
 * 板が出ているかどうかは板を数えると1回で分かる（`docs/island-misses.md` #22）。
 *
 * 見るもの:
 *   - 「今日の島」の板が何枚あるか（0枚なら不合格）
 *   - その1行が「◯年前の今日」かどうか。**焼いた日ではなく、見ている日の1年前**か
 *   - どちらの島が出ているか（建っているものを数える）
 */
import { mkdirSync } from "fs";
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";

const PORT = process.env.PORT || 4630;
const OUT = process.env.OUT || "/tmp/covertoday";
mkdirSync(OUT, { recursive: true });

/** 見る時点。名前・時計・幅 */
const WHENS = [
  ["before", "2026-09-10T12:00:00Z"], // 出発前（いまと同じ絵になっているか）
  ["dep30", "2026-09-11T20:00:00Z"], // 出発30分後
  ["morning", "2026-09-12T00:00:00Z"], // 翌朝（日本時間の9時）
  ["week", "2026-09-18T20:00:00Z"], // 1週間後
];

const clockOf = (when) => `(() => {
  const F = ${Date.parse(when)}, R = Date, s = R.now();
  class D extends R {
    constructor(...a) { a.length ? super(...a) : super(F + (R.now() - s)); }
    static now() { return F + (R.now() - s); }
  }
  D.parse = R.parse; D.UTC = R.UTC; globalThis.Date = D;
})();`;

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});

const look = async (name, when, w, h, tag) => {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  await ctx.addInitScript(clockOf(when));
  await offline(ctx);
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  await p.goto(`http://localhost:${PORT}/index.html`, { waitUntil: "networkidle" });
  // 島の入れ替えは画面が出てから（`components/isle/Cover.tsx`）
  await p.waitForTimeout(4000);
  const got = await p.evaluate(() => {
    const boards = [...document.querySelectorAll(".today")];
    return {
      板: boards.length,
      名: boards.map((e) => e.querySelector(".today-line em")?.textContent ?? ""),
      行: boards.map((e) => e.querySelector(".today-line b")?.textContent ?? ""),
      島: document.querySelector(".isle") ? "章の島" : document.querySelector(".stage") ? "手で作った島" : "無し",
      建物: [...document.querySelectorAll(".isle-hit, .spot-hit, .stage a[href^='/']")].length,
      横あふれ: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
  await p.screenshot({ path: `${OUT}/${name}-${tag}.png` });
  await ctx.close();
  const past = got.行.filter((s) => /年前の今日/.test(s));
  console.log(
    `${name.padEnd(8)} ${tag.padEnd(6)} ${when}  島=${got.島}  板=${got.板}枚  ` +
      `1年前の今日=${past.length}  ${got.横あふれ ? "★横あふれ" : ""}${errs.length ? ` ★JSエラー${errs.length}` : ""}`,
  );
  for (const s of got.行) console.log(`    「今日の島」 ${s}`);
  return got;
};

for (const [name, when] of WHENS) {
  await look(name, when, 390, 844, "phone");
  await look(name, when, 1280, 900, "pc");
}
await b.close();
console.log(`\n絵 -> ${OUT}`);
