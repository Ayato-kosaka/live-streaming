import type { Metadata } from "next";
import { crumbOf } from "@/components/island/layout";
import { share, type ShareKey } from "@/lib/share";
import { AHEAD_COUNTRIES, COUNTRIES, type Country } from "./countries";
import { TRAVEL, travelHref } from "./travelPath";

export { TRAVEL, travelHref };

/**
 * **`/travel/<国>` の名簿。国の面を数える出どころは、ここ1か所。**
 *
 * ## なぜ要るか
 *
 * 国の面を1枚増やすと、前は**7か所を手で**直していた（`docs/country-guide.md` 6章）。
 * そのうち道に関わるもの——索引（`app/sitemap.ts`）・島のなか ぜんぶ（`content/directory.ts`）・
 * パンくずと名札（`BreadcrumbList`）・自分の居場所（canonical / `og:url`）・貼られたときの絵——は、
 * どれも「どの国が面を持っていて、道は何か」を自分で書き写していた。
 * 書き写すと、道を1つ動かした日に1か所だけ古い道を指す（#1201 で `/map` を動かすときに数えた）。
 * **ここから引けば、国を足すのは表に1行で済む。**
 *
 * ## 何が載るか
 *
 * - 歩き終わった国（`COUNTRIES`）。歩いた記録の面で、北欧の6か国は行く前の案内も同じ面の下に持つ
 * - いま歩いている旅の国（`GUIDE_ONLY`）。記録（街・見どころ）は歩き終わってから書く
 *
 * **面の型はどちらも1つ**（`app/travel/record.tsx`。あやと 2026-11-18「イギリスみたいに」）。
 * 歩いている最中の国は、いつ・配信の数と人数・行った街を、もう在る焼き込みから組む。
 * 国の案内（ことば・通貨・ビザ）は街の面（`/travel/bulgaria/sofia`。#1228）が兼ねていて、国の面に書き写さない
 * （同じ字の面が2枚になると、検索の評価が割れる）。
 */
export type TravelPlace = {
  slug: string;
  /** 面の名前（パンくずの最後・見出しと同じ字） */
  name: string;
  /** 面の道 */
  href: string;
  /** 歩いた記録。**行く前の案内だけの国は持たない** */
  country?: Country;
  /** 貼られたときの絵（`lib/ogCards.json` の鍵） */
  card: ShareKey;
};

/**
 * いま歩いている旅の国。面は `app/travel/<slug>/page.tsx` に1枚ずつ（道が固定の面。同じ段に街の面が在るため）。
 * 名前の `GUIDE_ONLY` は、前は行く前の案内だけの面だったころのもの（見張りがこの名前で読むので残す。
 * `site/selftest/travelreg.mjs`）。
 *
 * **歩き終わって `COUNTRIES` へ移ったら、ここから消す。** 両方に居ると、
 * 同じ道の面が2枚になる（下で止める）。
 */
const GUIDE_ONLY: { slug: string; card: ShareKey }[] = [
  { slug: "north-macedonia", card: "northMacedonia" },
  /* 2026-11-18 まで `CITY_ONLY`（国の面を持たず、ソフィアの面だけ）だった。`/travel/bulgaria` が 404 で、
     ソフィアのパンくずにも国の段が無かった（#1262） */
  { slug: "bulgaria", card: "bulgaria" },
];

/** 歩いた記録の面の絵。国ごとに焼かない（区画ごとに1枚。`lib/share.ts` の頭） */
const RECORD_CARD: ShareKey = "map";

function build(): TravelPlace[] {
  /* 島の札（`components/island/layout.ts` の `map`）は道を字で持っている（あちらは画面の部品からも
     読まれるので、軽く置いてある）。**食い違ったまま書き出さない** */
  if (crumbOf("map").href !== TRAVEL) {
    throw new Error(`content/travel.ts: 島の札「歩いた国」の道（${crumbOf("map").href}）が ${TRAVEL} と違う`);
  }
  const walked = [...COUNTRIES]
    .sort((a, b) => a.order - b.order)
    .map((c) => ({ slug: c.slug, name: c.name, href: travelHref(c.slug), country: c, card: RECORD_CARD }));
  const ahead = GUIDE_ONLY.map((g) => {
    /* 名前は国の表から引く。ここに書き写すと、表の名前を直した日に面だけ古い名前で残る */
    const a = AHEAD_COUNTRIES.find((x) => x.slug === g.slug);
    if (!a) throw new Error(`content/travel.ts: ${g.slug} が AHEAD_COUNTRIES に無い（行く前の案内は、入った国にだけ置く）`);
    return { slug: g.slug, name: a.name, href: travelHref(g.slug), card: g.card };
  });
  const all = [...walked, ...ahead];
  /* **黙って1つに畳まない。** 同じ国が2回並ぶのは、歩き終わって `COUNTRIES` へ移したのに
     `GUIDE_ONLY` から消し忘れたとき。書き出しを止めて、そこで気づく */
  const seen = new Set<string>();
  const twice = all.filter((p) => seen.size === seen.add(p.slug).size).map((p) => p.slug);
  if (twice.length) throw new Error(`content/travel.ts: 同じ国が2回並んでいる（${twice.join(", ")}）`);
  return all;
}

/** 国の面ぜんぶ。歩いた順、そのあとに行く前の案内だけの国 */
export const TRAVEL_PLACES: TravelPlace[] = build();

export const travelPlace = (slug: string) => TRAVEL_PLACES.find((p) => p.slug === slug);

/**
 * 名簿に**在るはずの**国。無ければ書き出しを止める。
 * 名簿に無い国の面を作ると、索引にも `/all` にも出ない——空の行き先で黙って出さない。
 */
export function travelPage(slug: string): TravelPlace {
  const p = travelPlace(slug);
  if (!p) throw new Error(`content/travel.ts: ${slug} が名簿（TRAVEL_PLACES）に無い`);
  return p;
}

/** 区画の名前（`/travel` の見出し・パンくず）。**島の札と同じ字**（`components/island/layout.ts`） */
export const TRAVEL_LABEL = crumbOf("map").label;

/** パンくず。**道の階層と同じ**（島 › 歩いた国 › <国>）。名札（`BreadcrumbList`）もここから出る */
export const travelCrumbs = (name: string) => [crumbOf("map"), { label: name }];

/**
 * **`/travel/<国>/<街>` の名簿。** 実際に行った街のガイド（`docs/guide-design.md`）。
 *
 * ## 公開前の印（`draft`）
 *
 * 最初の街（スコピエ）は、あやとが全部読んでから検索に出した（#1197 Q3。2026-11-19 に OK で印を外した）。
 * 次の街も、あやとが仕上がりを見て OK を出すまでは印を付けて出す（`.claude/skills/city-guide/SKILL.md` 2-9〜2-11）。
 * **印が付いているあいだ、その面は**——
 *
 * - 検索に載せない（面の `robots` が `index: false`）
 * - 索引（`app/sitemap.ts`）と島のなか ぜんぶ（`/all`）の棚に並べない
 * - 国の面の「行った街」で、ガイドへのカードにしない（街の名前と配信だけの行のまま）
 *
 * 面そのものは書き出す（道を知っている人は読める）。**OK が出たら `draft: true` を消すだけで、
 * 4つとも出る側へ倒れる。** ほかを書き換えなくていいように、4か所ともこの印1つを見ている。
 */
export type TravelCity = {
  /** 国の slug（`TRAVEL_PLACES` に在ること） */
  country: string;
  slug: string;
  /** 面の名前（パンくずの最後・h1 と同じ字） */
  name: string;
  /** 面の道 */
  href: string;
  /** 公開前。付いているあいだ、検索・索引・`/all`・国の面のカードに出さない */
  draft?: true;
};

const CITIES: Omit<TravelCity, "href">[] = [
  /* あやとが読んで OK（2026-11-19「いい感じ。結構綺麗」）。公開前の印を外した */
  { country: "north-macedonia", slug: "skopje", name: "スコピエ" },
  { country: "bulgaria", slug: "sofia", name: "ソフィア" },
  /* 行く前の街（あやとは 2026-11-21 に移る。`content/plans.ts` の `romania`）。国の面はまだ無い（`CITY_ONLY`） */
  { country: "romania", slug: "bucharest", name: "ブカレスト", draft: true },
];

/**
 * **国の面（`/travel/<国>`）を持たず、街の面だけを持つ国。** パンくずは 島 › 歩いた国 › <街> で、国の段を飛ばす
 * （行き止まりの段を作らない）。貼られたときの絵は国の1枚（`card`）。
 *
 * いまは空。ブルガリアがここに居たが、国の面（街の一覧）を建てて `GUIDE_ONLY` へ移した（#1262）。
 * 国の面を建てた日に、ここから消して `GUIDE_ONLY` か `COUNTRIES` へ移す——両方に居ると書き出しを止める（下）。
 */
const CITY_ONLY: { country: string; card: ShareKey; before?: true }[] = [
  /* ルーマニア（2026-11-19）。**行く前の国**（`before`）。国に入った日が国の表（`content/countries.ts` の
     `AHEAD_COUNTRIES`）に入るのは、入った日に入れる決まりなので、それまでは国の表に居ない。
     入った日に国の面を建てて `GUIDE_ONLY` へ移すまで、パンくずは 島 › 歩いた国 › ブカレスト */
  { country: "romania", card: "map", before: true },
];

/** 街の上の国。国の面が在ればそれ、無ければ `CITY_ONLY` の行（どちらにも無ければ書き出しを止める） */
function cityCountry(country: string): { page?: TravelPlace; card: ShareKey } {
  const page = travelPlace(country);
  const only = CITY_ONLY.find((c) => c.country === country);
  if (page && only) throw new Error(`content/travel.ts: ${country} は国の面が在るのに CITY_ONLY にも居る（消し忘れ）`);
  if (page) return { page, card: page.card };
  if (!only) throw new Error(`content/travel.ts: ${country} の国の面が無い（TRAVEL_PLACES にも CITY_ONLY にも居ない）`);
  /* 行く前の国（`before`）は、まだ国の表に居なくてよい。入った日に国の表へ入っても、ここでは止めない
     （止めると、入った晩の毎晩の配りが落ちる）。国の面を建てた日に `before` ごと `GUIDE_ONLY` へ移す */
  const listed = AHEAD_COUNTRIES.some((a) => a.slug === country) || COUNTRIES.some((c) => c.slug === country);
  if (!only.before && !listed) {
    throw new Error(`content/travel.ts: ${country} が国の表（content/countries.ts）に無い`);
  }
  return { card: only.card };
}

export const TRAVEL_CITIES: TravelCity[] = CITIES.map((c) => {
  /* 上の国が決まらない街を立てない。パンくずの1つ上が行き止まりになる */
  cityCountry(c.country);
  return { ...c, href: `${travelHref(c.country)}/${c.slug}` };
});

/** 名簿に在るはずの街。無ければ書き出しを止める */
export function travelCity(country: string, slug: string): TravelCity {
  const c = TRAVEL_CITIES.find((x) => x.country === country && x.slug === slug);
  if (!c) throw new Error(`content/travel.ts: ${country}/${slug} が街の名簿（TRAVEL_CITIES）に無い`);
  return c;
}

/** 出してよい街。**公開前の印が付いた街は入らない**（索引・`/all`・国の面のカードはここから引く） */
export const publicCities = (country?: string) =>
  TRAVEL_CITIES.filter((c) => !c.draft && (!country || c.country === country));

/** 街のパンくず。島 › 歩いた国 › <国> › <街> */
export function travelCityCrumbs(country: string, slug: string) {
  const { page } = cityCountry(country);
  const c = travelCity(country, slug);
  return page ? [crumbOf("map"), { label: page.name, href: page.href }, { label: c.name }] : [crumbOf("map"), { label: c.name }];
}

/** 街の面の、貼られたときの顔と居場所。**公開前は検索に出さない**（`robots` は印から） */
export function travelCityShare(country: string, slug: string, o: { title: string; description: string }): Metadata {
  const { card } = cityCountry(country);
  const c = travelCity(country, slug);
  return share({
    key: card,
    title: o.title,
    description: o.description,
    path: c.href,
    ...(c.draft ? { robots: { index: false, follow: true } } : {}),
  });
}

/**
 * 国の面の、貼られたときの顔と自分の居場所（canonical / `og:url`）。
 * 道と絵は名簿から引くので、面は題と一文だけを渡す。
 */
export function travelShare(slug: string, o: { title: string; description: string }): Metadata {
  const p = travelPage(slug);
  return share({ key: p.card, title: o.title, description: o.description, path: p.href });
}

/**
 * **`/travel/<国>/<街>/<話>` の記事の名簿。** 勝てる問い1つに1枚で答える面（`docs/guide-design.md` ★3）。
 *
 * 公開前の印（`draft`）の意味は街と同じ: 付いているあいだ、検索に載せない・索引と `/all` に並べない。
 * **出すときは、街と同じく印を1つ外すだけ。** 索引（`app/sitemap.ts`）と `/all`（`content/directory.ts`）は
 * `publicArticles()` を読み、面の `robots` は印から決まり（`travelArticleShare`）、索引の見張り
 * （`sitemapgap_selftest.mjs`）は面の字ではなく名簿の印を読む（`site/selftest/travelreg.mjs` の `travelArticles`）。
 */
export type TravelArticle = {
  country: string;
  /** 街の slug（`TRAVEL_CITIES` に在ること） */
  city: string;
  slug: string;
  /** パンくずの最後の字 */
  crumb: string;
  href: string;
  draft?: true;
};

const ARTICLES: Omit<TravelArticle, "href">[] = [
  /* 街の面と同じ日に印を外した（2026-11-19。あやと「スコピエのところにリンクを入れてほしい」） */
  { country: "north-macedonia", city: "skopje", slug: "prices", crumb: "物価" },
  /* ソフィアの物価（#1262）。配信で言った額だけで組むので、公開前の印は付けない */
  { country: "bulgaria", city: "sofia", slug: "prices", crumb: "物価" },
  /* マトカ渓谷に行ってきた（#1228。あやと 2026-11-19「がっつり書いた行ったは、ページ遷移でもいい」）。
     配信の facts だけで書いた一人称の旅の記録なので、公開前の印は付けない。街のガイドの窓から「続きを読む」で繋ぐ */
  { country: "north-macedonia", city: "skopje", slug: "matka", crumb: "マトカ渓谷" },
  /* スコピエ城塞に行ってきた【2026年10月】（#1228。マトカ渓谷と同じ型） */
  { country: "north-macedonia", city: "skopje", slug: "kale", crumb: "スコピエ城塞" },
  /* ヴォドノ山に登ってきた【2026年11月】（#1228。マトカ渓谷と同じ型） */
  { country: "north-macedonia", city: "skopje", slug: "vodno", crumb: "ヴォドノ山" },
  /* ソフィアで本場のヨーグルトを探してきた【2026年11月】（#1228。マトカ渓谷と同じ型） */
  { country: "bulgaria", city: "sofia", slug: "yogurt", crumb: "ヨーグルト" },
];

/* 街の面が無い記事を立てない（`travelCity` が止める）。パンくずの1つ上が行き止まりになる */
export const TRAVEL_ARTICLES: TravelArticle[] = ARTICLES.map((a) => ({
  ...a,
  href: `${travelCity(a.country, a.city).href}/${a.slug}`,
}));

/** 名簿に在るはずの記事。無ければ書き出しを止める */
export function travelArticle(country: string, city: string, slug: string): TravelArticle {
  const a = TRAVEL_ARTICLES.find((x) => x.country === country && x.city === city && x.slug === slug);
  if (!a) throw new Error(`content/travel.ts: ${country}/${city}/${slug} が記事の名簿（TRAVEL_ARTICLES）に無い`);
  return a;
}

/** 出してよい記事。**公開前の印が付いた記事は入らない** */
export const publicArticles = (country?: string) =>
  TRAVEL_ARTICLES.filter((a) => !a.draft && (!country || a.country === country));

/** 記事のパンくず。島 › 歩いた国 › <国> › <街> › <記事> */
export function travelArticleCrumbs(country: string, city: string, slug: string) {
  const p = travelPage(country);
  const c = travelCity(country, city);
  const a = travelArticle(country, city, slug);
  return [crumbOf("map"), { label: p.name, href: p.href }, { label: c.name, href: c.href }, { label: a.crumb }];
}

/**
 * 記事の、貼られたときの顔と居場所。**`robots` は公開前の印から決める**（街の `travelCityShare` と同じ）。
 * 面が `robots` を字で渡していたら、印と合っているかだけを見る（食い違ったら書き出しを止める）
 */
export function travelArticleShare(
  country: string,
  city: string,
  slug: string,
  o: { title: string; description: string; robots?: { index: false; follow: boolean } },
): Metadata {
  const p = travelPage(country);
  const a = travelArticle(country, city, slug);
  if (o.robots && !a.draft) {
    throw new Error(`content/travel.ts: ${a.href} は公開前の印が無いのに、面が robots（index: false）を渡している`);
  }
  const robots = a.draft ? (o.robots ?? { index: false as const, follow: true }) : undefined;
  return share({ key: p.card, title: o.title, description: o.description, path: a.href, ...(robots ? { robots } : {}) });
}
