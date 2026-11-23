/**
 * **書き出した面の上で、札の組を名指しで踏む**（#1357。`site/lib/tags.ts` の札）。
 *
 *   tools/build.sh 3209
 *   DIST=site/.next-3209 node tools/sprites/tagreach.mjs
 *
 * 終了コード: 0＝ぜんぶ辿れた / 1＝辿れない組がある / 2＝数えるものが無い（面が無い・対照が外れた）。
 * **`| tail` を挟まない**——終了コードが消える。
 *
 * ## なぜ要るか
 *
 * 料理は国を持ち、企画は期間を持ち、滞在は街を持っていたのに、**書き出した面にはリンクが無い組**が
 * 7つあった（#1357 の「いま」）。札を引く関数（`lib/tags.ts`）が正しくても、面がそれを並べていなければ
 * 辿れない。だから書き出した字（`<a href>`）の上で、組ごとに1例を踏む。ブラウザは要らない。
 *
 * 鍵を1つ抜くと札が消えること（＝札が鍵で結ばれていること）は、書き出しの前に
 * `site/selftest/tags_selftest.mjs` が同じ組で見ている。こちらは**面に出ているか**の側。
 *
 * ## 対照
 *
 * 本物を踏む前に、1組目の面の字からその札を抜いた写しで判定を当てる。**抜いた写しで「辿れる」と言ったら、
 * 本物の数を出さずに 2 で落ちる**（字を見ていない）。
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DIST = process.env.DIST || "site/.next-verify";

/**
 * 組。`[名前, 面, 行き先]`。「いま」に挙げた組（料理→国・料理↔街・国↔伝説・伝説↔料理・旅↔料理・旅↔月・月↔国・国→旅）を
 * 1例ずつ。例は動かない過去の事実から選ぶ（終わった旅・終わった企画・作り終えた料理）
 */
const PAIRS = [
  ["料理 → 国", "/kitchen/gyoza", "/travel/georgia"],
  ["料理 → 街", "/kitchen/chicken-cream-stew", "/travel/north-macedonia/skopje"],
  ["街 → 料理", "/travel/north-macedonia/skopje", "/kitchen/chicken-cream-stew"],
  ["国 → 伝説", "/travel/georgia", "/legends/iwashi-festival"],
  ["伝説 → 国", "/legends/iwashi-festival", "/travel/georgia"],
  ["伝説 → 料理", "/legends/iwashi-festival", "/kitchen/iwashi-paella"],
  ["料理 → 伝説", "/kitchen/iwashi-paella", "/legends/iwashi-festival"],
  ["旅 → 料理", "/island/caucasus", "/kitchen/gyoza"],
  ["料理 → 旅", "/kitchen/gyoza", "/island/caucasus"],
  ["旅 → 月", "/island/balkans", "/months/2026-10"],
  ["月 → 旅", "/months/2026-10", "/island/balkans"],
  ["月 → 国", "/months/2026-10", "/travel/north-macedonia"],
  ["国 → 月", "/travel/north-macedonia", "/months/2026-10"],
  ["国 → 旅（北欧の外）", "/travel/georgia", "/island/caucasus"],
];

/** 面の書き出した字。無ければ `null` */
const pageOf = (path) => {
  const f = join(DIST, `${path === "/" ? "index" : path.slice(1)}.html`);
  return existsSync(f) ? readFileSync(f, "utf8") : null;
};

/** その字に、その行き先への `<a href>` が在るか（`href="/x"` のちょうど。`/x/y` を `/x` と読まない） */
const reaches = (html, to) => new RegExp(`<a\\b[^>]*\\bhref="${to.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`).test(html);

// ---- 対照
const [, from0, to0] = PAIRS[0];
const html0 = pageOf(from0);
if (!html0) {
  console.log(`✕ ${DIST}${from0}.html が無い（書き出しの置き場を DIST で渡す）`);
  process.exit(2);
}
const cut = html0.replace(new RegExp(`<a\\b[^>]*\\bhref="${to0}"[^>]*>`, "g"), "<a>");
if (!reaches(html0, to0) && !reaches(cut, to0)) {
  /* 本物で辿れないのは下で数える。ここでは判定が字を見ているかだけ */
} else if (reaches(cut, to0)) {
  console.log(`✕ 対照: ${from0} から ${to0} の札を抜いた写しで「辿れる」と言った。字を見ていない`);
  process.exit(2);
}
if (reaches('<a class="x" href="/travel/georgia/tbilisi">', "/travel/georgia")) {
  console.log("✕ 対照: 下の段（/travel/georgia/tbilisi）を /travel/georgia と読んだ");
  process.exit(2);
}

// ---- 本物
let bad = 0;
let seen = 0;
for (const [name, from, to] of PAIRS) {
  const html = pageOf(from);
  if (!html) {
    console.log(`  NG  ${name}: 面 ${from} が書き出しに無い`);
    bad++;
    continue;
  }
  seen++;
  const good = reaches(html, to);
  if (!good) bad++;
  console.log(`  ${good ? "ok" : "NG"}  ${name}: ${from} → ${to}`);
}
if (!seen) {
  console.log("✕ 面が1枚も読めない");
  process.exit(2);
}
console.log(bad ? `✕ ${PAIRS.length}組のうち ${bad}組 辿れない` : `○ ${PAIRS.length}組ぜんぶ、書き出した面で辿れる（面 ${seen}枚）`);
process.exit(bad ? 1 : 0);
