import type { Metadata } from "next";

import { BOOK_PROJECTS, PROJECT_ROWS } from "@/content/projectDrafts";
import { share } from "@/lib/share";

import { INDIA_STREET_FOOD } from "./india-street-food";
import { INDIA_STREET_FOOD_EATEN } from "./india-street-food-eaten";
import type { Eaten, LegendBook } from "./types";

/**
 * **面の印の付いた企画の中身**（M-8・`docs/adr/0018-upcoming-project-page.md`）。企画の slug → 焼いた中身と、食べた記録。
 *
 * 面（`app/legends/<企画>/page.tsx`）・面の名簿（`lib/pages.ts`）・llms.txt・`/all` がここを読む。
 * **伝説の企画（`content/legends.ts`）とは別の口**——あちらは旅程の表を読むので重く、面の印の企画は伝説の丘に並ばない。
 *
 * 企画を足すときは、材料を焼いて（`python/legend_book_bake.py`）ここに1行。表の面の印と食い違うと書き出しを止める（下）。
 */
const BOOKS: Record<string, { book: LegendBook; eaten: Eaten[] }> = {
  "india-street-food": { book: INDIA_STREET_FOOD, eaten: INDIA_STREET_FOOD_EATEN },
};

/* 面の印の付いた企画と、焼いた中身が1対1か（M-15。名前の鍵の指す先が在る） */
{
  const marked = BOOK_PROJECTS.map((p) => p.slug);
  const lost = marked.filter((s) => !BOOKS[s]);
  const stray = Object.keys(BOOKS).filter((s) => !marked.includes(s));
  if (lost.length) throw new Error(`content/legends/index.ts: 面の印の付いた企画の中身が無い（${lost.join(", ")}）。材料を焼いて足す`);
  if (stray.length) throw new Error(`content/legends/index.ts: 面の印の無い企画の中身が在る（${stray.join(", ")}）`);
  for (const [slug, { book, eaten }] of Object.entries(BOOKS)) {
    if (book.slug !== slug) throw new Error(`content/legends/index.ts: ${slug} に ${book.slug} の中身を結んでいる`);
    /* 食べた記録は1食目から抜けなく。100品に無い品を結ばない */
    eaten.forEach((e, i) => {
      if (e.n !== i + 1) throw new Error(`content/legends/${slug}-eaten.ts: ${i + 1}行目が ${e.n}食目（1から抜けなく並べる）`);
      if (e.dish && !book.dishes.some((d) => d.id === e.dish)) {
        throw new Error(`content/legends/${slug}-eaten.ts: ${e.n}食目の品 "${e.dish}" が100品に無い`);
      }
    });
    if (eaten.length > book.goal.n) throw new Error(`content/legends/${slug}-eaten.ts: ${eaten.length}行（ゴールは${book.goal.n}）`);
  }
}

/** 焼いた中身と食べた記録。**無い slug は投げる** */
export function bookOf(slug: string): { book: LegendBook; eaten: Eaten[] } {
  const b = BOOKS[slug];
  if (!b) throw new Error(`content/legends/index.ts: 企画 "${slug}" の中身が無い（面の印の企画: ${Object.keys(BOOKS).join(", ")}）`);
  return b;
}

/**
 * 面の `robots`。**下書きの印（M-33）が付いているあいだだけ `index: false`**——面そのものは書き出す（道を知っている人は読める）。
 * 印を外せば、ここが `undefined` を返して検索に出る（街の `travelCityShare` と同じ。面は触らない）
 */
export function bookRobots(slug: string): Metadata["robots"] {
  const p = PROJECT_ROWS.find((x) => x.slug === slug);
  if (!p?.book) throw new Error(`content/legends/index.ts: 企画 "${slug}" に面の印が無い`);
  return p.draft ? { index: false, follow: true } : undefined;
}

/** 面の題・説明・居場所（book.json の meta から）。検索に出すかは印から（`bookRobots`） */
export function bookShare(slug: string): Metadata {
  const { book } = bookOf(slug);
  return share({
    key: "legends",
    title: book.meta.title,
    description: book.meta.description,
    path: `/legends/${slug}`,
    robots: bookRobots(slug),
  });
}
