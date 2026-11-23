import type { Metadata } from "next";

import { Body, Head, NextRead, Points, SceneButton, Sec, Sources, Streams, Toc, Writer } from "@/components/travel/article/Article";
import { jpRange } from "@/components/travel/article/scene";
import { CITY_STREAMS } from "@/content/cityStreams";
import { travelArticle, travelArticleCrumbs, travelArticleShare, travelCity, travelPage, TRAVEL, TRAVEL_LABEL } from "@/content/travel";
import { ARTICLE as A } from "@/content/travel/turkey/istanbul-touts";
import PageShell from "@/components/ui/PageShell";
import { JsonLd, articleLd } from "@/lib/jsonld";

import "@/components/travel/article/article.css";

/**
 * 記事「イスタンブールで声をかけてきたおじさんについて行った【2025年3月】」。#1228。型はマトカ渓谷（`north-macedonia/skopje/matka/page.tsx`）と同じで、
 * 街のガイドの「治安のコツ」の窓には要約と「続きを読む」だけを残す。
 *
 * - **読む人**: イスタンブールに着いたばかりの個人旅行者が、前の晩に「街で声をかけてくる人にどう対応するか」を調べる
 * - **狙う語**: イスタンブール 客引き／イスタンブール 声をかけられる／イスタンブール 治安
 *
 * **字は1つもここに書かない。** 記事の字は `content/travel/turkey/istanbul-touts.ts`（`python/guide_article.py` が台本
 * `python/data/guide/turkey/istanbul/touts.json` と facts.json から焼く）。本文はあやとの一人称の旅の記録（`docs/guide-blog.md`）。
 */

const COUNTRY = "turkey";
const CITY = "istanbul";
const SLUG = "touts";
const PATH = travelArticle(COUNTRY, CITY, SLUG).href;

export const metadata: Metadata = travelArticleShare(COUNTRY, CITY, SLUG, {
  title: A.title,
  description: A.description,
});

/** 話した日（配信の日）。5本の配信にまたがるので、最初と最後の日 */
const FROM = "2025-03-31";
const TO = "2025-04-13";

/** 配信の一覧で、畳まずに見せる本数（場面をよく引いた回から） */
const STREAMS_OPEN = 2;

export default function IstanbulToutsPage() {
  const country = travelPage(COUNTRY);
  const city = travelCity(COUNTRY, CITY);
  const all = CITY_STREAMS[A.streams.country]?.[A.streams.city] ?? [];
  const cited = A.streams.videos.map((v) => {
    const s = all.find((x) => x.videoId === v);
    if (!s) throw new Error(`istanbul/touts/page.tsx: 場面を引いた回 ${v} が配信の一覧（cityStreams.ts）に無い`);
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
          went={{ from: FROM, text: jpRange(FROM, TO) }}
          published={A.published}
          updated={A.updated}
        />

        {/* 先に答え → 目次。答えだけ知りたい人は、答えの箱で帰れるように */}
        <Sec id={A.answer.id} n={1} icon={A.answer.icon} h={A.answer.h} answer={A.answer.text} className="ta-first">
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
            <Body blocks={s.body} sizes="(min-width: 720px) 520px, 92vw" />
            {s.scene && <SceneButton at={s.scene} />}
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
