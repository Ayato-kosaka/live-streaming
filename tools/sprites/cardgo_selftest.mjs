/**
 * `cardgo.mjs` の**判定**（`cardgojudge.mjs`）を、ブラウザも書き出しも本番も無しで確かめる。
 *
 *     node tools/sprites/cardgo_selftest.mjs
 *
 * 0＝ぜんぶ通った / 1＝落ちた / 2＝数えるものが無い。
 *
 * ## なぜ、道具の中の対照と別に要るのか
 *
 * `cardgo.mjs` は回るたびに自分で対照を当てられる（`BREAK=cut2` /
 * `BREAK=golink`）。**あれがいちばん強い**——本物のブラウザで、本番と同じ
 * 枚数（22人・404枚・いちばん多い人43枚。2026-09-19 実測）を通る。
 * だが**書き出しとブラウザと本番の口**が要るので、毎 PR では回せない。
 *
 * すると腐るのは**判定の側**になる。正規表現は1文字直せば黙って穴が開き、
 * 穴が開いても出るのは「0件」で、**0件はいちばん合格に見える**
 * （`docs/island-standards.md` §15）。だから判定だけを毎 PR で当てる。
 *
 * `python/selftest_runner.py` が `tools/sprites/*_selftest.mjs` を拾うので、
 * ここに置いたぶんは**何も書き足さなくても** `pull_request` で走る。
 *
 * ## 何を見るか
 *
 *   1. **落とさなければいけない字** — 本番に出ていた
 *      「あやと島カードを、ぜんぶ見る」→ `/cards` を含む
 *   2. **落としてはいけない字** — 誰のぶんかを先に名乗るもの
 *      （「島のカードを、ぜんぶ見る」）と、人を指す行き先を持つもの
 *   3. **たどれたか** — 枚数の食い違い
 *   4. **終了コード** — 0件と「見ていない」を混ぜない
 *
 * ## 壊した写しで落ちること
 *
 *     BREAK=nolabel node tools/sprites/cardgo_selftest.mjs   # 1 で落ちる
 *     BREAK=nogap   node tools/sprites/cardgo_selftest.mjs   # 1 で落ちる
 *
 * **足は1本ずつ折る**（`docs/island-misses.md` #128 の決めごと1）。
 * この本自身が子として自分を起こして、**折れることまで**見る。
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const me = fileURLToPath(import.meta.url);
const { goesElsewhere, reachGap, verdict } = await import("./cardgojudge.mjs");

const ng = [];
let 見た = 0;

/** @param {string} what @param {boolean} got @param {boolean} want */
const is = (what, got, want) => {
  見た += 1;
  if (got !== want) ng.push(`${what}: ${got} と出たが ${want} のはず`);
};

/* ---- 1. 落とさなければいけない字 ---- */
// 2026-09-19 まで本番に出ていた、そのままの字と行き先
is("本番に出ていた字", goesElsewhere({ 字: "あやと島カードを、ぜんぶ見る", 先: "/cards" }), true);
is("その人と名乗る字", goesElsewhere({ 字: "この人のカードを、ぜんぶ見る", 先: "/cards" }), true);
is("さん付けの字", goesElsewhere({ 字: "ゆずたつさんのカードを、ぜんぶ見る", 先: "/cards" }), true);
is("一覧という言い方", goesElsewhere({ 字: "もらったカードの一覧", 先: "/cards" }), true);
is("すべてという言い方", goesElsewhere({ 字: "カードをすべて見る", 先: "/cards" }), true);
// 合言葉のついていない目印だけでは、人を指したことにならない
is("目印だけの行き先", goesElsewhere({ 字: "カードを、ぜんぶ見る", 先: "/cards#top" }), true);
is("空の合言葉", goesElsewhere({ 字: "カードを、ぜんぶ見る", 先: "/cards?who=" }), true);

/* ---- 2. 落としてはいけない字 ---- */
// 誰のぶんかを**先に名乗っている**。島ぜんぶへ送ってよい
is("島のぶんと名乗る字", goesElsewhere({ 字: "島のカードを、ぜんぶ見る", 先: "/cards" }), false);
is("みんなのぶんと名乗る字", goesElsewhere({ 字: "みんなのカードを、ぜんぶ見る", 先: "/cards" }), false);
// 人を指す行き先を持っている
is("人を指す行き先", goesElsewhere({ 字: "この人のカードを、ぜんぶ見る", 先: "/cards?who=abc" }), false);
// ぜんぶ見せると言っていない
is("その日の企画", goesElsewhere({ 字: "北欧旅 7日目", 先: "/nordic/day/7" }), false);
is("1枚だけの行き先", goesElsewhere({ 字: "このカードを開く", 先: "/cards" }), false);
is("字が空", goesElsewhere({ 字: "", 先: "/cards" }), false);

/* ---- 3. たどれたか ---- */
is("2枚しか出ない43枚の人", reachGap(43, 2), true);
is("0枚", reachGap(9, 0), true);
is("そろっている", reachGap(43, 43), false);
is("1枚の人", reachGap(1, 1), false);

/* ---- 4. 終了コード ---- */
is("何も無ければ0", verdict({ missing: [], bad: [] }) === 0, true);
is("食い違いは1", verdict({ missing: [], bad: ["x"] }) === 1, true);
is("数えられなければ2", verdict({ missing: ["x"], bad: [] }) === 2, true);
// **数えていないほうが強い。** 数えられていないのに「1件だけ」と言わない
is("両方あれば2", verdict({ missing: ["x"], bad: ["y"] }) === 2, true);

/* ---- 5. 足が1本ずつ折れること ---- */
if (!process.env.BREAK) {
  for (const br of ["nolabel", "nogap"]) {
    let code = 0;
    try {
      execFileSync(process.execPath, [me], { env: { ...process.env, BREAK: br }, stdio: "pipe" });
    } catch (e) {
      code = e.status ?? -1;
    }
    見た += 1;
    if (code !== 1) ng.push(`BREAK=${br} を当てても落ちない（終了コード ${code}）`);
  }
}

if (見た === 0) {
  console.error("数えるものが無い");
  process.exit(2);
}
if (ng.length) {
  console.error(`落ちた ${ng.length}件 / 見た ${見た}件`);
  for (const x of ng) console.error(`  - ${x}`);
  process.exit(1);
}
console.log(`cardgo の判定 ${見た}件、ぜんぶ通りました。`);
