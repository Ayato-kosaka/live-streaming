/**
 * 時計を進めて、書き出したものを撮る。
 *
 * 静的書き出し（`output: "export"`）なので、「あと何日」「いまいる島」「いちばん
 * 近い企画」はビルドした日の答えが HTML に焼かれている。動くのは、画面が出てから
 * 数え直しているところだけ。**旅が始まった日に何が出るのかは、時計を進めないと
 * 分からない。** 出発の6日前にこれで見て、島の連なりの穴（コーカサスの島が
 * 404 になる）と、旅の最中に「もう行ってきた」と出る面が見つかった。
 *
 *   cd tools/sprites
 *   SPORT=4170 OUT=/tmp/shots node timetravel.mjs
 *
 *   DATES  進める日（ISO、カンマ区切り）。既定は出発の前後6つ
 *   PLACE  島の「いまどこ」。渡すと `/island-api` を作って、旅の最中を再現する。
 *          渡さないと島の様子が取れない日（＝場所が届いていない日）になる
 *   SPORT  書き出したものを配っている静的サーバのポート
 *   OUT    撮ったものの置き場
 *
 * **開発サーバに当てない**（`CLAUDE.md`）。焼かれた HTML を見るのが目的なので、
 * `tools/build.sh <port>` で書き出したものを静的に配って、そこへ当てる。
 */
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "fs";
import { offline } from "./route.mjs";

const SPORT = process.env.SPORT || "4170";
const OUT = process.env.OUT || "/tmp/shots";
const BASE = `http://localhost:${SPORT}`;

/** 時計を止める。Date も performance.timeOrigin も差し替える。 */
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

const PAGES = [
  ["top", "/index.html"],
  ["nordic", "/nordic.html"],
  ["day-depart", "/nordic/day/depart.html"],
  ["day1", "/nordic/day/1.html"],
  ["day4", "/nordic/day/4.html"],
  ["day7", "/nordic/day/7.html"],
  ["photos", "/nordic/photos.html"],
  ["atlas", "/atlas.html"],
  ["isle-nordic", "/island/nordic.html"],
  ["next", "/next.html"],
  ["now", "/now.html"],
];

const DATES = (process.env.DATES || [
  "2026-09-10T12:00:00+09:00",
  "2026-09-12T04:00:00+09:00",
  "2026-09-12T11:00:00+09:00",
  "2026-09-15T12:00:00+09:00",
  "2026-09-20T12:00:00+09:00",
  "2026-09-25T12:00:00+09:00",
].join(",")).split(",");

/** 島の様子。旅の途中を再現したいときは PLACE を渡す。 */
const PLACE = process.env.PLACE || "";

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});

const report = [];
for (const iso of DATES) {
  const tag = iso.slice(0, 10) + (iso.includes("T04") ? "-0400" : "");
  const dir = `${OUT}/${tag}${PLACE ? "-at" : ""}`;
  mkdirSync(dir, { recursive: true });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await offline(ctx);
  await ctx.addInitScript(clockScript(iso));
  if (PLACE) {
    await ctx.route(/island-api\/state/, (r) =>
      r.fulfill({ contentType: "application/json", body: JSON.stringify({ current: { place: PLACE }, stats: null, ideas: [], notes: [], residents: [], more: { ideas: null, notes: null } }) }));
    await ctx.route(/island-api\/fund/, (r) =>
      r.fulfill({ contentType: "application/json", body: JSON.stringify({ total: 21500, people: 12 }) }));
    await ctx.route(/island-api\/forks/, (r) =>
      r.fulfill({ contentType: "application/json", body: JSON.stringify({ forks: {} }) }));
  }
  const p = await ctx.newPage();
  for (const [name, path] of PAGES) {
    const errs = [];
    p.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));
    const res = await p.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 45000 });
    await p.waitForTimeout(1400);
    // 島は rAF で動く。撮る前に止める
    await p.evaluate(() => { window.requestAnimationFrame = () => 0; });
    await p.screenshot({ path: `${dir}/${name}.png` });
    const txt = await p.evaluate(() => document.body.innerText.replace(/\n{2,}/g, "\n").slice(0, 2600));
    writeFileSync(`${dir}/${name}.txt`, txt);
    report.push({ date: tag, name, status: res.status(), errs });
    p.removeAllListeners("pageerror");
  }
  await ctx.close();
  console.log("done", tag);
}
writeFileSync(`${OUT}/report${PLACE ? "-at" : ""}.json`, JSON.stringify(report, null, 1));
for (const r of report) if (r.status !== 200 || r.errs.length) console.log("NG", r.date, r.name, r.status, r.errs.join("|"));
await b.close();
