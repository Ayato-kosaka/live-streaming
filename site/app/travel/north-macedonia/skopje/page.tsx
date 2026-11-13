import type { Metadata } from "next";

import Embed from "@/components/travel/Embed";
import {
  CardView,
  Dishes,
  ExtLine,
  Hero,
  Keyword,
  Lines,
  MoveCard,
  NextRead,
  Nums,
  PriceTables,
  SECTION_HEAD,
  Says,
  Sec,
  Sources,
  StreamList,
  Toc,
  Writer,
} from "@/components/travel/Guide";
import { jpRange } from "@/components/travel/scene";
import Icon from "@/components/ui/Icon";
import PageShell from "@/components/ui/PageShell";
import { CITY_STREAMS } from "@/content/cityStreams";
import { AHEAD_COUNTRIES } from "@/content/countries";
import { travelCity, travelCityCrumbs, travelCityShare, travelPage, TRAVEL, TRAVEL_LABEL } from "@/content/travel";
import { guideOf } from "@/content/travel/guides";
import type { Local, Scene, Section } from "@/content/travel/types";
import { JsonLd, articleLd } from "@/lib/jsonld";

import "@/components/travel/guide.css";

/**
 * スコピエ（北マケドニア）——実際に行った人のガイド。#1203（親 #1196）。
 *
 * 型は `docs/guide-design.md`（節立て・部品・絵・言葉・検索と AI のための作り）。
 * **字は1つもここに書かない。** 街ごとの字は `content/travel/north-macedonia/skopje.ts`
 * （`python/guide_bake.py` が台本と facts.json から焼く）。ここが持つのは並びだけ。
 *
 * ## 公開前
 *
 * あやとが全部読んでから検索に出す（#1197 Q3）。印は `content/travel.ts` の `TRAVEL_CITIES` の
 * `draft`。付いているあいだ `robots` が `index: false`（`travelCityShare` が印から決める）で、
 * 索引・`/all`・国の面のカードにも出ない。
 *
 * ## 日付を焼いてよい理由
 *
 * 面に出る日付は全部「起きた日」（行った日・場面の日・公開・最終更新）で、いつ読んでも本当。
 * 「あと何日」のような、読む日で変わる字は置かない。
 */

const COUNTRY = "north-macedonia";
const CITY = "skopje";
const G = guideOf(COUNTRY, CITY);
const CITY_PATH = travelCity(COUNTRY, CITY).href;

export const metadata: Metadata = travelCityShare(COUNTRY, CITY, { title: G.title, description: G.description });

/**
 * 行った日。**国に入った日から、次の国に入った日まで**（`content/countries.ts`）。
 * facts の日付の範囲で切ると、抜いていない回の日（10/31〜）が抜けて、短く見える。
 */
function stayOf(slug: string): { from: string; to: string } {
  const all = [...AHEAD_COUNTRIES].sort((a, b) => a.entered.localeCompare(b.entered));
  const i = all.findIndex((c) => c.slug === slug);
  if (i < 0) throw new Error(`skopje/page.tsx: ${slug} が AHEAD_COUNTRIES に無い`);
  return { from: all[i].entered, to: all[i + 1]?.entered ?? all[i].entered };
}

/** 面の上で場面を引いた回と、引いた数（配信の一覧で、多い回を先に出す） */
function citedVideos(): Map<string, number> {
  const vs = new Map<string, number>([[G.embed.v, 1]]);
  const add = (s: Scene | null | undefined) => s && vs.set(s.v, (vs.get(s.v) ?? 0) + 1);
  G.nums.forEach((b) => add(b.at));
  for (const s of G.sections) {
    add(s.scene);
    [...s.lines, ...s.others].forEach((l) => add(l.at));
    s.quotes.forEach((q) => add(q.at));
    s.moves.forEach((m) => add(m.at));
    s.tables.forEach((t) => t.rows.forEach((r) => add(r.at)));
    [...s.cards, ...s.dishes, ...s.trips].forEach((c) => {
      c.lines.forEach((l) => add(l.at));
      [...c.quotes, ...c.more].forEach((q) => add(q.at));
    });
  }
  return vs;
}

/** 配信の一覧で、畳まずに見せる本数。**場面をよく引いた回から**（全部並べると、それだけで2画面になる） */
const STREAMS_OPEN = 5;

/** 目次の件数。**数は中身から数える**（手で書かない） */
function noteOf(s: Section): string {
  switch (s.id) {
    case "about":
      return `${s.lines.length + s.quotes.length}話`;
    case "move":
      return `${s.moves.length + s.lines.length}つ`;
    case "money":
      return `${s.tables.reduce((n, t) => n + t.rows.length, 0)}品の値段`;
    case "places":
      return `${s.cards.length + s.others.length}か所`;
    case "food":
      return `${s.dishes.length + s.others.length}品`;
    case "stay":
      return `${s.lines.length}つ`;
    case "caution":
      return `${s.cards.length}件`;
    case "trip":
      return `${s.trips.length}か所`;
  }
}

function Body({ s }: { s: Section }) {
  switch (s.id) {
    case "about":
      return (
        <>
          <Says qs={s.quotes} />
          <Lines lines={s.lines} />
          {s.ext.map((e) => (
            <ExtLine key={e.src} e={e} />
          ))}
        </>
      );
    case "move":
      return (
        <>
          {s.moves.map((m) => (
            <MoveCard key={`${m.from}-${m.to}`} m={m} />
          ))}
          <Lines lines={s.lines} />
        </>
      );
    case "money":
      return (
        <>
          <PriceTables tables={s.tables} />
          {s.keyword && <Keyword k={s.keyword} />}
          <Lines lines={s.lines} />
          <Says qs={s.quotes} />
        </>
      );
    case "places":
      return (
        <>
          <div className="tg-cards">
            {s.cards.map((c) => (
              <CardView key={c.key} c={c} kind="place" sizes="(min-width: 720px) 440px, 92vw" />
            ))}
          </div>
          {s.others.length > 0 && (
            <>
              <h3 className="tg-sub">ほかに歩いた所</h3>
              <Lines lines={s.others} />
            </>
          )}
        </>
      );
    case "food":
      return (
        <>
          <Dishes dishes={s.dishes} />
          <div className="tg-cards">
            {s.cards.map((c) => (
              <CardView key={c.key} c={c} kind="shop" sizes="(min-width: 720px) 440px, 92vw" />
            ))}
          </div>
          {s.others.length > 0 && (
            <>
              <h3 className="tg-sub">ほかに食べたもの</h3>
              <Lines lines={s.others} />
            </>
          )}
        </>
      );
    case "stay":
      return (
        <>
          <Lines lines={s.lines} />
          <Says qs={s.quotes} />
        </>
      );
    case "caution":
      return (
        <div className="tg-cards is-flat">
          {s.cards.map((c) => (
            <CardView key={c.key} c={c} kind="caution" sizes="92vw" />
          ))}
        </div>
      );
    case "trip":
      return (
        <div className="tg-cards">
          {s.trips.map((c) => (
            <CardView key={c.key} c={c} kind="trip" sizes="(min-width: 720px) 880px, 92vw" />
          ))}
        </div>
      );
  }
}

export default function SkopjePage() {
  const country = travelPage(COUNTRY);
  const stay = stayOf(COUNTRY);
  const streams = G.streams ? (CITY_STREAMS[G.streams.country]?.[G.streams.city] ?? []) : [];
  /* その街に居たあいだの回だけ（次の国へ着いた日の回は、次の国の話） */
  const mine = streams.filter((s) => s.date >= stay.from && s.date < stay.to);
  const cited = citedVideos();
  const top = [...mine]
    .sort((a, b) => (cited.get(b.videoId) ?? 0) - (cited.get(a.videoId) ?? 0))
    .slice(0, STREAMS_OPEN)
    .sort((a, b) => a.date.localeCompare(b.date));
  const embedTitle = mine.find((s) => s.videoId === G.embed.v)?.title;
  if (!embedTitle) throw new Error(`skopje/page.tsx: 埋め込みの回 ${G.embed.v} が配信の一覧（cityStreams.ts）に無い`);

  const toc = [
    ...G.sections.map((s) => ({ id: s.id, label: SECTION_HEAD[s.id].toc, icon: SECTION_HEAD[s.id].icon, note: noteOf(s) })),
    ...(mine.length ? [{ id: "streams", label: SECTION_HEAD.streams.toc, icon: SECTION_HEAD.streams.icon, note: `${mine.length}本` }] : []),
  ];
  const locals: { name: string; l: Local }[] = [
    ...(G.local ? [{ name: G.name, l: G.local }] : []),
    ...G.sections.flatMap((s) => [...s.cards, ...s.trips].flatMap((c) => (c.local ? [{ name: c.name, l: c.local }] : []))),
  ];
  const ext = [...G.sources, ...G.sections.flatMap((s) => [...s.ext, ...(s.keyword?.ext ?? [])])];

  return (
    <PageShell crumbs={travelCityCrumbs(COUNTRY, CITY)}>
      <JsonLd
        data={articleLd({
          path: CITY_PATH,
          headline: G.title,
          description: G.description,
          datePublished: G.published,
          dateModified: G.updated,
          image: G.cover?.src,
        })}
      />
      <article className="tg">
        <Hero
          name={G.name}
          local={G.local}
          lead={G.lead}
          cover={G.cover}
          went={{ ...stay, text: jpRange(stay.from, stay.to) }}
          published={G.published}
          updated={G.updated}
        />

        <Embed v={G.embed.v} t={G.embed.t} title={embedTitle} date={G.embed.date} play={<Icon name="play" size={30} />} />

        <Nums nums={G.nums} />

        <Toc items={toc} />

        {G.sections.map((s, i) => (
          <Sec key={s.id} id={s.id} n={i + 1} head={SECTION_HEAD[s.id]} answer={s.answer} scene={s.scene}>
            <Body s={s} />
          </Sec>
        ))}

        {mine.length > 0 && (
          <Sec id="streams" n={G.sections.length + 1} head={{ ...SECTION_HEAD.streams, h: `${G.name}${SECTION_HEAD.streams.h}` }}>
            <StreamList cited={top} rest={mine.filter((s) => !top.includes(s))} />
          </Sec>
        )}

        <Writer />
        <Sources ext={ext} locals={locals} />
        <NextRead
          items={[
            { href: country.href, title: country.name, note: "国の案内。ことば・食べもの・お金", icon: "mountain" },
            { href: TRAVEL, title: TRAVEL_LABEL, note: "あやとが歩いた国の記録", icon: "globe" },
          ]}
        />
      </article>
    </PageShell>
  );
}
