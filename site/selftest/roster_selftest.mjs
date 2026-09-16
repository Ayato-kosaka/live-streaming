/**
 * `components/island/roster.ts` の確かめ。**偽の島で、本物の式を回す。**
 *
 *     node site/selftest/roster_selftest.mjs
 *
 * ## 何を見ているか
 *
 * 島を歩く人のえらばれかたは、あやとの決め（2026-09-15）でこうなっている。
 *
 * > やっぱり、投げ銭よくしてくれる人が優先されるべき。けど、出席も大事。
 * > 額と出席まで欲しい。**投げ銭の頻度はどうでも良い。**
 * > **相対評価が良いかも。ランクづけを過去3ヶ月でして、スコアリングできそう。
 * > 額1位は皆勤と同じくらい重要**
 *
 * 点（`score`）を作るのは焼くほう（`python/build_residents.py`、確かめは
 * `python/build_residents_selftest.py`）。**ここが見るのはその先**——
 * 焼いた点が、島に出る日数にちゃんと化けているか。
 *
 *  1. 順位 → 点（`rankPoints`）。**同着はかたまりのいちばん下**
 *  2. 点の無い人は、出席日数の順位で点が付く（焼き直しの前の受け皿）
 *  3. 重みは 1 〜 `TOP_WEIGHT`
 *  4. 90日回して——**一度も出ない人が 0人**
 *  5. **前の日と顔ぶれが完全に同じ日が 0日**（日替わりになっている）
 *  6. 上位と下位の差が **3〜5倍**
 *  7. **点が同じなら、出る日数もだいたい同じ**
 *     （＝額1位と皆勤が同じくらい強い、が日数で見えている）
 *  8. **点を見ていない実装は落ちる**（対照。点を平らにすると日数も平らになる）
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
 *
 * ```bash
 * cp site/components/island/roster.ts /tmp/broken.ts   # 守りを1つ外す
 * ROSTER_TS=/tmp/broken.ts node site/selftest/roster_selftest.mjs
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

const {TOP_WEIGHT, rankPoints, pointsOf, weightsOf, rosterOf} =
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

console.log("\n# 3. 重みは 1 〜 TOP_WEIGHT");
const w = weightsOf([{days: 0, score: 0}, {days: 0, score: 1}, {days: 0, score: 0.5}]);
check(`点0 は 1`, w[0] === 1, String(w[0]));
check(`点1 は ${TOP_WEIGHT}`, w[1] === TOP_WEIGHT, String(w[1]));
check("そのあいだはまっすぐ", near(w[2], (1 + TOP_WEIGHT) / 2, 1e-9), String(w[2]));
check("倍率は 3〜5 のあいだ", TOP_WEIGHT >= 3 && TOP_WEIGHT <= 5, String(TOP_WEIGHT));

// --------------------------------------------------------------- 90日まわす

/** 本番の102人と同じ形の出席日数（2026-09-15 の `residents.ts`）。 */
const DAYS = [
  80, 77, 49, 47, 44, 42, 41, 40, 39, 36, 35, 30, 24, 22, 19, 18, 11, 10, 10, 8,
  8, 7, 6, 6, 4, 4, 4, 4, 3, 3, 3, 3, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1,
  ...Array(60).fill(0),
];

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
 * 90日まわして、1人ずつ何日出たかを数える。
 * @param {object[]} people 候補
 * @param {number} start 何日目から
 * @return {object} 出た日数・前の日と同じだった日数・0日の人の数
 */
function walk(people, start) {
  const count = Array(people.length).fill(0);
  let prev = null;
  let same = 0;
  for (let d = 0; d < 90; d++) {
    const out = rosterOf(people, 12, start + d);
    for (const p of out) count[p.i]++;
    const ids = out.map((p) => p.i).sort((a, b) => a - b).join(",");
    if (prev !== null && ids === prev) same++;
    prev = ids;
  }
  const sorted = [...count].sort((a, b) => b - a);
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  return {
    count, same, sorted,
    zero: count.filter((n) => n === 0).length,
    top12: avg(sorted.slice(0, 12)),
    bottom12: avg(sorted.slice(-12)),
  };
}

/**
 * 90日の窓を何本もまわして、ならす。
 *
 * **1本だけ見て「0人だった」と言わない。** いちばん出ない人が何日出るかは
 * 運で動くので、たまたま0人の窓を引いただけかもしれない（#99）。
 * @param {object[]} people 候補
 * @param {number} windows 何本まわすか
 * @return {object} ならしたもの
 */
function many(people, windows = 200) {
  let zeroWindows = 0;
  let zeroPeople = 0;
  let hi = 0;
  let top12 = 0;
  let bottom12 = 0;
  let same = 0;
  for (let t = 0; t < windows; t++) {
    const r = walk(people, 19000 + t * 3);
    if (r.zero) zeroWindows++;
    zeroPeople += r.zero;
    hi += r.sorted[0];
    top12 += r.top12;
    bottom12 += r.bottom12;
    same += r.same;
  }
  return {
    zeroWindows: zeroWindows / windows,
    zeroPeople: zeroPeople / windows,
    hi: hi / windows,
    ratio: top12 / bottom12,
    same,
  };
}

const people = bake();
const one = walk(people, 20400);

console.log("\n# 4〜6. 候補102人・一度に12人・90日（公平なら1人あたり10.6日）");
console.log(`  ある90日: 上位12 ${one.sorted.slice(0, 12).join(" ")}`);
console.log(`            下位12 ${one.sorted.slice(-12).join(" ")}`);
const now = many(people);
console.log(`  200窓ならし: 最多 ${now.hi.toFixed(1)}日 / 上位12÷下位12 ${now.ratio.toFixed(2)}倍`
  + ` / 0日の人が出た窓 ${(100 * now.zeroWindows).toFixed(1)}% / 1窓あたり ${now.zeroPeople.toFixed(2)}人`);

check("90日で一度も出ない人は、ほとんどの窓で 0人（95%以上）",
  now.zeroWindows <= 0.05, `${(100 * now.zeroWindows).toFixed(1)}% の窓で出た`);
check("出たとしても1窓あたり 0.1人未満", now.zeroPeople < 0.1, `${now.zeroPeople.toFixed(2)}人`);
check("90日ぜんぶ出る人は 0人", one.count.filter((n) => n === 90).length === 0,
  `${one.count.filter((n) => n === 90).length}人`);
check("前の日と顔ぶれが完全に同じだった日が 0日（200窓ぜんぶで）", now.same === 0, `${now.same}日`);
check(`上位12平均と下位12平均の差が 3〜5倍（${now.ratio.toFixed(2)}倍）`,
  now.ratio >= 3 && now.ratio <= 5.2, now.ratio.toFixed(2));
check("いつも12人ちょうど出る", rosterOf(people, 12, 1).length === 12);
check("同じ人を2回出さない", new Set(rosterOf(people, 12, 1).map((p) => p.i)).size === 12);
check("候補が12人以下なら、そのまま全員", rosterOf(people.slice(0, 9), 12, 1).length === 9);
check("同じ日なら何度呼んでも同じ顔ぶれ",
  rosterOf(people, 12, 7).map((p) => p.i).join()
    === rosterOf(people, 12, 7).map((p) => p.i).join());

console.log("\n# 7. **点が同じなら、出る日数もだいたい同じ**（額1位 ≒ 皆勤）");
// 額1位（投げ銭のいちばん重い人）と、出席1位（days=80 の人）。
// 点はどちらも片方が満点・もう片方が最下位に近いので、ほぼ同じ値になる
const yen = fakeYen();
const topYen = yen.indexOf(Math.max(...yen));
const topDay = DAYS.indexOf(Math.max(...DAYS));
let yenDays = 0;
let dayDays = 0;
for (let t = 0; t < 60; t++) {
  const r = walk(people, 19000 + t * 3);
  yenDays += r.count[topYen];
  dayDays += r.count[topDay];
}
yenDays /= 60;
dayDays /= 60;
console.log(`  額1位 点${people[topYen].score.toFixed(3)} → ${yenDays.toFixed(1)}日`
  + ` / 出席1位 点${people[topDay].score.toFixed(3)} → ${dayDays.toFixed(1)}日`);
check("点が近い", Math.abs(people[topYen].score - people[topDay].score) < 0.2,
  `${people[topYen].score} / ${people[topDay].score}`);
check("出る日数も近い（1.3倍の内側）",
  Math.max(yenDays, dayDays) / Math.min(yenDays, dayDays) < 1.3,
  `${yenDays.toFixed(1)} / ${dayDays.toFixed(1)}`);
check("どちらも公平な10.6日よりはっきり多い", yenDays > 14 && dayDays > 14,
  `${yenDays.toFixed(1)} / ${dayDays.toFixed(1)}`);

console.log("\n# 8. 点を見ている（対照。点を平らにすると日数も平らになる）");
const flat = many(people.map((p) => ({days: p.days, score: 0.5, i: p.i})));
console.log(`  点を平らにすると: 最多 ${flat.hi.toFixed(1)}日 / 上位12÷下位12 ${flat.ratio.toFixed(2)}倍`);
check("平らにすると差が縮む（2.71倍あたり）", flat.ratio < 3.2, flat.ratio.toFixed(2));
check("点を付けたほうは、はっきり広い（1.6倍以上の開き）",
  now.ratio / flat.ratio >= 1.6, `${now.ratio.toFixed(2)} / ${flat.ratio.toFixed(2)}`);
check("平らにすると0日の人も出なくなる（＝差は点から来ている）",
  flat.zeroWindows < now.zeroWindows || flat.zeroWindows === 0,
  `${flat.zeroWindows} / ${now.zeroWindows}`);

console.log("");
if (BAD) {
  console.log(`NG が ${BAD} 件（通ったのは ${OK} 件）。`);
  process.exit(1);
}
console.log(`${OK} 件ぜんぶ通った。`);
