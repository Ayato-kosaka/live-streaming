import type { Metadata } from "next";

import { Body, Head, NextRead, Points, SceneButton, Sec, Sources, Streams, Toc, Writer } from "@/components/travel/article/Article";
import { jpRange } from "@/components/travel/article/scene";
import { CITY_STREAMS } from "@/content/cityStreams";
import { travelArticle, travelArticleCrumbs, travelArticleShare, travelCity, travelPage, TRAVEL, TRAVEL_LABEL } from "@/content/travel";
import { ARTICLE as A } from "@/content/travel/armenia/yerevan-cascade";
import PageShell from "@/components/ui/PageShell";
import { JsonLd, articleLd } from "@/lib/jsonld";

import "@/components/travel/article/article.css";

/**
 * 記事「カスケードの大階段を上ってきた【2026年4〜5月】」。#1228。カスケードに行った2回（04-25 は夕日に間に合わせて駆け上がった日、05-22 はエスカレーターで上った日）を1枚に厚く書く
 * （あやと 2026-11-19「がっつり書いた行ったは、モーダルではなくページ遷移でもいい」）。街のガイドの窓には要約と「続きを読む」だけを残す。
 *
 * ## 誰が、何を調べて読むか
 *
 * - **読む人**: エレバンに数日いる個人旅行者が、前の晩に「カスケードは歩いて上るか、エスカレーターか」「夕日に合わせて行くか」を調べる
 * - **狙う語**: 「カスケード エレバン」「エレバン 大階段」「カスケード エスカレーター」
 * - **得て帰るもの**: 夕日まで残り20分で駆け上がった日・階段に座る人たち・上から見えた山・エスカレーターと止まっていた所、を2回の流れで
 *
 * **字は1つもここに書かない。** 記事の字は `content/travel/armenia/yerevan-cascade.ts`
 * （`python/guide_article.py` が台本 `python/data/guide/armenia/yerevan/cascade.json` と facts.json から焼く）。
 * 本文はあやとの一人称の旅の記録（`docs/guide-blog.md`）。並びはマトカ渓谷の記事と同じ部品。
 */

const COUNTRY = "armenia";
const CITY = "yerevan";
const SLUG = "cascade";
const PATH = travelArticle(COUNTRY, CITY, SLUG).href;

export const metadata: Metadata = travelArticleShare(COUNTRY, CITY, SLUG, {
  title: A.title,
  description: A.description,
});

/** 行った日（配信の日）。04-25 に夕日に駆け上がり、05-22 にもう一度行った。最初と最後の日 */
const FROM = "2026-04-25";
const TO = "2026-05-22";

/** 配信の一覧で、畳まずに見せる本数（場面をよく引いた回から） */
const STREAMS_OPEN = 2;

export default function YerevanCascadePage() {
  const country = travelPage(COUNTRY);
  const city = travelCity(COUNTRY, CITY);
  /* エレバンの回は、配信の一覧（cityStreams.ts）の「エレバン」と「セヴァン湖」の欄に分かれる（#1402 で滞在の回が街に寄った）。
     滞在の街の分けかたが変わっても引けるように、国の欄をまたいで探す（一覧に無ければ止めるのは同じ） */
  const all = Object.values(CITY_STREAMS[A.streams.country] ?? {}).flat();
  const cited = A.streams.videos.map((v) => {
    const s = all.find((x) => x.videoId === v);
    if (!s) throw new Error(`yerevan/cascade/page.tsx: 場面を引いた回 ${v} が配信の一覧（cityStreams.ts）に無い`);
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

        {/* 先に答え → 目次。行けるかだけ知りたい人は、答えの箱で帰れるように */}
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
