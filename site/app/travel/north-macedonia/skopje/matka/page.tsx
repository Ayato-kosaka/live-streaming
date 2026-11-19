import type { Metadata } from "next";

import { Body, Head, NextRead, Points, SceneButton, Sec, Sources, Streams, Toc, Writer } from "@/components/travel/article/Article";
import { jpDate } from "@/components/travel/article/scene";
import { CITY_STREAMS } from "@/content/cityStreams";
import { travelArticle, travelArticleCrumbs, travelArticleShare, travelCity, travelPage, TRAVEL, TRAVEL_LABEL } from "@/content/travel";
import { ARTICLE as A } from "@/content/travel/north-macedonia/skopje-matka";
import PageShell from "@/components/ui/PageShell";
import { JsonLd, articleLd } from "@/lib/jsonld";

import "@/components/travel/article/article.css";

/**
 * 記事「マトカ渓谷に行ってきた」。#1228。行った日の話を厚く書く1枚（あやと 2026-11-19「マトカ渓谷の行ったがかなり寂しい。
 * がっつり書いた行ったは、モーダルではなくページ遷移でもいい」）。街のガイドの窓には要約と「続きを読む」だけを残す。
 *
 * ## 誰が、何を調べて読むか
 *
 * - **読む人**: スコピエに2〜4日いる個人旅行者が、前の晩に「マトカ渓谷へ路線バスで行って帰ってこられるか」「ボートは乗れるか」を調べる
 * - **狙う語**: 「マトカ渓谷 行き方」「マトカ渓谷 バス」「マトカ渓谷 ボート」
 * - **得て帰るもの**: 60番のバス・手前で降ろされることがある・ボートは5人集まるまで出ない・帰りのバスが無くなる、を1日の流れで
 *
 * **字は1つもここに書かない。** 記事の字は `content/travel/north-macedonia/skopje-matka.ts`
 * （`python/guide_article.py` が台本 `python/data/guide/north-macedonia/skopje/matka.json` と facts.json から焼く）。
 * 本文はあやとの一人称の旅の記録（`docs/guide-blog.md`）。並びは物価の記事と同じ部品で、値段の表と1日の合計は無い。
 */

const COUNTRY = "north-macedonia";
const CITY = "skopje";
const SLUG = "matka";
const PATH = travelArticle(COUNTRY, CITY, SLUG).href;

export const metadata: Metadata = travelArticleShare(COUNTRY, CITY, SLUG, {
  title: A.title,
  description: A.description,
});

/** 行った日（配信の日）。行った箱の日付と同じ1日 */
const DAY = "2026-10-24";

/** 配信の一覧で、畳まずに見せる本数（場面をよく引いた回から） */
const STREAMS_OPEN = 2;

export default function SkopjeMatkaPage() {
  const country = travelPage(COUNTRY);
  const city = travelCity(COUNTRY, CITY);
  const all = CITY_STREAMS[A.streams.country]?.[A.streams.city] ?? [];
  const cited = A.streams.videos.map((v) => {
    const s = all.find((x) => x.videoId === v);
    if (!s) throw new Error(`skopje/matka/page.tsx: 場面を引いた回 ${v} が配信の一覧（cityStreams.ts）に無い`);
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
          went={{ from: DAY, text: jpDate(DAY) }}
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
