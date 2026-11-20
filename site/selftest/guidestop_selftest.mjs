/**
 * **足もとの街のガイドが、いまいる街か次に行く街の1本だけか。**（あやと 2026-11-20）
 *
 *     node site/selftest/guidestop_selftest.mjs
 *     # 0=通った / 1=食い違った / 2=数えるものが無い（対照が外れた・読めなかった）
 *
 * ## なぜ要るか
 *
 * > 行ったのにスコピエ観光ガイドとかソフィア観光ガイドが出てきてる。
 * > これ全部出す気ですか。意味がわからない
 *
 * 前の足もとは、公開した街を名簿から全部並べていた。街は行くたびに増えるので、
 * **並べる形に戻した日から、足もとが行った街の一覧に戻る。** そして選びかたは日で変わる
 * ——静的書き出しなので、焼いた日に選んだ街が残る形に戻すと、つぎの国へ移った日に
 * 前の街のガイドが出る。どちらも 1面ずつ開いて見ても、その日には正しく見える。
 *
 * ## 見ているもの
 *
 *  1. **足もと（`components/ui/PageShell.tsx` の `IslandFooter`）が、街のガイドを
 *     `FootGuide` の1本でしか出していない。** 街の名簿を並べる形（`publicCities()` /
 *     `TRAVEL_CITIES` の `.map`）が足もとに無い。`FootGuide` は選んだ1本だけを返す
 *  2. **選ぶ関数（`lib/guideStop.ts` の `guideOn`）が、作った滞在で3通りを当てる**——
 *     次の街にガイドがあれば次の街 / 無ければいまの街 / いまの街にも無ければ出さない。
 *     終わる日の当日はまだ居る
 *  3. **本物の滞在の表（`content/plans.ts`）× 本物の街の名簿（`content/travel.ts`）で、
 *     最初の滞在の日から最後の滞在の120日先まで1日ずつ選んで、** 選んだ1本の滞在が
 *     企画の段で「行ってきた」でないこと・それより後に始まる、ガイドのある滞在が
 *     「行ってきた」でないまま飛ばされていないこと・何も選ばない日はガイドのある滞在が
 *     全部「行ってきた」であること。段の決めかたは本物（`planPhase`）を使う——
 *     写しで持つと、企画の表の閉じかた（`closeStays`）が変わった日に確かめが古いまま通る
 *
 * ## 対照（本物を見る前に）
 *
 * 3 の数える手を、**わざと間違えた選びかた**（いちばん古い滞在を返す）に当てて落ちること、
 * 正しく選ぶ写しに当てて通ることを先に見る。外れたら本物を1つも見ずに 2。
 *
 * ## わざと壊して、赤くなることを見る
 *
 * ```bash
 * # 終わる日の当日に、もう居ないことにする（2 の「終わる日の当日」で落ちる）
 * sed 's/s.until >= day/s.until > day/' site/lib/guideStop.ts > /tmp/fg-gt.ts
 * GUIDE_TS=/tmp/fg-gt.ts node site/selftest/guidestop_selftest.mjs   # → 1
 *
 * # いちばん古い滞在から選ぶ（行った街を出す。3 で落ちる）
 * sed 's/for (let i = stops.length - 1; i >= 0; i--)/for (let i = 0; i < stops.length; i++)/' \
 *   site/lib/guideStop.ts > /tmp/fg-old.ts
 * GUIDE_TS=/tmp/fg-old.ts node site/selftest/guidestop_selftest.mjs  # → 1
 *
 * # 足もとに名簿を並べ直す（1 で落ちる）
 * sed 's|<FootGuide stops={GUIDE_STOPS} />|{publicCities().map((c) => <FootGuide key={c.href} stops={GUIDE_STOPS} />)}|' \
 *   site/components/ui/PageShell.tsx > /tmp/fg-shell.tsx
 * SHELL_TSX=/tmp/fg-shell.tsx node site/selftest/guidestop_selftest.mjs  # → 1
 * ```
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { must, readArray } from "../../tools/sprites/tsread.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = join(HERE, "..");
const LIB = join(SITE, "lib");
const CONTENT = join(SITE, "content");

/** 見るもの。**落ちることを確かめる写しだけ、ここを差し替える。** */
const GUIDE_SRC = process.env.GUIDE_TS || join(LIB, "guideStop.ts");
const SHELL_SRC = process.env.SHELL_TSX || join(SITE, "components", "ui", "PageShell.tsx");
const FOOT_SRC = join(SITE, "components", "ui", "FootGuide.tsx");

const req = createRequire(import.meta.url);

let BAD = 0;
let OK = 0;
function check(name, good, why = "") {
  if (good) {
    OK++;
    console.log(`  ok   ${name}`);
    return;
  }
  BAD++;
  console.log(`  NG   ${name}${why ? ` — ${why}` : ""}`);
}
function give(code, why) {
  console.log(why);
  process.exit(code);
}

/* ------------------------------------------------------------------ 組み立て */

/** 1枚だけ字を落として読む。**import の無い（型しか import しない）本だけ**に使う */
function loadGuide(src) {
  const ts = req(join(SITE, "node_modules", "typescript"));
  const code = ts.transpileModule(readFileSync(src, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const mod = { exports: {} };
  new Function("exports", "require", "module", code)(mod.exports, req, mod);
  return mod.exports;
}

/* 企画の表は**本物**を組み立てる（`leadplan_selftest.mjs` と同じ持ち込みかた）。
   `@/lib/…` `@/content/…` は tsc が道に直さないので、隣に並べてから組み立てる */
const WORK = mkdtempSync(join(tmpdir(), "guidestop-src-"));
const OUT = mkdtempSync(join(tmpdir(), "guidestop-out-"));
function bring(src, name) {
  const code = readFileSync(src, "utf8").replace(/@\/lib\//g, "./").replace(/@\/content\//g, "./");
  writeFileSync(join(WORK, name), code);
}
bring(join(LIB, "builtAt.ts"), "builtAt.ts");
bring(join(CONTENT, "chapters.ts"), "chapters.ts");
bring(join(LIB, "nightly.ts"), "nightly.ts");
bring(join(CONTENT, "plans.ts"), "plans.ts");
execFileSync(
  join(SITE, "node_modules", ".bin", "tsc"),
  [
    join(WORK, "plans.ts"),
    "--outDir", OUT,
    "--module", "commonjs",
    "--target", "es2022",
    "--strict",
    "--skipLibCheck",
    "--typeRoots", join(SITE, "node_modules", "@types"),
    "--types", "node",
  ],
  { stdio: "inherit" },
);
const { PLANS, NEXT_MOVE, planPhase } = req(join(OUT, "plans.js"));

/**
 * 街の名簿（`content/travel.ts` の `CITIES`）を字で読む。**本体は組み立てない**——
 * あちらは面の部品（パンくず・貼られたときの顔）まで連れてくる。読み方は
 * `tools/sprites/tsread.mjs` の1本（読み落としが在れば `must` が 2 で止める）。
 * 道は本物の組み立てかた（`content/travelPath.ts` の `travelHref` ＋ `/<街>`。`TRAVEL_CITIES` と同じ）
 */
function readCities() {
  const { travelHref } = loadGuide(join(CONTENT, "travelPath.ts"));
  const got = readArray(readFileSync(join(CONTENT, "travel.ts"), "utf8"), "CITIES", {
    keys: ["country", "slug", "name"],
    idKey: "slug",
  });
  return must(got, "content/travel.ts の CITIES").map((c) => ({
    href: `${travelHref(c.country)}/${c.slug}`,
    name: c.name,
  }));
}

/** `YYYY-MM-DD` を n 日ずらす */
const shift = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
/** 日本時間の正午。日をまたぐ境目で数えない */
const noonJst = (day) => new Date(`${day}T12:00:00+09:00`);

/**
 * 選びかたを、企画の段と突き合わせる（3）。**食い違いを並べる。空なら通った。**
 *
 * `stays` は滞在の企画（日の順）、`stops` はそこから組んだ並び、`pick` は選ぶ関数。
 */
function audit(stays, stops, pick, from, to) {
  const bad = [];
  let picked = 0;
  const planOf = (s) => stays.find((p) => p.href === s.href);
  for (let d = from; d <= to; d = shift(d, 1)) {
    const now = noonJst(d);
    const g = pick(stops, d);
    const alive = stops.filter((s) => planPhase(planOf(s), now) !== "after");
    if (!g) {
      if (alive.length) bad.push(`${d}: 何も選ばなかった（まだ終わっていない ${alive.map((s) => s.name).join("・")} がある）`);
      continue;
    }
    picked++;
    if (planPhase(planOf(g), now) === "after") bad.push(`${d}: ${g.name}（もう行ってきた滞在）を選んだ`);
    const later = stops.slice(stops.indexOf(g) + 1).filter((s) => alive.includes(s));
    if (later.length) bad.push(`${d}: ${g.name} を選んで、あとの ${later.map((s) => s.name).join("・")} を飛ばした`);
  }
  return { bad, picked };
}

/* ------------------------------------------------------------- 対照（先に） */
{
  const { guideStops } = loadGuide(join(LIB, "guideStop.ts"));
  /* 作り物の滞在。A → B（B に移る日に A が終わる）。どちらもガイドあり */
  const fake = [
    { id: "a", date: "2030-01-01", until: "2030-01-09", href: "/t/a", endsWhen: NEXT_MOVE, when: "", title: "a", note: "", tags: [] },
    { id: "b", date: "2030-01-10", href: "/t/b", endsWhen: NEXT_MOVE, when: "", title: "b", note: "", tags: [] },
  ];
  const fakeStops = guideStops(fake, [{ href: "/t/a", name: "A" }, { href: "/t/b", name: "B" }]);
  const oldest = (stops) => stops[0];
  const right = (stops, d) => [...stops].reverse().find((s) => !s.until || s.until >= d);
  const wrong = audit(fake, fakeStops, oldest, "2029-12-25", "2030-02-01");
  const good = audit(fake, fakeStops, right, "2029-12-25", "2030-02-01");
  const fails = [];
  if (fakeStops.length !== 2) fails.push(`作り物の滞在から組んだ並びが ${fakeStops.length}本（2本のはず）`);
  if (!wrong.bad.length) fails.push("いちばん古い滞在を返す選びかたを、落とせなかった");
  if (good.bad.length) fails.push(`正しく選ぶ写しを落とした: ${good.bad[0]}`);
  if (!good.picked) fails.push("正しく選ぶ写しで、1日も選ばなかった（数える手が空回り）");
  if (fails.length) give(2, `対照が外れた。本物は1つも見ていない\n  ${fails.join("\n  ")}`);
  console.log("# 対照 通った（古い滞在を返す選びかたを落とし、正しい写しを通す）");
}

/* --------------------------------------------- 1. 足もとは1本でしか出さない */
console.log("\n# 1. 足もとに、街のガイドを並べていないか");
{
  const shell = readFileSync(SHELL_SRC, "utf8");
  const a = shell.indexOf("export function IslandFooter");
  const b = shell.indexOf("\n}\n", a);
  if (a < 0 || b < 0) give(2, `${SHELL_SRC} に IslandFooter が見つからない`);
  const foot = shell.slice(a, b);
  const uses = foot.match(/<FootGuide\b/g)?.length ?? 0;
  check("足もとが FootGuide をちょうど1つ置いている", uses === 1, `${uses}つ`);
  check(
    "足もとで街の名簿を並べていない（publicCities / TRAVEL_CITIES の map）",
    !/(publicCities\(\)|TRAVEL_CITIES)\s*\.\s*map\(/.test(foot),
  );
  check("足もとに街のガイドの字（観光ガイド）を直に書いていない", !/観光ガイド/.test(foot.replace(/\{\/\*[\s\S]*?\*\/\}/g, "")));
  const fg = readFileSync(FOOT_SRC, "utf8");
  check("FootGuide は選んだ1本だけを返す（guideOn を1回呼び、並べない）",
    (fg.match(/guideOn\(/g)?.length ?? 0) === 1 && !/\.map\(/.test(fg));
}

/* ------------------------------------------------ 2. 作った滞在で3通りを当てる */
console.log("\n# 2. 選ぶ関数を、作った滞在で当てる");
const { guideOn, guideStops } = loadGuide(GUIDE_SRC);
{
  const A = { href: "/t/a", name: "A", until: "2030-01-09" };
  const B = { href: "/t/b", name: "B" };
  check("次の街にガイドがあれば、次の街", guideOn([A, B], "2030-01-05")?.name === "B");
  check("次の街にガイドが無ければ、いまの街", guideOn([A], "2030-01-05")?.name === "A");
  check("終わる日の当日は、まだその街", guideOn([A], "2030-01-09")?.name === "A");
  check("終わった次の日は、何も出さない", guideOn([A], "2030-01-10") === undefined);
  check("ガイドが1つも無ければ、何も出さない", guideOn([], "2030-01-05") === undefined);
  const built = guideStops(
    [
      { date: "2030-01-10", href: "/t/b" },
      { date: "2030-01-01", href: "/t/a", until: "2030-01-09" },
      { date: "2030-01-05", href: "/t/none" },
    ],
    [{ href: "/t/a", name: "A" }, { href: "/t/b", name: "B" }],
  );
  check("並べるのは、ガイドのある滞在だけを始まる日の順に",
    built.map((s) => s.name).join() === "A,B", built.map((s) => s.name).join());
}

/* ------------------------------------- 3. 本物の滞在の表 × 本物の街の名簿 */
console.log("\n# 3. 本物の滞在の表で、1日ずつ選ぶ");
{
  const cities = readCities();
  const stays = PLANS.filter((p) => p.endsWhen === NEXT_MOVE && p.date).sort((a, b) => a.date.localeCompare(b.date));
  const stops = guideStops(stays, cities);
  console.log(`  （街の名簿 ${cities.length} / 滞在 ${stays.length} / ガイドのある滞在 ${stops.map((s) => s.name).join("・") || "0"}）`);
  if (!cities.length) give(2, "街の名簿（content/travel.ts の CITIES）が読めない");
  if (!stays.length) give(2, "滞在の企画（endsWhen が NEXT_MOVE）が1件も無い");
  const from = stays[0].date;
  const to = shift(stays[stays.length - 1].date, 120);
  const { bad, picked } = audit(stays, stops, guideOn, from, to);
  console.log(`  （${from} 〜 ${to}。選んだ日 ${picked}）`);
  if (stops.length && !picked) give(2, "ガイドのある滞在があるのに、1日も選ばなかった（数えていない）");
  check("選んだ1本は、いまいる街か次に行く街（行った街を出さず、次の街を飛ばさない）", !bad.length,
    bad.slice(0, 5).join(" / "));
}

console.log(`\n通った ${OK} / 落ちた ${BAD}`);
if (OK === 0) give(2, "数えるものがありませんでした。");
process.exit(BAD ? 1 : 0);
