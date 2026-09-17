/**
 * 島の**寄り・引きを撮って、1秒あたりのコマ数を測る**。
 *
 *   PORT=4160 node tools/sprites/island.mjs
 *   PORT=4160 OUT=/tmp/shots node tools/sprites/island.mjs
 *
 * 出るのは `OUT`（既定 `/tmp/shots`）の `i-close.png` と `i-wide.png`。
 *
 * **終了コード**: 0＝測れた / 2＝測るものが無かった（島が出ない・引きの札が無い）。
 * ここは合否を出す道具ではないので 1 は使わない。**測れなかったときに 0 で
 * 終わらせない**のがこのコードの仕事（`docs/island-standards.md` §15）。
 *
 * **fps は混み具合に振り回される。** この箱で並列に作業していると、同じ条件で
 * 33ms と 116ms が出る（`CLAUDE.md`）。**ここで出る数は「動いているか」までで、
 * 速くなったかどうかの比較には使わない。** 比べるなら
 * `tools/sprites/framecpu.mjs`（CDP の ProcessTime）。
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "fs";
import { repoPath } from "./repo.mjs";
import { findStage } from "./stage.mjs";

/** 並列で作業するとき、エージェントごとに別のポートを使う。既定は 3000。 */
const PORT = process.env.PORT || "3000";
const OUT = process.env.OUT || "/tmp/shots";
mkdirSync(OUT, { recursive: true });

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--no-sandbox"]});
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await ctx.route(/googleusercontent\.com/, r => r.fulfill({ path: repoPath("site/public/characters/ayato.webp") }));
const p = await ctx.newPage();
let errs = 0;
p.on("pageerror", e => { errs++; console.log("[pageerror]", String(e).slice(0,300)); });
await p.addInitScript(() => localStorage.setItem("ayato-island-arrived", "1"));
await p.goto(`http://localhost:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
await p.waitForTimeout(4000);

/* **島の名前を決め打ちしない。** 表紙の島は章で入れ替わり、`.stage` と `.isle` の
   2種類がある（`stage.mjs`）。どちらを撮ったかは写真に写らないので、印字する。 */
let S;
try {
  S = await findStage(p);
} catch (e) {
  console.error(String(e.message || e));
  await b.close();
  process.exit(2);
}

const marks = await p.$$eval(S.mark, n => n.length);
const badges = await p.$$eval(S.badge, n => n.map(x => x.textContent));
console.log(`島 ${S.kind}（${S.root}）  view ${await p.getAttribute(S.root, "data-view")}  cam ${await p.getAttribute(S.root, "data-cam")}`);
console.log(`札 ${marks}  バッジ ${badges.length} ${JSON.stringify(badges)}`);
await p.screenshot({ path: `${OUT}/i-close.png` });

// 引き。**押せなかったら 2 で落ちる。**「押す所が無い」を黙って素通りすると、
// 引きの写真が寄りの写真と同じものになって、見ても気づけない
const z = await p.$(S.zoom);
if (!z) {
  console.error(`引きに切り替える札（${S.zoom}）がありません。島の隅の道具の名前が変わった可能性`);
  await b.close();
  process.exit(2);
}
await z.click();
await p.waitForTimeout(2500);
const camWide = await p.getAttribute(S.root, "data-cam");
await p.screenshot({ path: `${OUT}/i-wide.png` });
console.log(`引き cam ${camWide}  札 ${await p.$$eval(S.mark, n => n.length)}`);

// フレームレート
const fps = await p.evaluate(() => new Promise(res => {
  let n = 0; const t0 = performance.now();
  const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(Math.round(n / ((performance.now()-t0)/1000))); };
  requestAnimationFrame(f);
}));
console.log(`fps ${fps}  JSの例外 ${errs}  写真 ${OUT}/i-close.png ${OUT}/i-wide.png`);
await b.close();
// 島は出たが1枚も札が無い＝数えるものが無い。撮れた写真だけを見て合格にしない
process.exit(marks > 0 && fps > 0 ? 0 : 2);
