/**
 * **人の打った「いまどこ」が古くなった日、機械が何を出すか**（#808）。
 *
 *     node site/selftest/placefb_selftest.mjs
 *
 * 終了コード: 0=通った / 1=食い違った / 2=数えるものが無い
 *
 * ## なぜ要るか
 *
 * あやと（2026-10-13）:「機械が知っていることは機械が埋める」。
 *
 * `island/state.current.place` はあやとが旅先からスマホで打つ欄で、
 * 旅のあいだは何日も打ち直せない。**古くなった日の受け皿は、
 * 長いあいだ「旅に出ているとき」しか無かった**（`tripAsPlace`）。
 * 落ち着いて国に居る日は受け皿が無く、こうなりうる——
 *
 *     いまどこ … ジョージア・トビリシ   ← 2週間前に打たれた字
 *     札       … アルバニアに来て 5日目  ← 機械が数えた、本当のこと
 *
 * **同じ面が2つのことを言う。** `stayAsPlace()` がその穴を埋める。
 *
 * ## 両側から当てる
 *
 * 「古い日に国が出る」だけでは足りない。**新しい日に人の字が勝つこと**も
 * 同じ数だけ当てる。片側だけ見ていると、「いつでも機械が勝つ」に
 * 変わった日に黙って通る（`docs/island-standards.md` §15）。
 *
 * ## 旅程も国の表も読まない
 *
 * 本物の `content/chapters.ts` / `countries.ts` を読むと、**いま旅に
 * 出ているかどうかで対照の片側が消える**（いまは `stayNow()` が返す国が
 * 1つも無いので、3 の枝に一度も入らない）。仕込みの表を渡して、
 * 4通りぜんぶを必ず通す。
 */
import { createRequire } from "module";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const ts = require("typescript");

const NOW = new Date("2026-10-13T12:00:00+09:00");

/** 仕込みの章。`running` を落とすと「もう終わった旅」になる */
const chapter = (running) => ({
  slug: "balkans", name: "バルカン諸国周遊", from: "2026-09-28", to: running ? "" : "2026-10-01",
  countries: [], note: "海ぞいの国から、山と湖の内陸へ",
});

/**
 * `lib/stay.ts` を、**仕込みの表といっしょに**読み込む。
 *
 * @param {object} o どう仕込むか
 * @param {boolean} o.outdated 人の字が古いか（`lib/place.ts` の答え）
 * @param {boolean} o.running いま章が走っているか
 * @param {object|null} o.stay いま開いている滞在（`countries.ts` の国1つぶん）
 * @return {object} `lib/stay.ts` が出すもの
 */
function load({ outdated, running, stay }) {
  const code = ts.transpileModule(readFileSync(join(here, "..", "lib", "stay.ts"), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const ch = chapter(running);
  const stubs = {
    "@/content/chapters": {
      CHAPTERS: [ch],
      chapterDayNo: () => 16,
      chapterNow: () => ch,
      chapterRunning: () => running,
      chapterSpan: () => ({ from: Date.parse("2026-09-28T00:00:00+09:00"), to: running ? null : 1 }),
      /* 島への道。**本物と同じ式**（いまの章なら表紙、ほかは `/island/<slug>`）。
         `chapters.ts` へ移したとき、差し替えを足し忘れた側がここで落ちた */
      chapterHref: (c, now) => (c.slug === now?.slug ? "/" : `/island/${c.slug}`),
    },
    "@/content/countries": { COUNTRIES: stay ? [stay] : [] },
    /* 章の国の数。**この見張りは「いまどこ」の受け皿を見るもの**で、
       国を数えるところは見ていない（数えるほうは `walkedcount.mjs` の持ち場）。
       仕込みの章は `countries: []` なので、本物を通すと 0 になって
       `tripAsPlace` が数ごと落とす枝に入り、**受け皿の確かめと関係ない分岐**を
       踏む。だから「1カ国は在る」で固定する。
       2026-10-13 に `stay.ts` がこれを読み始めて、**差し替えを足し忘れた側が
       CI で落ちた**（手元は通っていた。足し忘れても型は通る） */
    "@/content/walked": { chapterCountries: () => [{ slug: "albania" }] },
    "@/lib/place": { placeOutdated: () => outdated },
    "@/lib/nightly": { jstNow: () => ({ y: 2026, m: 10, d: 13, date: "2026-10-13" }) },
  };
  const mod = { exports: {} };
  new Function("exports", "require", "module", code)(
    mod.exports, (n) => stubs[n] ?? require(n), mod,
  );
  return mod.exports;
}

/** 仕込みの国。**終わりの日が空＝いま居る**（`stayNow` が拾う形） */
const ALBANIA = {
  slug: "albania", name: "アルバニア",
  stays: [{ from: "2026-10-08", to: "", cities: ["ティラナ"] }],
};

let bad = 0;
let seen = 0;
/**
 * 1件の確かめ。
 * @param {string} name 何を見ているか
 * @param {unknown} got 出たもの
 * @param {unknown} want ほしいもの
 */
function ck(name, got, want) {
  seen += 1;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad += 1;
  console.log(`  ${ok ? "ok  " : "NG  "} ${name}${ok ? "" : `  出た=${JSON.stringify(got)} ほしい=${JSON.stringify(want)}`}`);
}

console.log("# 1. 人の字が新しい日は、**人が勝つ**（機械は黙る）");
{
  const m = load({ outdated: false, running: true, stay: ALBANIA });
  ck("stayAsPlace は null", m.stayAsPlace("2026-10-13", NOW), null);
  ck("tripAsPlace も null", m.tripAsPlace("2026-10-13", NOW), null);
  ck("placeWord は人の字", m.placeWord("アルバニア・ティラナ", "2026-10-13", NOW), "アルバニア・ティラナ");
}

console.log("\n# 2. 古い × 旅に出ている → **章が受ける**（`stayAsPlace` は譲る）");
{
  const m = load({ outdated: true, running: true, stay: null });
  ck("tripAsPlace が章を返す", m.tripAsPlace("2026-09-28", NOW)?.name, "バルカン諸国周遊");
  ck("stayAsPlace は null（章のほうが細かい）", m.stayAsPlace("2026-09-28", NOW), null);
  ck("placeWord は「…のとちゅう」", m.placeWord("ジョージア・トビリシ", "2026-09-28", NOW), "バルカン諸国周遊のとちゅう");
}

console.log("\n# 3. 古い × 国に落ち着いている → **国が受ける**（ここが空いていた穴）");
{
  const m = load({ outdated: true, running: true, stay: ALBANIA });
  ck("travelNow は null（国が引けるので章は出ない）", m.travelNow(NOW), null);
  ck("stayAsPlace が国を返す", m.stayAsPlace("2026-09-28", NOW), { name: "アルバニア", slug: "albania" });
  ck("placeWord が国の名前", m.placeWord("ジョージア・トビリシ", "2026-09-28", NOW), "アルバニア");
}

console.log("\n# 4. 古い × 旅も国も無い → **受け皿なし。人の字のまま**");
{
  const m = load({ outdated: true, running: false, stay: null });
  ck("tripAsPlace は null", m.tripAsPlace("2026-09-28", NOW), null);
  ck("stayAsPlace も null", m.stayAsPlace("2026-09-28", NOW), null);
  ck("placeWord は人の字のまま（作り話をしない）",
    m.placeWord("ジョージア・トビリシ", "2026-09-28", NOW), "ジョージア・トビリシ");
}

if (seen < 12) {
  console.error(`数えたのが ${seen}件しかありません。対照が落ちています`);
  process.exit(2);
}
console.log(bad ? `\n落ちた: ${bad}件 / ${seen}件` : `\n${seen}件ぜんぶ通りました`);
process.exit(bad ? 1 : 0);
