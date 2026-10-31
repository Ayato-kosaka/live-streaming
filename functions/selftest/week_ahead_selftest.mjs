/**
 * **過ぎた日の行を、口が落としているか**（#808）。
 *
 * あやと（2026-10-13）:
 * 「これ、わたし打つの面倒なので仕組みを見直してください。
 *  最低でもあなたは知ってるはずだし、**過去のものが出るのはシステムとして
 *  おかしい**」
 *
 * `GET /island-api/state` は `current.week` から、**もう過ぎた日の行を
 * 落としてから返す。** 落とすのは返す字だけで、書類は触らない。
 *
 * ## 対照は両側から
 *
 * 「過ぎた行が出ない」だけを見ても、**全部落としていても通る。**
 * 先の行・今日の行・日付の無い行が**残ること**を同じ数だけ当てる。
 *
 * ## 本番の字を1つも使わない
 *
 * このリポジトリは公開で、Actions のログも誰でも読める。
 * あやとが打った書き置きは出さない。仕込みは「ティラナを歩く」だけ。
 *
 * ## `islandApi.ts` を import しない
 *
 * 読み込んだだけで `admin.initializeApp()` が走って、資格情報の無いこの箱で
 * 落ちる。`clean_selftest.mjs` と同じで、`tsc` が書き出した
 * `lib/islandApi.js` から3つだけ切り出して動かす。**写しを持たない。**
 *
 * ```bash
 * node functions/selftest/week_ahead_selftest.mjs
 * ```
 */

import {execFileSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const FUNCTIONS = join(HERE, "..");

let bad = 0;

/**
 * 1件の確かめ。
 * @param {string} name 何を見ているか
 * @param {boolean} ok 通ったか
 * @param {string} [why] 落ちたときに出す中身（**仕込みの字だけ**）
 */
function check(name, ok, why = "") {
  if (ok) {
    console.log(`  ok   ${name}`);
    return;
  }
  bad += 1;
  console.log(`  NG   ${name}${why ? ` — ${why}` : ""}`);
}

/* ---------------- 本体を切り出す ---------------- */

console.log("# tsc を回して、いまの src から切り出す");
// -b: src が lib より新しいときだけ書き出す（src を変えれば作り直し、型の誤りでは今までどおり落ちる）。
// Selftests では functions/selftest の見張りが同じ src から同じ lib を1本ずつ作り直していて、1本 10秒がほぼそれだった
execFileSync(join(FUNCTIONS, "node_modules/.bin/tsc"), ["-b"], {cwd: FUNCTIONS});

const js = readFileSync(join(FUNCTIONS, "lib/islandApi.js"), "utf8");
const from = js.indexOf("const WEEK_MD = ");
const to = js.indexOf("const DONERU_GOAL = ");
/* **切り出しが空振りしたら、中身を見ずに通してはいけない。**
   名前を変えた日に「0件だから合格」と出るのがいちばん危ない（#19）。 */
if (from < 0 || to < 0 || to <= from) {
  console.error(
    "切り出せなかった。lib/islandApi.js に WEEK_MD / DONERU_GOAL が見当たらない",
  );
  process.exit(1);
}
const src = js.slice(from, to);
for (const name of ["const WEEK_MD", "function weekMdAt", "function weekAhead"]) {
  if (!src.includes(name)) {
    console.error(`切り出した中に ${name} が無い`);
    process.exit(1);
  }
}
const {weekAhead} = new Function(`${src}\nreturn {weekAhead};`)();
console.log(`  切り出した長さ: ${src.length} 字\n`);

/* ---------------- 0. 探し方が当たるか（先に見る。#19） ---------------- */

const TODAY = "2026-10-13";
console.log(`# 0. 探し方が当たるか（きょうは ${TODAY}）`);
check(
  "日付の無い行だけなら、1行も落ちない",
  weekAhead(["回る先はこれから"], TODAY).length === 1,
);
check(
  "過ぎた行だけなら、0行になる（＝落とす側が動いている）",
  weekAhead(["9/27 ティラナを歩く"], TODAY).length === 0,
);

/* ---------------- 1. 両側から ---------------- */

console.log("\n# 1. 落とすほう／残すほう");
{
  const got = weekAhead([
    "9/27 ティラナを歩く",
    "10/13 ティラナを歩く",
    "10/17 ティラナを歩く",
    "回る先はこれから",
  ], TODAY);
  check("過ぎた行が落ちる", !got.some((r) => r.startsWith("9/27")), got.join(" / "));
  check("今日の行は残る", got.some((r) => r.startsWith("10/13")), got.join(" / "));
  check("先の行は残る", got.some((r) => r.startsWith("10/17")), got.join(" / "));
  check("日付の無い行は残る", got.includes("回る先はこれから"), got.join(" / "));
  check("残ったのは3行", got.length === 3, `${got.length}行`);
}

/* **今日は過ぎていない。** 配信は日本時間の22時からなので、今日の予定は
   朝から夜までずっとまだ起きていない（`navtruth.mjs` の `judge` と同じ決め）。 */
console.log("\n# 2. 今日は過ぎていない");
check(
  "今日ちょうどの行は残る",
  weekAhead(["10/13 ティラナを歩く"], TODAY).length === 1,
);
check(
  "きのうの行は落ちる",
  weekAhead(["10/12 ティラナを歩く"], TODAY).length === 0,
);

/* 1行に日付が2つあるとき。**いちばん遅いほうで決める**——頭の日付で決めると、
   まだ続いている予定が初日を過ぎた瞬間に消える。 */
console.log("\n# 3. 1行に日付が2つ");
check(
  "10/10〜10/20 は、まだ続いているので残る",
  weekAhead(["10/10〜10/20 ティラナを歩く"], TODAY).length === 1,
);
check(
  "10/1〜10/5 は、終わっているので落ちる",
  weekAhead(["10/1〜10/5 ティラナを歩く"], TODAY).length === 0,
);

/* 年は書かれていない。**今日にいちばん近い年**として読む。 */
console.log("\n# 4. 年をまたぐ");
check(
  "1/3 を 12/30 に読むと「来年」なので残る",
  weekAhead(["1/3 ティラナを歩く"], "2026-12-30").length === 1,
);
check(
  "12/28 を 1/10 に読むと「去年」なので落ちる",
  weekAhead(["12/28 ティラナを歩く"], "2027-01-10").length === 0,
);

/* 日付に見えるが日付ではない数。**ありえない日付を作らない。** */
console.log("\n# 5. 日付ではない数");
check("13/40 は日付ではないので落とさない",
  weekAhead(["13/40 ティラナを歩く"], TODAY).length === 1);
check("2/30 は在りえないので落とさない",
  weekAhead(["2/30 ティラナを歩く"], TODAY).length === 1);
check("全角のスラッシュも拾う（スマホの入力で混ざる）",
  weekAhead(["9／27 ティラナを歩く"], TODAY).length === 0);

/* 壊れた入力。**落ちずに、黙って全部消さない。** */
console.log("\n# 6. 壊れた入力");
check("配列でなければ null（口は `current` をそのまま返す）",
  weekAhead(undefined, TODAY) === null);
check("空の配列は空のまま", weekAhead([], TODAY).length === 0);
check("きょうが読めないときは、1行も落とさない",
  weekAhead(["9/27 ティラナを歩く"], "だめな字").length === 1);

console.log(bad ? `\n落ちた: ${bad}件` : "\nぜんぶ通りました");
process.exit(bad ? 1 : 0);
