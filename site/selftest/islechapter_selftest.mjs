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
 * | 表紙の案内が、居ない国を指す | 国を越えても前の国の歩きかたが「いま」に出たまま（#664） |
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
 *     行き先の面が実在して、索引（`sitemap.ts`）にも載っている。
 *     **いま居る国に面が無い日は、案内が出ていないこと**のほうを見る
 *     （前の国の案内へ戻っていたら落ちる）
 *  3b. **案内は、その日に居る国のもの。** 国の表（`content/countries.ts`）から
 *     「その日に居る国」をここで組み直して、日を差し替えながら見くらべる。
 *     入った日に替わる／つぎの国に入る前の日まで当たる／つぎの国が無ければ
 *     開いたまま／つぎの国に面が無ければ出ない、の4本足
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
 * # (c) 国の案内の行き先を、面の無いところへ向ける → 3b の「行き先がぜんぶ在る」が落ちる
 * #     （いま居る国の行なら、3 の「その行き先の面が実在する」も一緒に落ちる）
 * sed 's#href: "/travel/north-macedonia",#href: "/albania",#' site/components/isle/spec.ts > /tmp/spec-dead.ts
 * SPEC_TS=/tmp/spec-dead.ts node site/selftest/islechapter_selftest.mjs
 *
 * # (d) トップの紙に、国の名前を書き写す → 3 の裏が落ちる
 * #     （字は、いま居る国の案内の `name`。`spec.ts` の `GUIDES` から写す）
 * sed 's|name: g.name,|name: "<いま居る国の案内の name>",|' site/app/page.tsx > /tmp/home-copied.tsx
 * HOME_TSX=/tmp/home-copied.tsx node site/selftest/islechapter_selftest.mjs
 *
 * # (f) つぎの国に入っても、前の国の案内を閉じない → 3b の「並びを逆にしても」と「面なしの国」が落ちる
 * sed 's|next ? dayBefore(next.on) : ""|""|' site/components/isle/spec.ts > /tmp/spec-open.ts
 * SPEC_TS=/tmp/spec-open.ts node site/selftest/islechapter_selftest.mjs
 *
 * # (g) 入った日を見ない（国の表に居れば、入る前から当たる）→ 3b の「入った日から」が落ちる
 * sed 's|return \[{ from: e.on,|return [{ from: "0000-01-01",|' site/components/isle/spec.ts > /tmp/spec-early.ts
 * SPEC_TS=/tmp/spec-early.ts node site/selftest/islechapter_selftest.mjs
 *
 * # (h) 日本時間ではなく UTC で日を切る → 3b の「0時ちょうど」が落ちる
 * sed 's|d.getTime() + 9 \* 3600_000|d.getTime()|' site/lib/guideDay.ts > /tmp/guideday-utc.ts
 * GUIDEDAY_TS=/tmp/guideday-utc.ts node site/selftest/islechapter_selftest.mjs
 *
 * # (i) 表紙の板だけ、日を渡さずに選ぶ → 3b の「表紙の板も」が落ちる
 * sed 's|guideOf(c.slug, today)|guideOf(c.slug)|' site/components/isle/cover.ts > /tmp/cover-now.ts
 * COVER_TS=/tmp/cover-now.ts node site/selftest/islechapter_selftest.mjs
 *
 * # (j) 国の表に「つぎの国（案内の面なし）」を今日の日付で足す → 落ちない。
 * #     3 が「案内を出さない」側へ切り替わって通ること（＝満たしようのある見張り）
 * COUNTRIES_TS=/tmp/countries-next.ts node site/selftest/islechapter_selftest.mjs
 *
 * # (k) 案内の行に、手で書いた期間を戻す → 3b の「手で書いた期間が無い」が落ちる
 * sed 's|      slug: "bulgaria",|&\n      to: "2026-11-19",|' site/components/isle/spec.ts > /tmp/spec-hand.ts
 * SPEC_TS=/tmp/spec-hand.ts node site/selftest/islechapter_selftest.mjs
 *
 * # (l) 紙の板に、選びかたの写しを持たせる → 3b の「同じ式で選んでいる」が落ちる
 * sed 's|guideOn(items, new Date())|items.find((g) => g.from <= "9999") ?? null|' \
 *   site/components/live/GuideLink.tsx > /tmp/link-own.tsx
 * LINK_TSX=/tmp/link-own.tsx node site/selftest/islechapter_selftest.mjs
 *
 * # (m) いま居る国の案内の行を、表から丸ごと抜く（面は在るまま）→ 3 の「国の案内がある」が落ちる
 * #     （`GUIDES` の `{ slug: "<いま居る国>", … },` を消した写しを SPEC_TS に渡す）
 *
 * # (n) 閉じた滞在の終わりを見ない → 3b の「歩き終わった国」が落ちる
 * sed 's|isDay(e.left) ? e.left : ""|""|' site/components/isle/spec.ts > /tmp/spec-noleft.ts
 * SPEC_TS=/tmp/spec-noleft.ts node site/selftest/islechapter_selftest.mjs
 * ```
 *
 * **(f) は1度、足が1本しか落ちなかった。** 期間を閉じなくても、表の並びが
 * 「新しい国が先」なので、上から見て最初に当たる行がたまたま正しい国になる。
 * **並びに頼って合っているだけ**なのを見分けるために、並びを逆にしても
 * 同じ答えになること（＝期間が重なっていないこと）を足した。
 *
 * **(d) は1度、空振りしていた。** `<b>{guide.name}</b>` を `app/page.tsx` から
 * 探していたが、その字は部品（`GuideLink.tsx`）のほうに在る。sed は当たらなくても
 * 黙って元の字を返すので、**壊していない写しで「落ちる」を確かめたつもり**になる。
 * 写しを作ったら、まず `diff` で1行変わっていることを見る。
 *
 * ## 日を差し替えて、表だけ見る
 *
 * ```bash
 * GUIDE_DAYS=2026-11-11,2026-11-12,2026-11-20 node site/selftest/islechapter_selftest.mjs
 * ```
 *
 * その日（JST）に、島の札の表・紙の板・表紙の板がどこを指すかを印字する。
 * `COUNTRIES_TS` と組めば、国を足した写しでも同じ表が出る。
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
import { sitemapReadsTravel, travelFixedRoutes } from "./travelreg.mjs";
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
const COUNTRIES_SRC = process.env.COUNTRIES_TS || join(CONTENT, "countries.ts");
const COVER_SRC = process.env.COVER_TS || join(ISLE, "cover.ts");
const GUIDEDAY_SRC = process.env.GUIDEDAY_TS || join(SITE, "lib", "guideDay.ts");
/** 紙の板の部品。**字として読む**（選びかたの写しを持っていないか） */
const LINK_SRC = process.env.LINK_TSX || join(SITE, "components", "live", "GuideLink.tsx");
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
swap(COUNTRIES_SRC, CONTENT, "countries", "content");
swap(COVER_SRC, ISLE, "cover", join("components", "isle"));
swap(GUIDEDAY_SRC, join(SITE, "lib"), "guideDay", "lib");

/* `@/…` は tsc が道に直してくれないので、require のときに差し替える */
const orig = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request.startsWith("@/")) return orig.call(this, join(OUT, request.slice(2)), ...rest);
  return orig.call(this, request, ...rest);
};

const req = createRequire(import.meta.url);
const { ENTERED, GUIDE_BLURB, GUIDE_LABEL, TRIP_SPEC, chapterIsle, guideOf, guidePlace, guidesOf } =
  req(join(OUT, "components", "isle", "spec.js"));
const { coverSpec } = req(join(OUT, "components", "isle", "cover.js"));
const { guideOn } = req(join(OUT, "lib", "guideDay.js"));
const { AHEAD_COUNTRIES, COUNTRIES, isWalkedCountry } = req(join(OUT, "content", "countries.js"));
const { CHAPTERS, chapterNow } = req(join(OUT, "content", "chapters.js"));
const { CHAPTER_STATS } = req(join(OUT, "content", "chapterStats.js"));

if (!CHAPTERS?.length) stop("章の表が読めなかった");
if (!TRIP_SPEC) stop("振り分けの表（TRIP_SPEC）が読めなかった");
if (!CHAPTER_STATS) stop("焼き込み（chapterStats）が読めなかった");
if (!COUNTRIES?.length || !AHEAD_COUNTRIES) stop("国の表（countries）が読めなかった");

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

/**
 * 国に入った日の並び（古い順）。**`spec.ts` の式を借りずに、国の表から組み直す。**
 *
 * 借りると、あちらの式が壊れた日に、こちらの物差しも同じだけ曲がる
 * （`docs/island-standards.md` 15章。緑が「何も見ていない」の側になる）。
 * 決まりは `spec.ts` の `ENTERED` と同じ——歩き終わった国は滞在1つが1回、
 * 歩いている最中の国は `entered`。記録のある国とは重ねない。
 */
const isDay = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d ?? "");
const doneSlugs = new Set(COUNTRIES.map((c) => c.slug));
const ENTRIES = [
  ...COUNTRIES.flatMap((c) => c.stays.map((x) => ({ slug: c.slug, on: x.from, left: x.to || "" }))),
  ...AHEAD_COUNTRIES.filter((c) => isWalkedCountry(c.slug) && !doneSlugs.has(c.slug)).map((c) => ({
    slug: c.slug,
    on: c.entered,
    left: "",
  })),
]
  .filter((e) => isDay(e.on))
  .sort((x, y) => (x.on < y.on ? -1 : x.on > y.on ? 1 : 0));
if (!ENTRIES.length) stop("国の表から、入った日が1つも読めなかった");

/** JST のその日（`YYYY-MM-DD`）。**`lib/guideDay.ts` を借りない**（上と同じ理由） */
const dayOf = (at) => new Date(at.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
/** その日の日本時間 0時ちょうど */
const jst0 = (day) => new Date(`${day}T00:00:00+09:00`);
const addDays = (day, n) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);

/**
 * その日に居る国。**いちばん新しく入った国。** 閉じた滞在のあと、つぎの国が
 * まだ表に無い日は、どの国にも居ない（`null`）。
 */
const hereOn = (day, entries = ENTRIES) => {
  const got = entries.filter((e) => e.on <= day).at(-1);
  return got && (!got.left || day <= got.left) ? got : null;
};
/**
 * 国の面。**案内の面の道は、国の slug と同じ字にする決まり。**
 * 旅のガイドの区画（`app/travel/<国>/page.tsx`。#1201）に移ったものと、
 * まだ根に立っているもの（`app/<国>/page.tsx`。ブルガリアは次の便で移る）の両方を見る。
 */
const countryPage = (slug) =>
  existsSync(join(SITE, "app", "travel", slug, "page.tsx")) || existsSync(join(SITE, "app", slug, "page.tsx"));

const TODAY = dayOf(new Date());
const here = hereOn(TODAY);
const herePage = Boolean(here && countryPage(here.slug));
console.log(
  `# いま居る国: ${here ? `${here.slug}（${here.on} から）` : "国の表に無い"}／その国の面: ${herePage ? "在る" : "無い"}`,
);

const guide = guidePlace(NOW.slug);
if (herePage) {
  check(
    "いま居る国に面が在るので、国の案内（この国の歩きかた）がある",
    Boolean(guide?.href) && guideOf(NOW.slug)?.slug === here.slug,
    guide?.href
      ? `案内が ${guideOf(NOW.slug)?.slug} を指している（居るのは ${here.slug}）`
      : `面（app/travel/${here.slug}/page.tsx か app/${here.slug}/page.tsx）は在るのに、${NOW.slug} の案内の表（components/isle/spec.ts の GUIDES）に ${here.slug} の行が無い`,
  );
} else {
  /* **案内が無いことは、赤ではない。** 面を作っていない国に居る日は、出さないのが
     本当のこと。赤いのは、そこへ**前の国の案内が残っている**とき */
  check(
    "いま居る国に面が無い日は、案内を出していない（前の国へ戻していない）",
    !guide,
    `${guide?.href} を指している（居るのは ${here?.slug ?? "国の表に無い国"}）`,
  );
  const left = coverPlaces.flatMap((p) => (p.items ?? []).filter((i) => i.label === GUIDE_LABEL));
  check(
    "表紙の板にも、案内の1行が残っていない",
    left.length === 0,
    left.map((i) => i.href).join(" "),
  );
}
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
  /* 国の面は、索引が字で書かずに名簿（`content/travel.ts`）から並べる（#1201） */
  const viaTravel = sitemapReadsTravel(sitemap) ? travelFixedRoutes(SITE) : [];
  check(
    "その行き先が、索引（sitemap.ts か、国の面の名簿）にも載っている",
    sitemap.includes(`"${guide.href}"`) || viaTravel.includes(guide.href),
    `${guide.href} が sitemap.ts にも content/travel.ts にも無い`,
  );
  /* 島に建てるだけでは足りない（送って読む人には小さな札が見つからない。#216 の裏）。
     トップの紙にも1本引いてあるが、**そこに国の名前を書き写していない**こと。
     書き写すと、国を越えた日に紙だけが前の国を指す（`docs/island-standards.md` 8章）。 */
  const homeSrc = readFileSync(HOME_SRC, "utf8");
  /* `guidesOf`（表ぜんぶ）でも通す。**滞在の期間で入れ替える面**は、
     どの国かを焼いた日で決められないので、表ぜんぶを部品へ渡して
     画面が出てから選び直している（`components/live/GuideLink.tsx`）。
     見たいのは「紙が表から引いているか」なので、どちらの口でもよい。 */
  check(
    "トップの紙の1本が、案内の表から字を引いている",
    /guidesOf\s*\(|guideOf\s*\(/.test(homeSrc),
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
  /* 対照 (d) の sed が空振りしていないこと。**写しを渡したのに字が同じなら、
     壊していない面で「落ちる」を確かめている** */
  if (process.env.HOME_TSX) {
    check(
      "（対照）渡された写しが、本物の面と1字でも違う",
      homeSrc !== readFileSync(join(SITE, "app", "page.tsx"), "utf8"),
      "HOME_TSX の写しが本物と同じ。sed が当たっていない",
    );
  }
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

// ---- 3b. 案内は、その日に居る国のもの（日を差し替える） -------------------

/**
 * ## なぜ要るか
 *
 * 案内の行は前、出す期間（`from`〜`to`）を手で持っていた。ブルガリアは
 * 「一週間ほど」の見立てで 11-19 までと書いてあって、**出る日が決まらないまま
 * 11-20 に、もう居ない北マケドニアの案内へ戻る**形だった（#664）。
 * いまは国の表の入った日から導く。**導いた結果が「その日に居る国」と合うか**を、
 * 国の表からここで組み直した物差し（`hereOn`）と見くらべる。
 *
 * **日付をここに書かない。** 書くと、国を1つ越えるたびに書き換えに来る名簿になる。
 * 当てる日は国の表から引く——国に入った日と、その前の日。
 */
const ROWS = guidesOf(NOW.slug);
/** 国 → 行き先。**行の中身は表から借りる**（見くらべるのは「どの日に、どの行か」） */
const HREF = new Map(ROWS.map((g) => [g.slug, g.href]));
const wantOn = (day, entries = ENTRIES) => {
  const h = hereOn(day, entries);
  return (h && HREF.get(h.slug)) || null;
};
const hrefOf = (g) => g?.href ?? null;
/** 表紙の板（「この島のこと」の中の1行）が指している先 */
const coverGuide = (at) =>
  coverSpec(NOW, at)
    .places.flatMap((p) => (p.items ?? []).filter((i) => i.label === GUIDE_LABEL))
    .map((i) => i.href)
    .join(" ") || null;
const say = (h) => h ?? "無し";

/* `GUIDE_DAYS=2026-11-11,2026-11-20` で、その日の表だけ印字する（合否にしない） */
for (const day of (process.env.GUIDE_DAYS || "").split(",").map((d) => d.trim()).filter(Boolean)) {
  if (!isDay(day)) stop(`GUIDE_DAYS の ${day} を日付として読めない`);
  const at = jst0(day);
  console.log(
    `# その日 ${day} → 島の札の表 ${say(hrefOf(guideOf(NOW.slug, at)))} / 紙の板 ${say(hrefOf(guideOn(ROWS, at)))} / 表紙の板 ${say(coverGuide(at))}`,
  );
}

if (!ROWS.length) {
  /* **0 を緑と読ませない**（§15）。案内の行を持つ国が1つも国の表に居ないなら、
     当てる相手が無い。そう印字して、足は数えない */
  console.log(`# 3b: ${NOW.slug} の案内の行に、国の表に居る国が1つも無い。日の差し替えは当てていない`);
} else {
  /* 境目——案内の行を持つ国に入った日と、そのつぎの国に入った日 */
  const marks = ENTRIES.flatMap((e, i) => {
    const prev = ENTRIES[i - 1];
    return HREF.has(e.slug) || (prev && HREF.has(prev.slug)) ? [{ e, prev }] : [];
  });
  const last = ENTRIES.at(-1);
  const far = addDays(last.on > TODAY ? last.on : TODAY, 400);

  /* (1) 入った日から。**0時ちょうどに替わり、その1ミリ秒前は前の国** */
  const starts = marks.filter((m) => HREF.has(m.e.slug));
  const lateStart = starts.filter(
    (m) =>
      hrefOf(guideOf(NOW.slug, jst0(m.e.on))) !== HREF.get(m.e.slug) ||
      hrefOf(guideOf(NOW.slug, new Date(jst0(m.e.on).getTime() - 1))) !== wantOn(addDays(m.e.on, -1)),
  );
  check(
    `国に入った日の日本時間0時ちょうどから、その国の案内（${starts.map((m) => `${m.e.slug} ${m.e.on}`).join("、")}）`,
    starts.length > 0 && lateStart.length === 0,
    lateStart
      .map(
        (m) =>
          `${m.e.on} 0:00 → ${say(hrefOf(guideOf(NOW.slug, jst0(m.e.on))))}、その1ms前 → ${say(hrefOf(guideOf(NOW.slug, new Date(jst0(m.e.on).getTime() - 1))))}`,
      )
      .join(" / ") || "当てる国が無い",
  );

  /* (2) つぎの国に入る前の日まで。**入った日からは、前の国の案内ではない** */
  const ends = marks.filter((m) => m.prev && HREF.has(m.prev.slug) && m.prev.slug !== m.e.slug);
  const lateEnd = ends.filter(
    (m) =>
      hrefOf(guideOf(NOW.slug, new Date(jst0(m.e.on).getTime() - 1))) !== HREF.get(m.prev.slug) ||
      hrefOf(guideOf(NOW.slug, jst0(m.e.on))) === HREF.get(m.prev.slug),
  );
  if (ends.length) {
    check(
      `つぎの国に入る前の日まで当たり、入った日からは前の国の案内を出さない（${ends.map((m) => `${m.prev.slug}→${m.e.slug} ${m.e.on}`).join("、")}）`,
      lateEnd.length === 0,
      lateEnd
        .map((m) => `${m.e.on} 0:00 → ${say(hrefOf(guideOf(NOW.slug, jst0(m.e.on))))}（${m.prev.slug} を出たあと）`)
        .join(" / "),
    );
  } else {
    console.log("# 3b: 案内の行を持つ国のあとに入った国が、まだ無い（「前の日まで」は下の写しで当てる）");
  }

  /* (3) つぎの国がまだ無ければ、開いたまま。**手で書いた終わりの日が無い** */
  check(
    `つぎの国が表に入るまで、いま居る国のまま（400日先の ${far} → ${say(wantOn(far))}）`,
    hrefOf(guideOf(NOW.slug, jst0(far))) === wantOn(far),
    `${far} → ${say(hrefOf(guideOf(NOW.slug, jst0(far))))}`,
  );

  /* (4) つぎの国（案内の面なし）を足した写し。**前の国へ戻らず、案内なし**
     ——国の表を書き換えずに、入った日の並びに1行足して渡す（`guideOf` の3つ目）。
     国の表ごと差し替えた写しは、頭の (j) と `GUIDE_DAYS` で回す */
  const nextOn = addDays(last.on > TODAY ? last.on : TODAY, 8);
  const NEXT = "tsugi-no-kuni";
  const withNext = [...ENTERED, { slug: NEXT, on: nextOn }];
  const wantNext = [...ENTRIES, { slug: NEXT, on: nextOn, left: "" }];
  const eve = new Date(jst0(nextOn).getTime() - 1);
  check(
    `つぎの国（案内の面なし）が ${nextOn} に入った写し → 前の日までは ${say(wantOn(addDays(nextOn, -1), wantNext))}、その日から案内なし`,
    hrefOf(guideOf(NOW.slug, eve, withNext)) === wantOn(addDays(nextOn, -1), wantNext) &&
      guideOf(NOW.slug, jst0(nextOn), withNext) === null &&
      guideOf(NOW.slug, jst0(addDays(nextOn, 400)), withNext) === null,
    `前の日 → ${say(hrefOf(guideOf(NOW.slug, eve, withNext)))}、その日 → ${say(hrefOf(guideOf(NOW.slug, jst0(nextOn), withNext)))}、400日先 → ${say(hrefOf(guideOf(NOW.slug, jst0(addDays(nextOn, 400)), withNext)))}`,
  );

  /* (4b) 歩き終わった国（閉じた滞在）。**出た日の翌日からは、つぎの国がまだ表に
     無くても案内なし**——出た国の歩きかたを「いま」に出さない。国を移る日は、前の国の
     終わりとつぎの国の頭が同じ日になるので、境目の日は入った国が取る。

     いまの本番には、案内の行を持つ国がまだ `COUNTRIES`（歩き終わった国）に無い。
     **本番の値では当たらない足**なので、ここだけは入った日の並びを作って渡す
     （行き先は本番の行のまま。日付は 2001年——国の表のどの日とも重ならない） */
  const walked = ROWS[0];
  const stay = { slug: walked.slug, on: "2001-01-01", left: "2001-01-04" };
  const ms = (day, n = 0) => new Date(jst0(day).getTime() + n);
  const of = (at, rows) => hrefOf(guideOf(NOW.slug, at, rows));
  const lone = [stay];
  const moved = [stay, { slug: NEXT, on: "2001-01-04" }];
  check(
    "歩き終わった国の案内は、滞在の終わりの日まで。境目の日は、入った国が取る",
    of(ms("2001-01-01"), lone) === walked.href &&
      of(ms("2001-01-05", -1), lone) === walked.href &&
      of(ms("2001-01-05"), lone) === null &&
      of(ms("2001-01-04", -1), moved) === walked.href &&
      of(ms("2001-01-04"), moved) === null,
    `つぎの国なし: 入った日 ${say(of(ms("2001-01-01"), lone))} / 終わりの日の最後 ${say(of(ms("2001-01-05", -1), lone))} / 翌日 ${say(of(ms("2001-01-05"), lone))}。` +
      `つぎの国あり: 前の日の最後 ${say(of(ms("2001-01-04", -1), moved))} / 境目の日 ${say(of(ms("2001-01-04"), moved))}`,
  );

  /* (5) 境目ぜんぶと、ずっと先。**3つの口が、同じ日に同じ国を指す**
     ——島の札の表（`guideOf`）・紙の板（`guideOn`。`GuideLink` が呼ぶ式）・表紙の板 */
  const days = [...new Set([...marks.flatMap((m) => [addDays(m.e.on, -1), m.e.on]), TODAY, far])].sort();
  const points = days.flatMap((day) => [jst0(day), new Date(jst0(addDays(day, 1)).getTime() - 1)]);
  const off = points.flatMap((at) => {
    const want = wantOn(dayOf(at));
    const got = { 札: hrefOf(guideOf(NOW.slug, at)), 紙: hrefOf(guideOn(ROWS, at)) };
    /* 表紙の板は、いまの章が始まってからの日だけ（その前は別の島が表紙） */
    if (!NOW.from || dayOf(at) >= NOW.from) got.表紙 = coverGuide(at);
    const bad = Object.entries(got).filter(([, h]) => h !== want);
    return bad.length
      ? [`${at.toISOString()} 居るのは ${hereOn(dayOf(at))?.slug ?? "-"}（${say(want)}）なのに ${bad.map(([k, h]) => `${k}=${say(h)}`).join(" ")}`]
      : [];
  });
  check(
    `日を差し替えた ${points.length}点（${days[0]}〜${days.at(-1)}）で、島の札・紙の板・表紙の板が「その日に居る国」の案内`,
    off.length === 0,
    off.slice(0, 4).join(" / "),
  );

  /* (5b) **並びに頼って合っているのではないこと。** 期間が重なっていると、
     上から見て最初に当たる行が答えになる——表の並びが「新しい国が先」のあいだは
     たまたま正しく見えて、並びを変えた日に前の国へ戻る。逆さに並べても同じ答えなら、
     どの日にも当たる行は1つしか無い */
  const flipped = [...ROWS].reverse();
  const order = points.filter((at) => hrefOf(guideOn(flipped, at)) !== hrefOf(guideOn(ROWS, at)));
  check(
    "案内の行の並びを逆にしても、同じ日に同じ案内（期間が重なっていない）",
    order.length === 0,
    order
      .slice(0, 3)
      .map((at) => `${at.toISOString()} 表の並び=${say(hrefOf(guideOn(ROWS, at)))} 逆さ=${say(hrefOf(guideOn(flipped, at)))}`)
      .join(" / "),
  );

  /* (5c) 行き先の面が、**どの行も**在る。上の 3 が見るのは、いま居る国の1行だけ。
     前の国の行も、その国へ戻った日にはそのまま出る */
  const hrefs = [...new Set(ROWS.map((g) => g.href))];
  const gone = hrefs.filter((h) => !pageOf(h));
  check(
    `案内の行き先が、ぜんぶ面として在る（${hrefs.length}つ: ${hrefs.join(" ")}）`,
    gone.length === 0,
    `無い面: ${gone.join(" ")}`,
  );

  /* (6) 紙の板が、選びかたの写しを持っていない。持つと、片方だけ直した日に
     島の札と紙の板が別の国を指す（前は同じ式が2か所に書いてあった） */
  const linkSrc = readFileSync(LINK_SRC, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  check(
    "紙の板（GuideLink）が、島の札と同じ式（lib/guideDay.ts の guideOn）で選んでいる",
    /guideOn\s*\(/.test(linkSrc) && !/\.find\s*\(/.test(linkSrc),
    "GuideLink.tsx が guideOn を呼んでいないか、自前の .find( を持っている",
  );

  /* (7) 案内の行に、手で書いた期間が戻っていない */
  const specCode = readFileSync(SPEC_SRC, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  const table = /const GUIDES\b[\s\S]*?\n};/.exec(specCode)?.[0] ?? "";
  if (!table) stop("components/isle/spec.ts から案内の表（GUIDES）を読めなかった");
  const hand = [...table.replace(/"(?:[^"\\]|\\.)*"/g, '""').matchAll(/\b(from|to)\s*:/g)].map((m) => m[1]);
  check(
    "案内の行に、手で書いた期間（from / to）が無い",
    hand.length === 0,
    `${hand.join(" ")} が書いてある。いつ出すかは国の表（content/countries.ts）の入った日から導く`,
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
