import type { Metadata } from "next";
import Link from "next/link";

import About from "@/components/guidebook/About";
import Basics from "@/components/guidebook/Basics";
import Cover from "@/components/guidebook/Cover";
import { Buy, Eat, See } from "@/components/guidebook/Items";
import SheetHost from "@/components/guidebook/SheetHost";
import Sources from "@/components/guidebook/Sources";
import SpotsLd from "@/components/guidebook/SpotsLd";
import Toc, { tocOf } from "@/components/guidebook/Toc";
import Todo from "@/components/guidebook/Todo";
import Videos, { VideoLds } from "@/components/guidebook/Videos";
import StickyNotes from "@/components/live/Notes";
import Writer from "@/components/travel/article/Writer";
import Icon from "@/components/ui/Icon";
import PageShell from "@/components/ui/PageShell";
import { SOFIA } from "@/content/guidebook/bulgaria-sofia";
import { GUIDE_BY, firstWent } from "@/content/guidebook/heading";
import { coverShare, readDrawn, todoPic } from "@/content/guidebook/manifest";
import type { Pic } from "@/content/guidebook/types";
import { travelArticle, travelCity, travelCityCrumbs, travelCityShare } from "@/content/travel";
import { articleOf } from "@/content/travel/articles";
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
 *
 * ## 行ったあとの肉付け（2026-11-19。スコピエの形）
 *
 * 行った項目に「行った」の印・その日のあやと島カード・短い話・配信の場面が乗る（`content/guidebook/bulgaria-sofia-went.ts`。
 * 焼くのは `python/guidebook_went.py`）。**行っていない所も骨組みから消さない。**
 */

const G = SOFIA;
const CITY = travelCity(G.country, G.city);
/* 物価の記事（#1262）。1日の予算の下から、払った額を品ごとに見に行けるように */
const PRICES = { href: travelArticle(G.country, G.city, "prices").href, title: articleOf(G.country, G.city, "prices").h1[0] };

/* 貼られたときの絵は、字の無い表紙（#332 の決めごと3。題を焼いた絵は面の表紙と画像検索に。描いていなければ国の1枚のまま） */
const DRAWN = readDrawn(G.country, G.city);
export const metadata: Metadata = coverShare(
  travelCityShare(G.country, G.city, { title: G.title, description: G.description }),
  DRAWN,
  DRAWN.cover?.alt ?? G.title,
);

export default function SofiaPage() {
  const drawn = DRAWN;
  /* 描いた絵があれば、やりたいこと・料理・土産の絵を差し替える（**見たいもの＝実在の場所は写真のまま**。#1228 Q1 の A）。
     **行った項目のその日のカードは差し替えない**（あやとが撮ったものが先。スコピエと同じ）。カードの無い日の行った項目は描いた絵のまま */
  const swap = <T extends { pic?: Pic }>(it: T, pic?: Pic) => (pic && it.pic?.kind !== "card" ? { ...it, pic } : it);
  const g = {
    ...G,
    todo: G.todo.map((t) => swap(t, todoPic(drawn, t))),
    eat: { ...G.eat, items: G.eat.items.map((it) => swap(it, drawn.food[it.id])) },
    buy: { ...G.buy, items: G.buy.items.map((it) => swap(it, drawn.buy[it.id])) },
  };
  const usedDrawn = !!(drawn.cover || drawn.areamap || [drawn.do, drawn.food, drawn.buy].some((d) => Object.keys(d).length));
  const toc = tocOf(g);
  /* 行った最初の日（配信の facts から焼いた「行った」のいちばん早い日）。**居た期間と日数は出さない**——
     あやとはまだソフィアに居て、終わりの日と日数は時間で変わる字になる（書き出しに焼くと、次の日から嘘になる） */
  const went = firstWent(g);
  return (
    <PageShell crumbs={travelCityCrumbs(G.country, G.city)}>
      <JsonLd
        data={articleLd({
          path: CITY.href,
          headline: G.title,
          description: G.description,
          datePublished: G.published,
          dateModified: G.updated,
          /* 記事の絵は字の無い表紙の 16:9・4:3・1:1（Google の Article の手引き。#332）。切っていなければ表紙の1枚 */
          image: drawn.ld.length ? drawn.ld.map((x) => x.src) : (drawn.cover ?? G.cover).src,
        })}
      />
      <VideoLds g={g} />
      {/* 見たいもの22か所の名札（名前・座標・窓への錨）。#1262 */}
      <SpotsLd g={g} path={CITY.href} />
      <article className="gb">
        <Cover g={g} drawn={drawn} />
        <Toc items={toc} />
        <About g={g} drawn={drawn} n={1} />
        <Todo g={g} n={2} />
        <See g={g} n={3} />
        <Eat g={g} n={4} />
        <Buy g={g} n={5} />
        <Basics g={g} n={6} article={PRICES} />
        {/* 面のいちばん下。導線は「検索 → ブログ → ショート → アーカイブ → ライブ」（あやと #1228） */}
        <Videos g={g} n={7} />
        {/* 書き手の枠（記事の面と同じ。検索の上位の 7割が書き手を見せている。#1262）。行った日は配信の facts から（スコピエと同じ） */}
        <Writer by={went ? GUIDE_BY.after : GUIDE_BY.before} went={went ? { city: G.name, from: went } : undefined} />
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
