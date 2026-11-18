import type { Metadata } from "next";

import {
  Body,
  Days,
  Head,
  Keyword,
  NextRead,
  Pairs,
  Points,
  PriceTable,
  SceneButton,
  Sec,
  Sources,
  Streams,
  Toc,
  Writer,
} from "@/components/travel/article/Article";
import { jpRange } from "@/components/travel/article/scene";
import { CITY_STREAMS } from "@/content/cityStreams";
import { AHEAD_COUNTRIES } from "@/content/countries";
import { travelArticle, travelArticleCrumbs, travelArticleShare, travelCity, travelPage, TRAVEL, TRAVEL_LABEL } from "@/content/travel";
import { ARTICLE as A } from "@/content/travel/north-macedonia/skopje-prices";
import PageShell from "@/components/ui/PageShell";
import { JsonLd, articleLd } from "@/lib/jsonld";

import "@/components/travel/article/article.css";

/**
 * 記事「スコピエの物価」。#1203（親 #1196）。型は `docs/guide-design.md` の ★ の章。
 *
 * ## 誰が、何を調べて読むか（`docs/seo-2026-11/G_skopje_intent.md` 5章の1）
 *
 * - **読む人**: バルカンを周る20〜30代の個人旅行者。ティラナかソフィアを出る1〜2週間前に、
 *   スコピエに何日寄るか決めかねている。「外食と自炊で1日いくらか、何が安くて何が高いか、
 *   現金とカードどちらか」が分からない
 * - **狙う語**: 「スコピエ 物価」「北マケドニア 物価」（と「北マケドニア 旅費／現金／クレジットカード」）
 * - **得て帰るもの**: 30秒で「自炊なら1日 約2,400円・スーパーは安くて外食は高い・カードは使えたが現金も持つ」。
 *   その下に、2026年10月の値段の表と、どこで買えば安いか
 * - **競合より上な所**: 上位3件は2014年・2019年（1Den=1.92円で固定）・ユーロ建ての3泊4日。
 *   こちらは2026年10月に1か月暮らした値段を、場面つきで
 *
 * **字は1つもここに書かない。** 記事の字は `content/travel/north-macedonia/skopje-prices.ts`
 * （`python/guide_article.py` が台本 `python/data/guide/north-macedonia/skopje/prices.json` と facts.json から焼く）。
 * ここが持つのは並びだけ。
 *
 * ## 公開前
 *
 * 印は `content/travel.ts` の `ARTICLES` の `draft`。`robots` は印から決まる（`travelArticleShare`）ので、
 * ここには書かない。**出すときは印を1つ外すだけ**（街の面と同じ1手。索引・`/all`・見張りも名簿を読む）。
 */

const COUNTRY = "north-macedonia";
const CITY = "skopje";
const SLUG = "prices";
const PATH = travelArticle(COUNTRY, CITY, SLUG).href;

export const metadata: Metadata = travelArticleShare(COUNTRY, CITY, SLUG, {
  title: A.title,
  description: A.description,
});

/** 行った日。**国に入った日から、次の国に入った日まで**（`content/countries.ts`。街の面と同じ数えかた） */
function stayOf(slug: string): { from: string; to: string } {
  const all = [...AHEAD_COUNTRIES].sort((a, b) => a.entered.localeCompare(b.entered));
  const i = all.findIndex((c) => c.slug === slug);
  if (i < 0) throw new Error(`skopje/prices/page.tsx: ${slug} が AHEAD_COUNTRIES に無い`);
  return { from: all[i].entered, to: all[i + 1]?.entered ?? all[i].entered };
}

/** 配信の一覧で、畳まずに見せる本数（場面をよく引いた回から） */
const STREAMS_OPEN = 3;

export default function SkopjePricesPage() {
  const country = travelPage(COUNTRY);
  const city = travelCity(COUNTRY, CITY);
  const stay = stayOf(COUNTRY);
  const all = CITY_STREAMS[A.streams.country]?.[A.streams.city] ?? [];
  const cited = A.streams.videos.map((v) => {
    const s = all.find((x) => x.videoId === v);
    if (!s) throw new Error(`skopje/prices/page.tsx: 場面を引いた回 ${v} が配信の一覧（cityStreams.ts）に無い`);
    return s;
  });
  const ext = A.sections.flatMap((s) => s.keyword?.ext ?? []);
  const n = A.sections.length + 2;

  return (
    <PageShell crumbs={travelArticleCrumbs(COUNTRY, CITY, SLUG)}>
      <JsonLd
        data={articleLd({
          path: PATH,
          headline: A.title,
          description: A.description,
          datePublished: A.published,
          dateModified: A.updated,
          image: A.cover?.src,
        })}
      />
      <article className="tg ta">
        <Head
          h1={A.h1}
          lead={A.lead}
          cover={A.cover}
          went={{ from: stay.from, text: jpRange(stay.from, stay.to) }}
          published={A.published}
          updated={A.updated}
        />

        {/* 先に答え → 目次。値段だけ知りたい人は、答えの箱で帰れるように */}
        <Sec id={A.answer.id} n={1} icon={A.answer.icon} h={A.answer.h} answer={A.answer.text} className="ta-first">
          <Days days={A.answer.days} />
          <Points points={A.answer.points} />
          <p className="ta-note">{A.answer.note}</p>
        </Sec>

        <Toc
          items={[
            { id: A.answer.id, label: A.answer.toc, icon: A.answer.icon },
            ...A.sections.map((s) => ({ id: s.id, label: s.toc, icon: s.icon })),
            { id: "streams", label: "この記事の配信", icon: "youtube" as const },
          ]}
        />

        {A.sections.map((s, i) => (
          <Sec key={s.id} id={s.id} n={i + 2} icon={s.icon} h={s.h} answer={s.answer}>
            {/* 答え → 値段の表 → 話。表を先に置くのは、値段だけ見に来た人が話を読み飛ばせるように */}
            {s.pairs && <Pairs pairs={s.pairs} />}
            {s.table && <PriceTable caption={s.table.caption} rows={s.table.rows} />}
            <Body blocks={s.body} sizes="(min-width: 720px) 520px, 92vw" />
            {s.scene && <SceneButton at={s.scene} />}
            {s.keyword && <Keyword k={s.keyword} />}
          </Sec>
        ))}

        <Sec id="streams" n={n} icon="youtube" h="この記事の配信">
          <Streams open={cited.slice(0, STREAMS_OPEN)} rest={cited.slice(STREAMS_OPEN)} />
        </Sec>

        <NextRead
          items={[
            { href: city.href, title: `${city.name}のガイド`, note: "見どころ・食べもの・気をつけること", icon: "guide" },
            { href: country.href, title: country.name, note: "国の案内。ことば・食べもの・お金", icon: "mountain" },
            { href: TRAVEL, title: TRAVEL_LABEL, note: "あやとが歩いた国の記録", icon: "globe" },
          ]}
        />
        <Writer />
        <Sources ext={ext} />
      </article>
    </PageShell>
  );
}
