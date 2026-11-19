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
const FAMILY_RE = /font-family:\s*"([^"]+)"/;

/** ふだんの束の家族。面ひとりぶんの1本は `"Maru Island <面>"`（`tools/fonts/subset.py` の `SOLO`） */
export const FAMILY = "Maru Island";

/**
 * 焼いた束を並べる。
 * @param {string} [css] 読み込み済みの中身（対照から渡す用）
 * @returns {{family:string,w:number,url:string,ranges:[number,number][],bytes:number|null}[]}
 */
export function faces(css = readFileSync(CSS, "utf8")) {
  const out = [];
  for (const m of css.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
    const body = m[1];
    const family = (body.match(FAMILY_RE) || [])[1] || FAMILY;
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
    out.push({ family, w, url, ranges, bytes });
  }
  return out;
}

/* 面ひとりぶんの1本を、その面でだけ `body` の頭に足す宣言（`subset.py` の `solo_rule()` と同じ形） */
const SOLO_RULE_RE =
  /:root:has\(link\[rel="canonical"\]\[href\$="\/([^"]+)"\]\)\s+body\s*\{\s*font-family:\s*"([^"]+)"/g;

/**
 * 面ひとりぶんの1本が、どの面で効くか。`Map<面, 家族>`。
 * 当たり判定（canonical の末尾）も返す——書き出しの面が本当にそれを持っているかは、
 * 読む側（`fontbudget_selftest.mjs`）が書き出しで当てる。
 * @param {string} [css]
 */
export function soloRules(css = readFileSync(CSS, "utf8")) {
  const out = new Map();
  for (const m of css.matchAll(SOLO_RULE_RE)) out.set(m[1], m[2]);
  return out;
}

/**
 * 「その面で、その太さのその字は、どの1本から出るか」を返す関数を作る。
 *
 * ブラウザと同じ順に引く: **その面に効く1本（`soloRules`）→ ふだんの束**。
 * 同じ家族・同じ太さの中で範囲が重なっていたら、先に書かれた1本（`fonts.css` は
 * 重ならないように焼いている）。無ければ -1（端末の書体に落ちる）。
 *
 * `fontbudget_selftest.mjs`（払う量の見積もり）と `fontwaste.mjs`（空振りの数え）が
 * 同じものを読む。**写すと、片方を直した日にもう片方が黙って古くなる。**
 *
 * @param {ReturnType<typeof faces>} all
 * @param {Map<string,string>} [rules] `soloRules()` の答え。空なら全部の面がふだんの束から引く
 */
export function picker(all, rules = new Map()) {
  /** family → w → cp → 何本目 */
  const by = new Map();
  for (const [i, f] of all.entries()) {
    if (!by.has(f.family)) by.set(f.family, new Map());
    const fam = by.get(f.family);
    if (!fam.has(f.w)) fam.set(f.w, new Map());
    const m = fam.get(f.w);
    for (const [lo, hi] of f.ranges) for (let c = lo; c <= hi; c++) if (!m.has(c)) m.set(c, i);
  }
  return (page, w, cp) => {
    const own = rules.get(page);
    for (const fam of own ? [own, FAMILY] : [FAMILY]) {
      const i = by.get(fam)?.get(w)?.get(cp);
      if (i !== undefined) return i;
    }
    return -1;
  };
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
