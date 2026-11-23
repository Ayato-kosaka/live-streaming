import type { Metadata } from "next";

import { BOOK_PROJECTS, PROJECT_ROWS } from "@/content/projectDrafts";
import { share } from "@/lib/share";

import { INDIA_STREET_FOOD } from "./india-street-food";
import { INDIA_STREET_FOOD_EATEN } from "./india-street-food-eaten";
import type { KitchenCarBook } from "./kitchenCarTypes";
import { NOMAD_KITCHEN_CAR } from "./nomad-kitchen-car";
import type { Eaten, LegendBook } from "./types";

/**
 * **面の印の付いた企画の中身**（M-8・`docs/adr/0018-upcoming-project-page.md`）。企画の slug → 焼いた中身と、食べた記録。
 *
 * 面（`app/legends/<企画>/page.tsx`）・面の名簿（`lib/pages.ts`）・llms.txt・`/all` がここを読む。
 * **伝説の企画（`content/legends.ts`）とは別の口**——あちらは旅程の表を読むので重く、面の印の企画は伝説の丘に並ばない。
 *
 * 企画を足すときは、材料を焼いて（`python/legend_book_bake.py`）ここに1行。表の面の印と食い違うと書き出しを止める（下）。
 *
 * **中身の形は2つ。** インドの形（`./types.ts` の `LegendBook`＋食べた記録。`bookOf`）と、ノマドキッチンカーの形
 * （`./kitchenCarTypes.ts` の `KitchenCarBook`。`python/legend_kitchen_bake.py` が焼く。`kitchenOf`）。面の名簿・llms.txt・`/all`・
 * 面の題と説明は、どちらの形にもある共通の頭（`headOf`）だけを読む。
 */
const BOOKS: Record<string, { book: LegendBook; eaten: Eaten[] }> = {
  "india-street-food": { book: INDIA_STREET_FOOD, eaten: INDIA_STREET_FOOD_EATEN },
};

/** ノマドキッチンカーの形の中身（#1418） */
const KITCHEN: Record<string, KitchenCarBook> = {
  "nomad-kitchen-car": NOMAD_KITCHEN_CAR,
};

/** どちらの形にもある頭（面の名簿・llms.txt・`/all`・面の題と説明が読む） */
export type BookHead = {
  slug: string;
  updated: string;
  hash: string;
  meta: { title: string; description: string; h1: string; sub: string };
};

/* 面の印の付いた企画と、焼いた中身が1対1か（M-15。名前の鍵の指す先が在る） */
{
  const marked = BOOK_PROJECTS.map((p) => p.slug);
  const both = Object.keys(BOOKS).filter((s) => KITCHEN[s]);
  if (both.length) throw new Error(`content/legends/index.ts: 同じ企画に中身が2つ結んである（${both.join(", ")}）`);
  const lost = marked.filter((s) => !BOOKS[s] && !KITCHEN[s]);
  const stray = [...Object.keys(BOOKS), ...Object.keys(KITCHEN)].filter((s) => !marked.includes(s));
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
  for (const [slug, book] of Object.entries(KITCHEN)) {
    if (book.slug !== slug) throw new Error(`content/legends/index.ts: ${slug} に ${book.slug} の中身を結んでいる`);
  }
}

/** 面の印の付いた企画の頭（どちらの形でも）。**無い slug は投げる** */
export function headOf(slug: string): BookHead {
  const b = BOOKS[slug]?.book ?? KITCHEN[slug];
  if (!b) {
    throw new Error(`content/legends/index.ts: 企画 "${slug}" の中身が無い（面の印の企画: ${[...Object.keys(BOOKS), ...Object.keys(KITCHEN)].join(", ")}）`);
  }
  const { title, description, h1, sub } = b.meta;
  return { slug: b.slug, updated: b.updated, hash: b.hash, meta: { title, description, h1, sub } };
}

/** ノマドキッチンカーの形の中身。**無い slug は投げる** */
export function kitchenOf(slug: string): KitchenCarBook {
  const b = KITCHEN[slug];
  if (!b) throw new Error(`content/legends/index.ts: 企画 "${slug}" はノマドキッチンカーの形の中身を持たない（${Object.keys(KITCHEN).join(", ")}）`);
  return b;
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

/** 面の題・説明・居場所（book.json の meta から。どちらの形でも `headOf`）。検索に出すかは印から（`bookRobots`） */
export function bookShare(slug: string): Metadata {
  const { meta } = headOf(slug);
  return share({
    key: "legends",
    title: meta.title,
    description: meta.description,
    path: `/legends/${slug}`,
    robots: bookRobots(slug),
  });
}
