import type { GuideArticle } from "@/components/travel/article/types";
import { ARTICLE as SKOPJE_PRICES } from "./north-macedonia/skopje-prices";

/**
 * 記事（`/travel/<国>/<街>/<話>`）の中身（焼いたもの）の名簿。鍵は `<国>/<街>/<話>`。
 *
 * 道と公開前の印は `content/travel.ts` の `TRAVEL_ARTICLES` が持つ。ここは中身だけ
 * （`content/travel/guides.ts` が街の中身を持つのと同じ分けかた）。
 * 街の面の「もっと詳しく」の札と、索引の更新日がここを読む。
 */
const ARTICLES: Record<string, GuideArticle> = {
  "north-macedonia/skopje/prices": SKOPJE_PRICES,
};

/** 記事の中身。**無ければ書き出しを止める**（名簿に在るのに中身の無い記事を黙って出さない） */
export function articleOf(country: string, city: string, slug: string): GuideArticle {
  const a = ARTICLES[`${country}/${city}/${slug}`];
  if (!a) throw new Error(`content/travel/articles.ts: ${country}/${city}/${slug} の中身が無い（python/guide_article.py で焼く）`);
  return a;
}
