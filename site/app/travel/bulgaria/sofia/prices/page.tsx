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
import { travelArticle, travelArticleCrumbs, travelArticleShare, travelCity, travelPage, TRAVEL, TRAVEL_LABEL } from "@/content/travel";
import { ARTICLE as A } from "@/content/travel/bulgaria/sofia-prices";
import PageShell from "@/components/ui/PageShell";
import { JsonLd, articleLd } from "@/lib/jsonld";

import "@/components/travel/article/article.css";

/**
 * 記事「ソフィアの物価」。#1262。型はスコピエの物価（`../../../north-macedonia/skopje/prices/page.tsx`）と同じ。
 *
 * - **読む人**: スコピエかブカレストからソフィアへ入る前の個人旅行者。外食・宿・服がいくらか、
 *   北マケドニアより高いのかを知りたい
 * - **狙う語**: 「ソフィア 物価」「ブルガリア 物価」（`python/data/seo_targets.json`）
 * - **競合より上な所**: 上位は1本の記事で、ユーロ導入前（レフ建て）の値段が多い。こちらは2026年11月、
 *   ユーロに切り替わったあとに配信で言った値段だけを、場面つきで
 *
 * **字は1つもここに書かない。** 記事の字は `content/travel/bulgaria/sofia-prices.ts`
 * （`python/guide_article.py` が台本 `python/data/guide/bulgaria/sofia/prices.json` と facts.json から焼く）。
 * ここが持つのは並びだけ。配信で言った額だけで組むので、公開前の印は付けていない（`content/travel.ts`）。
 */

const COUNTRY = "bulgaria";
const CITY = "sofia";
const SLUG = "prices";
const PATH = travelArticle(COUNTRY, CITY, SLUG).href;

export const metadata: Metadata = travelArticleShare(COUNTRY, CITY, SLUG, {
  title: A.title,
  description: A.description,
});

/** 行った日。**場面を引いた回のいちばん前の日から、いちばん後の日まで**（ブルガリアはまだ滞在の最中で、
    スコピエのように「次の国に入った日」で閉じられない） */
function stayOf(dates: string[]): { from: string; to: string } {
  const d = [...dates].sort();
  if (!d.length) throw new Error("sofia/prices/page.tsx: 場面を引いた回が1本も無い");
  return { from: d[0], to: d[d.length - 1] };
}

/** 配信の一覧で、畳まずに見せる本数（場面をよく引いた回から） */
const STREAMS_OPEN = 3;

export default function SofiaPricesPage() {
  const country = travelPage(COUNTRY);
  const city = travelCity(COUNTRY, CITY);
  const all = CITY_STREAMS[A.streams.country]?.[A.streams.city] ?? [];
  const cited = A.streams.videos.map((v) => {
    const s = all.find((x) => x.videoId === v);
    if (!s) throw new Error(`sofia/prices/page.tsx: 場面を引いた回 ${v} が配信の一覧（cityStreams.ts）に無い`);
    return s;
  });
  const stay = stayOf(cited.map((s) => s.date));
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
