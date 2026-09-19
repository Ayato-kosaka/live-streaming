/**
 * `components/isle/folk.ts` の確かめ。**表紙の島が、どう人を選んでいるか。**
 *
 *     node site/selftest/folk_selftest.mjs
 *
 * ## なぜ、`roster_selftest.mjs` と別に要るのか
 *
 * 選びかたそのもの（順位→点→重み、倍率）はあちらが見ている。
 * ここが見るのは **`folk.ts` がそれを使っているか** の1点だけ。
 *
 * `folk.ts` には、出席日数だけを指数にする古い写しが残っていた。
 * `app/page.tsx` と `app/island/[chapter]/page.tsx` は `IsleStage` →
 * `folk.ts` を通るので、**視聴者さんが実際に見る表紙（`/`）はこちらの経路**。
 * あちらを直しても画面は1ピクセルも変わっていなかった。
 * 写しが戻ってきたら、ここが落ちる。
 *
 * ## 何を見ているか
 *
 *  1. 12人ちょうど出る／同じ人を2度出さない／同じ日なら同じ顔ぶれ
 *  2. **点（`score`）を持たない名簿**——焼き直しの前の受け皿。
 *     出席0日の人は島に出ず、出席の上から `FIXED_SEATS` 人が毎日そのまま出る
 *  3. **点を持つ名簿**——投げ銭の額1位（出席0日）は島に出る。
 *     **出席0日・投げ銭0円の人は1日も出ない**
 *     （あやとの決め 2026-09-19 / #568 Q1=A。経緯は `docs/island-misses.md` #175）
 *  4. **前の日と顔ぶれが完全に同じ日が 0日**（日替わりになっている）
 *  5. **抽選席の重みを平らにすると差が消える**（対照。点を見ていることが数で見える）
 *
 * 人の数と日数の分布は、**本番の102人と同じ形**（2026-09-15 の `residents.ts`）。
 * 額は偽物で、本番の値は1つも置いていない。
 *
 * ## 壊した写しで落ちることまで見る（`docs/island-misses.md` #99 #100）
 *
 * `FOLK_TS` に壊した写しの道を渡すと、そちらを組み立てて回す。
 *
 * ```bash
 * # 選びかたを自前で書いた写し（`rosterOf` を通らない）で回すと落ちる
 * sed 's/rosterOf(people.filter((p) => p.icon), max, jstDay(today))/'\
 * '[...people].sort((a, b) => b.days - a.days).slice(0, max)/' \
 *   site/components/isle/folk.ts > /tmp/folk-old.ts
 * FOLK_TS=/tmp/folk-old.ts node site/selftest/folk_selftest.mjs
 * ```
 */

import {execFileSync} from "node:child_process";
import {copyFileSync, mkdtempSync, readFileSync, writeFileSync} from "node:fs";
import {createRequire} from "node:module";
import {tmpdir} from "node:os";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = join(HERE, "..");
const ISLAND = join(SITE, "components", "island");
const ISLE = join(SITE, "components", "isle");

/** 組み立てる `folk.ts`。**落ちることを確かめる写しだけ、ここを差し替える。** */
const SRC = process.env.FOLK_TS || join(ISLE, "folk.ts");

// CommonJS に落とす。**拡張子の要らない `require` で読めるようにするため**
const OUT = mkdtempSync(join(tmpdir(), "folk-selftest-"));
const WORK = mkdtempSync(join(tmpdir(), "folk-src-"));

// 選びかたは**本物**を持ち込む。写しを置くと、本体を直したのに確かめが古いまま通る
copyFileSync(join(ISLAND, "geometry.ts"), join(WORK, "geometry.ts"));
copyFileSync(join(ISLAND, "roster.ts"), join(WORK, "roster.ts"));

/* 島の地形（`./world`）だけは受け皿を置く。本物は `Sprite.tsx` 経由で React まで
   引き連れてくるし、ここで見ているのは**今日だれが島にいるか**であって
   立ち位置ではない。草地への引き戻しは何もしない。 */
writeFileSync(join(WORK, "world.ts"), `export type Placed = { x: number; y: number };
export function clampTo(
  _w: { cx: number; cy: number; squash: number },
  _radii: number[],
  x: number,
  y: number,
  _margin = 10,
): [number, number] {
  return [x, y];
}
`);

/* 別名（`@/components/island/…`）は tsc が道に直してくれないので、
   隣に置いたものを指すように書き替えてから組み立てる */
writeFileSync(
  join(WORK, "folk.ts"),
  readFileSync(SRC, "utf8").replace(/@\/components\/island\//g, "./"),
);

execFileSync(join(SITE, "node_modules", ".bin", "tsc"), [
  join(WORK, "folk.ts"),
  "--outDir", OUT,
  "--module", "commonjs",
  "--target", "es2022",
  "--strict",
  "--skipLibCheck",
], {stdio: "inherit"});

const req = createRequire(import.meta.url);
const {createFolk, outToday} = req(join(OUT, "folk.js"));
/** 席の分けかたは `roster.ts` が決める。**ここに写しを置かない** */
const {FIXED_SEATS} = req(join(OUT, "roster.js"));
console.log(`# 組み立てた本体: ${SRC}（固定席 ${FIXED_SEATS}人）`);

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

// ------------------------------------------------------------------ 偽の島

/** 島の半径。12人出る大きさ（`outToday`） */
const R = 432;

/** 偽の地形。建物を10軒だけ置く（表紙の島と同じ軒数） */
const GROUND = {
  cx: 600,
  cy: 600,
  squash: 0.62,
  radii: Array(64).fill(R),
  places: Array.from({length: 10}, (_, i) => ({
    x: 600 + Math.cos((i / 10) * Math.PI * 2) * 200,
    y: 600 + Math.sin((i / 10) * Math.PI * 2) * 120,
  })),
};
const LANDING = {x: 600, y: 760};

/** 日本時間の正午あたり。日をまたぐ境目で数えないため */
const NOON = Date.UTC(2026, 0, 1, 3, 0, 0);
const dayAt = (n) => new Date(NOON + n * 86400000);

/** 本番の102人と同じ形の出席日数（2026-09-15 の `content/residents.ts`）。 */
const DAYS = [
  80, 77, 49, 47, 44, 42, 41, 40, 39, 36, 35, 30, 24, 22, 19, 18, 11, 10, 10, 8,
  8, 7, 6, 6, 4, 4, 4, 4, 3, 3, 3, 3, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1,
  ...Array(60).fill(0),
];

/**
 * 偽の投げ銭。**本番の額は1つも置かない。**
 * 20人だけが投げていて、上へ行くほど重い。
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

/** 順位 → 0〜1。同着はかたまりのいちばん下（`roster.ts` の `rankPoints` と同じ決め） */
function rank(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return values.map((v) => sorted.findIndex((x) => x >= v) / (values.length - 1));
}

/** 点の無い名簿。**いまの `content/residents.ts` とまったく同じ形** */
const PLAIN = DAYS.map((d, i) => ({icon: `p${i}`, days: d}));

/** 点のある名簿。焼くほう（`python/build_residents.py`）と同じ作りで組む */
const YEN = fakeYen();
const TIP_RANK = rank(YEN);
const DAY_RANK = rank(DAYS);
const SCORED = DAYS.map((d, i) => ({
  icon: `p${i}`,
  days: d,
  score: (TIP_RANK[i] + DAY_RANK[i]) / 2,
}));

/** 額1位。**出席0日**の人を選ぶ——点が効いていなければ絶対に出てこない */
const TOP_YEN = (() => {
  const zero = YEN.map((y, i) => ({y, i})).filter((x) => DAYS[x.i] === 0);
  zero.sort((a, b) => b.y - a.y);
  return zero[0].i;
})();

/**
 * 90日の窓を何本かまわして、1人ずつ何日島に出たかを数える。
 * **1本だけ見て「0人だった」と言わない**（`roster_selftest.mjs` と同じ理由）。
 * @param {object[]} people 候補
 * @param {number} windows 何本まわすか
 * @return {object} ならした日数・前の日と同じだった日数・一度も出ない人の数
 */
function walk(people, windows = 20) {
  const total = Array(people.length).fill(0);
  const at = Object.fromEntries(people.map((p, i) => [p.icon, i]));
  let same = 0;
  let zero = 0;
  for (let w = 0; w < windows; w++) {
    const count = Array(people.length).fill(0);
    let prev = null;
    for (let d = 0; d < 90; d++) {
      const out = createFolk(people, GROUND, R, LANDING, dayAt(w * 131 + d));
      for (const f of out) count[at[f.icon]]++;
      const ids = out.map((f) => f.icon).sort().join(",");
      if (prev !== null && ids === prev) same++;
      prev = ids;
    }
    count.forEach((n, i) => {
      total[i] += n;
    });
    zero += count.filter((n) => n === 0).length;
  }
  const avg = total.map((n) => n / windows);
  const sorted = [...avg].sort((a, b) => b - a);
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  return {
    avg,
    same,
    windows,
    zero: zero / windows,
    top12: mean(sorted.slice(0, 12)),
    bottom12: mean(sorted.slice(-12)),
  };
}

// ------------------------------------------------------------------ 1

console.log("\n# 1. 島に出る人数と、日ごとの決まりかた");
const one = createFolk(PLAIN, GROUND, R, LANDING, dayAt(0));
check(`半径 ${R} の島は12人（outToday）`, outToday(R) === 12, String(outToday(R)));
check("12人ちょうど出る", one.length === 12, String(one.length));
check("同じ人を2度出さない", new Set(one.map((f) => f.icon)).size === 12);
check("同じ日なら、何度呼んでも同じ顔ぶれ",
  createFolk(PLAIN, GROUND, R, LANDING, dayAt(0)).map((f) => f.icon).join()
    === one.map((f) => f.icon).join());
check("候補が12人以下なら、そのまま全員",
  createFolk(PLAIN.slice(0, 9), GROUND, R, LANDING, dayAt(0)).length === 9);

// ------------------------------------------------------------------ 2

console.log("\n# 2. 点を持たない名簿（＝焼き直しの前の受け皿）でも、来ていない人は出ない");
const plain = walk(PLAIN);
const plainOut = PLAIN.map((p, i) => ({p, i, n: plain.avg[i]}));
const plainZero = plainOut.filter((x) => x.p.days === 0);
const plainLive = plainOut.filter((x) => x.p.days > 0);
const plainFixed = [...plainLive].sort((a, b) => b.p.days - a.p.days).slice(0, FIXED_SEATS);
console.log(`  出席0日の ${plainZero.length}人: 島にいた日 ${plainZero.reduce((n, x) => n + x.n, 0).toFixed(1)}日`);
console.log(`  出席の上から ${FIXED_SEATS}人: ${plainFixed.map((x) => `${x.n.toFixed(0)}日`).join(" ")}`
  + ` / そのすぐ下: ${[...plainLive].sort((a, b) => b.p.days - a.p.days)[FIXED_SEATS].n.toFixed(0)}日`);
check("出席0日の人は島に出ない（点が付かないので候補から外れる）",
  plainZero.every((x) => x.n === 0),
  plainZero.filter((x) => x.n > 0).length + "人 出た");
check(`出席の上から ${FIXED_SEATS}人は、90日ぜんぶ島にいる`,
  plainFixed.every((x) => x.n === 90), plainFixed.map((x) => x.n.toFixed(0)).join());
check("出席のある人は、全員が一度は島に出る",
  plainLive.every((x) => x.n > 0),
  plainLive.filter((x) => x.n === 0).length + "人 出なかった");
check("90日ぜんぶ島にいるのは、その人たちだけ",
  plainOut.filter((x) => x.n === 90).length === FIXED_SEATS,
  `${plainOut.filter((x) => x.n === 90).length}人`);

// ------------------------------------------------------------------ 3

console.log("\n# 3. 点を持つ名簿。**額1位（出席0日）も島に出る**");
const scored = walk(SCORED);
const withScore = scored.avg[TOP_YEN];
const without = plain.avg[TOP_YEN];
console.log(`  額1位（p${TOP_YEN}・出席0日・点 ${SCORED[TOP_YEN].score.toFixed(3)}）:`
  + ` 点あり ${withScore.toFixed(1)}日 / 点なし ${without.toFixed(1)}日`);
check("額1位が島に出ている", withScore > 0, withScore.toFixed(1));
check("点なし（出席だけ）のときは出ていない＝額を見ている", without === 0, without.toFixed(1));
check("出席0日でも、公平な10.6日の半分は歩く", withScore > 5.3, withScore.toFixed(1));

/* 出席0日・投げ銭0円の人を対照に置く。**あやとの決め（#568 Q1=A）で、島に出さない** */
const POOR = DAYS.map((d, i) => ({d, i})).filter((x) => x.d === 0 && YEN[x.i] === 0)[0].i;
const POORS = DAYS.map((d, i) => i).filter((i) => DAYS[i] === 0 && YEN[i] === 0);
console.log(`  出席0日・投げ銭0円（${POORS.length}人・点 ${SCORED[POOR].score.toFixed(3)}）:`
  + ` ${POORS.reduce((n, i) => n + scored.avg[i], 0).toFixed(1)}日`);
check("3ヶ月なにもしていない人は、1日も島に出ない（#568 Q1=A）",
  POORS.every((i) => scored.avg[i] === 0),
  POORS.filter((i) => scored.avg[i] > 0).length + "人 出た");
check("額のある0日の人は出ている（切っているのは点0であって、出席0日ではない）",
  withScore > 0 && scored.avg[POOR] === 0);

// ------------------------------------------------------------------ 4 / 5

console.log("\n# 4. 日替わりになっている");
console.log(`  前の日と顔ぶれが完全に同じ日: 点なし ${plain.same}/${89 * plain.windows}`
  + ` / 点あり ${scored.same}/${89 * scored.windows}`);
check("点なしで 0日", plain.same === 0, String(plain.same));
check("点ありで 0日", scored.same === 0, String(scored.same));

console.log("\n# 5. 点を見ている（対照。抽選席の重みを平らにすると、差が消える）");
/* 固定席の人と、点0で切られた人は**そのまま**にして、抽選席だけを平らにする。
   名簿ぜんぶを同じ点にすると、点0の人が居なくなって固定席の顔ぶれまで変わり、
   何が効いたのか分からなくなる */
const ORDER = SCORED.map((p, i) => ({p, i}))
  .filter((x) => x.p.score > 0)
  .sort((a, b) => b.p.score - a.p.score || a.i - b.i)
  .map((x) => x.i);
const FIXED = ORDER.slice(0, FIXED_SEATS);
const LOT = ORDER.slice(FIXED_SEATS);
const flat = walk(SCORED.map((p, i) => ({
  icon: p.icon,
  days: p.days,
  score: FIXED.includes(i) || p.score === 0 ? p.score : 0.5,
})));
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const hi12 = LOT.slice(0, 12);
const lo12 = LOT.slice(-12);
const ratioIn = (r) => mean(hi12.map((i) => r.avg[i])) / mean(lo12.map((i) => r.avg[i]));
console.log(`  抽選席の 点の上12人 ÷ 点の下12人: 点あり ${ratioIn(scored).toFixed(2)}倍`
  + ` / 平らにすると ${ratioIn(flat).toFixed(2)}倍`);
check("平らにすると抽選席の差がほぼ消える（1.2倍の内側）", ratioIn(flat) < 1.2,
  ratioIn(flat).toFixed(2));
check("点を見ているほうは、はっきり広い（1.3倍以上の開き）",
  ratioIn(scored) / ratioIn(flat) >= 1.3,
  `${ratioIn(scored).toFixed(2)} / ${ratioIn(flat).toFixed(2)}`);
check("平らにしても固定席は動かない（＝上の差は席、下の差は点）",
  FIXED.every((i) => flat.avg[i] === 90), FIXED.map((i) => flat.avg[i].toFixed(0)).join());

console.log("");
if (BAD) {
  console.log(`NG が ${BAD} 件（通ったのは ${OK} 件）。`);
  process.exit(1);
}
console.log(`${OK} 件ぜんぶ通った。`);
