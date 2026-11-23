import type { MetadataRoute } from "next";
import { SITE } from "@/content/site";
import { listedPages } from "@/lib/pages";

export const dynamic = "force-static";

/**
 * 索引。**面を並べるのは種類の表から**（`lib/pages.ts` の `listedPages`。#1357・R-22）。
 *
 * 前はここに面の道を手で並べていて、面を1枚増やす仕事が3か所（ここ・`/all` の棚・面そのもの）あった。
 * 書いてあっても2回足し忘れた（#872 の `/months`・`/north-macedonia`）。いまは中身の表に1行足せば、
 * ここと `/all` の両方に出る。**ここに道を書き足さない。**
 *
 * `lastModified` は分かる面にだけ付ける（`lib/lastmod.ts`）。`priority` は読む側（Google）が使わないと
 * 明言している欄なので付けない。
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const rows: MetadataRoute.Sitemap = listedPages().map((p) => {
    const url = `${SITE.url}${p.path === "/" ? "" : p.path}`;
    return {
      url,
      ...(p.lastmod ? { lastModified: p.lastmod } : {}),
      ...(p.images ? { images: p.images } : {}),
    };
  });

  /* **同じ URL を2回載せない。黙って1つに畳まず、書き出しを止める**（面の一覧の側でも止めている。二重の止め金） */
  const seen = new Set<string>();
  const twice = rows.map((r) => r.url).filter((u) => seen.size === seen.add(u).size);
  if (twice.length) {
    throw new Error(`sitemap に同じ URL が2回載っています（${rows.length}行・一意 ${seen.size}）: ${twice.join(", ")}`);
  }
  return rows;
}
