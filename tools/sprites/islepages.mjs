/**
 * 島の面の一覧を、1か所に置く。
 *
 * `popcheck` `hitspan` `lenshot` `tapcount` `wsheet` が、同じ26面を
 * **それぞれ写して**持っていた。面が1枚増えたときに直るのは開いた1本だけで、
 * 残りは「新しい面だけ数えないまま 0件」を出す（`docs/island-misses.md` #83）。
 * 新しく足す道具はここを読む。
 *
 *   import { PAGES, PUBLIC_PAGES, ME_PAGES, checkAgainstPopcheck } from "./islepages.mjs";
 *
 * **写しが増えるのを、道具の側で見張る。** 既にある5本を書き替えるのは
 * 別の担当の領分なので、ここでは `popcheck.mjs` に書いてある一覧と
 * 突き合わせて、**食い違ったら数字を出さずに落ちる**ところまでをやる
 * （`checkAgainstPopcheck()`）。片方だけ増えた日に黙って通さないため。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

/** だれでも開ける面（24枚） */
export const PUBLIC_PAGES = [
  "/", "/about", "/streams", "/streams/cooking", "/kitchen", "/kitchen/egg-sandwich",
  "/legends", "/legends/iran-walk", "/apps", "/apps/nanitabeyo", "/next", "/next/new",
  "/board", "/map", "/map/france", "/nordic", "/nordic/guide", "/nordic/finland",
  "/nordic/photos", "/cards", "/all", "/friends", "/now", "/design",
];

/** 入った人にしか中身の出ない面（2枚）。`SEED=tools/sprites/asme.mjs` が要る */
export const ME_PAGES = ["/me", "/me/roulette"];

/** 島の26面 */
export const PAGES = [...PUBLIC_PAGES, ...ME_PAGES];

/**
 * `popcheck.mjs` が持っている一覧と食い違っていないか。
 *
 * 向こうの `const PAGES = (process.env.PAGES || [ ... ].join(","))` を字で読む。
 * **どちらかに面が足された日に、黙って片方だけ数えないようにするため。**
 *
 * @returns {{ok: boolean, only_here: string[], only_there: string[], there: number}}
 */
export function checkAgainstPopcheck() {
  const src = readFileSync(join(HERE, "popcheck.mjs"), "utf8");
  const m = src.match(/const PAGES = \(\s*process\.env\.PAGES \|\|\s*\[([\s\S]*?)\]\.join\(","\)/);
  if (!m) return { ok: false, only_here: [], only_there: [], there: 0, why: "popcheck.mjs の一覧が読めなかった（書き方が変わった）" };
  const there = [...m[1].matchAll(/"(\/[^"]*)"/g)].map((x) => x[1]);
  const here = new Set(PAGES);
  const t = new Set(there);
  const only_here = PAGES.filter((x) => !t.has(x));
  const only_there = there.filter((x) => !here.has(x));
  return { ok: !only_here.length && !only_there.length, only_here, only_there, there: there.length };
}
