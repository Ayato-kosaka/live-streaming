/**
 * 旅の面の「いまどこ」を、時計を進めて数える。
 *
 * 撮るだけでは分からないものを4つ数える（`docs/island-standards.md` 13）。
 *
 *   1. 主役の箱の「いま／きょうは」と、その街
 *   2. 残り距離（「数えています」なら不合格）
 *   3. 旅程表の「いま、ここ」／「きょう」が出ている行（何行中いくつか）
 *   4. 航路図の「いま ここ」ピンが立っている街と、その札の字
 *
 * **島から届く値は、既定を本番のままにしてある**（「ジョージア・トビリシ」・
 * `updatedAt` 2026-09-04）。そこを直っている前提で差し込むと、直っていない
 * ものが直って見える（`docs/island-misses.md` #1）。
 *
 *   cd tools/sprites
 *   SPORT=4720 DATE=2026-09-13T12:00:00+09:00 node tripwhere.mjs
 *
 *   DATE     時計をここに合わせる（ISO）
 *   PLACE    島の「いまどこ」。既定は本番の値
 *   PLACE_AT `current.updatedAt`。既定は本番の値（2026-09-04）
 *   ARRIVED  ストックホルムに着いた日
 *   TAG      撮ったものの名前
 */
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "fs";
import { offline } from "./route.mjs";

const SPORT = process.env.SPORT || "4720";
const OUT = process.env.OUT || "/tmp/tripwhere";
const DATE = process.env.DATE || "2026-09-13T12:00:00+09:00";
const PLACE = process.env.PLACE ?? "ジョージア・トビリシ";
const PLACE_AT = process.env.PLACE_AT ?? "2026-09-04";
const ARRIVED = process.env.ARRIVED || "";
const TAG = process.env.TAG || DATE.slice(0, 10);
const PAGES = (process.env.PAGES || "/nordic.html").split(",");

const clock = `(() => {
  const FAKE = ${Date.parse(DATE)}, R = Date, s = R.now();
  const shift = () => FAKE + (R.now() - s);
  class D extends R {
    constructor(...a) { a.length ? super(...a) : super(shift()); }
    static now() { return shift(); }
    static parse(...a) { return R.parse(...a); }
    static UTC(...a) { return R.UTC(...a); }
  }
  Object.defineProperty(D, "name", { value: "Date" });
  globalThis.Date = D;
})();`;

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const dir = `${OUT}/${TAG}`;
mkdirSync(dir, { recursive: true });
const ctx = await b.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
  timezoneId: "Asia/Tokyo",
});
await offline(ctx);
await ctx.addInitScript(clock);
await ctx.route(/island-api\/state/, (r) =>
  r.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      current: { place: PLACE, updatedAt: PLACE_AT, theme: "georgia", word: "", week: [] },
      stats: null,
      notes: [],
      residents: [],
      nordic: ARRIVED ? { arrivedOn: ARRIVED } : null,
    }),
  }));
for (const [re, body] of [
  [/island-api\/nordic\/log/, { log: [] }],
  [/island-api\/nordic\/photos/, { days: [] }],
  [/island-api\/fund/, { total: 21500, people: 12 }],
  [/island-api\/forks/, { forks: {} }],
  [/island-api\/nextplans/, { plans: [] }],
]) {
  await ctx.route(re, (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(body) }));
}

const p = await ctx.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));

for (const path of PAGES) {
  const name = path.replace(/^\//, "").replace(/\.html$/, "").replace(/\//g, "-") || "top";
  await p.goto(`http://localhost:${SPORT}${path}`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await p.waitForTimeout(2200);
  // 島は rAF で動く。止めてから撮らないと、2枚のあいだで絵が変わる
  await p.evaluate(() => { window.requestAnimationFrame = () => 0; });

  const seen = await p.evaluate(() => {
    const t = (el) => (el ? el.textContent.replace(/\s+/g, " ").trim() : null);
    // 見えている字だけを読む。display:none の札を数に入れない
    const shown = (el) => !!el && !!el.getClientRects().length;
    const at = document.querySelector(".tnow-at");
    const rows = [...document.querySelectorAll(".nday")];
    const now = rows.filter((r) => r.hasAttribute("data-now"));
    const badge = (r) =>
      [...r.querySelectorAll(".nday-now, .nday-day")].filter(shown).map((e) => t(e)).join("/");
    const pin = document.querySelector(".nmap-pin.is-now");
    // 「いま ここ」の札は街より上のレイヤにいる（`RouteMapSvg.tsx`）
    const chip = [...document.querySelectorAll(".nm-here.is-now .nm-chip text")].filter(shown).map(t);
    return {
      いま: at ? { 札: t(at.querySelector("i")), 街: t(at.querySelector("b")), 国: t(at.querySelector("em")), 弱め: at.classList.contains("is-plan") } : null,
      つぎ: t(document.querySelector(".tnow-to b")),
      距離の見出し: t(document.querySelector(".tnow-count-l")),
      距離: t(document.querySelector(".tnow-count-n")),
      距離の一行: t(document.querySelector(".tnow-count-w")),
      旅程表の行数: rows.length,
      いまここの行: now.map((r) => `${r.id}「${badge(r)}」`),
      地図のピン: pin ? pin.getAttribute("data-id") : null,
      地図の札: chip,
      "今日のところへ": t(document.querySelector(".tnow-act.is-main")),
      横あふれ: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
  console.log(`--- ${TAG} ${path}`);
  console.log(JSON.stringify(seen, null, 1).replace(/\\n/g, " "));
  writeFileSync(`${dir}/${name}.json`, JSON.stringify(seen, null, 1));
  await p.screenshot({ path: `${dir}/${name}.png` });
  writeFileSync(`${dir}/${name}.txt`, await p.evaluate(() => document.body.innerText.replace(/\n{2,}/g, "\n").slice(0, 2500)));
}
if (errs.length) console.log("JSエラー", errs);
await ctx.close();
await b.close();
console.log("out", dir);
