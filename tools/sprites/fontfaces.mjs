/**
 * **焼いた書体の束を、1か所で読む。**
 *
 *   import { faces, STRUT_CPS, isStrut } from "./fontfaces.mjs";
 *
 * `site/app/css/fonts.css`（自動生成）の `@font-face` を並べて、
 * 太さ・URL・`unicode-range`・焼いた実ファイルの大きさを返す。
 *
 * 読み手を写すと、片方を直した日にもう片方が黙って古くなる
 * （`islepages.mjs` の26面と同じ形）。`fontwaste.mjs` と
 * `fontstrut_selftest.mjs` はここを読むだけにしてある。
 *
 * `node:fs` しか要らない。**`playwright-core` を import しないこと**が、
 * 毎 PR で走る見張りから読める条件（`tools/sprites/node_modules` は CI に入らない）。
 */
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fromRoot } from "./repo.mjs";

export const CSS = fromRoot("site/app/css/fonts.css");
export const FONTS = fromRoot("site/public/fonts");

/**
 * ブラウザが**DOM に字が無いまま**描くもの。`tools/fonts/subset.py` の `STRUT`
 * と同じ並びで、ここだけが専用の小さな束から出る。
 *   U+0020 … 字を1つも描かない段でも、行の高さを決めるのに要る代表の字
 *   U+2026 … `text-overflow: ellipsis` の「…」
 */
export const STRUT_CPS = [0x20, 0x2026];

const WEIGHT_RE = /font-weight:\s*(\d+)/;
const URL_RE = /url\("([^"]+)"\)/;
const RANGE_RE = /unicode-range:\s*([^;]+);/;

/**
 * 焼いた束を並べる。
 * @param {string} [css] 読み込み済みの中身（対照から渡す用）
 * @returns {{w:number,url:string,ranges:[number,number][],bytes:number|null}[]}
 */
export function faces(css = readFileSync(CSS, "utf8")) {
  const out = [];
  for (const m of css.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
    const body = m[1];
    const w = +(body.match(WEIGHT_RE) || [])[1];
    const url = (body.match(URL_RE) || [])[1];
    const ur = (body.match(RANGE_RE) || [])[1];
    if (!w || !url || !ur) continue;
    const ranges = ur.split(",").map((r) => {
      const [a, b] = r.trim().replace(/^U\+/i, "").split("-");
      return [parseInt(a, 16), parseInt(b ?? a, 16)];
    });
    let bytes = null;
    try { bytes = statSync(join(FONTS, url.replace("/fonts/", ""))).size; } catch { /* 焼いていない */ }
    out.push({ w, url, ranges, bytes });
  }
  return out;
}

/** その束が覆う符号位置（多すぎるときは打ち切る。`cap` 個まで数える） */
export function cover(f, cap = 4096) {
  const out = new Set();
  for (const [a, b] of f.ranges || []) for (let c = a; c <= b && out.size < cap; c++) out.add(c);
  return out;
}

/** ブラウザ自身が描く字のための束か（U+0020 と U+2026 だけ） */
export function isStrut(f) {
  const s = cover(f, 8);
  return s.size === STRUT_CPS.length && STRUT_CPS.every((c) => s.has(c));
}

/** その束が U+0020 を持っているか */
export const holdsSpace = (f) => (f.ranges || []).some(([a, b]) => a <= 0x20 && 0x20 <= b);
