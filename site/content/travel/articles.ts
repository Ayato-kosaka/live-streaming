import type { GuideArticle } from "@/components/travel/article/types";
import { ARTICLE as SOFIA_PRICES } from "./bulgaria/sofia-prices";
import { ARTICLE as SKOPJE_MATKA } from "./north-macedonia/skopje-matka";
import { ARTICLE as SKOPJE_PANPAN } from "./north-macedonia/skopje-panpan";
import { ARTICLE as SKOPJE_DEBAR_MAALO } from "./north-macedonia/skopje-debar-maalo";
import { ARTICLE as SKOPJE_CLEMENT } from "./north-macedonia/skopje-clement";
import { ARTICLE as SKOPJE_KOSMOS } from "./north-macedonia/skopje-kosmos";
import { ARTICLE as SKOPJE_SQUARE } from "./north-macedonia/skopje-square";
import { ARTICLE as SKOPJE_OLDTOWN } from "./north-macedonia/skopje-oldtown";
import { ARTICLE as SKOPJE_KALE } from "./north-macedonia/skopje-kale";
import { ARTICLE as SKOPJE_VODNO } from "./north-macedonia/skopje-vodno";
import { ARTICLE as SOFIA_YOGURT } from "./bulgaria/sofia-yogurt";
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
  "north-macedonia/skopje/matka": SKOPJE_MATKA,
  "north-macedonia/skopje/panpan": SKOPJE_PANPAN,
  "north-macedonia/skopje/debar-maalo": SKOPJE_DEBAR_MAALO,
  "north-macedonia/skopje/clement": SKOPJE_CLEMENT,
  "north-macedonia/skopje/kosmos": SKOPJE_KOSMOS,
  "north-macedonia/skopje/square": SKOPJE_SQUARE,
  "north-macedonia/skopje/oldtown": SKOPJE_OLDTOWN,
  "north-macedonia/skopje/kale": SKOPJE_KALE,
  "north-macedonia/skopje/vodno": SKOPJE_VODNO,
  "bulgaria/sofia/yogurt": SOFIA_YOGURT,
  "bulgaria/sofia/prices": SOFIA_PRICES,
};

/** 記事の中身。**無ければ書き出しを止める**（名簿に在るのに中身の無い記事を黙って出さない） */
export function articleOf(country: string, city: string, slug: string): GuideArticle {
  const a = ARTICLES[`${country}/${city}/${slug}`];
  if (!a) throw new Error(`content/travel/articles.ts: ${country}/${city}/${slug} の中身が無い（python/guide_article.py で焼く）`);
  return a;
}
