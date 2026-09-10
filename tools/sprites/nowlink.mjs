/**
 * **いま起きていること（旅）へ、常設の面から行けるか**を、時計を進めて数える。
 *
 *   cd site && NEXT_DIST_DIR=.next-lead npx next build
 *   python3 -m http.server 4740 --directory site/.next-lead &
 *   SPORT=4740 node tools/sprites/nowlink.mjs
 *
 * 見る時点は3つ。**日付で変わるものは、その日を過ぎた形で見る**
 * （`docs/island-misses.md` #23）。
 *
 *   2026-09-10 … 出発前。**いまと変わっていないこと**（デグレよけ）
 *   2026-09-13 … 旅の2日目。ここで口が出ていなければ不合格
 *   2026-09-30 … 旅のあと。**焼き込みで固まっていれば、ここで残る**
 *
 * 時計は `aftersail.mjs` と同じ差し込み。ブラウザの時計だけを進める。
 */
import { chromium } from "playwright-core";

const PORT = process.env.SPORT || 4740;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const clockOf = (iso) => `(() => {
  const F = ${Date.parse(iso)}, R = Date, s = R.now();
  class D extends R {
    constructor(...a) { a.length ? super(...a) : super(F + (R.now() - s)); }
    static now() { return F + (R.now() - s); }
  }
  D.parse = R.parse; D.UTC = R.UTC; globalThis.Date = D;
})();`;

/** 見る時点。JST の 21:00 に合わせる（配信の1時間前＝いちばん人が来る時刻） */
const WHENS = [
  ["出発前 2026-09-10", "2026-09-10T12:00:00Z"],
  ["旅の2日目 2026-09-13", "2026-09-13T12:00:00Z"],
  ["旅のあと 2026-09-30", "2026-09-30T12:00:00Z"],
];

const PAGES = ["/index.html", "/streams.html", "/about.html", "/apps.html", "/map.html"];

const b = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });

for (const [tag, iso] of WHENS) {
  const ctx = await b.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
  });
  await ctx.addInitScript(clockOf(iso));
  console.log(`\n=== ${tag} ===`);
  for (const path of PAGES) {
    const p = await ctx.newPage();
    const errs = [];
    p.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));
    p.on("console", (m) => m.type() === "error" && errs.push("console: " + m.text().slice(0, 160)));
    await p.goto(`${ORIGIN}${path}`, { waitUntil: "domcontentloaded" }).catch(() => {});
    await p.waitForTimeout(3000);
    const r = await p.evaluate(() => {
      const a = [...document.querySelectorAll('a[href^="/nordic"]')];
      const foot = [...document.querySelectorAll('.ifoot-doors a[href^="/nordic"]')];
      const trip = document.querySelector(".ifoot-door.is-trip");
      const lead = document.querySelector(".phead-lead");
      return {
        旅への口: a.length,
        砂浜の口: foot.length,
        砂浜の板: trip ? trip.textContent.trim() : null,
        砂浜の板の位置: trip ? [...trip.closest("ul").children].indexOf(trip.closest("li")) : null,
        前置きの口: lead ? [...lead.querySelectorAll("a")].map((x) => `${x.textContent}→${x.getAttribute("href")}`) : [],
        今夜の答え: (document.querySelector(".wk-now") || {}).textContent?.trim() ?? null,
        今日の列: document.querySelectorAll(".wk-col").length,
        今日の見出し: (document.querySelector(".wk-days .is-today") || {}).textContent?.trim() ?? null,
        表紙の2本: [...document.querySelectorAll(".scards .scard time")].map((x) => x.textContent),
        読めない札: [...document.querySelectorAll(".blank.is-off > b")].map((x) => x.textContent),
        横あふれ: document.body.scrollWidth > document.documentElement.clientWidth,
      };
    });
    console.log(`${path.padEnd(15)} ${JSON.stringify(r, null, 0)}`);
    if (errs.length) console.log(`${" ".repeat(15)} JSエラー: ${errs.join(" / ")}`);
    await p.close();
  }
  await ctx.close();
}
await b.close();
