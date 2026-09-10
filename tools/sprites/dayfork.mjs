/**
 * 1日ぶんのページ（`/nordic/day/N`）の「まだ決めていないこと」を、時計を進めて数える。
 *
 * 撮るだけでは分からないので、**押しどころを DOM で数える**
 * （`docs/island-standards.md` 13「当座の判定は、まずその判定を疑う」）。
 *
 *   1. 「この日に、言う」の区画が出ているか（読めない日でも消えないこと）
 *   2. 押せるボタン（`.fork-pick`）が何個あるか＝票を受ける口
 *   3. 越えた日に残る答え（`.fork-was`）が何個あるか
 *   4. 区画の一行（「まだ決まっていません」／「もう越えました」／「きょうは…」）
 *
 * **島から届く値は、既定を本番のままにしてある**（「ジョージア・トビリシ」・
 * `updatedAt` 2026-09-04）。そこを直っている前提で差し込むと、直っていない
 * ものが直って見える（`docs/island-misses.md` #1）。
 *
 *   cd tools/sprites
 *   SPORT=4750 DATE=2026-09-16T12:00:00+09:00 node dayfork.mjs
 *
 *   DATE     時計をここに合わせる（ISO）。時間帯は Asia/Tokyo で見る
 *   PLACE    島の「いまどこ」。既定は本番の値
 *   PLACE_AT `current.updatedAt`。既定は本番の値（2026-09-04）
 *   ARRIVED  ストックホルムに着いた日
 *   FORKS    down にすると、わかれ道の数を落として撮る（#272 の3つ目の答え）
 *   DAYS     見るページ。既定は depart,1..9
 *   TAG      撮ったものの名前
 */
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "fs";
import { offline } from "./route.mjs";

const SPORT = process.env.SPORT || "4750";
const OUT = process.env.OUT || "/tmp/dayfork";
const DATE = process.env.DATE || "2026-09-16T12:00:00+09:00";
const PLACE = process.env.PLACE ?? "ジョージア・トビリシ";
const PLACE_AT = process.env.PLACE_AT ?? "2026-09-04";
const ARRIVED = process.env.ARRIVED || "";
const FORKS = process.env.FORKS || "ok";
const TAG = process.env.TAG || DATE.slice(0, 10);
const DAYS = (process.env.DAYS || "depart,1,2,3,4,5,6,7,8,9").split(",");
const SHOT = (process.env.SHOT || "").split(",").filter(Boolean);

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
  }),
);
/* わかれ道の数。**落とすときは「返さない」ではなく「届かない」にする。**
   404 を返すと、読めたことにしてしまう。

   `FORKS=votes` は、票が入っている状態。**0票と、票が入った状態は別の絵**
   （越えた日に「いちばん多かったのは◯◯」が出るのはこちらだけ）。 */
await ctx.route(/island-api\/fork/, (r) => {
  if (FORKS === "down") return r.abort("failed");
  const ids = new URL(r.request().url()).searchParams.get("ids");
  /* 問いごとの選択肢は `content/nordic.ts` にある。**適当な札を返さない**——
     どの問いにも無い札を返すと `top()` が名前を引けず、票が入っているのに
     「半分に割れました」と出て、判定のほうが嘘をつく。 */
  const OPTS = {
    "nordic-kutaisi-katowice": ["sleep", "awake"],
    "nordic-katowice-warszawa": ["count", "no"],
    "nordic-day-4": ["trakai", "rest"],
    "nordic-vilnius-riga": ["stop", "hurry"],
    "nordic-riga-tallinn": ["stand", "wait"],
    "nordic-helsinki-stockholm": ["deck", "sleep"],
  };
  const forks =
    FORKS === "votes" && ids
      ? Object.fromEntries(
          ids
            .split(",")
            .filter((id) => OPTS[id])
            .map((id) => [id, { [OPTS[id][0]]: 12, [OPTS[id][1]]: 5 }]),
        )
      : {};
  r.fulfill({ contentType: "application/json", body: JSON.stringify({ forks }) });
});
for (const [re, body] of [
  [/island-api\/nordic\/log/, { log: [] }],
  [/island-api\/nordic\/photos/, { days: [] }],
  [/island-api\/fund/, { total: 21500, people: 12 }],
  [/island-api\/nextplans/, { plans: [] }],
]) {
  await ctx.route(re, (r) =>
    r.fulfill({ contentType: "application/json", body: JSON.stringify(body) }),
  );
}

const p = await ctx.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));

const rows = [];
for (const d of DAYS) {
  await p.goto(`http://localhost:${SPORT}/nordic/day/${d}.html`, {
    waitUntil: "domcontentloaded",
    timeout: 45000,
  });
  await p.waitForTimeout(2500);
  await p.evaluate(() => {
    window.requestAnimationFrame = () => 0;
  });
  const seen = await p.evaluate(() => {
    const t = (el) => (el ? el.textContent.replace(/\s+/g, " ").trim() : null);
    const say = document.querySelector("#say");
    /* 押しどころは、見た目の箱ではなく**押せるか**で数える。
       `disabled` のボタンは票を受けないので数に入れない。 */
    const picks = [...document.querySelectorAll("#say .fork-pick")].filter(
      (e) => !e.disabled && e.getClientRects().length,
    );
    return {
      日: t(document.querySelector(".pagehead time")) || t(document.querySelector("h1")),
      区画: !!say,
      一行: t(say?.querySelector("p.muted")),
      問い: [...document.querySelectorAll("#say .fork-q")].map(t),
      押しどころ: picks.length,
      答え: [...document.querySelectorAll("#say .fork-was")].map(t),
      読み直す: !!say?.querySelector(".blank.is-off"),
      横あふれ: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
  rows.push({ ページ: `day/${d}`, ...seen });
  /* 撮るのは区画そのもの。面の頭を撮っても「まだ決めていないこと」は写らない。
     畳みの中にいることがあるので、下まで送ってから撮る（`CLAUDE.md`）。 */
  if (SHOT.includes(d)) {
    const el = await p.$("#say");
    if (el) {
      await el.scrollIntoViewIfNeeded();
      await p.waitForTimeout(400);
      await el.screenshot({ path: `${dir}/day-${d}.png` });
    }
  }
}
console.log(`--- ${TAG}  時計 ${DATE}  いまどこ「${PLACE}」(${PLACE_AT})  数 ${FORKS}${ARRIVED ? `  着いた ${ARRIVED}` : ""}`);
for (const r of rows) {
  console.log(
    `${r.ページ.padEnd(10)} 区画${r.区画 ? "○" : "×"} 押しどころ${String(r.押しどころ).padStart(2)} 答え${r.答え.length} ` +
      `一行「${r.一行 ?? ""}」${r.横あふれ ? " ★横あふれ" : ""}`,
  );
}
writeFileSync(`${dir}/${FORKS}.json`, JSON.stringify(rows, null, 1));
if (errs.length) console.log("JSエラー", errs);
await ctx.close();
await b.close();
console.log("out", dir);
