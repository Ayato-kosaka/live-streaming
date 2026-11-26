import type { Metadata } from "next";

import { Body, Head, NextRead, Points, SceneButton, Sec, Shorts, Sources, Streams, Toc, Writer, shownShorts } from "@/components/travel/article/Article";
import { jpDate } from "@/components/travel/article/scene";
import { CITY_STREAMS } from "@/content/cityStreams";
import { travelArticle, travelArticleCrumbs, travelArticleShare, travelCity, travelPage, TRAVEL, TRAVEL_LABEL } from "@/content/travel";
import { ARTICLE as A } from "@/content/travel/bulgaria/sofia-biryani";
import PageShell from "@/components/ui/PageShell";
import { JsonLd, articleLd } from "@/lib/jsonld";

import "@/components/travel/article/article.css";

/**
 * 記事「ソフィアの宿の共同キッチンでビリヤニを作ってきた【2026年11月】」。#1453。ショートの行き先の1枚（あやと 2026-11-26「ショート投稿する時に、あやと島の記事書いて欲しい…
 * あやと島カードの写真も使って…記事をショートと本編からリンクして、記事からショートをリンクする双方向」）。②ビリヤニのショート（2026-11-18 の配信 sOvaH0tBzSg から）。
 * 型はバニツァ（`../banitsa/page.tsx`）と同じで、「この記事のショート」の欄だけ足してある（ショートの URL が空の間は出ない）。
 *
 * - **読む人**: 長く旅をしていて宿の共同キッチンで自炊したい人が「宿のキッチンでビリヤニは作れるか・どこでつまずくか」を調べる
 * - **狙う語**: 海外 自炊 ビリヤニ／ホステル キッチン 料理／ソフィア ホステル 自炊
 *
 * **字は1つもここに書かない。** 記事の字は `content/travel/bulgaria/sofia-biryani.ts`（`python/guide_article.py` が台本
 * `python/data/guide/bulgaria/sofia/biryani.json` と facts.json から焼く）。本文はあやとの一人称の旅の記録（`docs/guide-blog.md`）。
 */

const COUNTRY = "bulgaria";
const CITY = "sofia";
const SLUG = "biryani";
const PATH = travelArticle(COUNTRY, CITY, SLUG).href;

export const metadata: Metadata = travelArticleShare(COUNTRY, CITY, SLUG, {
  title: A.title,
  description: A.description,
});

/** 行った日（配信の日）。行った箱の日付と同じ1日 */
const DAY = "2026-11-18";

/** 配信の一覧で、畳まずに見せる本数（場面をよく引いた回から） */
const STREAMS_OPEN = 2;

export default function SofiaBiryaniPage() {
  const country = travelPage(COUNTRY);
  const city = travelCity(COUNTRY, CITY);
  const all = CITY_STREAMS[A.streams.country]?.[A.streams.city] ?? [];
  const cited = A.streams.videos.map((v) => {
    const s = all.find((x) => x.videoId === v);
    if (!s) throw new Error(`sofia/biryani/page.tsx: 場面を引いた回 ${v} が配信の一覧（cityStreams.ts）に無い`);
    return s;
  });
  const ext = A.sections.flatMap((s) => s.keyword?.ext ?? []);
  const n = A.sections.length + 2;
  /** この記事のショート（#1453）。名簿に在る（公開された）ものだけ。空の間は欄も目次の行も出さない */
  const shorts = shownShorts(A.shorts ?? []);

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
            ...(shorts.length ? [{ id: "shorts", label: "この記事のショート", icon: "film" as const }] : []),
            { id: "streams", label: "この記事の配信", icon: "youtube" as const },
          ]}
        />

        {A.sections.map((s, i) => (
          <Sec key={s.id} id={s.id} n={i + 2} icon={s.icon} h={s.h} answer={s.answer}>
            <Body blocks={s.body} sizes="(min-width: 720px) 520px, 92vw" />
            {s.scene && <SceneButton at={s.scene} />}
          </Sec>
        ))}

        {shorts.length > 0 && (
          <Sec id="shorts" n={n} icon="film" h="この記事のショート">
            <Shorts shorts={shorts} />
          </Sec>
        )}

        <Sec id="streams" n={shorts.length ? n + 1 : n} icon="youtube" h="この記事の配信">
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
