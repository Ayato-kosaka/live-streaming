/**
 * **締め切った宛先の表を、`site/content/themes.ts` から写す。**
 *
 *   node functions/tools/shutthemes.mjs            # 写したものを出すだけ
 *   node functions/tools/shutthemes.mjs --write    # src/shutThemes.ts に書く
 *   node functions/tools/shutthemes.mjs --check    # ずれていたら 1 で落ちる
 *
 * 終了コード 0=同じ / 1=ずれている / 2=写せなかった。
 *
 * ## なぜ写すのか（`functions` から島の表をそのまま読めない）
 *
 * 宛先の表は Git（`site/content/themes.ts`）が正本で、画面はそれを直に読む。
 * Functions は**配るときに `functions/` しか上がらない**ので、`site/` を
 * `import` できない。かといってサーバーが締め切りを知らないままだと、
 * 画面が畳んだ宛先の slug を直に投げれば**いまも書けてしまう**
 * （2026-10-12。`docs/island-misses.md` #225）。
 *
 * だから**機械で写す。** 写しは1方向（島 → Functions）で、ずれたら
 * `functions/selftest/sticky_shut_selftest.mjs` が落ちる。
 * 手で書き足す余地を残さないために、ファイルまるごとをここが組み立てる。
 *
 * ## 締め切りを「日付」で持つ
 *
 * 畳みかたは2通りある（`content/themes.ts` の `isOpenTheme`）。
 *
 *   1. `closed: true` … こちらが畳んだ印。**ずっと書けない**
 *   2. 企画あて … 同じ id の企画の**日が過ぎたら**書けなくなる
 *
 * 2つを1つの形で持つために、**「この時刻から書けない」の epoch ms** だけを
 * 写す。`closed` は `0`（＝いつでも書けない）。サーバーの判定は
 * `now >= その値` の1本になる（`functions/src/islandApi.ts` の `shutTheme`）。
 *
 * ## 規則を書き写さない
 *
 * 「どういうときに締め切りか」をこちらに書き写すと、島の表の決まりが
 * 変わった日に**ここだけ古い規則で写す。** 判定は島の `isOpenTheme` を
 * そのまま呼んで、**開いている → 締まっている に変わる瞬間**を
 * 二分探索で取る。写すのは結果（時刻）だけ。
 *
 * 向きが逆（締まっていたものが開く）や、2回以上ひっくり返る宛先は
 * この形で表せないので、**数字を1つも出さずに 2 で落ちる。**
 */

import {execFileSync} from "node:child_process";
import {existsSync, mkdtempSync, readFileSync, writeFileSync} from "node:fs";
import {createRequire} from "node:module";
import {tmpdir} from "node:os";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const FUNCTIONS = join(HERE, "..");
const REPO = join(FUNCTIONS, "..");
const SITE = join(REPO, "site");
const OUT_FILE = join(FUNCTIONS, "src", "shutThemes.ts");

/** 写せなかった。**本物の数字を1つも出さずに落ちる**（§15）。 */
function nothing(why) {
  console.error(`写せません: ${why}`);
  process.exit(2);
}

/* ------------------------------------------------------------ 島の表を読む
   `@/lib/…` `@/content/…` は tsc が道に直してくれないので、隣に並べてから
   組み立てる（`site/selftest/themes_selftest.mjs` と同じやり方）。
   **写しは1つも置かない**——置くと、島の表を直したのにここが古いまま通る。 */

const TSC = join(SITE, "node_modules", ".bin", "tsc");
if (!existsSync(TSC)) nothing(`${TSC} が無い（先に site で npm ci）`);

const WORK = mkdtempSync(join(tmpdir(), "shut-src-"));
const OUT = mkdtempSync(join(tmpdir(), "shut-out-"));

/**
 * 島のファイルを1つ、組み立て場へ並べる。
 * @param {string} src 元のファイル
 * @param {string} name 並べる先の名前
 */
function bring(src, name) {
  if (!existsSync(src)) nothing(`${src} が無い`);
  const code = readFileSync(src, "utf8")
    .replace(/@\/lib\//g, "./")
    .replace(/@\/content\//g, "./");
  writeFileSync(join(WORK, name), code);
}

bring(join(SITE, "lib", "builtAt.ts"), "builtAt.ts");
bring(join(SITE, "content", "chapters.ts"), "chapters.ts");
bring(join(SITE, "lib", "nightly.ts"), "nightly.ts");
bring(join(SITE, "content", "plans.ts"), "plans.ts");
bring(join(SITE, "content", "themes.ts"), "themes.ts");

execFileSync(
  TSC,
  [
    join(WORK, "themes.ts"),
    "--outDir", OUT,
    "--module", "commonjs",
    "--target", "es2022",
    "--strict",
    "--skipLibCheck",
    /* `lib/builtAt.ts` が `process.env` を読む。型は site のものを使う */
    "--typeRoots", join(SITE, "node_modules", "@types"),
    "--types", "node",
  ],
  {stdio: "inherit"},
);

const req = createRequire(import.meta.url);
const T = req(join(OUT, "themes.js"));
const {THEMES, isOpenTheme} = T;

if (!Array.isArray(THEMES) || THEMES.length === 0) nothing("`THEMES` が読めない");
if (typeof isOpenTheme !== "function") nothing("`isOpenTheme` が読めない");

/* ------------------------------------------------------- 締まる時刻を探す */

/** 探す窓の両端。島が始まるずっと前から、ずっと先まで */
const T0 = Date.UTC(2000, 0, 1);
const T1 = Date.UTC(2100, 0, 1);
/** ひっくり返る回数を数えるための刻み（1か月ごと） */
const STEP = 30 * 86400000;

const open = (t, ms) => isOpenTheme(t, new Date(ms));

/**
 * その宛先が「書ける → 書けない」に変わる時刻。
 * @param {object} t 宛先ひとつ
 * @return {number|null} epoch ms。ずっと書けるなら null
 */
function shutAt(t) {
  const first = open(t, T0);
  const last = open(t, T1);

  /* **ひっくり返る回数を先に数える。** 2回以上ひっくり返るもの
     （締まってからまた開くもの）は、1つの時刻では表せない。
     「0回だと思って写した」が起きないように、ここで落とす。 */
  let flips = 0;
  let prev = first;
  for (let ms = T0; ms <= T1; ms += STEP) {
    const now = open(t, ms);
    if (now !== prev) flips += 1;
    prev = now;
  }
  if (flips > 1) nothing(`${t.id} は ${flips} 回ひっくり返る（表せない）`);
  if (!first && last) nothing(`${t.id} は締まってから開く（表せない）`);

  if (!first && !last) return 0; // ずっと書けない（`closed: true`）
  if (first && last) return null; // ずっと書ける

  /* 境目を二分探索。`lo` は書ける時刻、`hi` は書けない時刻 */
  let lo = T0;
  let hi = T1;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (open(t, mid)) lo = mid;
    else hi = mid;
  }
  return hi;
}

/** 日本時間で読める形にする（見て分かるのは、字ではなく日付のほう） */
const jst = (ms) =>
  new Date(ms + 9 * 3600000).toISOString().replace("T", " ").slice(0, 16);

const rows = [];
for (const t of THEMES) {
  const at = shutAt(t);
  if (at === null) continue;
  rows.push({
    id: t.id,
    at,
    why: at === 0 ?
      `${t.name} — 畳んである（closed）` :
      `${t.name} — ${jst(at)} JST から`,
  });
}

/* **1件も無いまま書かない。** 島の表の読み方が外れると、
   「締め切った宛先は0件」が静かに出る（§15）。 */
if (rows.length === 0) nothing("締め切った宛先が0件（読み方が外れている）");

/* ------------------------------------------------------------ 組み立てる */

const body = rows
  .map((r) => `  /* ${r.why} */\n  "${r.id}": ${r.at},`)
  .join("\n");

const text = `/**
 * **締め切った宛先の表。手で直さない。**
 *
 * 正本は島の側（\`site/content/themes.ts\` の \`closed\` と、企画あての日付）。
 * ここはその写しで、\`functions/tools/shutthemes.mjs\` が組み立てる:
 *
 *     node functions/tools/shutthemes.mjs --write
 *
 * ずれたら \`functions/selftest/sticky_shut_selftest.mjs\` が落ちる。
 *
 * ## 読み方
 *
 * 値は「**この時刻（epoch ms）から書けない**」。\`0\` はずっと書けない。
 * **ここに名前が無い宛先は、いつでも書ける**——島の表に1行足した日に
 * Functions を配り直さなくても、その宛先に貼れるようにするため
 * （\`islandApi.ts\` の \`THEME_ID\` の注と同じ決め）。
 */

/** 宛先の id → その時刻から書けない（epoch ms。\`0\` はずっと） */
export const SHUT_THEMES: Readonly<Record<string, number>> = {
${body}
};
`;

const cur = existsSync(OUT_FILE) ? readFileSync(OUT_FILE, "utf8") : "";

if (process.argv.includes("--write")) {
  writeFileSync(OUT_FILE, text);
  console.log(`書いた: ${OUT_FILE}（${rows.length}件）`);
  process.exit(0);
}

if (process.argv.includes("--check")) {
  console.log(`# 島の表から写した締め切り: ${rows.length}件`);
  for (const r of rows) console.log(`  ${r.id} ${r.at} — ${r.why}`);
  if (cur === text) {
    console.log("  ok   src/shutThemes.ts と同じ");
    process.exit(0);
  }
  console.error(
    "\nNG   src/shutThemes.ts が島の表とずれている。" +
      "直すには: node functions/tools/shutthemes.mjs --write",
  );
  /* どこがずれたかを出す。**字そのものを出す**（締め切りの表に
     視聴者さんの書いたものは入っていない。入っているのは宛先の id だけ） */
  const a = cur.split("\n");
  const b = text.split("\n");
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) console.error(`  ${i + 1}行 いま: ${a[i]}\n       写し: ${b[i]}`);
  }
  process.exit(1);
}

console.log(text);
