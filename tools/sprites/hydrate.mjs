/**
 * 水あわせ（hydration）が落ちていないかを、**時計を動かして数える。**
 *
 * 静的書き出しなので、焼いた HTML の答えは「ビルドした瞬間」で止まっている。
 * ブラウザの最初の描画がそれと違う字を出すと React が面ごと捨てて描き直す
 * （`Minified React error #418`）。**見た目は壊れないので、絵では分からない。**
 * `pageerror` と `console` の両方を拾って数える以外に見つけようがない。
 *
 * 出発の日をまたぐ前後で必ず見る。焼いた答えと今日の答えが変わるのは、
 * そこだからです（`docs/island-misses.md` #30）。
 *
 *   cd tools/sprites
 *   SPORT=4700 DIST=…/site/.next-baked node hydrate.mjs
 *
 *   DATES  差し込む時刻（ISO、カンマ区切り）。"real" と書くと差し込まない
 *   PAGES  見る面（カンマ区切り）。既定は島じゅう
 *   SPORT  書き出したものを配っている静的サーバのポート
 *
 * **`DATES=real` を必ず1回混ぜる。** 時計の差し込みそのものが水あわせを
 * 壊すことがあるので（`docs/island-standards.md` 13）、差し込み無しでも
 * 同じ答えが出るかを見る。焼いた時刻を過去にしてビルドすれば、
 * 本物の時計のまま「焼いた翌日」を作れる（`NEXT_PUBLIC_BUILT_AT`）。
 */
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";

const SPORT = process.env.SPORT || "4700";
const BASE = `http://localhost:${SPORT}`;

/** 時計を止める。`timetravel.mjs` と同じ差し込み。 */
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

const PAGES = (process.env.PAGES || [
  "/index.html",
  "/atlas.html",
  "/all.html",
  "/now.html",
  "/next.html",
  "/board.html",
  "/nordic.html",
  "/island/europe.html",
  "/island/middle-east.html",
  "/island/caucasus.html",
  "/island/iran-walk.html",
  "/island/nordic.html",
  "/island/albania.html",
].join(",")).split(",");

const DATES = (process.env.DATES || [
  "2026-09-11T19:00:00Z",
  "2026-09-11T19:35:00Z",
  "2026-09-11T20:00:00Z",
  "2026-09-18T20:00:00Z",
].join(",")).split(",");

/** 水あわせが落ちた合図。React は本番ビルドだと番号でしか言わない */
const HYDRATE = /#418|#423|#425|Hydration failed|Text content does not match|hydrat/i;

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});

let total = 0;
const rows = [];
for (const iso of DATES) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await offline(ctx);
  if (iso !== "real") await ctx.addInitScript(clockScript(iso));
  const p = await ctx.newPage();
  for (const path of PAGES) {
    const hits = [];
    const onErr = (e) => { if (HYDRATE.test(String(e))) hits.push(String(e).slice(0, 120)); };
    const onCon = (m) => { if (m.type() === "error" && HYDRATE.test(m.text())) hits.push(m.text().slice(0, 120)); };
    p.on("pageerror", onErr);
    p.on("console", onCon);
    await p.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 45000 });
    // 水あわせは最初の描画のすぐ後。念のため少し待つ
    await p.waitForTimeout(1200);
    p.off("pageerror", onErr);
    p.off("console", onCon);
    total += hits.length;
    rows.push([iso, path, hits.length, hits[0] ?? ""]);
  }
  await ctx.close();
  console.log("done", iso);
}
console.log("\n時刻              面                         #418");
for (const [iso, path, n, why] of rows) {
  console.log(`${n ? "NG" : "ok"} ${iso.padEnd(22)} ${path.padEnd(26)} ${n}${why ? "  " + why : ""}`);
}
console.log("\n合計:", total);
await b.close();
process.exit(total ? 1 : 0);
