import type { Metadata } from "next";

import CityCards from "@/components/travel/CityCards";
import Flag from "@/components/ui/Flag";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import { guidebookOf } from "@/content/guidebook";
import { publicCities, travelCrumbs, travelPage, travelShare } from "@/content/travel";

/**
 * ブルガリアの国の面（`/travel/bulgaria`）。**街のガイドの一覧だけ**の1枚。#1262
 *
 * ## なぜ要るか
 *
 * 2026-11-18 までここは 404 で、ソフィアの面（`/travel/bulgaria/sofia`）のパンくずは「島 › 歩いた国 › ソフィア」と
 * 国の段を飛ばしていた。島の中からソフィアへ行けるのは表紙の期間限定の札の2本だけで、`/travel` の国の一覧からは
 * 行けなかった。国の段を立てると、`/travel` の年表（ブルガリアの行）→ ここ → ソフィア、が常に繋がる。
 *
 * ## 国の案内を書き写さない
 *
 * ことば・通貨・ビザ・1日の予算は、ソフィアの面が国の案内も兼ねて持っている（#1228）。ここに同じ字を置くと、
 * 同じ中身の面が2枚になって検索の評価が割れる（#1262「言い換えごとの面を作らない」）。ここは街を選ぶだけの面。
 * 北マケドニアの面（`../north-macedonia/page.tsx`）が国の読みものを持っているのは、首都の面より先に建ったから。
 *
 * 街は名簿（`content/travel.ts` の `CITIES`）から。街が増えれば、ここにひとりでにカードが増える。
 */

const PLACE = travelPage("bulgaria");
const CITIES = publicCities("bulgaria");

/* 題と一文は、並んでいる街の中身から組む。数は手で書かない */
const NAMES = CITIES.map((c) => c.name).join("・");
const WHAT = CITIES.map((c) => {
  const g = guidebookOf(c.country, c.slug);
  if (!g) throw new Error(`app/travel/bulgaria/page.tsx: ${c.country}/${c.slug} の中身が content/guidebook/ に無い`);
  /* 地図（マイマップ）を持たない街に「地図」と書かない */
  return `${c.name}のやりたいこと${g.todo.length}選と見どころ${g.see.items.length}か所${g.see.map ? "の地図" : ""}`;
}).join("、");

export const metadata: Metadata = travelShare("bulgaria", {
  title: `${PLACE.name}の街のガイド — ${NAMES}`,
  description: `${PLACE.name}の街のガイド。${WHAT}、食べもの・お土産・1日の予算。`,
});

export default function BulgariaPage() {
  return (
    <PageShell crumbs={travelCrumbs(PLACE.name)}>
      <PageHead mark={<Flag slug="bulgaria" size={44} />} title={PLACE.name} lead="北マケドニアの東どなり、黒海に面した国。首都はソフィア。" />
      <CityCards country="bulgaria" />
    </PageShell>
  );
}
