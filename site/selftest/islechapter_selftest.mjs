/**
 * **章を統合しても、島が静かに壊れていないか。**
 *
 *     node site/selftest/islechapter_selftest.mjs
 *
 * 0＝通った / 1＝見つかった / 2＝数えるものが無い
 *
 * ## なぜ要るか
 *
 * 2026-10-12、あやと:「北マケドニアとアルバニアの島をわけろなんて言ってない。
 * バルカン諸国周遊に島の名前を変えて統合してください。」
 *
 * 章を1つにまとめる作業は、**4通りとも赤くならずに壊れる。**
 *
 * | 壊れかた | そのとき画面に出るもの |
 * | --- | --- |
 * | 振り分けの表に古い章の名前が残る | 島が素材だけになって、板と案内が**黙って消える** |
 * | いまの章の島が建たない | 表紙が桟橋だけの島になる |
 * | 表紙から国の案内へ行けない | 面は在るのに、島から行く道が1本も無い（#216） |
 * | 焼き込みの鍵が章とずれる | 人数・配信・住人が**0ではなく、欄ごと消える** |
 *
 * どれも型でもビルドでも巡回でも出ない。**島が薄くなるだけ**なので、
 * 誰かが見て言うまで誰も気づかない（`docs/island-misses.md` #185 #216 #223）。
 *
 * ## 見ているもの
 *
 *  1. **振り分けの表（`TRIP_SPEC`）の鍵が、章の表と過不足なく合う。**
 *     面（`app/island/[chapter]/page.tsx`）が自前の表を持っていないことも見る
 *  2. **いまの章（`chapterNow()`）の島が建つ。** 章の島も表紙の島も、
 *     桟橋だけになっていない・絵がぜんぶ実在する
 *  3. **表紙から、いまいる国の案内へ行ける。** 押しどころが在って、
 *     行き先の面が実在して、索引（`sitemap.ts`）にも載っている
 *  4. **焼き込み（`chapterStats`）の鍵と、章の slug が合っている。**
 *     合っていないときに**黙らない**——どちらへずれているかを名指しで出す
 *
 * ## わざと壊すと赤くなる（4とおり。足を1本ずつ抜く）
 *
 * ```bash
 * # (a) 振り分けの表に、章に無い名前を残す → 1 が落ちる
 * sed 's/  balkans: balkansSpec,/  albania: balkansSpec,/' site/components/isle/spec.ts > /tmp/spec-ghost.ts
 * SPEC_TS=/tmp/spec-ghost.ts node site/selftest/islechapter_selftest.mjs
 *
 * # (b) いまの章の島から、建つものを全部落とす → 2 が落ちる
 * sed 's/^  places: IslePlaceSpec\[\],$/  places: [],/' ... （下の BREAK=b でも同じことをする）
 * BREAK=b node site/selftest/islechapter_selftest.mjs
 *
 * # (c) 国の案内の行き先を、面の無いところへ向ける → 3 が落ちる
 * sed 's#href: "/north-macedonia"#href: "/albania"#' site/components/isle/spec.ts > /tmp/spec-dead.ts
 * SPEC_TS=/tmp/spec-dead.ts node site/selftest/islechapter_selftest.mjs
 *
 * # (d) 焼き込みの鍵を、章に無いものへ変える → 4 が落ちる
 * sed 's/^  "nordic": {/  "nordic-trip": {/' site/content/chapterStats.ts > /tmp/stats-ghost.ts
 * STATS_TS=/tmp/stats-ghost.ts node site/selftest/islechapter_selftest.mjs
 * ```
 *
 * **`BREAK=b` だけ、源を差し替えずにこちらで島を痩せさせる。**
 * 「建つものが無い島」は、どのファイルを1行いじっても作れない
 * （素材が無い章は桟橋1軒で建つのが正しい姿）ので、**判定の足のほう**を
 * 抜いて、受け止める側が鳴ることを見る。
 */

import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import Module from "node:module";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = join(HERE, "..");
const ISLE = join(SITE, "components", "isle");
const CONTENT = join(SITE, "content");

/** 組み立てる本体。**落ちることを確かめる写しだけ、ここを差し替える。** */
const SPEC_SRC = process.env.SPEC_TS || join(ISLE, "spec.ts");
const CHAPTERS_SRC = process.env.CHAPTERS_TS || join(CONTENT, "chapters.ts");
const STATS_SRC = process.env.STATS_TS || join(CONTENT, "chapterStats.ts");
/** 面。**字として読む**（表を自前で持っていないか） */
const PAGE_SRC = process.env.PAGE_TSX || join(SITE, "app", "island", "[chapter]", "page.tsx");
/** 判定の足を1本抜く。中身は頭のコメント */
const BREAK = process.env.BREAK || "";

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
function stop(why) {
  console.log(`\n数えるものが無い: ${why}`);
  process.exit(2);
}

// ------------------------------------------------------------------ 組み立て

const OUT = mkdtempSync(join(tmpdir(), "islechapter-out-"));
const WORK = mkdtempSync(join(tmpdir(), "islechapter-src-"));
const TSC = join(SITE, "node_modules", ".bin", "tsc");

writeFileSync(
  join(WORK, "tsconfig.json"),
  JSON.stringify({
    compilerOptions: {
      target: "ES2022",
      lib: ["ES2022", "DOM"],
      module: "commonjs",
      moduleResolution: "node",
      esModuleInterop: true,
      resolveJsonModule: true,
      skipLibCheck: true,
      /* 型の粗さはここで見るものではない（`npx tsc --noEmit` が見る）。
         欲しいのは**動く JS** だけなので、型では止めない */
      strict: false,
      noEmitOnError: false,
      outDir: OUT,
      rootDir: SITE,
      baseUrl: SITE,
      paths: { "@/*": ["./*"] },
    },
    files: [join(ISLE, "spec.ts"), join(ISLE, "cover.ts")],
  }),
);

try {
  execFileSync(TSC, ["-p", join(WORK, "tsconfig.json")], { stdio: "pipe" });
} catch {
  /* 型の文句で 1 を返すが、JS は書き出されている（`isleboard_selftest.mjs` と同じ） */
}

/**
 * 写しで回すときだけ、その1本を組み立て直して差し替える。
 * **本体はそのまま通す**——ここに偽の島を置くと、直したのに確かめが古いまま通る。
 */
function swap(src, dirAbs, rel, outRel) {
  if (src === join(dirAbs, `${rel}.ts`)) return;
  const tmp = join(WORK, `${rel}.ts`);
  copyFileSync(src, tmp);
  try {
    execFileSync(
      TSC,
      [tmp, "--outDir", WORK, "--module", "commonjs", "--target", "es2022", "--skipLibCheck"],
      { stdio: "pipe" },
    );
  } catch {
    /* `@/…` の型は引けないが、JS は出る */
  }
  copyFileSync(join(WORK, `${rel}.js`), join(OUT, outRel, `${rel}.js`));
  console.log(`# 差し替え: ${rel}.ts <- ${src}`);
}
swap(SPEC_SRC, ISLE, "spec", join("components", "isle"));
swap(CHAPTERS_SRC, CONTENT, "chapters", "content");
swap(STATS_SRC, CONTENT, "chapterStats", "content");

/* `@/…` は tsc が道に直してくれないので、require のときに差し替える */
const orig = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request.startsWith("@/")) return orig.call(this, join(OUT, request.slice(2)), ...rest);
  return orig.call(this, request, ...rest);
};

const req = createRequire(import.meta.url);
const { TRIP_SPEC, chapterIsle, guidePlace } = req(join(OUT, "components", "isle", "spec.js"));
const { coverSpec } = req(join(OUT, "components", "isle", "cover.js"));
const { CHAPTERS, chapterNow } = req(join(OUT, "content", "chapters.js"));
const { CHAPTER_STATS } = req(join(OUT, "content", "chapterStats.js"));

if (!CHAPTERS?.length) stop("章の表が読めなかった");
if (!TRIP_SPEC) stop("振り分けの表（TRIP_SPEC）が読めなかった");
if (!CHAPTER_STATS) stop("焼き込み（chapterStats）が読めなかった");

const SLUGS = CHAPTERS.map((c) => c.slug);
console.log(`# 章 ${SLUGS.length}（${SLUGS.join(" ")}）`);

// ---- 1. 振り分けの表が、章の表と合っているか ------------------------------

const tripKeys = Object.keys(TRIP_SPEC);
const ghost = tripKeys.filter((k) => !SLUGS.includes(k));
check(
  `振り分けの表の鍵が、ぜんぶ章の表にある（${tripKeys.length}件: ${tripKeys.join(" ")}）`,
  ghost.length === 0,
  `章の表に無い: ${ghost.join(" ")}（その島は素材だけで建つ。板も案内も黙って消える）`,
);

/* **表を2か所に書かない。** 面が自前の表を持っていたころ、章の名前を変えると
   面と見張りが別の島を測っていた（`docs/island-standards.md` 8章）。 */
const pageSrc = readFileSync(PAGE_SRC, "utf8");
check(
  "面が、振り分けの表を自前で持っていない",
  !/const\s+TRIP_SPEC\b/.test(pageSrc) && /chapterIsle/.test(pageSrc),
  "`app/island/[chapter]/page.tsx` に `const TRIP_SPEC` が在る（`components/isle/spec.ts` の1枚を読むこと）",
);

// ---- 2. いまの章の島が建つか -----------------------------------------------

const NOW = chapterNow(new Date());
check("いまの章が決まる", Boolean(NOW?.slug), "chapterNow() が章を返さない");
if (!NOW?.slug) stop("いまの章が決まらないので、島を組み立てられない");
console.log(`# いまの章: ${NOW.slug}「${NOW.name}」`);

/* となりの島。**本番と同じ形の行き先を渡す**——でたらめな道を渡すと、
   下の「行き先がぜんぶ面として在る」が自分の仕込みで落ちる */
const NEAR = { name: "となりの島", href: `/island/${SLUGS[0]}` };
/** 判定の足を抜く（対照 b）。**源は触らない**——受け止める側が鳴るかを見る */
const thin = (places) => (BREAK === "b" ? places.filter((p) => p.id === "pier") : places);

const isle = chapterIsle(NOW, NEAR, NEAR);
const cover = coverSpec(NOW, new Date());
const islePlaces = thin(isle.places);
const coverPlaces = thin(cover.places);
console.log(`  - /island/${NOW.slug}: ${islePlaces.map((p) => p.id).join(" ")}`);
console.log(`  - 表紙: ${coverPlaces.length}軒（${coverPlaces.map((p) => p.id).join(" ")}）`);

/* **桟橋だけの島を「建った」と数えない。** 桟橋は素材が無くても建つので、
   1軒なら「何も建っていない島」（`app/island/[chapter]/page.tsx` の注）。 */
const built = (places) => places.filter((p) => p.id !== "pier").length;
check(
  `いまの章の島に、桟橋のほかに建物がある（${built(islePlaces)}軒）`,
  built(islePlaces) >= 1,
  "桟橋だけの島になっている",
);
/* 表紙は**常設の入口ぜんぶ**が建つ島（`docs/island-atlas.md` 4章）。
   数を焼かない——`components/island/layout.ts` が増えればここも増える。 */
const HOME = req(join(OUT, "components", "island", "layout.js")).PLACES.length;
check(
  `表紙の島に、常設の入口がぜんぶ建っている（${built(coverPlaces)}軒 ≥ ${HOME}軒）`,
  built(coverPlaces) >= HOME,
  `常設 ${HOME}軒より少ない。章が変わると入口が消える作りに戻っている`,
);

const HAVE = new Set(
  readdirSync(join(SITE, "public", "sprites"))
    .filter((f) => f.endsWith(".webp"))
    .map((f) => f.slice(0, -5)),
);
const noArt = [...new Set([...islePlaces, ...coverPlaces].map((p) => p.icon).filter((n) => !HAVE.has(n)))];
check("いまの章の島の絵が、ぜんぶ実在する", noArt.length === 0, `無い: ${noArt.join(" ")}`);

/* 引きで名前が出るのは6つまで（`docs/island-design.md` 3-4／`island-atlas.md` 4章）。
   **表紙は常設の6つでちょうど埋まっている**ので、1枚足すと7枚並ぶ。 */
const signs = (places) => places.filter((p) => p.sign).map((p) => p.id);
check(
  `表紙の引きに出る札が6つまで（${signs(coverPlaces).length}枚: ${signs(coverPlaces).join(" ")}）`,
  signs(coverPlaces).length <= 6,
  "7枚目を足すと、引きの島が札で埋まる",
);

// ---- 3. 表紙から、いまいる国の案内へ行けるか -------------------------------

/**
 * 島の中の行き先が、ほんとうに面として在るか。
 *
 * **動く段（`[chapter]`）も歩く。** 静的な名前だけで数えると、
 * `/island/<章>` がぜんぶ「無い面」に化ける（`docs/island-standards.md` 8章の、
 * `prodsweep.mjs` が `[chapter]` の中身を知らなかったのと同じ形）。
 * 本番で配る `public/*.html` も行き先になる（`tools/sprites/crawltargets.mjs`）。
 */
const pageOf = (href) => {
  const p = href.split("#")[0].replace(/^\/+|\/+$/g, "");
  if (!p) return join(SITE, "app", "page.tsx");
  if (existsSync(join(SITE, "public", `${p}.html`))) return join(SITE, "public", `${p}.html`);
  let dir = join(SITE, "app");
  for (const seg of p.split("/")) {
    if (existsSync(join(dir, seg))) {
      dir = join(dir, seg);
      continue;
    }
    // 動く段。`[chapter]` のような1枚があれば、そこへ降りる
    const slot = readdirSync(dir, { withFileTypes: true }).find(
      (e) => e.isDirectory() && e.name.startsWith("["),
    );
    if (!slot) return null;
    dir = join(dir, slot.name);
  }
  return existsSync(join(dir, "page.tsx")) ? join(dir, "page.tsx") : null;
};

const guide = guidePlace(NOW.slug);
check(
  "いまの章に、国の案内（この国の歩きかた）がある",
  Boolean(guide?.href),
    `${NOW.slug} の案内が components/isle/spec.ts の GUIDES に無い`,
);
if (guide?.href) {
  const onCover = coverPlaces.filter((p) => p.href === guide.href);
  check(
    `表紙に、その案内への押しどころがある（${guide.href}）`,
    onCover.length >= 1,
    "表紙の島から、いまいる国の案内へ行く道が1本も無い（島に無い＝道が無い。#216）",
  );
  /* **同じ用事の入口を、同じ島に2つ建てない**（#223）。
     風船を戻すと、ここで捕まる */
  check(
    `表紙で、その案内への入口が1つだけ（${onCover.length}）`,
    onCover.length <= 1,
    `${onCover.map((p) => p.id).join(" ")} が同じ先を指している`,
  );
  check(
    "その行き先の面が実在する",
    Boolean(pageOf(guide.href)),
    `${guide.href} に当たる page.tsx が無い`,
  );
  /* 面を1枚増やす仕事は3か所（`app/sitemap.ts` の注）。索引から落ちると、
     検索からだけ見つからない面になる */
  const sitemap = readFileSync(join(SITE, "app", "sitemap.ts"), "utf8");
  check(
    "その行き先が、索引（sitemap.ts）にも載っている",
    sitemap.includes(`"${guide.href}"`),
    `${guide.href} が sitemap.ts に無い`,
  );
  const isleGuide = islePlaces.filter((p) => p.href === guide.href);
  check(
    `章の島にも、同じ案内が1つ建っている（${isleGuide.length}）`,
    isleGuide.length === 1,
    "章の島と表紙で、建つものが食い違っている",
  );
}

/* 島の中の行き先が、ぜんぶ面として在ること。**案内だけ見て終わらせない**
   ——統合で消えた URL（`/island/albania` など）を誰かが指したままなら、ここで出る */
const dead = [...islePlaces, ...coverPlaces]
  .flatMap((p) => [p.href, ...(p.items ?? []).map((i) => (i.ext ? null : i.href)), p.more?.href])
  .filter((h) => typeof h === "string" && h.startsWith("/"))
  .filter((h) => !pageOf(h));
check("島の中の行き先が、ぜんぶ面として在る", dead.length === 0, `無い面: ${[...new Set(dead)].join(" ")}`);

// ---- 4. 焼き込みの鍵と、章の slug ------------------------------------------

/** きょう。**始まっていない章は、焼き込みが無くて当たり前** */
const TODAY = new Date();
const started = CHAPTERS.filter((c) => c.from && Date.parse(`${c.from}T00:00:00+09:00`) <= +TODAY);
const bakedKeys = Object.keys(CHAPTER_STATS);
const orphan = bakedKeys.filter((k) => !SLUGS.includes(k));
const unbaked = started.map((c) => c.slug).filter((s) => !bakedKeys.includes(s));

console.log(`# 焼き込みの鍵 ${bakedKeys.length}（${bakedKeys.join(" ")}）／始まった章 ${started.length}`);
/* **ここの赤は、焼き直しで消える赤。** それ以外の赤と混ぜない——混ぜると、
   焼き直し待ちのあいだに本物の赤が1本紛れても見分けがつかない
   （`docs/island-misses.md` #197「毎晩赤いものは、いつもの赤に化ける」）。
   **黙らせはしない。** 消しかたを添えて、落とす。 */
const beforeBake = BAD;
check(
  "焼き込みに、章の表に無い鍵が残っていない",
  orphan.length === 0,
  `${orphan.join(" ")} — 章の名前を変えたまま焼き直していない。` +
    "rebake.yml を dry_run: false で回すと消える",
);
check(
  "始まった章が、ぜんぶ焼き込みに在る",
  unbaked.length === 0,
  `${unbaked.join(" ")} — この島は人数・配信・住人の欄ごと出ない（0ではなく、無い）。` +
    "rebake.yml を dry_run: false で回すと入る",
);

// ------------------------------------------------------------------ しめ

const bakeOnly = BAD > beforeBake && beforeBake === 0;
console.log(`\n通った ${OK} / 落ちた ${BAD}`);
if (bakeOnly)
  console.log(
    "落ちているのは焼き込みの鍵だけ。`rebake.yml` を `dry_run: false` で回せば消える" +
      "（BigQuery が要るので、手元では回らない）。",
  );
process.exit(BAD ? 1 : 0);
