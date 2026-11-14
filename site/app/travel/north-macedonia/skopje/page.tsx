import { existsSync } from "node:fs";
import path from "node:path";

import type { Metadata } from "next";

import Embed from "@/components/travel/Embed";
import {
  Articles,
  Basics,
  Hero,
  Intro,
  Legend,
  NextRead,
  Nums,
  SECTION_HEAD,
  Sec,
  Sources,
  StreamList,
  Tiles,
  Toc,
  Todos,
  Writer,
} from "@/components/travel/Guide";
import { jpRange } from "@/components/travel/scene";
import Icon from "@/components/ui/Icon";
import PageShell from "@/components/ui/PageShell";
import { CITY_STREAMS } from "@/content/cityStreams";
import { AHEAD_COUNTRIES } from "@/content/countries";
import { travelCity, travelCityCrumbs, travelCityShare, travelPage, TRAVEL, TRAVEL_LABEL } from "@/content/travel";
import { guideOf } from "@/content/travel/guides";
import type { Item, Photo, Scene, Section, Src } from "@/content/travel/types";
import { JsonLd, articleLd } from "@/lib/jsonld";

import "@/components/travel/guide.css";

/**
 * スコピエ（北マケドニア）の街の面（ハブ）。#1203（親 #1196）。
 *
 * ## 誰が、何を調べて読むか（`docs/seo-2026-11/G_skopje_intent.md` 5章・6章）
 *
 * **この面は「スコピエで何をする？」に答えるハブ。** 頭の語（スコピエ 観光）で大手に勝とうとしない。
 * 勝てる問い（物価・マトカ渓谷の行き方・安い店）は、1枚ずつの記事で深く答え、ここは入口になる。
 *
 * | 読む人 | いつ・何に困って | ここで得て満足するもの |
 * | --- | --- | --- |
 * | ① バルカンを周る20〜30代の個人旅行者（**いちばん大事**） | ティラナかソフィアを出る1〜2週間前。スコピエに何日寄って何をするか決めかねている | 見どころ・食べもの・買いものの骨組みと、1日いくらか・現金かカードか |
 * | ② スコピエに2〜4日いる旅行者 | 前の晩。マトカ渓谷へ路線バスで行って帰ってこられるか | 60番のバス・手前で降ろされること・ボートの人数・終バス |
 * | ③ 着いたばかりの節約派 | 今晩どこで安く食べるか | 食堂・ケバブ・パン屋・スーパーで何がいくらか |
 * | ④ 10〜11月に1か月ほど住むノマド | どれくらい寒いか・宿の長期割・祝日に何が閉まるか | 気候・防寒具の値段・宿・祝日 |
 *
 * 狙う語: **スコピエ 観光／スコピエ 見どころ／スコピエ 食べ物／北マケドニア 物価／マトカ渓谷**。
 * 競合の上位3件は、2019年の ca-voir（値段が古い）・2025年の半日の街歩き（食事と物価が無い）・
 * 日付の無いまとめ。こちらが勝つのは「行く前のガイド」と「2026年10月に暮らした人の話と値段」が1枚に在ること。
 *
 * ## 作り（2026-11-14 の作り直し。`docs/island-misses.md` #323）
 *
 * 最初の面は「配信の事実を並べた記録」で、あやとに30点と言われた。いまは `/bulgaria` と同じ骨組み
 * （見たい・食べたい・買いたい・したい・基本情報）に、行った所だけ話と写真を乗せる。
 * **行っていない所も骨組みから消さない。** 本人の一言は節に1つ、場面のリンクは行った所ごとに1つ。
 *
 * **字は1つもここに書かない。** 街ごとの字は `content/travel/north-macedonia/skopje.ts`
 * （`python/guide_bake.py` が台本 `python/data/guide/north-macedonia/skopje.json` と facts.json から焼く）。
 *
 * ## 公開前
 *
 * あやとが全部読んでから検索に出す（#1197 Q3）。印は `content/travel.ts` の `TRAVEL_CITIES` の
 * `draft`。付いているあいだ `robots` が `index: false`（`travelCityShare` が印から決める）で、
 * 索引・`/all`・国の面のカードにも出ない。
 *
 * ## 日付を焼いてよい理由
 *
 * 面に出る日付は全部「起きた日」（行った日・場面の日・見た日・公開・最終更新）で、いつ読んでも本当。
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
  add(G.intro.went.at);
  for (const s of G.sections) {
    add(s.quote?.at);
    s.items.forEach((it) => {
      add(it.went?.at);
      it.went?.rows.forEach((r) => add(r.at));
    });
  }
  return vs;
}

/** 配信の一覧で、畳まずに見せる本数。**場面をよく引いた回から**（全部並べると、それだけで2画面になる） */
const STREAMS_OPEN = 5;

/**
 * 記事の面が在るか。**まだ無い記事の入口を出さない**（押して 404 になる札を置かない）。
 * 書き出しのときに `app/` の下を見る。記事の担当が面を足した次の書き出しから、札がひとりでに出る
 */
function hasPage(href: string): boolean {
  return existsSync(path.join(process.cwd(), "app", ...href.split("/").filter(Boolean), "page.tsx"));
}

/** 目次の件数。**数は中身から数える**（手で書かない） */
function noteOf(s: Section): string {
  const went = s.items.filter((it) => it.went?.stamp === "行った").length;
  const n = `${s.items.length}${s.id === "eat" ? "品" : s.id === "basics" ? "件" : s.id === "see" ? "か所" : "つ"}`;
  return went ? `${n}・行った${went}` : n;
}

function Body({ s }: { s: Section }) {
  switch (s.id) {
    case "see":
      return <Tiles items={s.items} rest="あやとが歩いて見つけた所" />;
    case "eat":
      return <Tiles items={s.items} rest="あやとが入った店" />;
    case "buy":
      return <Tiles items={s.items} rest="あやとが買ったもの" />;
    case "todo":
      return <Todos items={s.items} />;
    case "basics":
      return <Basics items={s.items} />;
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
  const articles = G.articles.filter((a) => hasPage(a.href));

  const all: Item[] = G.sections.flatMap((s) => s.items);
  const marked = all.filter((it) => it.mark);
  const went = all.filter((it) => it.went?.stamp === "行った").length;
  const toc = [
    ...G.sections.map((s) => ({ id: s.id, label: SECTION_HEAD[s.id].toc, icon: SECTION_HEAD[s.id].icon, note: noteOf(s) })),
    ...(articles.length ? [{ id: "articles", label: SECTION_HEAD.articles.toc, icon: SECTION_HEAD.articles.icon, note: `${articles.length}本` }] : []),
    ...(mine.length ? [{ id: "streams", label: SECTION_HEAD.streams.toc, icon: SECTION_HEAD.streams.icon, note: `${mine.length}本` }] : []),
  ];
  /* 出どころの一覧。同じ URL は1回だけ（見た日は全部同じ日に揃えてある） */
  const src = new Map<string, Src>();
  [...G.intro.ext.src, ...G.rate.src, ...all.flatMap((it) => it.src)].forEach((e) => src.has(e.url) || src.set(e.url, e));
  const lent: { name: string; p: Photo }[] = all.flatMap((it) => (it.photo?.page ? [{ name: it.name, p: it.photo }] : []));

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

        <Intro ext={G.intro.ext} went={G.intro.went} />

        <Nums nums={G.nums} />

        <Toc items={toc} />

        <Legend
          good={marked.filter((it) => it.mark === "good").length}
          warn={marked.filter((it) => it.mark === "warn").length}
          went={went}
          rate={G.rate}
        />

        {G.sections.map((s, i) => (
          <Sec
            key={s.id}
            id={s.id}
            n={i + 1}
            head={SECTION_HEAD[s.id]}
            note={noteOf(s)}
            lead={s.lead}
            quote={s.quote}
            quoteOf={s.quoteOf}
          >
            <Body s={s} />
          </Sec>
        ))}

        {articles.length > 0 && (
          <Sec id="articles" n={G.sections.length + 1} head={SECTION_HEAD.articles}>
            <Articles items={articles} />
          </Sec>
        )}

        {mine.length > 0 && (
          <Sec
            id="streams"
            n={G.sections.length + (articles.length ? 2 : 1)}
            head={{ ...SECTION_HEAD.streams, h: `${G.name}${SECTION_HEAD.streams.h}` }}
            note={`${mine.length}本`}
          >
            <Embed v={G.embed.v} t={G.embed.t} title={embedTitle} date={G.embed.date} play={<Icon name="play" size={30} />} />
            <StreamList cited={top} rest={mine.filter((s) => !top.includes(s))} />
          </Sec>
        )}

        <Writer />
        <Sources src={[...src.values()]} photos={lent} />
        <NextRead
          items={[
            { href: country.href, title: country.name, note: "国の案内。ことば・食べもの・街の外", icon: "mountain" },
            { href: TRAVEL, title: TRAVEL_LABEL, note: "あやとが歩いた国の記録", icon: "globe" },
          ]}
        />
      </article>
    </PageShell>
  );
}
