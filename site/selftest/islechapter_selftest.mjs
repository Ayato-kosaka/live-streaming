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
 * | 焼き込みの鍵が章とずれる | 人数・配信・住人が**0ではなく、欄ごと消える**（→ 夜の側） |
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
 *
 * **焼き込み（`chapterStats`）の鍵が章の slug と合っているかは、ここでは見ない。**
 * 焼くのは master に対してなので、**マージの前に鍵は絶対に合わない**——
 * 毎 PR 走るここに置くと、章の名前を変える PR を毎回止める（§13）。
 * 夜の側（`python/stale_content_watch.py` の `SAME`）に在る。下の「4」も読む。
 *
 * ## わざと壊すと赤くなる（4とおり。足を1本ずつ抜く）
 *
 * **先に「壊していない写しが通ること」を見る**（`docs/island-standards.md` 15章）。
 * 素のままで 0 になることを確かめてから、1本ずつ壊す。
 *
 * ```bash
 * # (0) 素のまま → 落ちない
 * node site/selftest/islechapter_selftest.mjs
 *
 * # (a) 振り分けの表に、章に無い名前を残す → 1 が落ちる
 * sed 's/^  balkans: balkansSpec,$/  albania: balkansSpec,/' site/components/isle/spec.ts > /tmp/spec-ghost.ts
 * SPEC_TS=/tmp/spec-ghost.ts node site/selftest/islechapter_selftest.mjs
 *
 * # (b) いまの章の島から、建つものを全部落とす → 2 が落ちる
 * BREAK=b node site/selftest/islechapter_selftest.mjs
 *
 * # (c) 国の案内の行き先を、面の無いところへ向ける → 3 が落ちる
 * sed 's#href: "/north-macedonia",#href: "/albania",#' site/components/isle/spec.ts > /tmp/spec-dead.ts
 * SPEC_TS=/tmp/spec-dead.ts node site/selftest/islechapter_selftest.mjs
 *
 * # (d) トップの紙に、国の名前を書き写す → 3 の裏が落ちる
 * sed 's|<b>{guide.name}</b>|<b>北マケドニア</b>|' site/app/page.tsx > /tmp/home-copied.tsx
 * HOME_TSX=/tmp/home-copied.tsx node site/selftest/islechapter_selftest.mjs
 * ```
 *
 * **焼き込みの鍵を壊す対照は、夜の側に在る**（`python/stale_content_watch_selftest.py`。
 * `--dir` に「章の名前を替えた写し」を渡して 1 が返ることまで当てている）。
 *
 * **`BREAK=b` だけ、源を差し替えずにこちらで島を痩せさせる。**
 * 「建つものが無い島」は、どのファイルを1行いじっても作れない
 * （素材が無い章は桟橋1軒で建つのが正しい姿）ので、**判定の足のほう**を
 * 抜いて、受け止める側が鳴ることを見る。
 *
 * **(e) は1度素通りした。** 書き写しを札（`guidePlace`）と見くらべていて、
 * 札は国の名前を持っていないので、何を書き写しても一致しなかった。
 * いまは表の行（`guideOf`）と見くらべる。**対照を当てるまで気づけない形**だった。
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
/** トップの紙。同じく字として読む（国の名前を書き写していないか） */
const HOME_SRC = process.env.HOME_TSX || join(SITE, "app", "page.tsx");
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
const { GUIDE_BLURB, GUIDE_LABEL, TRIP_SPEC, chapterIsle, guideOf, guidePlace } =
  req(join(OUT, "components", "isle", "spec.js"));
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
  /* **建物そのものでも、建物の板の中の1行でもよい。**
     表紙の島は13軒ぶんに詰めてあるので、14軒目を建てると寄りで入口が
     3つ届かなくなる（`components/isle/cover.ts` の `COVER_R`）。
     いま表紙では「この島のこと」の板の中に入っている。
     **見たいのは「島から行けるか」**で、建物かどうかではない。 */
  const goesTo = (p) =>
    p.href === guide.href ||
    (p.items ?? []).some((i) => i.href === guide.href) ||
    p.more?.href === guide.href;
  const onCover = coverPlaces.filter(goesTo);
  check(
    `表紙の島から、その案内へ行ける（${guide.href}）`,
    onCover.length >= 1,
    "表紙の島から、いまいる国の案内へ行く道が1本も無い（島に無い＝道が無い。#216）",
  );
  /* **同じ用事の入口を、同じ島に2つ置かない**（#223）。
     風船を戻すと、ここで捕まる */
  check(
    `表紙で、その案内への入口が1つだけ（${onCover.length}）`,
    onCover.length <= 1,
    `${onCover.map((p) => p.id).join(" ")} が同じ先を指している`,
  );
  /* 字は1か所から（`spec.ts` の `GUIDE_LABEL`）。板の中と建物で別の字になると、
     同じ行き先が別の部屋に見える */
  const rows = coverPlaces.flatMap((p) => (p.items ?? []).filter((i) => i.href === guide.href));
  check(
    "板の中の1行も、島の札と同じ字",
    rows.every((r) => r.label === GUIDE_LABEL && r.sub === GUIDE_BLURB),
    rows.map((r) => `「${r.label}」/${r.sub}`).join(" "),
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
  /* 島に建てるだけでは足りない（送って読む人には小さな札が見つからない。#216 の裏）。
     トップの紙にも1本引いてあるが、**そこに国の名前を書き写していない**こと。
     書き写すと、国を越えた日に紙だけが前の国を指す（`docs/island-standards.md` 8章）。 */
  const homeSrc = readFileSync(HOME_SRC, "utf8");
  check(
    "トップの紙の1本が、案内の表から字を引いている",
    /guideOf\s*\(/.test(homeSrc),
    "app/page.tsx が components/isle/spec.ts の GUIDES を読んでいない",
  );
  /* **注を落としてから見る。** あやとの言葉も、行き先の面の道も、注には出てくる。
     見たいのは「画面に出る字」のほうだけ（`python/ts_read.py` の `code_only` と同じ）。 */
  const code = homeSrc.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  /* **札（`guidePlace`）ではなく、表の行（`guideOf`）と見くらべる。** 札は
     「この国の歩きかた」しか持っていないので、札と見くらべると**国の名前を
     書き写しても気づけない**（この対照を当てて、実際に素通りした）。 */
  const row = guideOf(NOW.slug) ?? {};
  const copied = [row.name, row.lead, guide.href].filter((w) => w && code.includes(w));
  check(
    "トップの紙に、国の名前や行き先が書き写されていない",
    copied.length === 0,
    `書き写し: ${copied.join(" / ")}`,
  );
  /* **章の島のほうは、建物で建てる。** あちらは建つものが少ないので詰まらない */
  const isleGuide = islePlaces.filter((p) => p.href === guide.href);
  check(
    `章の島に、同じ案内が1軒建っている（${isleGuide.length}）`,
    isleGuide.length === 1,
    "章の島と表紙で、行ける先が食い違っている",
  );
}

/* 島の中の行き先が、ぜんぶ面として在ること。**案内だけ見て終わらせない**
   ——統合で消えた URL（`/island/albania` など）を誰かが指したままなら、ここで出る */
const dead = [...islePlaces, ...coverPlaces]
  .flatMap((p) => [p.href, ...(p.items ?? []).map((i) => (i.ext ? null : i.href)), p.more?.href])
  .filter((h) => typeof h === "string" && h.startsWith("/"))
  .filter((h) => !pageOf(h));
check("島の中の行き先が、ぜんぶ面として在る", dead.length === 0, `無い面: ${[...new Set(dead)].join(" ")}`);

// ---- 4. 焼き込みの鍵は、**ここでは見ない** --------------------------------

/* **夜の側へ移した**（`python/stale_content_watch.py` の `SAME`。2026-10-12）。
   一度ここに「`chapterStats` の鍵と `CHAPTERS` の slug が合っているか」を
   2判定置いたが、**置き場所が違った。**

   焼き込みは `rebake.yml` が master に対して焼くので、順番は必ず
   「PR をマージ → 焼き直す → 配る」。**マージの前に鍵は絶対に合わない。**
   ここは毎 PR 走る（`.github/workflows/selftest.yml`）ので、
   **章の名前を変える PR を、自分が守ろうとしているその変更ごと毎回止める。**
   満たしようのない見張りは、いつも通る見張りと同じだけ悪い
   （`docs/island-standards.md` §13）。

   **落としたのではなく、移した。** いまは `rebake.yml` の
   「焼き込みが古くなっていないか」（焼いたあと・deploy の後ろ）から走る
   `python/stale_content_watch.py` が、`chapterStats.ts` を `SAME` で見ている——
   上流 `chapters.ts` の slug と鍵が**過不足なく同じか**を、両向きで。
   両側からの対照は `python/stale_content_watch_selftest.py`
   （そろえた写し／欠け／余り／上流0件／下流0件／`--dir` で章の名前を替えた写し）。

   **ここに足し直さない。** 足すと、また章の名前を変えられなくなる。 */

// ------------------------------------------------------------------ しめ

console.log(`\n通った ${OK} / 落ちた ${BAD}`);
process.exit(BAD ? 1 : 0);
