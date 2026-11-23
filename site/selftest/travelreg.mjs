/**
 * 見張りが「この道は、国の面の名簿（`site/content/travel.ts`）から索引に出ているか」を引くための口。
 *
 * 索引（`app/sitemap.ts`）は、国の面を字で書かずに名簿から並べる（#1201）。
 * だから「索引に `"/travel/north-macedonia"` の字が在るか」で見ていた見張りは、
 * 名簿のほうも見ないと、在る面を「索引に無い」と言う。**名簿の読み口はここ1本**
 * （見張りごとに読み方を書くと、名簿の形を変えた日に1本だけ古いまま通る）。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { must, readArray } from "../../tools/sprites/tsread.mjs";

/** 道の根（`content/travelPath.ts` の `TRAVEL`）。**ここは字で持たず、書いてある値を読む** */
export function travelRoot(site) {
  const src = readFileSync(join(site, "content", "travelPath.ts"), "utf8");
  const m = /export const TRAVEL\s*=\s*"([^"]+)"/.exec(src);
  if (!m) throw new Error("site/content/travelPath.ts から TRAVEL が読めない（名前が変わった？）");
  return m[1];
}

/**
 * 名簿が索引に出す、**道が固定の**面（`app/travel/<国>/page.tsx`）と、根。
 * いま歩いている旅の国（`GUIDE_ONLY`）と、街のガイドを持ったまま歩き終わった国（`WALKED_FIXED`）。
 * ほかの歩いた国（`[slug]` の面）は道が固定ではないので、ここには入らない。
 */
export function travelFixedRoutes(site) {
  const root = travelRoot(site);
  const src = readFileSync(join(site, "content", "travel.ts"), "utf8");
  const rows = [
    ...must(readArray(src, "GUIDE_ONLY", { keys: ["slug"] }), "content/travel.ts の GUIDE_ONLY"),
    ...must(readArray(src, "WALKED_FIXED", { keys: ["slug"] }), "content/travel.ts の WALKED_FIXED"),
  ];
  return [root, ...rows.map((r) => `${root}/${r.slug}`)];
}

/** 索引（`app/sitemap.ts`）が、名簿を読んでいるか。**読んでいなければ名簿の道は索引に出ない** */
export const sitemapReadsTravel = (sitemapSrc) => /\bTRAVEL_PLACES\b/.test(sitemapSrc) && /\bTRAVEL\b/.test(sitemapSrc);

/**
 * 街のガイド（`/travel/<国>/<街>`）の名簿（`content/cities.ts` の `CITIES`）。`draft` は公開前の印。
 *
 * 街の面の `robots` は面に字で書いてなく、印から決まる（`travelCityShare`）。だから「索引に出さないと
 * 自分で言っている面か」は、面の `metadata` ではなく名簿の印で読む。印の無い街は、索引が
 * `publicCities` を読んでいれば索引に在る（`sitemapReadsCities`）。
 */
export function travelCities(site) {
  const root = travelRoot(site);
  const src = readFileSync(join(site, "content", "cities.ts"), "utf8");
  const rows = must(readArray(src, "CITIES", { keys: ["country", "slug", "draft"] }), "content/cities.ts の CITIES");
  return rows.map((r) => ({ route: `${root}/${r.country}/${r.slug}`, draft: r.draft === "true" }));
}

/** 索引が街の名簿（公開してよい街だけ）を読んでいるか */
export const sitemapReadsCities = (sitemapSrc) => /\bpublicCities\(|\bTRAVEL_CITIES\b/.test(sitemapSrc);

/**
 * 街の記事（`/travel/<国>/<街>/<話>`）の名簿（`content/travel.ts` の `ARTICLES`）。`draft` は公開前の印。
 *
 * 記事の面の `robots` も、街と同じく面に字で書かず印から決まる（`travelArticleShare`）。
 * だから「検索に出さないと自分で言っている面か」は名簿の印で読む。出すときは印を1つ外すだけで、
 * 索引が `publicArticles` を読んでいれば索引に在る（`sitemapReadsArticles`）。
 */
export function travelArticles(site) {
  const root = travelRoot(site);
  const src = readFileSync(join(site, "content", "travel.ts"), "utf8");
  const rows = must(readArray(src, "ARTICLES", { keys: ["country", "city", "slug", "draft"] }), "content/travel.ts の ARTICLES");
  return rows.map((r) => ({ route: `${root}/${r.country}/${r.city}/${r.slug}`, draft: r.draft === "true" }));
}

/** 索引が記事の名簿（公開してよい記事だけ）を読んでいるか */
export const sitemapReadsArticles = (sitemapSrc) => /\bpublicArticles\(|\bTRAVEL_ARTICLES\b/.test(sitemapSrc);

/**
 * 面の印の付いた企画（`content/projects.ts` の `book`。M-8）。`draft` は下書きの印（M-33。行は `DRAFT_PROJECTS` に居る）。
 *
 * 面は道が固定（`app/legends/<企画>/page.tsx`）だが、`robots` は面に字で書かず、表の印から決まる
 * （`content/legends/index.ts` の `bookRobots`）。だから「検索に出さないと自分で言っている面か」は表の印で読む。
 * 出すときは印を1つ外すだけで、面の名簿（`lib/pages.ts`）が `BOOK_PROJECTS` を読んでいれば索引に在る（`sitemapReadsBooks`）。
 */
export function legendBooks(site) {
  const src = readFileSync(join(site, "content", "projects.ts"), "utf8");
  /* 出ている企画（`PROJECTS`）と下書きの企画（`DRAFT_PROJECTS`）の2つの並び。下書きの並びは空のこともある */
  const rows = [
    ...must(readArray(src, "PROJECTS", { keys: ["slug", "book", "draft"] }), "content/projects.ts の PROJECTS"),
    ...readArray(src, "DRAFT_PROJECTS", { keys: ["slug", "book", "draft"] }),
  ];
  return rows.filter((r) => r.book === "true").map((r) => ({ route: `/legends/${r.slug}`, draft: r.draft === "true" }));
}

/** 面の名簿が、面の印の付いた企画を読んでいるか */
export const sitemapReadsBooks = (sitemapSrc) => /\bBOOK_PROJECTS\b/.test(sitemapSrc);
