import type { Metadata } from "next";
import Link from "next/link";

import SheetHost from "@/components/guidebook/SheetHost";
import Toc from "@/components/guidebook/Toc";
import { BookCover, BookSources, Compare, Dishes, Faq, Regions, Route, Rules, Stamps, Tips, Words, bookToc } from "@/components/legends/Book";
import BookLd from "@/components/legends/BookLd";
import Icon from "@/components/ui/Icon";
import PageShell from "@/components/ui/PageShell";
import { mustBeDrawn, readBookDrawn } from "@/content/legends/drawn";
import { bookOf, bookShare } from "@/content/legends/index";
import { PROJECT_ROWS } from "@/content/projectDrafts";
import { crumbsOf } from "@/lib/pages";

import "@/components/guidebook/guidebook.css";
import "@/components/legends/legends.css";

/**
 * **インド屋台飯100食、食べるまで出られません**（#1404。企画書は本文・2026-11-23 にあやとが承認）。
 *
 * ## 企画の面（面の印。M-8・`docs/adr/0018-upcoming-project-page.md`）
 *
 * 始まる前から、伝説の企画と同じ道（`/legends/<企画>`）に面を持つ。旅の前は予告とガイド、旅のあいだはスタンプラリー、
 * 旅のあとは伝説、と同じ URL のまま姿を変える（企画書11章）。
 *
 * ## 誰が、何を調べて読むか（企画書4章）
 *
 * 常連さんは「0/100食」とスタンプラリーの台紙、初見さんは題と一行と「2027年1月15日ごろ ムンバイから」、
 * 検索から来た人は題の「インド屋台飯」と、すぐ下の基本用語と地域ごとの料理の違い。
 * 狙う語は インド 屋台飯／マトン とは／インド カレー 地域 違い（#1404 の調べもの D）。
 *
 * **字は1つもここに書かない。** 中身は `content/legends/india-street-food.ts`（`python/legend_book_bake.py` が
 * 材料 `python/data/legends/india-street-food/book.json` から焼く）、食べた100食は `content/legends/india-street-food-eaten.ts`、
 * 部品は `components/legends/`（並びは企画書5章）。描いた絵は `public/legends/india-street-food/`（無ければ `content/legends/drawn.ts`）。
 *
 * ## 下書き（M-33）
 *
 * 「まだ動線をつなげるのは待ってほしい」（あやと 2026-11-23）。企画の表（`content/projects.ts`）の行に `draft: true` が
 * 付いているあいだ、検索に出さず（`bookShare` の `robots`）、島のどこからも引かない。付箋の節（企画書5章の9）と
 * 「この企画の配信」（10）は、印を外す日・始まった日に足す（企画書12章）。
 */

const SLUG = "india-street-food";
const PATH = `/legends/${SLUG}`;
const { book: B, eaten: EATEN } = bookOf(SLUG);
const DRAWN = readBookDrawn(B);
/* 印を外す日に、絵の無い品が残っていれば止める（絵が無いあいだの札は下書きのあいだだけ。`drawn.ts`） */
mustBeDrawn(B, DRAWN, !!PROJECT_ROWS.find((p) => p.slug === SLUG)?.draft);

export const metadata: Metadata = bookShare(SLUG);

export default function IndiaStreetFoodPage() {
  return (
    <PageShell crumbs={crumbsOf(PATH)}>
      <BookLd b={B} drawn={DRAWN} path={PATH} />
      <article className="gb">
        <BookCover b={B} eaten={EATEN} drawn={DRAWN} />
        <Toc items={bookToc(B, EATEN)} />
        <Rules b={B} />
        <Stamps b={B} eaten={EATEN} />
        <Words b={B} />
        <Regions b={B} drawn={DRAWN} />
        <Compare b={B} drawn={DRAWN} />
        <Dishes b={B} drawn={DRAWN} />
        <Route b={B} />
        <Tips b={B} />
        <Faq b={B} />
        <BookSources b={B} drawn={DRAWN} />
      </article>
      <p className="gb-back">
        <Link prefetch={false} href="/">
          <Icon name="left" size={15} />
          島へ戻る
        </Link>
      </p>
      <SheetHost />
    </PageShell>
  );
}
