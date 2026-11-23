import type { GuideArticle } from "@/components/travel/article/types";
import { ARTICLE as SOFIA_PRICES } from "./bulgaria/sofia-prices";
import { ARTICLE as SKOPJE_MATKA } from "./north-macedonia/skopje-matka";
import { ARTICLE as SOFIA_BANITSA } from "./bulgaria/sofia-banitsa";
import { ARTICLE as SOFIA_XMAS } from "./bulgaria/sofia-xmas";
import { ARTICLE as SOFIA_HOTSPRING } from "./bulgaria/sofia-hotspring";
import { ARTICLE as SOFIA_NEVSKY } from "./bulgaria/sofia-nevsky";
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
import { ARTICLE as TIRANA_WALK } from "./albania/tirana-walk";
import { ARTICLE as TIRANA_SUFLLAQE } from "./albania/tirana-sufllaqe";
import { ARTICLE as TIRANA_MOSQUE } from "./albania/tirana-mosque";
import { ARTICLE as TIRANA_GJELLTORE } from "./albania/tirana-gjelltore";
import { ARTICLE as TIRANA_AIRPORT } from "./albania/tirana-airport";
import { ARTICLE as TIRANA_HOSTEL } from "./albania/tirana-hostel";
import { ARTICLE as ISTANBUL_BLUE } from "./turkey/istanbul-blue";
import { ARTICLE as ISTANBUL_GALATA } from "./turkey/istanbul-galata";
import { ARTICLE as ISTANBUL_FERRY } from "./turkey/istanbul-ferry";
import { ARTICLE as ISTANBUL_TOUTS } from "./turkey/istanbul-touts";
import { ARTICLE as ISTANBUL_ARRIVAL } from "./turkey/istanbul-arrival";

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
  "bulgaria/sofia/banitsa": SOFIA_BANITSA,
  "bulgaria/sofia/xmas": SOFIA_XMAS,
  "bulgaria/sofia/hotspring": SOFIA_HOTSPRING,
  "bulgaria/sofia/nevsky": SOFIA_NEVSKY,
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
  "albania/tirana/walk": TIRANA_WALK,
  "albania/tirana/sufllaqe": TIRANA_SUFLLAQE,
  "albania/tirana/mosque": TIRANA_MOSQUE,
  "albania/tirana/gjelltore": TIRANA_GJELLTORE,
  "albania/tirana/airport": TIRANA_AIRPORT,
  "albania/tirana/hostel": TIRANA_HOSTEL,
  "turkey/istanbul/blue": ISTANBUL_BLUE,
  "turkey/istanbul/galata": ISTANBUL_GALATA,
  "turkey/istanbul/ferry": ISTANBUL_FERRY,
  "turkey/istanbul/touts": ISTANBUL_TOUTS,
  "turkey/istanbul/arrival": ISTANBUL_ARRIVAL,
};

/** 記事の中身。**無ければ書き出しを止める**（名簿に在るのに中身の無い記事を黙って出さない） */
export function articleOf(country: string, city: string, slug: string): GuideArticle {
  const a = ARTICLES[`${country}/${city}/${slug}`];
  if (!a) throw new Error(`content/travel/articles.ts: ${country}/${city}/${slug} の中身が無い（python/guide_article.py で焼く）`);
  return a;
}
