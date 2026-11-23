import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { Pic } from "@/content/guidebook/types";

import type { LegendBook } from "./types";

/**
 * **企画の面の描いた絵**（`public/legends/<企画>/`。絵担当が置く）。書き出すときに1回だけ読む。
 *
 * 置き場（運営が決めた受け渡しの型）: `cover.webp`・`map.webp`・`dishes/<品の id>.webp`・`manifest.json`。
 * `manifest.json` が在れば、街のガイドの置き場と同じ形（`content/guidebook/manifest.ts` の頭）で読む:
 *
 * ```json
 * { "cover": { "src": "cover.webp", "w": 1600, "h": 900, "alt": "…" },
 *   "map": { "src": "map.webp", "w": 1200, "h": 1400, "alt": "…" },
 *   "dishes": { "vada-pav": { "src": "dishes/vada-pav.webp", "src_small": "…", "w": 800, "h": 800, "alt": "…" } } }
 * ```
 *
 * 無い欄は、決まった名前のファイル（`dishes/<id>.webp`）が在れば使う。**ファイルが無ければ使わない**（壊れた絵の枠を出さない）。
 */
export type BookDrawn = { cover?: Pic; map?: Pic; dishes: Record<string, Pic> };

type Raw = Record<string, unknown>;
const isObj = (v: unknown): v is Raw => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

export function readBookDrawn(b: LegendBook): BookDrawn {
  const base = `/legends/${b.slug}`;
  const pub = join(process.cwd(), "public");
  const file = join(pub, base, "manifest.json");
  let raw: Raw = {};
  if (existsSync(file)) {
    try {
      const j = JSON.parse(readFileSync(file, "utf8"));
      if (isObj(j)) raw = j;
    } catch (e) {
      /* **黙って絵なしに落とさない。** 置き場が壊れているのは、描く担当が直すこと */
      throw new Error(`content/legends/drawn.ts: ${base}/manifest.json が読めない（${String(e)}）`);
    }
  }
  const url = (v: unknown) => {
    const s = str(v);
    if (!s || /^https?:/.test(s)) return undefined;
    const p = s.startsWith("/") ? s : `${base}/${s}`;
    return existsSync(join(pub, p)) ? p : undefined;
  };
  const pic = (v: unknown, fallback: string, alt: string): Pic | undefined => {
    const o = isObj(v) ? v : {};
    const src = url(o.src) ?? url(fallback);
    if (!src) return undefined;
    return { src, small: url(o.src_small), w: num(o.w), h: num(o.h), alt: str(o.alt) ?? alt, kind: "illust" };
  };
  const dishes: Record<string, Pic> = {};
  const rawDishes = isObj(raw.dishes) ? raw.dishes : {};
  for (const d of b.dishes) {
    const p = pic(rawDishes[d.id], `dishes/${d.id}.webp`, d.name);
    if (p) dishes[d.id] = p;
  }
  return {
    cover: pic(raw.cover, "cover.webp", b.meta.h1),
    map: pic(raw.map, "map.webp", b.sections.regions),
    dishes,
  };
}

/**
 * **絵の無い品を、下書きのあいだだけ許す。**
 *
 * 絵の無い札は、地域の色の地に名前の頭の1字（`components/guidebook/parts.tsx` の `Picture`）で置く。
 * 街のガイドの決まりは「空のマスを置かない」（`docs/guide-design.md` 4-1）で、字1つの札は穴に近い。
 * 下書きの面は検索にも島のどこにも出ない（M-33）ので、絵担当が描き終えるまでの組み立ての間だけ置く。
 * **印を外す日に1品でも絵が無ければ、書き出しを止める**（ここ）。表紙と地図は、無ければ枠ごと出さない
 */
export function mustBeDrawn(b: LegendBook, d: BookDrawn, draft: boolean) {
  if (draft) return;
  const lost = b.dishes.filter((x) => !d.dishes[x.id]).map((x) => x.id);
  if (lost.length) {
    throw new Error(
      `content/legends/drawn.ts: ${b.slug} は下書きの印を外したのに、絵の無い品が${lost.length}品ある（${lost.slice(0, 5).join(", ")}…）。` +
        `public/legends/${b.slug}/dishes/ に描いてから外す`,
    );
  }
}
