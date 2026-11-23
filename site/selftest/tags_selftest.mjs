/**
 * **札が、鍵（slug）と日付から引けているか**（`site/lib/tags.ts`。#1357）。
 *
 *     node site/selftest/tags_selftest.mjs
 *
 * 終了コード 0=通った / 1=落ちた / 2=数えるものが無い（組み立てられない・対照が外れた）。
 *
 * ## なぜ要るか
 *
 * 料理は国の字を持っていて、街の面には料理が出ていて、企画には期間があった。**データでは結べるのに、
 * 面にリンクが無い組**が7つあった（#1357 の「いま」）。札を引く関数を1つにしても、面がまた自分で表を読みはじめたり、
 * 鍵ではなく字で結びはじめたりすると、同じ形に戻る。だから「組ごとに1例」を名指しで引いて、**辿れること**を見る。
 * 書き出した面の上で同じ組を踏むのは `tools/sprites/tagreach.mjs`（こちらは書き出しの前に回る）。
 *
 * ## 見ているもの
 *
 *  1. **組ごとに1例**（下の `PAIRS`）。その面の札に、相手の面への札が在る
 *  2. **0件の段を返さない**（面ぜんぶ）。**同じ字が別の先を指さない**（面ごと。読み上げで区別がつかない）
 *  3. **種類と関係の不変条件**（M-13〜M-17。`modelProblems`）が、本物の表で空。壊した表では、その条を名指しで言う
 *  4. **滞在の街の鍵**（`content/stays.ts` の `stayKeyProblems`）が、本物の表で空。名簿の街を名前で書くと M-6、
 *     名簿に無い slug を書くと M-15 で落ちる
 *
 * ## 対照（鍵を1つ抜くと、その組が赤くなる）
 *
 * 1 の組ごとに、**その組を結んでいる鍵を1つだけ壊して**（料理の国・滞在の街の鍵・企画の旅・月の期間）、
 * 札が消えることを見る。消えなければ、その札は鍵を見ていない（何か別のもので結んでいる）。
 * 壊すのは組み立てたものの中の表（読み込んだあとの配列）で、ファイルは触らない。1組ずつ戻す。
 */
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import Module, { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = join(HERE, "..");
const TSC = join(SITE, "node_modules", ".bin", "tsc");

let BAD = 0;
let OK = 0;
function check(name, good, why = "") {
  if (good) OK++;
  else BAD++;
  console.log(`  ${good ? "ok" : "NG"}   ${name}${good || !why ? "" : `  … ${why}`}`);
}
function stop(why) {
  console.log(`✕ ${why}`);
  process.exit(2);
}

// ---------------------------------------------------------------- 組み立てる
const work = mkdtempSync(join(tmpdir(), "tags-selftest-"));
process.on("exit", () => rmSync(work, { recursive: true, force: true }));
for (const d of ["content", "lib", "components"]) cpSync(join(SITE, d), join(work, d), { recursive: true });
symlinkSync(join(SITE, "node_modules"), join(work, "node_modules"));
const out = join(work, "out");
writeFileSync(
  join(work, "tsconfig.json"),
  JSON.stringify({
    compilerOptions: {
      target: "ES2022",
      lib: ["dom", "dom.iterable", "ES2022"],
      module: "commonjs",
      moduleResolution: "node",
      esModuleInterop: true,
      resolveJsonModule: true,
      skipLibCheck: true,
      strict: true,
      jsx: "react-jsx",
      noEmitOnError: false,
      outDir: out,
      rootDir: work,
      baseUrl: work,
      paths: { "@/*": ["./*"] },
    },
    files: ["lib/tags.ts"].map((f) => join(work, f)),
  }),
);
try {
  execFileSync(TSC, ["-p", join(work, "tsconfig.json")], { stdio: "pipe" });
} catch {
  /* 型の文句はここでは数えない（`next build` が見る）。組み立てられたものだけ読む */
}
const orig = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (request.startsWith("@/") && parent?.filename?.startsWith(out + sep)) return orig.call(this, join(out, request.slice(2)), parent, ...rest);
  return orig.call(this, request, parent, ...rest);
};
const req = createRequire(import.meta.url);
let T, S, R, P, M, C;
try {
  T = req(join(out, "lib", "tags.js"));
  S = req(join(out, "content", "stays.js"));
  R = req(join(out, "content", "recipes.js"));
  P = req(join(out, "content", "projects.js"));
  M = req(join(out, "content", "months.js"));
  C = req(join(out, "content", "chapters.js"));
} catch (e) {
  stop(`lib/tags.ts を組み立てて読めない: ${String(e?.message ?? e).split("\n")[0]}`);
}

/** 面の札に、その先への札が在るか */
const has = (rows, href) => rows.some((r) => r.tags.some((t) => t.href === href) || r.more?.href === href);
const tagsOf = {
  country: (k) => T.tagsOfCountry(k),
  city: (k) => T.tagsOfCity(...k.split("/")),
  trip: (k) => T.tagsOfTrip(k),
  project: (k) => T.tagsOfProject(k),
  dish: (k) => T.tagsOfDish(k),
  month: (k) => T.tagsOfMonth(k),
};

// ---------------------------------------------------------------- 1. 組ごとに1例
const recipe = (slug) => R.RECIPES.find((r) => r.slug === slug) ?? stop(`料理 ${slug} が無い（組の例を選び直す）`);
const stayOf = (country, from) => S.STAYS.find((s) => s.country === country && s.from === from) ?? stop(`滞在 ${country} ${from} が無い`);
const month = (key) => M.MONTHS.find((m) => m.key === key) ?? stop(`月 ${key} が無い`);
const project = (slug) => P.PROJECTS.find((p) => p.slug === slug) ?? stop(`企画 ${slug} が無い`);

/* 例の料理は、表から選ぶ（slug を字で決め打ちしない。品が増えても減っても、条件に合う最初の1品） */
const skopjeDish = R.RECIPES.find((r) => r.country === "north-macedonia");
const sofiaDish = R.RECIPES.find((r) => r.country === "bulgaria");
const iwashi = R.RECIPES.find((r) => r.slug.startsWith("iwashi-"));
const georgiaDish = R.RECIPES.find((r) => r.country === "georgia");
if (!skopjeDish || !sofiaDish || !iwashi || !georgiaDish) stop("組の例にする料理が表に無い（北マケドニア・ブルガリア・イワシ・ジョージア）");

/**
 * 組。`from` の面の札に `to` の道が在ること。`cut` はその組を結んでいる鍵を1つ壊して、戻す関数を返す。
 * 「いま」に挙げた組（#1357）: 料理→国・料理↔街・国↔伝説・伝説↔料理・旅↔料理・旅↔月・月↔国・国→旅
 */
const PAIRS = [
  ["料理 → 国", "dish", georgiaDish.slug, "/travel/georgia", () => swap(georgiaDish, "country", "nowhere")],
  ["料理 → 街（北マケドニア）", "dish", skopjeDish.slug, "/travel/north-macedonia/skopje", () => swapTowns("north-macedonia")],
  ["料理 → 街（ブルガリア）", "dish", sofiaDish.slug, "/travel/bulgaria/sofia", () => swapTowns("bulgaria")],
  ["街 → 料理", "city", "north-macedonia/skopje", `/kitchen/${skopjeDish.slug}`, () => swapTowns("north-macedonia")],
  ["国 → 伝説", "country", "georgia", "/legends/iwashi-festival", () => swapSpan(project("iwashi-festival"), "2000-01-01")],
  ["伝説 → 国", "project", "iwashi-festival", "/travel/georgia", () => swapSpan(project("iwashi-festival"), "2000-01-01")],
  ["伝説 → 料理", "project", "iwashi-festival", `/kitchen/${iwashi.slug}`, () => swap(iwashi, "date", "2000-01-01")],
  ["料理 → 伝説", "dish", iwashi.slug, "/legends/iwashi-festival", () => swap(iwashi, "date", "2000-01-01")],
  ["旅 → 料理", "trip", "caucasus", `/kitchen/${georgiaDish.slug}`, () => swap(georgiaDish, "date", "2000-01-01")],
  ["料理 → 旅", "dish", georgiaDish.slug, "/island/caucasus", () => swap(georgiaDish, "date", "2000-01-01")],
  ["旅 → 月", "trip", "balkans", "/months/2026-10", () => swapMonth(month("2026-10"))],
  ["月 → 旅", "month", "2026-10", "/island/balkans", () => swapMonth(month("2026-10"))],
  ["月 → 国", "month", "2026-10", "/travel/north-macedonia", () => swapMonth(month("2026-10"))],
  ["国 → 月", "country", "north-macedonia", "/months/2026-10", () => swapMonth(month("2026-10"))],
  ["国 → 旅（北欧の外）", "country", "georgia", "/island/caucasus", () => swap(C.CHAPTERS.find((c) => c.slug === "caucasus"), "from", "")],
  ["企画（旅と1対1）→ 旅", "project", "nordic", "/island/nordic", () => swap(project("nordic"), "trip", "nowhere-trip")],
];

function swap(o, k, v) {
  const was = o[k];
  o[k] = v;
  return () => (o[k] = was);
}
/** その国の滞在の、街の鍵を外す（名前だけの街にする）。鍵で結んでいれば、街の札が消える */
function swapTowns(country) {
  const back = S.STAYS.filter((s) => s.country === country).map((s) => {
    const was = s.towns;
    s.towns = (s.towns ?? []).map((t) => ({ name: t.name }));
    return () => (s.towns = was);
  });
  return () => back.forEach((f) => f());
}
function swapSpan(p, day) {
  const a = swap(p, "date", day);
  const b = swap(p, "range", undefined);
  return () => (a(), b());
}
function swapMonth(m) {
  const a = swap(m, "from", "2000-01-01");
  const b = swap(m, "to", "2000-01-31");
  return () => (a(), b());
}

console.log("[1] 組ごとに1例（その面の札に、相手の面への札が在る）と、鍵を1つ抜いた対照");
let cutsMissed = 0;
for (const [name, kind, key, href, cut] of PAIRS) {
  check(`${name}: ${kind}「${key}」に ${href}`, has(tagsOf[kind](key), href));
  const back = cut();
  const still = has(tagsOf[kind](key), href);
  back();
  if (still) cutsMissed++;
  check(`  対照: 鍵を抜くと ${href} が消える`, !still, "鍵を抜いても札が残る（鍵ではない何かで結んでいる）");
}

// ---------------------------------------------------------------- 2. 0件の段・おなじ字
console.log("[2] 0件の段を返さない・同じ字が別の先を指さない（面ぜんぶ）");
const faces = [
  ...S.STAYS.map((s) => ["country", s.country]),
  ...S.STAYS.flatMap((s) => (s.towns ?? []).filter((t) => t.city).map((t) => ["city", `${s.country}/${t.city}`])),
  ...C.CHAPTERS.map((c) => ["trip", c.slug]),
  ...P.PROJECTS.map((p) => ["project", p.slug]),
  ...R.RECIPES.map((r) => ["dish", r.slug]),
  ...M.MONTHS.map((m) => ["month", m.key]),
];
let empty = 0;
let dup = 0;
for (const [kind, key] of faces) {
  const rows = tagsOf[kind](key);
  if (rows.some((r) => r.tags.length === 0)) empty++;
  const seen = new Map();
  for (const t of rows.flatMap((r) => r.tags)) {
    if (seen.has(t.label) && seen.get(t.label) !== t.href) dup++;
    seen.set(t.label, t.href);
  }
}
check(`面 ${faces.length}枚のうち、0件の段を返した面 = 0`, faces.length > 0 && empty === 0, `${empty}面`);
check(`面 ${faces.length}枚のうち、同じ字が別の先を指す札 = 0`, dup === 0, `${dup}組`);
check("0件の面（まだ街を書いていない街）は、段を1つも返さない", T.tagsOfCity("romania", "bucharest").length === 0);

// ---------------------------------------------------------------- 3. 不変条件
console.log("[3] 種類と関係の不変条件（M-13〜M-17）");
const real = {
  stays: S.STAYS,
  chapters: C.CHAPTERS,
  projects: P.PROJECTS,
  recipes: R.RECIPES,
  countries: req(join(out, "content", "countries.js")).COUNTRIES.map((c) => c.slug),
  streamDays: T.streamDays(),
};
check(`配信の在る日を ${real.streamDays.length}日 読めている`, real.streamDays.length > 300);
const realProblems = T.modelProblems(real);
check("本物の表で、外れ 0", realProblems.length === 0, realProblems.join(" / "));
const broken = [
  ["M-13", { stays: [...real.stays, { ...real.stays.at(-1), from: "2099-01-01", to: "" }] }],
  ["M-14", { streamDays: [...real.streamDays, "2024-01-01"] }],
  ["M-15", { recipes: [...real.recipes, { ...real.recipes[0], slug: "x", country: "atlantis" }] }],
  ["M-15", { projects: [...real.projects, { ...real.projects[0], slug: "x", trip: "nowhere" }] }],
  ["M-16", { projects: [...real.projects, { ...project("nordic"), slug: "nordic-2" }] }],
  ["M-17", { stays: real.stays.map((s, i) => (i === 0 ? { ...s, country: "europe", name: "ヨーロッパ" } : s)) }],
];
for (const [rule, over] of broken) {
  const got = T.modelProblems({ ...real, ...over });
  check(`壊した表（${Object.keys(over)[0]}）で ${rule} を名指しで言う`, got.some((x) => x.startsWith(rule)), got.join(" / ") || "何も言わない");
}

// ---------------------------------------------------------------- 4. 滞在の街の鍵
console.log("[4] 滞在の街の鍵（M-6・M-15）");
/* 読み込んだ表は、街の鍵がもう名前に開いてある。人が書いた形（鍵のまま）に戻してから当てる */
const raw = S.STAYS.map((s) => ({ ...s, cities: (s.towns ?? []).map((t) => t.city ?? t.name) }));
check("本物の表（人が書いた形）で、外れ 0", S.stayKeyProblems(raw).length === 0, S.stayKeyProblems(raw).join(" / "));
check("読み込んだ表には、名簿の街の鍵が開いて入っている（ソフィア）", S.STAYS.some((s) => s.towns?.some((t) => t.city === "sofia" && t.name === "ソフィア")));
const named = S.STAYS.map((s) => (s.country === "bulgaria" ? { ...s, cities: ["ソフィア"] } : { ...s, cities: [] }));
check("名簿の街を名前で書くと M-6", S.stayKeyProblems(named).some((x) => x.startsWith("M-6")));
const ghost = S.STAYS.map((s) => (s.country === "bulgaria" ? { ...s, cities: ["plovdiv"] } : { ...s, cities: [] }));
check("名簿に無い slug を書くと M-15", S.stayKeyProblems(ghost).some((x) => x.startsWith("M-15")));

console.log("");
if (cutsMissed) console.log(`✕ 対照が ${cutsMissed}組 外れた（鍵を抜いても札が残る）`);
console.log(BAD ? `✕ ${BAD}件 落ちた（${OK}件 通った）` : `○ ${OK}件 通った`);
process.exit(BAD ? 1 : 0);
