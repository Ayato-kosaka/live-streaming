/**
 * **図鑑の主役に指定した絵が、`hero/` に実体を持っているか**を数える。
 *
 *     node tools/sprites/heroicon_selftest.mjs
 *
 * 終了コード 0=ぜんぶ通った / 1=実体の無いものがある / 2=数えるものが無い。
 *
 * ## なぜ要るか（2026-09-19）
 *
 * 料理を1品足すとき、スタンプの絵は `site/content/sprites.json` の `food-*`
 * から「まだ使っていないもの」を選ぶ、という数え方をしていた。
 * **あの表は素の置き場（`site/public/sprites/`）の名簿で、`hero/` の名簿ではない。**
 *
 * `/kitchen/<品>` は `HeroArt` 経由で `/sprites/hero/<名前>.webp` を読む。
 * `hero/` に焼いてあるのは**いま主役に指定されている絵だけ**なので、
 * 「まだ使っていない絵」は**必ず hero が無い**。つまり、
 * **手引きどおりに選ぶと必ず 404 になる。**
 *
 * 実際に `food-mortar-pestle` でそうなった。`sprites.json` に在り、
 * 素の置き場にも在り、**hero だけ無い**。巡回（`crawl.mjs`）で
 * `naturalWidth 0` として出たが、巡回はブラウザと書き出しが要るので
 * 毎 PR では回せない。**名前とファイルの突き合わせだけ**をここへ切り出す。
 *
 * 焼き足す手順は `manifest.mjs` の `heroNames()` が決めている——
 * `recipes.ts` / `legends.ts` / `streamTypes.ts` の `icon:` を読んで、
 * `hero/<名前>` を `HERO_PX` で焼く。だから**この3つに名前を書き足したら、
 * `bake.mjs` → `meta.py` を通すまでが1組。** ここはその通し忘れを捕まえる。
 *
 * ## 何を見るか
 *
 * 1. 主役に指定された絵ぜんぶに `hero/<名前>.webp` が在る（**本番の判定**）
 * 2. `heroWide.json` に載っている絵には `@2x` も在る
 *    （`HeroArt` が `srcSet` に書くので、無いと広い画面だけ 404）
 * 3. 対照——実体の無い名前を混ぜたら**落ちること**。落ちなければ、
 *    この見張りは何も見ていない（`docs/island-standards.md` §15）
 * 4. 対照——名前が1つも取れなければ 2。0件と「見ていない」を混ぜない
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const CONTENT = path.join(ROOT, "site/content");
const HERO_DIR = path.join(ROOT, "site/public/sprites/hero");

/** 主役に指定されている絵の名前。**`manifest.mjs` の `heroNames()` と同じ読み方。** */
export function heroNames(contentDir = CONTENT) {
  const out = new Set();
  for (const f of ["recipes.ts", "legends.ts", "streamTypes.ts"]) {
    const src = fs.readFileSync(path.join(contentDir, f), "utf8");
    for (const m of src.matchAll(/^\s*icon: "([^"]+)"/gm)) out.add(m[1]);
  }
  return [...out].sort();
}

/** 実体の無いものを並べる。`{ name, want }` の配列。 */
export function missingHeroes(names, heroDir = HERO_DIR, wide = []) {
  const miss = [];
  for (const n of names) {
    const base = path.join(heroDir, `${n}.webp`);
    if (!fs.existsSync(base)) miss.push({ name: n, want: `hero/${n}.webp` });
    if (wide.includes(n) && !fs.existsSync(path.join(heroDir, `${n}@2x.webp`))) {
      miss.push({ name: n, want: `hero/${n}@2x.webp` });
    }
  }
  return miss;
}

let OK = 0;
let BAD = 0;
let SEEN = 0;

function check(name, ok, got) {
  SEEN++;
  if (ok) {
    OK++;
    return;
  }
  BAD++;
  console.log(`  ✕ ${name}${got === undefined ? "" : `  出た: ${got}`}`);
}

const names = heroNames();
const wide = JSON.parse(fs.readFileSync(path.join(CONTENT, "heroWide.json"), "utf8"));

console.log("# 1. 主役に指定された絵が、hero に実体を持っている");
if (names.length === 0) {
  console.log("::error::主役の名前が1つも取れなかった（読み方が壊れている）。");
  process.exit(2);
}
{
  const miss = missingHeroes(names, HERO_DIR, wide);
  for (const m of miss) console.log(`  ✕ ${m.name}: ${m.want} が無い`);
  check(`${names.length}枚ぜんぶに実体が在る`, miss.length === 0, `${miss.length}枚 無い`);
}

console.log("# 2. 対照（この見張りが、ほんとうに見ているか）");
{
  // sprites.json に在って hero に無い名前を1つ借りる。
  // **借りられなければ対照が組めない**ので、そのときは 2 で落ちる
  const all = Object.keys(JSON.parse(fs.readFileSync(path.join(CONTENT, "sprites.json"), "utf8")));
  const ghost = all.find((n) => !fs.existsSync(path.join(HERO_DIR, `${n}.webp`)));
  if (!ghost) {
    console.log("::error::対照に使える「hero の無い名前」が1つも無い。");
    process.exit(2);
  }
  check(`実体の無い名前（${ghost}）を混ぜたら落ちる`, missingHeroes([ghost], HERO_DIR).length === 1);
  check("実体の在る名前は落ちない", missingHeroes([names[0]], HERO_DIR).length === 0);
  // 2倍のぶんが無い絵を「横に長い」と偽って渡すと、@2x の欠けだけで落ちること
  const narrow = names.find((n) => !wide.includes(n) && !fs.existsSync(path.join(HERO_DIR, `${n}@2x.webp`)));
  if (!narrow) {
    console.log("::error::対照に使える「@2x の無い主役」が1つも無い。");
    process.exit(2);
  }
  check(`@2x が無ければ落ちる（${narrow}）`, missingHeroes([narrow], HERO_DIR, [narrow]).length === 1);
}

console.log("");
if (SEEN === 0) {
  console.log("::error::数えるものが1つも無かった。");
  process.exit(2);
}
if (BAD) {
  console.log(`NG が ${BAD} 件（通ったのは ${OK} 件 / 見たのは ${SEEN} 件）。`);
  process.exit(1);
}
console.log(`主役 ${names.length}枚 / 2倍のぶん ${wide.length}枚 — ${SEEN} 件ぜんぶ通った。`);
