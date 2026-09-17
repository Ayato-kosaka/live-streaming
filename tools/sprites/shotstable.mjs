/**
 * **同じ面を、何も変えずに2回撮って、2枚が同じかを見る。**
 *
 *   PORT=4150 PAGES=/design,/nordic/guide node tools/sprites/shotstable.mjs
 *   PORT=4150 DPR=3 PAGES=/nordic/guide node tools/sprites/shotstable.mjs
 *
 * 終了コード: 0＝2枚が揃った / 1＝揃わない面がある / 2＝数えるものが無い
 * （対照が落ちた・開けなかった面がある）。
 *
 * ## なぜ要るか（2026-09-17）
 *
 * `inkpx.mjs` は**2枚撮って差を見る**道具で、差の出た画素を「字の画素」として
 * 数える。ところが**背の高い面を dpr3 で撮ると、何も変えていない2枚が食い違う。**
 * `/nordic/guide`（1170x53199）で、同じ面を続けて2回撮った2枚が
 * **540万画素**ちがった（地の色が 228,215,162 と 237,230,196）。
 * こうなると面ぜんぶが「字の画素」に見えるので、字の芯ではなく**地と地**を
 * 比べることになり、4.5 を割った字が大量に出てくる。
 * 実際に 2026-09-17 の26面掃きで、**`/design` 296か所・`/nordic/guide` 63か所**の
 * 「薄い字」が出た。**絵を見たら、どの字も濃さは足りていた。**
 * `docs/island-misses.md` #130。
 *
 * しかも**毎回は起きない。** 箱が空いているときは同じ面が 0画素で揃う。
 * 混み具合で変わるので、「前は出なかった」は根拠にならない
 * （`CLAUDE.md`「描画の速さを、壁の時計で測らない」と同じ性質）。
 * **測るその場で、そのつど確かめる**しかない。
 *
 * ## 何を見ているか
 *
 * 画素の差は `inkjudge.mjs` と同じ物差し（RGB の差の合計 > 40）で数える。
 * あちらが「字が乗った」とみなす境目と揃えておかないと、
 * ここで「揃っている」と言った面が、あちらで割れる。
 *
 * ## 対照
 *
 * 両側から当てる（`docs/island-standards.md` §15）:
 *   ○ 何も変えずに撮った2枚は「揃った」と言う（`inkpxfix/fix.html`）
 *   ○ あいだで地の色を変えた2枚は「揃わない」と言う
 * 片側だけだと、**いつも「揃った」と言う道具**が通る。
 */
import { chromium } from "playwright-core";
import { PNG } from "pngjs";
import { offline } from "./route.mjs";
import { openChecked, reportMissing } from "./served.mjs";
import { serveFixtures, reportControl } from "./fixserve.mjs";

const PORT = process.env.PORT || "4150";
const PAGES = (process.env.PAGES || "/design").split(",");
const W = Number(process.env.W || 390);
const H = Number(process.env.H || 844);
const DPR = Number(process.env.DPR || 2);
/** これを超えて画素が食い違ったら、その面の2枚は当てにならない。
    面のごく一部（にじみ1画素など）まで落とすと、どの面も通らなくなる */
const TOL = Number(process.env.TOL || 1e-5);
/** わざと盲点を作る: `BREAK=nodiff` で差を見ない（対照が落ちる） */
const BREAK = process.env.BREAK || "";

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const ctx = await b.newContext({
  viewport: { width: W, height: H }, deviceScaleFactor: DPR,
  isMobile: W < 700, hasTouch: W < 700, reducedMotion: "reduce",
});
await offline(ctx);
if (process.env.SEED) await (await import(process.env.SEED)).apply(ctx);
/* **差し込みは、面を作る前に置く。** あとから足すと1枚目の面に効かない
   （歩きかたの案内が出たままの画面で測ることになる）。 */
await ctx.addInitScript(() => {
  try {
    localStorage.setItem("ayato-island-arrived", "2026-09-04");
    localStorage.setItem("ayato-island-walked", "1");
  } catch {}
});

/** 2枚の食い違った画素を数える。`inkjudge.mjs` と同じ物差し（RGB の差 > 40） */
function diffPx(a, c) {
  const A = PNG.sync.read(a), B = PNG.sync.read(c);
  if (A.width !== B.width || A.height !== B.height)
    return { err: `2枚の大きさが違う（${A.width}x${A.height} / ${B.width}x${B.height}）`, n: 0, all: 0, w: A.width, h: A.height };
  let n = 0;
  for (let i = 0; i < A.data.length; i += 4) {
    if (BREAK === "nodiff") break;
    const d = Math.abs(A.data[i] - B.data[i]) + Math.abs(A.data[i + 1] - B.data[i + 1]) + Math.abs(A.data[i + 2] - B.data[i + 2]);
    if (d > 40) n++;
  }
  return { n, all: A.width * A.height, w: A.width, h: A.height };
}

/**
 * 面を1枚開いて、何も変えずに2回撮る。`between` を渡すと、あいだでそれを走らせる。
 *
 * **面ごとに新しいタブで開いて、撮り終えたら閉じる。** 5万画素を超える絵を
 * 同じタブで何枚も撮ると、描画のプロセスが落ちて
 * `Target page, context or browser has been closed` で**道具ごと死ぬ**
 * （26面の回で実際に落ちた）。落ちたときに何も言わずに終わるのがいちばん悪いので、
 * ここで受けて「撮れなかった面」として数に残す。
 */
async function twice(base, path, miss, between = null) {
  const p = await ctx.newPage();
  try {
    const got = await openChecked(p, base, path, { miss, waitUntil: "networkidle", timeout: 60000 });
    if (!got.ok) return null;
    await p.waitForTimeout(1200);
    await p.evaluate(() => { for (const d of document.querySelectorAll("details")) d.open = true; });
    await p.waitForTimeout(1300);
    await p.evaluate(() => window.scrollTo(0, 0));
    await p.waitForTimeout(400);
    const a = await p.screenshot({ fullPage: true });
    if (between) { await p.evaluate(between); await p.waitForTimeout(200); }
    const c = await p.screenshot({ fullPage: true });
    return diffPx(a, c);
  } catch (e) {
    miss.push(`${path}（撮れなかった: ${String(e).split("\n")[0].slice(0, 80)}）`);
    return null;
  } finally {
    await p.close().catch(() => {});
  }
}

const bail = async (msg) => { console.log(msg); await b.close(); process.exit(2); };

/* ── 対照が先。両側から当てる ──────────────────────────────────── */
{
  const fx = await serveFixtures("inkpxfix");
  const miss0 = [];
  const same = await twice(fx.base, "/fix.html", miss0);
  const moved = await twice(fx.base, "/fix.html", miss0, () => {
    // 地の色を変える。**字ではなく地**を動かすのは、字が消えたのを
    // 「揃っている」と読む作りになっていないかを見るため
    document.body.style.setProperty("background", "#4b2e05", "important");
  });
  fx.close();
  if (!same || !moved) await bail("対照の台が開けませんでした。");
  const checks = [
    { name: "何も変えない2枚", want: false, got: same.n / same.all > TOL, note: `ちがう画素 ${same.n} / ${same.all}` },
    { name: "地の色を変えた2枚", want: true, got: moved.n / moved.all > TOL, note: `ちがう画素 ${moved.n} / ${moved.all}` },
  ].map((c) => ({ ...c, name: c.name + "（食い違いと言う）" }));
  console.log("── 対照（同じ2枚を「揃った」、違う2枚を「揃わない」と言えるか）");
  const { miss, total } = reportControl(checks);
  console.log(`  対照 ${total}件中 ${total - miss}件 一致${BREAK ? `（BREAK=${BREAK}）` : ""}`);
  if (miss) await bail(`\n対照が ${miss}件 外れた。**本物の面の数字は出さない。**（docs/island-standards.md §15）`);
}

/* ── 本物の面 ──────────────────────────────────────────────────── */
const miss = [];
let seen = 0, shaky = 0;
const rows = [];
for (const path of PAGES) {
  const r = await twice(`http://localhost:${PORT}`, path, miss);
  if (!r) { console.log(`${path}  開けず`); continue; }
  if (r.err) { miss.push(`${path}（${r.err}）`); continue; }
  seen++;
  const bad = r.n / r.all > TOL;
  if (bad) shaky++;
  rows.push({ path, ...r, bad });
  console.log(`${path}  ${r.w}x${r.h}  ちがう画素 ${r.n} / ${r.all}${bad ? "  ← 2枚が揃わない" : ""}`);
}
await b.close();

console.log(`\n── 数えたもの（幅 ${W}px / dpr ${DPR} / 見のがす割合 ${TOL}）`);
console.log(`  見た面           ${seen} / ${PAGES.length}`);
console.log(`  2枚が揃わない面   ${shaky} 面`);
console.log(`  いちばん高い絵    ${rows.length ? Math.max(...rows.map((r) => r.h)) : 0} 画素`);
console.log(`  見ていないもの: 押すと変わる面の、押したあとの姿（ここは開いた畳みまで）`);

if (miss.length) { reportMissing(miss); process.exit(2); }
if (!seen) { console.log("\n面を1枚も撮れませんでした。数えるものがありません。"); process.exit(2); }
if (shaky) {
  console.log(`\nだめ: 2枚が揃わない面が ${shaky} 面。**この面で字の濃さを測っても当てにならない**（dpr を下げるか、面を短くする）。`);
  process.exit(1);
}
console.log(`\n${seen}面、2枚は揃いました。`);
process.exit(0);
