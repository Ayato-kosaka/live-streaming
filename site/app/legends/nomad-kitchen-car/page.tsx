import type { Metadata } from "next";
import Link from "next/link";

import LateArt from "@/components/guidebook/LateArt";
import SheetHost from "@/components/guidebook/SheetHost";
import Toc from "@/components/guidebook/Toc";
import Cover from "@/components/legends/kitchen/Cover";
import Folds from "@/components/legends/kitchen/Folds";
import Issues from "@/components/legends/kitchen/Issues";
import KitchenLd from "@/components/legends/kitchen/KitchenLd";
import KitchenSources from "@/components/legends/kitchen/KitchenSources";
import Looks from "@/components/legends/kitchen/Looks";
import Menu from "@/components/legends/kitchen/Menu";
import Money from "@/components/legends/kitchen/Money";
import Route from "@/components/legends/kitchen/Route";
import { kitchenToc } from "@/components/legends/kitchen/Sec";
import Shorts from "@/components/legends/kitchen/Shorts";
import Writer from "@/components/travel/article/Writer";
import Icon from "@/components/ui/Icon";
import PageShell from "@/components/ui/PageShell";
import { GUIDE_BY } from "@/content/guidebook/heading";
import { drewAny, mustBeDrawnKitchen, readKitchenDrawn } from "@/content/legends/kitchenCarDrawn";
import { bookShare, kitchenOf } from "@/content/legends/index";
import { PROJECT_ROWS } from "@/content/projectDrafts";
import { crumbsOf } from "@/lib/pages";

import "@/components/guidebook/guidebook.css";
import "@/components/legends/legends.css";
import "@/components/legends/kitchen/kitchen.css";

/**
 * **ノマドキッチンカープロジェクト**（#1418。企画書は本文・あやとの答えは 2026-11-23 のコメント）。
 *
 * ## 企画の面（面の印。M-8・`docs/adr/0018-upcoming-project-page.md`・`docs/adr/0020-project-page-plans-and-guide-art.md`）
 *
 * 始まる前から、伝説の企画と同じ道（`/legends/<企画>`）に面を持つ。計画と課題（いまの考えに日付を付ける）・判断の記録・試算
 * （遊べる形も）を持ち、ガイドブックの形（表紙・目次・節）で組む（ADR 0020。R-10）。始まる日はまだ決まっていない
 * （企画の行は日の無い行。M-30）。
 *
 * **字は1つもここに書かない。** 中身は `content/legends/nomad-kitchen-car.ts`（`python/legend_kitchen_bake.py` が材料
 * `python/data/legends/nomad-kitchen-car/book.json` から焼く）、部品は `components/legends/kitchen/`（並びは build-plan ①）、
 * 描いた絵は `public/legends/nomad-kitchen-car/`（`content/legends/kitchenCarDrawn.ts` が読む。無い絵は枠ごと出さない）。
 *
 * ## 下書き（M-33）
 *
 * 企画の行が下書きの並び（`content/projectDrafts.ts`）に `draft: true` で居るあいだ、検索に出さず（`bookShare` の `robots`）、
 * 島のどこからも引かない。付箋の節（お題6つ）と表紙の「これから」での出かたは、あやとの「繋いでいい」で印を外す日に足す。
 */

const SLUG = "nomad-kitchen-car";
const PATH = `/legends/${SLUG}`;
const B = kitchenOf(SLUG);
const DRAWN = readKitchenDrawn(B);
/* 印を外す日に、紙面の絵が欠けていれば止める（絵の無い紙面は下書きのあいだだけ。`kitchenCarDrawn.ts`） */
mustBeDrawnKitchen(B, DRAWN, !!PROJECT_ROWS.find((p) => p.slug === SLUG)?.draft);

export const metadata: Metadata = bookShare(SLUG);

export default function NomadKitchenCarPage() {
  return (
    <PageShell crumbs={crumbsOf(PATH)}>
      <KitchenLd b={B} drawn={DRAWN} path={PATH} />
      <article className="gb kc">
        <Cover b={B} drawn={DRAWN} />
        <Toc items={kitchenToc(B)} />
        <Route b={B} drawn={DRAWN} />
        <Menu b={B} drawn={DRAWN} />
        <Looks b={B} drawn={DRAWN} />
        <Money b={B} />
        <Issues b={B} />
        <Shorts b={B} />
        <Folds b={B} />
        <Writer by={GUIDE_BY.after} />
        <KitchenSources b={B} drew={drewAny(DRAWN)} />
      </article>
      <p className="gb-back">
        <Link prefetch={false} href="/">
          <Icon name="left" size={15} />
          {B.ui.back}
        </Link>
      </p>
      <LateArt />
      <SheetHost />
    </PageShell>
  );
}
