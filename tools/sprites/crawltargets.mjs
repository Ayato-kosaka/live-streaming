/**
 * **島のリンクの「行き先が在るか」を決める1か所。**
 *
 * `crawl.mjs` は書き出したもの（`site/.next-*`）を配って歩くので、
 * **`public/` に在る面を知らない。** だが本番（Firebase Hosting）が配る
 * `dist/` は、`public/*` を写したうえに `site/out/.` を重ねたもの
 * （`package.json` の `copy-public` と `build:island`）。
 * **行き先は2つの山の合わせ**なのに、片方しか見ていなかった。
 *
 * そのせいで `/nordic` → `/nordic/review` が**毎回リンク切れとして挙がって
 * いた。** 本番は 200（実測。`public/nordic/review.html`。わざと `<Link>` では
 * なく `<a>` にしてある理由は `site/app/nordic/page.tsx` に書いてある）。
 *
 * **毎回1件の嘘が出ていると、本物の赤がそこに埋もれる**（2026-10-07 に
 * 担当5人が全員「既存の偽陽性です」と報告してきた）。
 *
 * ## 「見ない」で黙らせない
 *
 * `/nordic/review` を名指しで除けば嘘は消えるが、**ファイルが本当に消えた
 * ときも黙る。** それは見張りを下ろしたのと同じ（`docs/island-standards.md`
 * §13「満たしようのない見張りは、いつも通る見張りと同じだけ悪い」の裏側）。
 *
 * だから**在るかどうかを見る。** `public/` を実際に歩いて、見つかった
 * `.html` だけを行き先に足す。消えたら足されないので、**赤くなる。**
 *
 * ## ブラウザを使わない
 *
 * `crawl.mjs` 本体はブラウザが要るので毎 PR では回せない
 * （`tools/sprites/node_modules` は CI に入らない）。ここは
 * `fs` しか使わないので、`crawl_selftest.mjs` から毎 PR で回せる。
 * **腐るのは判定の側**なので、判定だけを切り出してある。
 */
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/** 書き出したものの中で、面ではない段。`crawl.mjs` の `walk` と同じ */
const SKIP_DIRS = ["_next", "cache", "server", "static", "node_modules"];

/**
 * リンクと面を同じ綴りに揃える。`/about.html` も `/about/` も `/about`
 *
 * @param {string} s
 * @returns {string}
 */
export const norm = (s) => {
  let x = String(s).split("#")[0].split("?")[0];
  x = x.replace(/\.html$/, "").replace(/\/index$/, "").replace(/\/$/, "");
  return x || "/";
};

/**
 * 置き場を歩いて、`.html` の面を並べる。**無い置き場は空**（投げない）。
 *
 * 投げないのは、`public/` を持たない写し（`tools/` だけ持ち出した置き場）でも
 * 道具が動くようにするため。**空で返ると行き先が足されない＝赤くなる**ので、
 * 黙って通ることにはならない。
 *
 * @param {string} dir 歩く置き場
 * @param {string} [base] 面の綴りの頭（再帰用）
 * @returns {string[]} `/nordic/review.html` のような並び
 */
export function htmlFiles(dir, base = "") {
  let out = [];
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return out;
  }
  for (const f of names) {
    if (SKIP_DIRS.includes(f)) continue;
    const p = join(dir, f);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) out = out.concat(htmlFiles(p, `${base}/${f}`));
    else if (f.endsWith(".html")) out.push(`${base}/${f}`);
  }
  return out;
}

/**
 * `public/` が本番で配っている行き先。**在るものだけ。**
 *
 * @param {string} dir リポジトリの `public/`
 * @returns {string[]} 揃えた綴り（`/nordic/review` など）
 */
export function publicTargets(dir) {
  return [...new Set(htmlFiles(dir).map(norm))].sort();
}

/**
 * 島に在る行き先ぜんぶ。**書き出したもの＋`public/`。**
 *
 * @param {string[]} pages 書き出した面（`crawl.mjs` の `walk(DIST)`）
 * @param {string[]} extra `public/` の側（`publicTargets()`）
 * @returns {Set<string>}
 */
export function targetSet(pages, extra = []) {
  return new Set([...pages.map(norm), ...extra.map(norm)]);
}

/**
 * 行き先の無いリンクを並べる。**面1枚ぶん。**
 *
 * @param {string[]} links その面に在る `/…` のリンク
 * @param {Set<string>} targets `targetSet()` の答え
 * @returns {string[]} 揃えた綴りの、重複を除いたもの
 */
export function brokenLinks(links, targets) {
  return [...new Set(links.map(norm))].filter((l) => !targets.has(l));
}
