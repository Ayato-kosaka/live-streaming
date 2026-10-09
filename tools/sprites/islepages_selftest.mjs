/**
 * **面の一覧が、また手書きに戻っていないか**を毎 PR で確かめる。
 *
 *     node tools/sprites/islepages_selftest.mjs
 *
 * 終了コード 0=ぜんぶ通った / 1=落ちた / 2=数えるものが無い。
 *
 * ## なぜ要るのか
 *
 * `tools/sprites/islepages.mjs` は 2026-09-17 に「26面の一覧を1か所に置いた」
 * ものとして作られた。**その1か所が手書きだった。** 書き出すと島は 138面
 * あるので、**112面が「数えないまま 48px 割れ 0」に数えられていた**
 * （`docs/island-misses.md` #216）。
 *
 * 付いていた見張り（`checkAgainstPopcheck()`）は毎回「○ 一致」と言っていた。
 * **向こうも手で並べた26面**だったので、同じだけ縮んだ2つを突き合わせて
 * ずっと一致していた——`docs/island-standards.md` §15 の「いつも通る見張り」。
 *
 * だから見るのは次の4つ。
 *
 *   1. 一覧を**書き出したものから**出している（手で並べた表が復活していない）
 *   2. 拾えなかったときに**空**を返す（0面を「ぜんぶ測った」にしない）
 *   3. 測らない面には**理由が書いてある**（名指しで黙らせていない）
 *   4. `sitemap.xml` のほうが多かったら**落ちる**（歩き方が壊れた印）
 *
 * ブラウザを1行も使わないので、`python/selftest_runner.py` から毎 PR で回せる
 * （`tools/sprites/node_modules` は CI に入らない）。
 *
 * ## 壊した写しで落ちること
 *
 *     BREAK=handlist node tools/sprites/islepages_selftest.mjs   # 1 で落ちる
 *
 *   handlist  手で並べた26面に戻した一覧を渡す（直す前の姿）
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { discover, needsMe, SKIP, checkAgainstPopcheck } from "./islepages.mjs";
import { norm } from "./crawltargets.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const BREAK = process.env.BREAK || "";

/** 直す前の姿。**書き出しを見ずに26面を返す**（面を足しても増えない） */
const HAND26 = [
  "/", "/about", "/streams", "/streams/cooking", "/kitchen", "/kitchen/egg-sandwich",
  "/legends", "/legends/iran-walk", "/apps", "/apps/nanitabeyo", "/next", "/next/new",
  "/board", "/map", "/map/france", "/nordic", "/nordic/guide", "/nordic/finland",
  "/nordic/photos", "/cards", "/all", "/friends", "/now", "/design", "/me", "/me/roulette",
];
const find = BREAK === "handlist" ? () => [...HAND26] : discover;

let SEEN = 0, BAD = 0;
const fails = [];
function check(name, cond, note = "") {
  SEEN++;
  if (!cond) { BAD++; fails.push(name); }
  console.log(`  ${cond ? "○" : "✕"} ${name}${note ? `  ${note}` : ""}`);
}

/* ── 台。本物の `site/.next-*` ではなく、ここで作った木に当てる ─────── */
const dir = mkdtempSync(join(tmpdir(), "islepages-"));
const page = "<html><body><main><h1>台</h1></main></body></html>";
const put = (p) => {
  mkdirSync(dirname(join(dir, p)), { recursive: true });
  writeFileSync(join(dir, p), page);
};
for (const p of [
  "index.html", "about.html", "kitchen.html", "kitchen/karaage.html",
  "kitchen/egg-sandwich.html", "island/nordic/streams.html",
  "me.html", "me/desk.html", "roulette.html",
  // 面ではない段。**ここを拾うと分母が水ぶくれする**
  "_next/static/chunk.html", "cache/x.html",
]) put(p);

console.log("[1] 書き出したものを歩いて出している（手で並べた表ではない）");
{
  const got = find(dir);
  check("台に置いた面がぜんぶ出る（料理の新顔 `/kitchen/karaage` を含む）",
    got.includes("/kitchen/karaage") && got.includes("/island/nordic/streams"),
    `${got.length}面`);
  check("`index.html` は `/` になる", got.includes("/"));
  check("`_next` と `cache` の中は面に数えない",
    !got.some((p) => p.startsWith("/_next") || p.startsWith("/cache")));
  check("**台に無い面を勝手に足さない**（本物のリポジトリを読んでいない）",
    !got.includes("/nordic/guide") && !got.includes("/board"));
}

console.log("\n[2] 拾えなかったら空（0面を「ぜんぶ測った」にしない）");
{
  const none = discover(join(dir, "ありません"));
  check("無い置き場は空で返る（投げない）", Array.isArray(none) && none.length === 0);
  const src = readFileSync(join(HERE, "tapink.mjs"), "utf8");
  check("`tapink.mjs` は面が0枚なら 2 で落ちる",
    /if \(!PAGES\.length\)\s*\n?\s*bail\(/.test(src) || /!PAGES\.length[\s\S]{0,120}bail\(/.test(src));
}

console.log("\n[3] 入った人の面と、だれでも開ける面を分けている");
{
  check("`/me` と `/me/desk` は入った人の面", needsMe("/me") && needsMe("/me/desk"));
  check("`/meeting` を `/me` の仲間にしない（頭の字だけで見ていない）", !needsMe("/meeting"));
  check("`/about` はだれでも開ける面", !needsMe("/about"));
}

console.log("\n[4] 測らない面には理由が書いてある（名指しで黙らせない）");
{
  check("`SKIP` が理由を持っている", SKIP.length > 0 && SKIP.every((s) => s.path && s.why));
  check("理由は12文字以上（空の理由で外せない）", SKIP.every((s) => s.why.length >= 12));
  const got = find(dir);
  check("`SKIP` に書いた面は一覧に出ない", !got.includes("/roulette"));
  check("台には `/roulette` を置いてある（外れていることが見える台）", true, "roulette.html");
}

console.log("\n[5] sitemap.xml との突き合わせ（出どころの別なものと比べる）");
{
  /* **こちらが縮んだときに落ちること**を見る。`checkAgainstSitemap()` は
     読み込み時に決まる `PAGES` を見るので、ここでは同じ算数を台に当てる
     （道具の中身を写さないために、判定の形だけを突き合わせる）。 */
  const src = readFileSync(join(HERE, "islepages.mjs"), "utf8");
  check("`sitemap.xml` を読んでいる", /sitemap\.xml/.test(src));
  check("sitemap にあって一覧に無い面を `missing` に積む", /missing = \[\.\.\.new Set\(locs\)\]/.test(src));
  check("検索に出さない面は別枠（`noindex`）で数だけ出す", /noindex/.test(src));
  check("`tapink.mjs` は `missing` があれば 2 で落ちる",
    /sitemap\.xml` が名乗っている面を、一覧が持っていない/.test(readFileSync(join(HERE, "tapink.mjs"), "utf8")));
  // 綴りを揃える側（`/about.html` も `/about/` も `/about`）
  check("綴りを揃えるのは `crawltargets.mjs` の `norm`（写しを作らない）",
    norm("/about.html") === "/about" && norm("/map/") === "/map" && /from "\.\/crawltargets\.mjs"/.test(src));
}

console.log("\n[6] 写しが復活していないか");
{
  const v = checkAgainstPopcheck();
  check("`popcheck.mjs` は自分の一覧を持っていない", v.ok, v.why);
  const src = readFileSync(join(HERE, "islepages.mjs"), "utf8");
  check("この一覧そのものが、手で並べた面の表を持っていない",
    !/"\/kitchen\/egg-sandwich"/.test(src) || !/"\/nordic\/photos"/.test(src));
}

rmSync(dir, { recursive: true, force: true });

console.log();
if (SEEN === 0) { console.log("✕ 1件も見ていません（数えるものが無い）"); process.exit(2); }
if (BAD) {
  console.log(`✕ ${SEEN}件中 ${BAD}件 落ちました${BREAK ? `（BREAK=${BREAK}）` : ""}: ${fails.join(" / ")}`);
  process.exit(1);
}
console.log(`○ ${SEEN}件ぜんぶ通りました（書き出しから出す・空で返る・理由つきの除外・sitemap との突き合わせ・写しの復活）`);
process.exit(0);
