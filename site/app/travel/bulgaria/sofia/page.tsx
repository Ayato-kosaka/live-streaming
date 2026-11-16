import type { Metadata } from "next";
import Link from "next/link";

import About from "@/components/guidebook/About";
import Basics from "@/components/guidebook/Basics";
import Cover from "@/components/guidebook/Cover";
import { Buy, Eat, See } from "@/components/guidebook/Items";
import SheetHost from "@/components/guidebook/SheetHost";
import Sources from "@/components/guidebook/Sources";
import Toc, { tocOf } from "@/components/guidebook/Toc";
import Todo from "@/components/guidebook/Todo";
import Videos, { VideoLds } from "@/components/guidebook/Videos";
import StickyNotes from "@/components/live/Notes";
import Icon from "@/components/ui/Icon";
import PageShell from "@/components/ui/PageShell";
import { SOFIA } from "@/content/guidebook/bulgaria-sofia";
import { readDrawn, todoPic } from "@/content/guidebook/manifest";
import { travelCity, travelCityCrumbs, travelCityShare } from "@/content/travel";
import { JsonLd, articleLd } from "@/lib/jsonld";

import "@/components/guidebook/guidebook.css";

/**
 * ソフィア（ブルガリア）のガイドブック。#1228
 *
 * ## 前の `/bulgaria` を土台に、道を移した（2026-11-15）
 *
 * あやと（#1228）:「いまのやつをベースに書き換える感じ。いまのやつのルーティングかえて良いよ」。
 * 中身と出どころは前の面のまま引き継ぎ、並びをガイドブックの型にした。`/bulgaria` は 301 でここへ
 * （`firebase.json`）。**前の面の錨（`#see` `#eat` `#todo` `#buy` `#about` `#basics` `#words` `#toc`）は、
 * ここでも同じ節に当たる**（貼られたリンクが、移った先で同じ所に着く）。
 *
 * ## 並び（#1228 の表）
 *
 * 表紙 → 目次 → どんな街 → やりたいこと8選 → 見たいもの → 食べたいもの → 買いたいもの → 基本情報 → この街の動画。
 * 1枚がごちゃつかないように、詳しい中身は**開く窓**（`Sheet`）と畳みに入れ、面に出す字を減らした
 * （あやと「1枚のページでごちゃごちゃにならないように、畳み込みやモーダルを使って綺麗に」）。
 *
 * **字は1つもここに書かない。** 街の中身は `content/guidebook/bulgaria-sofia.ts`、部品は
 * `components/guidebook/`。描いた絵（表紙・エリア地図・やりたいこと・料理・土産）は `public/guide/bulgaria/sofia/manifest.json`
 * から読み、無ければ借りた写真か色の札に落ちる。
 *
 * ## あやとはこの面を持って、ソフィアを歩いている
 *
 * 前の面の役目（現地で使える）を欠かさない: 見たい・食べたい・買いたいの地図（マイマップ）・
 * 名前で開く Google マップ・入場料と行き方・ことば・付箋。
 */

const G = SOFIA;
const CITY = travelCity(G.country, G.city);

export const metadata: Metadata = travelCityShare(G.country, G.city, { title: G.title, description: G.description });

export default function SofiaPage() {
  const drawn = readDrawn(G.country, G.city);
  /* 描いた絵があれば、やりたいこと・料理・土産の絵を差し替える（**見たいもの＝実在の場所は写真のまま**。#1228 Q1 の A） */
  const g = {
    ...G,
    todo: G.todo.map((t) => {
      const pic = todoPic(drawn, t);
      return pic ? { ...t, pic } : t;
    }),
    eat: { ...G.eat, items: G.eat.items.map((it) => (drawn.food[it.id] ? { ...it, pic: drawn.food[it.id] } : it)) },
    buy: { ...G.buy, items: G.buy.items.map((it) => (drawn.buy[it.id] ? { ...it, pic: drawn.buy[it.id] } : it)) },
  };
  const usedDrawn = !!(drawn.cover || drawn.areamap || [drawn.do, drawn.food, drawn.buy].some((d) => Object.keys(d).length));
  const toc = tocOf(g);
  return (
    <PageShell crumbs={travelCityCrumbs(G.country, G.city)}>
      <JsonLd
        data={articleLd({
          path: CITY.href,
          headline: G.title,
          description: G.description,
          datePublished: G.published,
          dateModified: G.updated,
          image: (drawn.cover ?? G.cover).src,
        })}
      />
      <VideoLds g={g} />
      <article className="gb">
        <Cover g={g} drawn={drawn} />
        <Toc items={toc} />
        <About g={g} drawn={drawn} n={1} />
        <Todo g={g} n={2} />
        <See g={g} n={3} />
        <Eat g={g} n={4} />
        <Buy g={g} n={5} />
        <Basics g={g} n={6} />
        {/* 面のいちばん下。導線は「検索 → ブログ → ショート → アーカイブ → ライブ」（あやと #1228） */}
        <Videos g={g} n={7} />
        <Sources g={g} drawn={usedDrawn} />
      </article>

      {/* 付箋。**宛先の id（`bulgaria`）は Firestore に入っているので変えない**（`content/themes.ts`） */}
      <StickyNotes theme="bulgaria" title="ソフィアでこれやって" />

      <p className="gb-back">
        <Link prefetch={false} href="/">
          <Icon name="left" size={15} />
          島へ戻る
        </Link>
      </p>
      <SheetHost />
    </PageShell>
  );
}
