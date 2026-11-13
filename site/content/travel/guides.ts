import type { CityGuide } from "./types";
import { GUIDE as SKOPJE } from "./north-macedonia/skopje";

/**
 * 街のガイドの中身（焼いたもの）の名簿。鍵は `<国>/<街>`。
 *
 * 面の道と「公開前」の印は `content/travel.ts` の `TRAVEL_CITIES` が持つ。ここは中身だけ。
 * **`content/travel.ts` からは読まない。** あちらは画面の部品からも引かれる軽い1枚で、
 * 街の中身（1街 50KB）を抱かせると、引いた所ぜんぶが重くなる。
 */
const GUIDES: Record<string, CityGuide> = {
  "north-macedonia/skopje": SKOPJE,
};

/** 街の中身。**無ければ書き出しを止める**（名簿に在るのに中身の無い面を黙って出さない） */
export function guideOf(country: string, city: string): CityGuide {
  const g = GUIDES[`${country}/${city}`];
  if (!g) throw new Error(`content/travel/guides.ts: ${country}/${city} の中身が無い（python/guide_bake.py で焼く）`);
  return g;
}
