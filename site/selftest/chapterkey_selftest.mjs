/**
 * **章の slug を手で名指ししている字が、統合や改名で取り残されていないか。**
 *
 *     node site/selftest/chapterkey_selftest.mjs
 *
 * 0＝通った / 1＝見つかった / 2＝数えるものが無い
 *
 * ## なぜ要るか（2026-10-13）
 *
 * 2026-10-12 の #224 で、章が `albania` → `balkans` に統合された。
 * `app/about/page.tsx` の年表が `chapterFrom("albania")` のまま残り、
 * 章が引けないので `""` を返し、`filter((x) => x.date)` が**行ごと捨てた。**
 *
 * 結果、「ここまでと、いま」を名乗る面の**いちばん新しい行が 2026-09-11
 * 「ジョージアを出て、北欧へ発った」**になった。いま読むと
 * 「これから北欧へ発つ」で終わっている面に見える。
 *
 * **型でもビルドでも巡回でも出ない。** `crawl.mjs` は「行き先が無いリンク」を
 * 見るが、**リンクごと消えた**のは見えない。行が減るだけなので、
 * 誰かが年表を読み下すまで気づけない。
 *
 * そして**同じ不具合は 9/28 に一度直してある**（その行のコメントに経緯が残っている）。
 * 14日で戻った。**1件ずつ直しても戻る**ので、戻った瞬間に赤くなる場所を作る。
 *
 * ## 見ているもの
 *
 *  1. **`chapterOf` が、章に無い slug で投げる。**
 *     ここが `undefined` を返していると、受けた側が `""` や `null` に畳んで黙る。
 *     生きている slug では投げないことも、同じだけ見る（両側から当てる）
 *  2. **字の中の `/island/<slug>` が、ぜんぶ実在する章を指している。**
 *     `href: "/island/albania"` がこれで残っていた
 *  3. **`/island/<章>` を手で組み立てていない。**
 *     **いまいる章の島はトップそのもの**（`content/chapters.ts` の `chapterHref`）。
 *     手で組み立てると、いまいる章のときだけ**どこからもリンクの来ていない写しの面**
 *     へ送ることになる。実際に `lib/stay.ts` の `travelNow()` がそうなっていて、
 *     `/now` の「◯◯の島へ」が `/island/balkans` を指していた
 *
 * **一覧はこの道具が出す。** 手で表を持たない——持った瞬間に、
 * 次に slug を書いた人が表に載らない（`docs/island-standards.md` §8）。
 *
 * ## わざと壊すと赤くなる（3とおり。足を1本ずつ抜く）
 *
 * **先に「壊していない写しが通ること」を見る**（`docs/island-standards.md` §15）。
 *
 * ```bash
 * # (0) 素のまま → 0
 * node site/selftest/chapterkey_selftest.mjs
 *
 * # (a) `chapterOf` を、昔のように undefined を返す形へ戻す → 1
 * BREAK=a node site/selftest/chapterkey_selftest.mjs
 *
 * # (b) 章に無い slug を `/island/…` で名指しする → 1
 * BREAK=b node site/selftest/chapterkey_selftest.mjs
 *
 * # (c) `/island/${…}` を手で組み立てる → 1
 * BREAK=c node site/selftest/chapterkey_selftest.mjs
 * ```
 *
 * 壊すのに本体のファイルは触らない。**差し込む字を、読んだ中身へ足す**
 * ——写しを作る途中で壊れても終了コードが同じになるのを避けるため
 * （`docs/island-misses.md` #99）。
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { readArray } from "../../tools/sprites/tsread.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = join(HERE, "..");
const BREAK = process.env.BREAK || "";

let BAD = 0;
function ok(name) {
  console.log(`  ok   ${name}`);
}
function ng(name, why) {
  BAD++;
  console.log(`  NG   ${name}${why ? ` — ${why}` : ""}`);
}
function stop(why) {
  console.log(`\n数えるものが無い: ${why}`);
  process.exit(2);
}

// ---------------------------------------------------------------- 字をあつめる

/** 見る木。**面と部品の両方**——どちらにも slug は書かれる */
const TREES = ["app", "components", "lib", "content"];
/**
 * **手で組み立ててよい所と、その理由。**
 *
 * 名指しで外すと、そこが本当に壊れた日も黙る。だから**理由ごと**並べて、
 * 道具がそれを印字する（`docs/island-standards.md` §8。`watch_excuses.py` と同じ形）。
 * 理由が12文字に満たないものは、理由とみなさない。
 *
 * **ここに足すのは、「いまいる章でも `/island/<章>` が正しい」所だけ。**
 * 読む人のリンクなら、答えは `chapterHref` のほう。
 */
const ALLOW_BUILD = new Map([
  [
    join("content", "chapters.ts"),
    "章の表そのもの。`chapterHref` の中身がここに在る（2026-10-13）",
  ],
  [
    join("components", "chain", "route.ts"),
    "`chapterHref` を再輸出しているだけ。字としては残る（2026-10-13）",
  ],
  [
    join("app", "sitemap.ts"),
    "索引は**本物の URL**を並べる面で、読む人のリンクではない。いまいる章の島も、"
      + "章が閉じた日から先はその URL で開かれる（2026-10-13）",
  ],
  [
    join("components", "chain", "AllIsleRow.tsx"),
    "章が引けなかったときの落とし先。引けたときは `chapterHref` に決めさせている"
      + "（同じ行に両方書いてある）（2026-10-13）",
  ],
  [
    join("content", "directory.ts"),
    "焼いた既定値。画面では `AllIsleRow` が `chapterHref` で引き直す"
      + "——いまいる島は日付で変わるので、焼いた答えでは決められない（2026-10-13）",
  ],
]);

function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (n === "node_modules" || n.startsWith(".")) continue;
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(n)) out.push(p);
  }
  return out;
}

let files;
try {
  files = TREES.flatMap((t) => walk(join(SITE, t)));
} catch (e) {
  stop(`字を集められなかった: ${e.message}`);
}
if (files.length < 50) stop(`見たファイルが ${files.length} 本しかない`);

/** コメントを落とす。**注の中の `/island/albania` は字ではない** */
function code(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

const read = new Map();
for (const f of files) read.set(f, code(readFileSync(f, "utf8")));

/* 壊す写しは、読んだ中身のほうへ足す（本体のファイルは触らない） */
if (BREAK === "b") {
  const k = join(SITE, "app", "about", "page.tsx");
  read.set(k, (read.get(k) ?? "") + '\nconst ghost = "/island/albania";\n');
}
if (BREAK === "c") {
  const k = join(SITE, "lib", "stay.ts");
  read.set(k, (read.get(k) ?? "") + "\nconst ghost = `/island/${c.slug}`;\n");
}

// ---------------------------------------------------------------- 章の表

const chaptersSrc = readFileSync(join(SITE, "content", "chapters.ts"), "utf8");
/* 読み方は `tools/sprites/tsread.mjs` の1本（#694）。前は**字下げが4つ**で
   あることを当てにしていたので、書き方が変わるだけで章が黙って減る。 */
const chapterRead = readArray(chaptersSrc, "CHAPTERS", { keys: ["slug"], idKey: "slug" });
if (chapterRead.missed) {
  stop(`章の表を ${chapterRead.missed} 章 読み落とした（名乗り ${chapterRead.declared}）`);
}
const SLUGS = chapterRead.rows.map((r) => r.slug);
if (SLUGS.length < 3) stop(`章の表から slug を ${SLUGS.length} 個しか読めなかった`);
const LIVE = new Set(SLUGS);

console.log(`章 ${SLUGS.length}つ: ${SLUGS.join(", ")}`);
console.log(`見たファイル ${files.length} 本\n`);

// ---------------------------------------------------------------- 1. chapterOf

console.log("1. chapterOf は、章に無い slug で投げるか");
{
  const OUT = mkdtempSync(join(tmpdir(), "chapterkey-"));
  const TSC = join(SITE, "node_modules", ".bin", "tsc");
  let src = chaptersSrc;
  if (BREAK === "a") {
    /* 昔の形（`undefined` を返して黙る）へ戻す */
    src = src.replace(
      /export function chapterOf\(slug: string\): Chapter \{[\s\S]*?\n\}/,
      "export function chapterOf(slug: string): Chapter {\n  return CHAPTERS.find((x) => x.slug === slug);\n}",
    );
    if (src === chaptersSrc) stop("BREAK=a が当たらなかった（chapterOf の形が変わっている）");
  }
  writeFileSync(join(OUT, "builtAt.ts"), readFileSync(join(SITE, "lib", "builtAt.ts"), "utf8"));
  writeFileSync(join(OUT, "chapters.ts"), src.replace('"@/lib/builtAt"', '"./builtAt"'));
  try {
    execFileSync(
      TSC,
      [
        "--target", "ES2022", "--module", "commonjs", "--moduleResolution", "node",
        "--strict", "false", "--noEmitOnError", "false", "--skipLibCheck",
        "--outDir", OUT, join(OUT, "chapters.ts"),
      ],
      { stdio: "pipe" },
    );
  } catch (e) {
    /* 型では止めない。**動く JS が出ていれば読む**（出ていなければ下で落ちる） */
  }
  let mod;
  try {
    mod = createRequire(join(OUT, "x.cjs"))(join(OUT, "chapters.js"));
  } catch (e) {
    stop(`章の表を組み立てられなかった: ${e.message}`);
  }
  if (typeof mod.chapterOf !== "function") stop("chapterOf が無い");

  /* 生きている slug では投げない（出してよいもので落ちないこと） */
  let fine = true;
  for (const s of SLUGS) {
    try {
      if (mod.chapterOf(s).slug !== s) fine = false;
    } catch {
      fine = false;
    }
  }
  fine ? ok(`生きている ${SLUGS.length} つの slug では投げない`) : ng("生きている slug で投げた");

  /* 消えた slug では投げる（守りを外したら落ちること） */
  let threw = false;
  try {
    mod.chapterOf("albania");
  } catch {
    threw = true;
  }
  threw
    ? ok('章に無い slug（"albania"）で投げる')
    : ng(
        '章に無い slug で投げない',
        "`undefined` を返すと、受けた側が `\"\"` や `null` に畳んで**黙って1行消える**（#224）",
      );
}

// ---------------------------------------------------------------- 2. /island/<slug>

console.log("\n2. 字の中の /island/<slug> が、実在する章を指しているか");
{
  const found = [];
  for (const [f, src] of read) {
    for (const m of src.matchAll(/["'`]\/island\/([a-z0-9-]+)/g)) {
      found.push({ f: relative(SITE, f), slug: m[1] });
    }
  }
  if (!found.length) stop("字の中に /island/<slug> が1つも無い（数え方が届いていない）");
  const dead = found.filter((x) => !LIVE.has(x.slug));
  console.log(`   名指し ${found.length}か所 / 生きている ${found.length - dead.length} / 消えた ${dead.length}`);
  for (const x of found) console.log(`     ${LIVE.has(x.slug) ? "・" : "×"} /island/${x.slug}  ${x.f}`);
  dead.length === 0
    ? ok("消えた章を指している字は無い")
    : ng(`消えた章を ${dead.length}か所が指している`, dead.map((x) => `${x.f} → /island/${x.slug}`).join(" / "));
}

// ---------------------------------------------------------------- 3. 手で組み立てていないか

console.log("\n3. /island/<章> を手で組み立てていないか");
{
  /* **`/island/<章>/streams` は数えない。** あちらに「いまいる章ならトップ」の
     言い換えは無い——配信の一覧はどの章でもその URL にしか無いので、
     手で組み立てるのが正しい。見るのは**島そのもの**へ向かうほうだけ。 */
  const BUILD = /`\/island\/\$\{[^}]*\}(?!\/)/;
  const ADD = /["']\/island\/["']\s*\+/;
  const built = [];
  for (const [f, src] of read) {
    const rel = relative(SITE, f);
    if (!BUILD.test(src) && !ADD.test(src)) continue;
    if (ALLOW_BUILD.has(rel)) continue;
    built.push(rel);
  }
  /* 断りのほうも印字する。**黙って外さない** */
  console.log("   手で組み立ててよいと決めた所:");
  for (const [p, why] of ALLOW_BUILD) {
    const short = why.replace(/（\d{4}-\d{2}-\d{2}）$/, "").length < 12;
    const dated = /（\d{4}-\d{2}-\d{2}）/.test(why);
    if (short || !dated) stop(`断りが足りない: ${p}（12文字以上と、いつ時点かの日付が要る）`);
    console.log(`     ・ ${p} — ${why}`);
  }
  console.log(`   残り ${built.length}か所`);
  for (const b of built) console.log(`     × ${b}`);
  built.length === 0
    ? ok("島そのものへの行き先は chapterHref が決めている")
    : ng(
        `${built.length}か所が手で組み立てている`,
        "いまいる章の島はトップそのもの（`chapterHref`）。手で組むと**どこからもリンクの来ていない写しの面**へ送る",
      );
}

// ----------------------------------------------------------------

console.log();
if (BAD) {
  console.log(`${BAD}件 見つかりました。`);
  process.exitCode = 1;
} else {
  console.log("章の slug を取り残している字は、見つかりませんでした。");
}
