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
 * 名簿が索引に出す、**道が固定の**面（行く前の案内だけの国。`app/travel/<国>/page.tsx`）と、根。
 * 歩いた国（`[slug]` の面）は道が固定ではないので、ここには入らない。
 */
export function travelFixedRoutes(site) {
  const root = travelRoot(site);
  const src = readFileSync(join(site, "content", "travel.ts"), "utf8");
  const rows = must(readArray(src, "GUIDE_ONLY", { keys: ["slug"] }), "content/travel.ts の GUIDE_ONLY");
  return [root, ...rows.map((r) => `${root}/${r.slug}`)];
}

/** 索引（`app/sitemap.ts`）が、名簿を読んでいるか。**読んでいなければ名簿の道は索引に出ない** */
export const sitemapReadsTravel = (sitemapSrc) => /\bTRAVEL_PLACES\b/.test(sitemapSrc) && /\bTRAVEL\b/.test(sitemapSrc);
