/**
 * 島の面の一覧を、1か所に置く。**手で並べない。書き出したものを数える。**
 *
 * `popcheck` `hitspan` `lenshot` `tapcount` `wsheet` が、同じ26面を
 * **それぞれ写して**持っていた。面が1枚増えたときに直るのは開いた1本だけで、
 * 残りは「新しい面だけ数えないまま 0件」を出す（`docs/island-misses.md` #83）。
 * 新しく足す道具はここを読む。
 *
 *   import { PAGES, PUBLIC_PAGES, ME_PAGES } from "./islepages.mjs";
 *
 * ## 2026-10-07: 「26面」そのものが、縮んだ分母だった
 *
 * ここは長いこと**手で並べた26面**を持っていた。`docs/island-standards.md`
 * §15 は「押しどころと字の濃さは26面ぜんぶに当てた」をチェックに載せていて、
 * 26 が島の全部だという前提で読まれていた。**書き出すと 138面ある。**
 *
 * | | 手で並べた一覧 | 書き出したもの |
 * | --- | --- | --- |
 * | 料理 | 2（`/kitchen` と egg-sandwich） | **33** |
 * | 歩いた国 | 2（`/map` と france） | **25** |
 * | 北欧 | 4 | **26**（1日ぶんが17面） |
 * | 過去の島 | 0 | **11**（`/atlas` と `/island/*`） |
 * | 伝説 | 2 | **9** |
 *
 * つまり「26面ぜんぶ緑」は、**112面を一度も測らずに出した緑**だった。
 * `inkband.mjs` の分母が縮んでいたのと同じ形が、面の側にもあった。
 *
 * **手で並べる限り、面が増えた日に一覧は増えない。** だから書き出したもの
 * （`site/.next-*`）を歩いて数える。面を足した人は何もしなくても繋がる
 * （`docs/island-standards.md` §8「名簿・一覧を手で作らない」）。
 *
 * ## 測らない面は、**理由ごと**ここに置く
 *
 * 名指しで外すと、その面が壊れた日も黙る。だから外すものは `SKIP` に
 * **理由つきで**並べて、道具がそれを**印字する**（黙って落とさない）。
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { htmlFiles, norm } from "./crawltargets.mjs";
import { fromRoot } from "./repo.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * 書き出したものの置き場を決める。
 *
 * `DIST=` を渡さない呼び方を残してあるのは、**ポートの名前で置き場を分ける**
 * のがこのリポジトリの決まりで（`CLAUDE.md`「1人1つ、ポートと同じ名前を
 * 付ける」）、置き場の名前が人によって違うから。`site/.next-verify` が無く、
 * `site/.next-*` が**1つだけ**あるならそれを使う。**2つ以上あるときは選ばない**
 * ——他人のビルドを測って「島を測った」と言うのがいちばん悪い。
 */
function pickDist() {
  if (process.env.DIST) return fromRoot(process.env.DIST);
  const verify = fromRoot("site/.next-verify");
  if (htmlFiles(verify).length) return verify;
  const site = fromRoot("site");
  let names = [];
  try {
    names = readdirSync(site).filter((n) => n.startsWith(".next-"));
  } catch { /* site が無い写しでも落ちない */ }
  const withPages = names.map((n) => join(site, n)).filter((d) => htmlFiles(d).length);
  return withPages.length === 1 ? withPages[0] : verify;
}

/** 書き出したものの置き場。`crawl.mjs` と同じ決め方（`DIST=` で差し替え） */
export const DIST = pickDist();

/**
 * 測らない面と、その理由。**理由は12文字以上**（`prodsweep.mjs` の `ABSENCES`
 * と同じ決め）。空の理由で外せないようにしてある。
 */
export const SKIP = [
  {
    path: "/roulette",
    why:
      "島ではなく、OBS に映すルーレットをそのまま写した面（docs/island-world.md 2章）。"
      + "1920px の配信画面なので、幅 390px の指の大きさで測る面ではない。"
      + "popcheck.mjs も同じ理由で前から外している",
  },
];

const SKIPPED = new Set(SKIP.map((s) => s.path));

/**
 * 書き出したものを歩いて、島の面を並べる。**無ければ空**（投げない）。
 *
 * 空で返ったら、呼ぶ側は「0面を測って合格」ではなく **2（数えるものが無い）**
 * で落ちること（`docs/island-standards.md` §15）。
 *
 * @param {string} [dist] 書き出したものの置き場
 * @returns {string[]} `/kitchen/karaage` のような綴り、並べ替え済み
 */
export function discover(dist = DIST) {
  const all = htmlFiles(dist).map(norm);
  return [...new Set(all)].filter((p) => !SKIPPED.has(p)).sort();
}

/** 入った人の控えが要る面か（`SEED=asme.mjs` / `frozenme.mjs`） */
export const needsMe = (p) => p === "/me" || p.startsWith("/me/");

/** 島の面ぜんぶ（`SKIP` を除く） */
export const PAGES = discover();

/** だれでも開ける面 */
export const PUBLIC_PAGES = PAGES.filter((p) => !needsMe(p));

/** 入った人にしか中身の出ない面。`SEED=tools/sprites/asme.mjs` が要る */
export const ME_PAGES = PAGES.filter(needsMe);

/**
 * `sitemap.xml` が名乗っている面が、ぜんぶ一覧に入っているか。
 *
 * **足して作った一覧は、足して届かない範囲を数える**（`docs/island-standards.md`
 * §8）。ここは書き出した `.html` を歩いているので、`sitemap.xml` のほうが
 * 多いことは本来ありえない。ありえないことが起きたら歩き方が壊れている
 * （置き場違い・畳みの飛ばしすぎ）ので、**数字を出さずに落とす**ための突き合わせ。
 *
 * 逆向き（一覧にあって sitemap に無い面）は**正しい**。`/design` `/next/new`
 * `/me/*` `/404` は検索に出さないと決めた面（`site/app/sitemap.ts`）。
 * そちらは数だけ出す。
 *
 * @param {string} [dist]
 * @returns {{ok: boolean, locs: number, missing: string[], noindex: string[], why?: string}}
 */
export function checkAgainstSitemap(dist = DIST) {
  let xml;
  try {
    xml = readFileSync(join(dist, "sitemap.xml"), "utf8");
  } catch {
    return {
      ok: false, locs: 0, missing: [], noindex: [],
      why: "sitemap.xml が読めなかった（置き場が違う・ビルドしていない）",
    };
  }
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => norm(m[1].replace(/^https?:\/\/[^/]+/, "") || "/"));
  const here = new Set(PAGES);
  const missing = [...new Set(locs)].filter((l) => !here.has(l) && !SKIPPED.has(l));
  const inSitemap = new Set(locs);
  const noindex = PAGES.filter((p) => !inSitemap.has(p));
  return { ok: !missing.length, locs: locs.length, missing, noindex };
}

/**
 * `popcheck.mjs` が、自分の写しを持ち直していないか。
 *
 * 前はここが「向こうの手で並べた一覧と、こちらの手で並べた一覧を突き合わせる」
 * だった。**両方が同じだけ縮んでいたので、ずっと一致していた。**
 * いまは一覧が1か所（ここ）なので、見るのは**写しが復活していないか**だけ。
 *
 * @returns {{ok: boolean, why: string}}
 */
export function checkAgainstPopcheck() {
  const src = readFileSync(join(HERE, "popcheck.mjs"), "utf8");
  if (/const PAGES = \(\s*process\.env\.PAGES \|\|\s*\[/.test(src))
    return { ok: false, why: "popcheck.mjs が面の一覧を自分で持ち直している（islepages.mjs から読むこと）" };
  if (!/from "\.\/islepages\.mjs"/.test(src))
    return { ok: false, why: "popcheck.mjs が islepages.mjs を読んでいない" };
  return { ok: true, why: "" };
}
