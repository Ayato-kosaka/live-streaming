/**
 * **「今日の島」の板を開いてから、中の押しどころを測る。**
 *
 *   SPORT=4400 node tools/sprites/todayhit.mjs
 *   SPORT=4400 W=1280 node tools/sprites/todayhit.mjs
 *
 * ## なぜ別に要るのか
 *
 * 全面の一斉点検（`foldsweep.mjs`）が開くのは `<details>` の畳みだけで、
 * **この板は `hidden` で畳んである**（`components/today/Today.tsx`）。
 * つまりこの板の中は、これまで一度も数に出ていなかった——
 * `docs/island-misses.md` #85 の「測らないと決めた場所は、0 と同じ顔をする」が、
 * `<details>` ではない畳みにそのまま残っていた。
 *
 * 実測（幅390・表紙）で、開いた中の押しどころは
 * 「その日を見る」117x38 / 「チャンネルへ」130x38 / 「掲示板に企画を貼る」130x28。
 * **3つとも 48px を割っていた**（`docs/island-design.md` 3-2）。
 * 28px のものは、この板から掲示板へ行く唯一の橋だった。
 *
 * 測るところは `hitbox.mjs` の `measure` を呼ぶ（#83。測り方を写さない）。
 */
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";
import { measure, fmtHit } from "./hitbox.mjs";

const SPORT = process.env.SPORT || "4400";
const W = Number(process.env.W || 390);
const H = Number(process.env.H || 844);
const MIN = Number(process.env.MIN || 48);
const PATHNAME = process.env.PATHNAME || "/index.html";

/** 板の中だけを見る。畳みの外は `foldsweep.mjs` が見ている */
const SEL =
  '.today-fold a[href],.today-fold button,.today-fold [role="button"],.today-fold input,' +
  ".today-fold select,.today-fold textarea,.today-fold summary,.today-fold label";

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const ctx = await b.newContext({
  viewport: { width: W, height: H },
  deviceScaleFactor: 1,
  isMobile: W < 700,
  hasTouch: W < 700,
  reducedMotion: "reduce",
});
await offline(ctx);
const p = await ctx.newPage();
await p.goto(`http://127.0.0.1:${SPORT}${PATHNAME}`, { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
await p.waitForTimeout(2500);

// 住人が喋っていると、どこを押しても閉じるだけになる。先に閉じる
if (await p.$(".isle.is-talking")) {
  await p.mouse.click(4, 4).catch(() => {});
  await p.waitForTimeout(400);
}
const tab = await p.$(".today-tab");
if (!tab) {
  console.log("今日の島の板が無い（測るものが無い）");
  await b.close();
  process.exit(1);
}
await tab.click();
await p.waitForTimeout(800);
const open = await p.evaluate(() => !!document.querySelector(".today.is-open"));
/* **開かなかったのに測ると、0件を「割れ 0」として読む。**
   開いたかどうかを必ず先に見る（#85 #87）。 */
if (!open) {
  console.log("！ 板が開かなかった。測っていない");
  await b.close();
  process.exit(1);
}
/* 島の下へ開くので、中身が画面の外にいる。**送ってから測る。**
   送らずに測ると、画面の外で止まった値を実寸として読む */
await p.evaluate(() => document.querySelector(".today-fold")?.scrollIntoView({ block: "center" }));
await p.waitForTimeout(400);

const { rows, skipped, excluded } = await measure(p, { sel: SEL, min: MIN, fold: "skip" });
console.log(
  `幅${W}  今日の板の中 押しどころ ${rows.length}個  ${MIN}px割れ ${rows.filter((r) => r.small).length}` +
    `  測れず ${skipped.length}`,
);
for (const r of rows)
  console.log(`  ${r.t || "(字なし)"}  見た目 ${r.box[0]}x${r.box[1]}  当たり ${fmtHit(r)}${r.small ? "  ← 割れ" : ""}`);
for (const r of skipped) console.log(`  ${r.t || "(字なし)"}  当たり 測れず（${r.why}）`);
const ex = Object.entries(excluded);
if (ex.length) console.log(`  数えなかったもの: ${ex.map(([k, v]) => `${k} ${v}`).join(" / ")}`);
await b.close();
