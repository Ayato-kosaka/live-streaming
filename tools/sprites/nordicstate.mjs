/**
 * 旅の途中と、旅が終わったあとを撮る。
 *
 * `timetravel.mjs` は時計を進めるところまでで、島から届く値
 * （いまいる街・その日に起きたこと・着いた日）は空のまま。
 * **旅の最中と旅のあとは、その値が入ってはじめて出る面がある**ので、
 * ここでは `/island-api` を作ってから撮る。
 *
 *   cd tools/sprites
 *   SPORT=4210 OUT=/tmp/shots-live node nordicstate.mjs
 *
 *   DATE     時計をここに合わせる（ISO）
 *   PLACE    島の「いまどこ」
 *   ARRIVED  ストックホルムに着いた日（YYYY-MM-DD）
 *   ENDED    旅が終わった（発った）日（YYYY-MM-DD）。**着いた日とは別。**
 *            着いてから7泊あるので、ARRIVED だけでは旅は終わらない
 *   LOG      その日に起きたことを入れるか（1 で入れる）
 *   SPORT    書き出したものを配っている静的サーバのポート
 *   OUT      撮ったものの置き場
 */
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "fs";
import { offline } from "./route.mjs";

const SPORT = process.env.SPORT || "4210";
const OUT = process.env.OUT || "/tmp/shots-live";
const DATE = process.env.DATE || "2026-09-15T12:00:00+09:00";
const PLACE = process.env.PLACE || "";
const ARRIVED = process.env.ARRIVED || "";
const ENDED = process.env.ENDED || "";
const WANT_LOG = process.env.LOG === "1";
const BASE = `http://localhost:${SPORT}`;

function clockScript(iso) {
  return `(() => {
    const FAKE = ${Date.parse(iso)};
    const RealDate = Date;
    const start = RealDate.now();
    function shift() { return FAKE + (RealDate.now() - start); }
    class FakeDate extends RealDate {
      constructor(...a) { if (a.length === 0) super(shift()); else super(...a); }
      static now() { return shift(); }
      static parse(...a) { return RealDate.parse(...a); }
      static UTC(...a) { return RealDate.UTC(...a); }
    }
    Object.defineProperty(FakeDate, "name", { value: "Date" });
    globalThis.Date = FakeDate;
  })();`;
}

const LOG = WANT_LOG ?
  [
    { day: "day-depart", date: "2026-09-11", body: "クタイシの空港で3時間待った。飛行機は満席。", at: 1 },
    { day: "day-1", date: "2026-09-12", body: "2台目で停まってくれた。運転手さんはワルシャワまで行く人だった。\n空港で3時間だけ寝た。", video: "dQw4w9WgXcQ", at: 2 },
    { day: "day-2", date: "2026-09-13", body: "ガソリンスタンドで7回断られた。8台目。", at: 3 },
  ] :
  [];

const PAGES = [
  ["nordic", "/nordic.html"],
  ["day1", "/nordic/day/1.html"],
  ["day4", "/nordic/day/4.html"],
  ["day9", "/nordic/day/9.html"],
  ["next", "/next.html"],
  ["top", "/index.html"],
];

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const dir = `${OUT}/${DATE.slice(0, 10)}${ARRIVED ? "-arrived" : ""}${ENDED ? "-ended" : ""}${WANT_LOG ? "-log" : ""}`;
mkdirSync(dir, { recursive: true });
const ctx = await b.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
});
await offline(ctx);
await ctx.addInitScript(clockScript(DATE));
await ctx.route(/island-api\/state/, (r) =>
  r.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      current: { place: PLACE },
      stats: null,
      ideas: [],
      notes: [],
      residents: [],
      nordic:
        ARRIVED || ENDED ?
          { arrivedOn: ARRIVED || undefined, endedOn: ENDED || undefined } :
          null,
      more: { ideas: null, notes: null },
    }),
  }));
await ctx.route(/island-api\/nordic\/log/, (r) =>
  r.fulfill({ contentType: "application/json", body: JSON.stringify({ log: LOG }) }));
await ctx.route(/island-api\/nordic\/photos/, (r) =>
  r.fulfill({ contentType: "application/json", body: JSON.stringify({ days: [] }) }));
await ctx.route(/island-api\/fund/, (r) =>
  r.fulfill({ contentType: "application/json", body: JSON.stringify({ total: 21500, people: 12 }) }));
await ctx.route(/island-api\/forks/, (r) =>
  r.fulfill({ contentType: "application/json", body: JSON.stringify({ forks: {} }) }));

const p = await ctx.newPage();
for (const [name, path] of PAGES) {
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));
  const res = await p.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 45000 });
  await p.waitForTimeout(1500);
  await p.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await p.screenshot({ path: `${dir}/${name}.png`, fullPage: false });
  const txt = await p.evaluate(() => document.body.innerText.replace(/\n{2,}/g, "\n").slice(0, 3000));
  writeFileSync(`${dir}/${name}.txt`, txt);
  const bad = errs.filter((e) => !e.includes("#418"));
  console.log(name, res.status(), bad.length ? `NG ${bad.join("|")}` : "ok");
  p.removeAllListeners("pageerror");
}
await ctx.close();
await b.close();
console.log("out", dir);
