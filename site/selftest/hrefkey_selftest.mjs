/**
 * **種類どうしを、道の字や名前の字で結んでいないか**（`docs/spec/model.md` M-6。#1357）。
 *
 *     node site/selftest/hrefkey_selftest.mjs
 *
 * 終了コード 0=通った / 1=見つかった / 2=数えるものが無い・対照が外れた。
 *
 * ## 数える2つ
 *
 * | 印 | 何を数えるか |
 * | --- | --- |
 * | `道の字` | 種類の表（下の `TABLES`）に、面の道（`href: "/…"`）を手で書いている所 |
 * | `名前の字` | 街の名簿（`CITIES` `TRAVEL_CITIES` `publicCities` `cityRow`）を、**名前の字が一致するか**で引いている所 |
 *
 * どちらも 0 が正しい。道は `content/kinds.ts` の `hrefOf` で組み、街は滞在の表の slug（`content/stays.ts` の `towns`）で結ぶ。
 * 前は国の面の「行った街」が `publicCities(country).find((t) => t.name === name)` で街のガイドを引いていて、
 * 滞在の表とガイドの名簿のどちらかの表記を変えた日にカードが黙って外れる形だった。
 *
 * ## 数えないもの（`EXCUSE`）
 *
 * 告知の札（`content/plans.ts`・`content/themes.ts`・`content/projects.ts` の `notice`）の `href` は、
 * 企画の面（`/next`）を畳む W3（#1277）が告知の札ごと畳む。それまで名指しで外す。
 * **外した字が無くなったら、ここから消す**（消し忘れは下に「もう要らない」と出る）。
 *
 * ## 対照
 *
 * 本物を数える前に、こしらえた字で `count()` を当てる。1本でも外れたら、本物を数えずに 2 で止まる。
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { codeOnly } from "../../tools/sprites/tsread.mjs";

const SITE = join(dirname(fileURLToPath(import.meta.url)), "..");

/** 種類の表（持ち主の表。`docs/spec/model.md` 3章の種類を書く表）。ここには道の字を書かない */
const TABLES = [
  "content/stays.ts",
  "content/cities.ts",
  "content/chapters.ts",
  "content/countries.ts",
  "content/projects.ts",
  "content/legends.ts",
  "content/recipes.ts",
  "content/months.ts",
  "content/streamTypes.ts",
  "content/apps.ts",
  "content/travel.ts",
  "content/kinds.ts",
];

/** 名前の字で街を引いていないかを見る置き場（面・部品・表・札） */
const JOIN_DIRS = ["app", "components", "lib", "content"];

/** 数えない字。`[ファイル, 字, 理由]` */
const EXCUSE = [
  ["content/projects.ts", '"/travel/georgia"', "告知の札（ジョージアバイバイ）。W3（#1277）が告知の札ごと畳む"],
  ["content/projects.ts", '"/about"', "告知の札（海外出発二周年）。W3（#1277）が告知の札ごと畳む"],
];

const HREF = /\bhref\s*:\s*(["'`])\/[^"'`]*\1/g;
const ROSTER = /\b(CITIES|TRAVEL_CITIES|publicCities|cityRow)\b/;
const NAME_EQ = /\.name\s*===|===\s*[\w.]*\.name\b/;

/** 字1枚から、道の字と名前の字を数える。`file` は数えない字を当てるため */
function count(file, src) {
  const code = codeOnly(src);
  const hrefs = TABLES.includes(file)
    ? [...code.matchAll(HREF)].map((m) => m[0]).filter((h) => !EXCUSE.some(([f, s]) => f === file && h.includes(s)))
    : [];
  const names = code.split("\n").filter((l) => ROSTER.test(l) && NAME_EQ.test(l));
  return { hrefs, names };
}

let BAD = 0;
const ok = (name, good, why = "") => {
  if (!good) BAD++;
  console.log(`  ${good ? "ok" : "NG"}  ${name}${good || !why ? "" : `  … ${why}`}`);
};

console.log("[対照] こしらえた字");
ok("表の道の字を数える", count("content/stays.ts", 'const A = [{ guide: { href: "/travel/bulgaria/sofia" } }];').hrefs.length === 1);
ok("注の中の道は数えない", count("content/stays.ts", '/* href: "/travel/x" */ const A = 1;').hrefs.length === 0);
ok("道の型からの道（hrefOf）は数えない", count("content/stays.ts", 'const h = hrefOf("/travel/<国>", "x");').hrefs.length === 0);
ok("表でないファイルの道は数えない", count("app/x.tsx", '<a href="/kitchen">').hrefs.length === 0);
ok("外した字は数えない", count("content/projects.ts", 'notice: { href: "/about" }').hrefs.length === 0);
ok(
  "名前の字で街を引く所を数える（前の国の面の形）",
  count("app/travel/record.tsx", "guide: publicCities(country).find((t) => t.name === name),").names.length === 1,
);
ok("slug で引く所は数えない", count("app/travel/record.tsx", "guide: publicCities(country).find((g) => g.slug === t.city),").names.length === 0);
if (BAD) {
  console.log(`✕ 対照が ${BAD}件 外れた。本物は数えない`);
  process.exit(2);
}

console.log("[本物]");
const files = [];
const walk = (d) => {
  for (const n of readdirSync(join(SITE, d))) {
    const p = `${d}/${n}`;
    if (n === "node_modules" || n.startsWith(".")) continue;
    if (statSync(join(SITE, p)).isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(n)) files.push(p);
  }
};
for (const d of JOIN_DIRS) walk(d);
const missing = TABLES.filter((t) => !existsSync(join(SITE, t)));
if (!files.length || missing.length) {
  console.log(`✕ 数えるものが無い（ファイル ${files.length}本・見当たらない表 ${missing.join(", ") || "なし"}）`);
  process.exit(2);
}
let hrefs = 0;
let names = 0;
for (const f of files) {
  const got = count(f, readFileSync(join(SITE, f), "utf8"));
  for (const h of got.hrefs) console.log(`  道の字    ${f}: ${h}`);
  for (const l of got.names) console.log(`  名前の字  ${f}: ${l.trim()}`);
  hrefs += got.hrefs.length;
  names += got.names.length;
}
for (const [f, s, why] of EXCUSE) {
  if (!readFileSync(join(SITE, f), "utf8").includes(s)) console.log(`  （もう要らない外し: ${f} の ${s}。${why}）`);
}
console.log(`表 ${TABLES.length}本・置き場 ${files.length}本を見た。道の字 ${hrefs}・名前の字 ${names}（外した字 ${EXCUSE.length}）`);
process.exit(hrefs || names ? 1 : 0);
