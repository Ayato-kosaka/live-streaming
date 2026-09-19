/**
 * `components/island/roster.ts` の確かめ。**偽の島で、本物の式を回す。**
 *
 *     node site/selftest/roster_selftest.mjs
 *
 * ## 何を見ているか
 *
 * 島を歩く人のえらばれかたは、あやとの決めでこうなっている。
 *
 * 2026-09-15:
 *
 * > やっぱり、投げ銭よくしてくれる人が優先されるべき。けど、出席も大事。
 * > 額と出席まで欲しい。**投げ銭の頻度はどうでも良い。**
 * > **相対評価が良いかも。ランクづけを過去3ヶ月でして、スコアリングできそう。
 * > 額1位は皆勤と同じくらい重要**
 *
 * 2026-09-19（issue #568）:
 *
 * > Q1 A（直近90日で出席0日・投げ銭0 の人は、島に出さない）
 * > Q3 上位は固定気味で、下のほうだけ入れ替わる
 *
 * この見張りは 2026-09-19 まで「重みが 1〜`TOP_WEIGHT` の一本の坂であること」を
 * 確かめていた。**その坂そのものが仕様を殺していた**（`docs/island-misses.md` #175）。
 *
 * 点（`score`）を作るのは焼くほう（`python/build_residents.py`、確かめは
 * `python/build_residents_selftest.py`）。**ここが見るのはその先**——
 * 焼いた点が、島に出る日数にちゃんと化けているか。
 *
 *  1. 順位 → 点（`rankPoints`）。**同着はかたまりのいちばん下**
 *  2. 点の無い人は、出席日数の順位で点が付く（焼き直しの前の受け皿）
 *  3. 重みは 1 〜 `TOP_WEIGHT`／`FIXED_SEATS` は島の半分を超えない
 *  4. **点0の人（3ヶ月なにもしていない人）が島に出ない**（Q1=A）
 *  5. **点の上から `FIXED_SEATS` 人が、毎日そのまま出る**（Q3 の「上位は固定気味」）
 *  6. **残りの席は毎日入れ替わる**（Q3 の「下のほうだけ入れ替わる」）
 *  7. **額だけの人も島に出る**（足し算が効いている。掛け算なら消える）
 *  8. **名簿が痩せた日でも、島が空にならない**
 *  9. **点を平らにすると差が消える**（対照。点を見ていることが数で見える）
 *
 * 人の数と日数の分布は、**本番の102人と同じ形**にしてある（`DAYS`）。
 * 中身は日数だけで、誰のものかは持っていない。
 *
 * ## なぜ写しを置かないか
 *
 * `roster.ts` を**その場で tsc に通して**動かす。写しを置くと、本体を
 * 直したのに確かめが古いまま通る（`functions/selftest/` と同じ作り）。
 *
 * ## 壊した写しで落ちることまで見る（`docs/island-misses.md` #99 #100）
 *
 * `ROSTER_TS` に壊した写しの道を渡すと、そちらを組み立てて回す。
 * **守りは2つあって、別々に落ちる。**
 *
 * ```bash
 * # (a) 点0を外す守りを抜く → 4 が落ちる（5 は通ったまま）
 * sed 's/order.filter((i) => points\[i\] > 0)/order/' \
 *   site/components/island/roster.ts > /tmp/no-cut.ts
 * ROSTER_TS=/tmp/no-cut.ts node site/selftest/roster_selftest.mjs
 *
 * # (b) 固定席の守りを抜く → 5 が落ちる（4 は通ったまま）
 * sed 's/live.slice(0, Math.min(FIXED_SEATS, max))/live.slice(0, 0)/' \
 *   site/components/island/roster.ts > /tmp/no-fix.ts
 * ROSTER_TS=/tmp/no-fix.ts node site/selftest/roster_selftest.mjs
 * ```
 */

import {execFileSync} from "node:child_process";
import {copyFileSync, mkdtempSync} from "node:fs";
import {createRequire} from "node:module";
import {tmpdir} from "node:os";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = join(HERE, "..");
const ISLAND = join(SITE, "components", "island");

/** 組み立てる `roster.ts`。**落ちることを確かめる写しだけ、ここを差し替える。** */
const SRC = process.env.ROSTER_TS || join(ISLAND, "roster.ts");

// CommonJS に落とす。**拡張子の要らない `require` で読めるようにするため**
// （tsc は `./geometry` を `./geometry.js` に書き換えてくれない）
const OUT = mkdtempSync(join(tmpdir(), "roster-selftest-"));
const WORK = mkdtempSync(join(tmpdir(), "roster-src-"));
copyFileSync(join(ISLAND, "geometry.ts"), join(WORK, "geometry.ts"));
copyFileSync(SRC, join(WORK, "roster.ts"));
execFileSync(join(SITE, "node_modules", ".bin", "tsc"), [
  join(WORK, "roster.ts"),
  "--outDir", OUT,
  "--module", "commonjs",
  "--target", "es2022",
  "--strict",
  "--skipLibCheck",
], {stdio: "inherit"});

const {TOP_WEIGHT, FIXED_SEATS, rankPoints, pointsOf, weightsOf, liveOf, rosterOf} =
  createRequire(import.meta.url)(join(OUT, "roster.js"));
console.log(`# 組み立てた本体: ${SRC}`);

let BAD = 0;
let OK = 0;
/**
 * 1つ見る。
 * @param {string} name 何を見たか
 * @param {boolean} good 通ったか
 * @param {string} why 落ちたときに出すもの
 */
function check(name, good, why = "") {
  if (good) {
    OK++;
    console.log(`  ok   ${name}`);
    return;
  }
  BAD++;
  console.log(`  NG   ${name}${why ? ` — ${why}` : ""}`);
}

const near = (a, b, tol) => Math.abs(a - b) <= tol;

// ------------------------------------------------------------------ 1 / 2 / 3

console.log("\n# 1. 順位 → 点。**同着はかたまりのいちばん下**");
check("いちばん上が 1、いちばん下が 0",
  JSON.stringify(rankPoints([5, 1, 3])) === JSON.stringify([1, 0, 0.5]),
  JSON.stringify(rankPoints([5, 1, 3])));
check("同着（0円が3人）は全員 0",
  JSON.stringify(rankPoints([0, 0, 0, 9])) === JSON.stringify([0, 0, 0, 1]),
  JSON.stringify(rankPoints([0, 0, 0, 9])));
check("同着をかたまりの上や平均で付けていない（0円が真ん中の点をもらわない）",
  rankPoints([0, 0, 0, 0, 0, 0, 0, 9])[0] === 0);
check("1人しかいなければ 0", JSON.stringify(rankPoints([7])) === JSON.stringify([0]));

console.log("\n# 2. 点の無い人は、出席日数の順位で点が付く（焼き直しの前の受け皿）");
const mixed = [{days: 30}, {days: 0}, {days: 10, score: 0.9}];
check("焼いてある点はそのまま", pointsOf(mixed)[2] === 0.9, String(pointsOf(mixed)[2]));
check("無い人は出席の順位から", pointsOf(mixed)[0] === 1 && pointsOf(mixed)[1] === 0,
  JSON.stringify(pointsOf(mixed)));
check("壊れた点は 0〜1 に収める",
  pointsOf([{days: 1, score: 9}, {days: 1, score: -9}]).join() === "1,0");

console.log("\n# 3. 重みと席の数");
const w = weightsOf([{days: 0, score: 0}, {days: 0, score: 1}, {days: 0, score: 0.5}]);
check(`点0 は 1`, w[0] === 1, String(w[0]));
check(`点1 は ${TOP_WEIGHT}`, w[1] === TOP_WEIGHT, String(w[1]));
check("そのあいだはまっすぐ", near(w[2], (1 + TOP_WEIGHT) / 2, 1e-9), String(w[2]));
check("倍率は 3〜5 のあいだ", TOP_WEIGHT >= 3 && TOP_WEIGHT <= 5, String(TOP_WEIGHT));
check(`固定席は1席以上（0席だと「上位は固定気味」が無い）`, FIXED_SEATS >= 1,
  String(FIXED_SEATS));
check("固定席は島（12人）の半分を超えない（超えると下が入れ替わらない）",
  FIXED_SEATS <= 6, String(FIXED_SEATS));

// --------------------------------------------------------------- 90日まわす

/** 本番の102人と同じ形の出席日数（2026-09-15 の `residents.ts`）。 */
const DAYS = [
  80, 77, 49, 47, 44, 42, 41, 40, 39, 36, 35, 30, 24, 22, 19, 18, 11, 10, 10, 8,
  8, 7, 6, 6, 4, 4, 4, 4, 3, 3, 3, 3, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1,
  ...Array(60).fill(0),
];

/** 島を歩く人数。本番の `/` は11人、`/island` は12人。 */
const SEATS = 12;

/**
 * 偽の投げ銭。**本番の額は1つも置かない。**
 * 20人だけが投げていて、上へ行くほど重い（実際の形に寄せた裾の長い山）。
 * **出席の順番とわざとずらしてある**——出席1位が額1位でもある人だと、
 * 「足している」のか「出席だけ見ている」のかが見分けられない。
 * @return {number[]} 1人ぶんずつの総額
 */
function fakeYen() {
  const yen = Array(DAYS.length).fill(0);
  const who = [41, 3, 60, 7, 0, 90, 12, 1, 33, 5, 70, 20, 2, 55, 9, 80, 15, 44, 26, 61];
  who.forEach((i, n) => {
    yen[i] = Math.round(120000 / (n + 1));
  });
  return yen;
}

/** 焼くほう（`points` × `points`）と同じ作りで点を組む。 */
function bake() {
  const yen = fakeYen();
  const tip = rankPoints(yen);
  const day = rankPoints(DAYS);
  return DAYS.map((d, i) => ({days: d, score: (tip[i] + day[i]) / 2, i}));
}

/**
 * 日をまわして、1人ずつ何日出たかを数える。
 * @param {object[]} people 候補
 * @param {number} days まわす日数
 * @param {number} start 何日目から
 * @return {object} 出た日数・前の日と同じだった日数・入れ替わった人数
 */
function walk(people, days = 2000, start = 19000) {
  const count = Array(people.length).fill(0);
  let same = 0;
  let churn = 0;
  let short = 0;
  let prev = null;
  for (let d = 0; d < days; d++) {
    const out = rosterOf(people, SEATS, start + d);
    if (out.length !== SEATS) short++;
    for (const p of out) count[p.i]++;
    const now = new Set(out.map((p) => p.i));
    if (prev) {
      churn += [...now].filter((i) => !prev.has(i)).length;
      if ([...now].sort((a, b) => a - b).join() === [...prev].sort((a, b) => a - b).join()) same++;
    }
    prev = now;
  }
  return {
    count, same, days, short,
    churn: churn / (days - 1),
    everyday: count.filter((n) => n === days).length,
  };
}

const people = bake();
const {live, rest} = liveOf(people);
const run = walk(people);

console.log(`\n# 4. 点0の人（3ヶ月なにもしていない人）が島に出ない`);
console.log(`  候補 ${people.length}人 → 点>0 ${live.length}人 / 点0 ${rest.length}人`
  + ` / ${SEATS}人の島を ${run.days}日`);
const zeroSeen = rest.reduce((n, i) => n + run.count[i], 0);
console.log(`  点0の人が島にいた延べ人数: ${zeroSeen}人`
  + `（1日あたり ${(zeroSeen / run.days).toFixed(2)}人）`);
check("点0の人は 1日も島に出ない", zeroSeen === 0, `延べ ${zeroSeen}人`);
check("それでも島は毎日ちょうど埋まる", run.short === 0, `${run.short}日 足りなかった`);

console.log(`\n# 5. 点の上から ${FIXED_SEATS}人が、毎日そのまま出る（上位は固定気味）`);
const fixed = live.slice(0, FIXED_SEATS);
const nextUp = live[FIXED_SEATS];
console.log(`  固定席: ${fixed.map((i) => `点${people[i].score.toFixed(3)}`).join(" ")}`);
console.log(`  そのすぐ下（点${people[nextUp].score.toFixed(3)}）: `
  + `${(100 * run.count[nextUp] / run.days).toFixed(0)}% の日`);
check(`点の上から ${FIXED_SEATS}人が、${run.days}日ぜんぶ出る`,
  fixed.every((i) => run.count[i] === run.days),
  fixed.map((i) => run.count[i]).join());
check(`毎日出るのは、その ${FIXED_SEATS}人だけ`, run.everyday === FIXED_SEATS,
  `${run.everyday}人`);
check("固定席のすぐ下は、毎日ではない（固定が広がっていない）",
  run.count[nextUp] < run.days, String(run.count[nextUp]));

console.log("\n# 6. 残りの席は毎日入れ替わる（下のほうだけ入れ替わる）");
const pool = live.slice(FIXED_SEATS);
const seen = pool.filter((i) => run.count[i] > 0).length;
console.log(`  抽選席 ${SEATS - FIXED_SEATS}席に出入りした人: ${seen}人 / ${pool.length}人`);
console.log(`  前の日から入れ替わる人数: 1日あたり ${run.churn.toFixed(2)}人`
  + ` / 前の日と顔ぶれが完全に同じ日: ${run.same}日`);
check("抽選席の候補は、全員が一度は島に出る", seen === pool.length,
  `${seen} / ${pool.length}`);
check("前の日と顔ぶれが完全に同じ日は 0日", run.same === 0, `${run.same}日`);
check("毎日3人以上が入れ替わる", run.churn >= 3, run.churn.toFixed(2));
check("いつも定員ちょうど出る", rosterOf(people, SEATS, 1).length === SEATS);
check("同じ人を2回出さない",
  new Set(rosterOf(people, SEATS, 1).map((p) => p.i)).size === SEATS);
check("候補が定員以下なら、そのまま全員",
  rosterOf(people.slice(0, 9), SEATS, 1).length === 9);
check("同じ日なら何度呼んでも同じ顔ぶれ",
  rosterOf(people, SEATS, 7).map((p) => p.i).join()
    === rosterOf(people, SEATS, 7).map((p) => p.i).join());

console.log("\n# 7. 額だけの人も島に出る（点は足し算。掛け算なら消える）");
const yen = fakeYen();
// 額1位。出席は1日しかない——**額を見ていなければ、点0で島から消える人**
const topYen = yen.indexOf(Math.max(...yen));
// 同じ出席1日で、投げ銭0円の人。**額のぶんだけ差が出るはず**
const sameDays = DAYS.map((d, i) => i)
  .filter((i) => DAYS[i] === DAYS[topYen] && yen[i] === 0)[0];
console.log(`  額1位（出席${DAYS[topYen]}日・点${people[topYen].score.toFixed(3)}）:`
  + ` ${(100 * run.count[topYen] / run.days).toFixed(0)}% の日`);
console.log(`  同じ出席${DAYS[sameDays]}日で投げ銭0円（点${people[sameDays].score.toFixed(3)}）:`
  + ` ${(100 * run.count[sameDays] / run.days).toFixed(0)}% の日`);
check("額1位が島に出ている（掛け算なら 0日）", run.count[topYen] > 0,
  String(run.count[topYen]));
check("同じ出席日数でも、額のあるほうが多く出る（1.3倍以上）",
  run.count[topYen] >= run.count[sameDays] * 1.3,
  `${run.count[topYen]} / ${run.count[sameDays]}`);
// 出席1位。**額を見ていない日でも、出席だけで上位に居られる**
const topDay = DAYS.indexOf(Math.max(...DAYS));
check("出席1位も島に出ている", run.count[topDay] > 0, String(run.count[topDay]));

console.log("\n# 8. 名簿が痩せた日でも、島が空にならない");
// 新しい章の頭・取り込みが落ちた日。点>0 が定員に届かない
for (const n of [0, 1, 5, SEATS - 1]) {
  const thin = people.map((p, i) => ({days: p.days, score: i < n ? (n - i) / n : 0, i}));
  const sizes = Array.from({length: 120}, (_, d) => rosterOf(thin, SEATS, 19000 + d).length);
  const lo = Math.min(...sizes);
  const hi = Math.max(...sizes);
  console.log(`  点>0 が ${String(n).padStart(2)}人 → 島は ${lo}〜${hi}人`);
  check(`点>0 が ${n}人でも、島は定員ちょうど`, lo === SEATS && hi === SEATS, `${lo}〜${hi}`);
}
check("候補が0人なら 0人（出しようがない）", rosterOf([], SEATS, 1).length === 0);

console.log("\n# 9. 点を見ている（対照）");
/* **抽選席の重みだけを平らにする。** 名簿ぜんぶを同じ点にすると、点0の人が
   居なくなって固定席の顔ぶれまで変わり、何が効いたのか分からなくなる。
   固定席の4人と、点0で切られた人は**そのまま**にして、抽選席だけを平らにする */
const flatPool = people.map((p, i) => ({
  days: p.days,
  score: fixed.includes(i) || p.score === 0 ? p.score : 0.5,
  i,
}));
const flat = walk(flatPool);
const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
/* 比べる相手は**点で選んだ12人**に固定する。出た日数の多い順に12人取ると、
   点が平らでも運のいい12人が上に来て、対照のほうが広く出る（ただの揺らぎ） */
const hi12 = pool.slice(0, 12);
const lo12 = pool.slice(-12);
const ratioIn = (r) => avg(hi12.map((i) => r.count[i])) / avg(lo12.map((i) => r.count[i]));
const nowRatio = ratioIn(run);
const flatRatio = ratioIn(flat);
console.log(`  抽選席の 点の上12人 ÷ 点の下12人: 点あり ${nowRatio.toFixed(2)}倍`
  + ` / 抽選席の重みを平らにすると ${flatRatio.toFixed(2)}倍`);
check("平らにすると抽選席の差がほぼ消える（1.1倍の内側）", flatRatio < 1.1,
  flatRatio.toFixed(2));
check("点を見ているほうは、はっきり広い（1.3倍以上の開き）",
  nowRatio / flatRatio >= 1.3, `${nowRatio.toFixed(2)} / ${flatRatio.toFixed(2)}`);
check("平らにしても固定席は動かない（＝上の差は席、下の差は点）",
  flat.everyday === FIXED_SEATS && fixed.every((i) => flat.count[i] === flat.days),
  `${flat.everyday}人`);

/* 切っているのが「点0」であって、その人たち自身ではないことを見る。
   点0の53人に点を付けると、同じ実装のまま島に出てくる */
const revived = walk(people.map((p) => ({
  days: p.days, score: p.score === 0 ? 0.4 : p.score, i: p.i,
})));
const back = rest.filter((i) => revived.count[i] > 0).length;
console.log(`  点0の ${rest.length}人に点0.4を付けると: ${back}人が島に出た`);
check("点を付ければ島に出る（＝切っているのは点0という値）", back === rest.length,
  `${back} / ${rest.length}`);

console.log("");
if (BAD) {
  console.log(`NG が ${BAD} 件（通ったのは ${OK} 件）。`);
  process.exit(1);
}
console.log(`${OK} 件ぜんぶ通った。`);
