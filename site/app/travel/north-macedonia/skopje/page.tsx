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
import Icon, { type IconName } from "@/components/ui/Icon";
import PageShell from "@/components/ui/PageShell";
import { AHEAD_COUNTRIES } from "@/content/countries";
import { coverShare, readDrawn, todoPic } from "@/content/guidebook/manifest";
import { SKOPJE } from "@/content/guidebook/north-macedonia-skopje";
import { TRAVEL_ARTICLES, travelCity, travelCityCrumbs, travelCityShare } from "@/content/travel";
import { articleOf } from "@/content/travel/articles";
import { JsonLd, articleLd } from "@/lib/jsonld";

import "@/components/guidebook/guidebook.css";

/**
 * スコピエ（北マケドニア）のガイドブック。#1228（前は #1203 のハブ）
 *
 * ## 行ったあとの最初の街
 *
 * 骨組みはソフィアと同じガイドブック（表紙 → 目次 → どんな街 → やりたいこと → 見たい → 食べたい → 買いたい →
 * 基本情報 → この街の動画）。そこに、あやとが行った記録（ブログ）を乗せる: 行った項目に「行った」の印・その日の
 * あやと島カードの写真・短い話・① ショート → ② 配信の場面。一言は1節に1つまで（`docs/guide-design.md` ★）。
 * **行っていない所も骨組みから消さない。**
 *
 * ## 誰が、何を調べて読むか
 *
 * 読む人と狙う語は組み立て（`python/data/guide/north-macedonia/skopje/compose.json` の `persona` `terms`）。
 * いちばん大事なのは、ティラナかソフィアを出る前に「スコピエに何日寄って何をするか」を決めかねている、
 * バルカンを安く回る個人旅行者。狙う語は スコピエ 観光／スコピエ 見どころ／北マケドニア 物価／マトカ渓谷。
 *
 * **字は1つもここに書かない。** 中身は `content/guidebook/north-macedonia-skopje.ts`
 * （`python/guidebook_bake.py` が材料 `guidebook.json`・組み立て `compose.json`・facts から焼く）、部品は `components/guidebook/`。
 * 描いた絵（表紙・見どころマップ・行っていないやりたいこと・料理・土産）は `public/guide/north-macedonia/skopje/manifest.json`
 * から読み、無ければ写真か色の札に落ちる。マイマップは見たい・食べたい・買いたいの3枚（`mymaps/mids.json`）。
 *
 * ## ソフィアの型（2026-11-18。#1228）
 *
 * 言葉は `docs/guide-copy.md` の型（キャッチは型3「マザー・テレサが生まれた街」）、やりたいことは「〜したい！」の7つで
 * 札は全部 4:3・縦1列・印は値段と季節だけ、どんな街は2つの問い（日本語のガイドがスコピエを語る地震と建て直し・川を境にした
 * 旧市街と新市街。2026-11-18 #1228）、題は「スコピエ観光ガイド」で表紙の絵に題を焼いた、見どころマップは地区名を焼いた D2 の絵地図
 * （旧市街・新市街。日本語の頁の分けかた）、見たいもの22か所の名札（座標つき）。ソフィアと同じ部品で、街の字は焼いた中身だけ。
 *
 * ## 公開前
 *
 * あやとが読んで OK を出すまで検索に出さない（`content/travel.ts` の `draft`。`robots` が `index: false`、
 * 索引・`/all`・国の面のカードにも出ない）。
 */

const G = SKOPJE;
const CITY = travelCity(G.country, G.city);

/* 貼られたときの絵は、題を焼いた表紙（あやと 2026-11-18 #1228。焼いていなければ国の1枚のまま） */
const DRAWN = readDrawn(G.country, G.city);
export const metadata: Metadata = coverShare(
  travelCityShare(G.country, G.city, { title: G.title, description: G.description }),
  DRAWN,
  DRAWN.cover?.alt ?? G.title,
);

/**
 * 居た期間。**国に入った日から、次の国に入った日まで**（`content/countries.ts`）。
 * facts の日付で切ると、抜いていない回の日が抜けて短く見える
 */
function stayOf(slug: string): { from: string; to: string } {
  const all = [...AHEAD_COUNTRIES].sort((a, b) => a.entered.localeCompare(b.entered));
  const i = all.findIndex((c) => c.slug === slug);
  if (i < 0) throw new Error(`skopje/page.tsx: ${slug} が AHEAD_COUNTRIES に無い`);
  return { from: all[i].entered, to: all[i + 1]?.entered ?? all[i].entered };
}

/**
 * この街の記事（物価など）への札。**公開前の印どうしで繋ぐ**——公開した街の面から、公開前の記事へは繋がない。
 * 街も記事も公開前なら繋ぐ（あやとが読むときに辿れるように）。記事の印を外した日に、札がひとりでに出る
 */
function articlesOf(country: string, city: string): { href: string; title: string; note: string; icon: IconName }[] {
  const cityDraft = !!travelCity(country, city).draft;
  return TRAVEL_ARTICLES.filter((a) => a.country === country && a.city === city && (!a.draft || cityDraft)).map((a) => {
    const x = articleOf(a.country, a.city, a.slug);
    return { href: a.href, title: x.h1[0], note: x.h1.slice(1).join(""), icon: x.answer.icon };
  });
}

export default function SkopjePage() {
  const drawn = DRAWN;
  const articles = articlesOf(G.country, G.city);
  const prices = articles.find((a) => a.href === G.basics.budget.article);
  /* 描いた絵があれば、やりたいこと・料理・土産の絵を差し替える。**行った項目はその日の写真のまま**（あやとが撮ったものが先）。
     行ったのにその日の写真が無い品（箱入りクッキー・防寒具・ドネル・ケバブ…）は、描いた絵に落とす。前は字1つの色の札で、
     行った品ほど絵が無く見えた（2026-11-18、本番の 390 幅で6枚） */
  const swap = <T extends { went?: unknown; pic?: unknown }>(it: T, pic?: (typeof drawn.food)[string]) =>
    pic && (!it.went || !it.pic) ? { ...it, pic } : it;
  const g = {
    ...G,
    stay: stayOf(G.country),
    todo: G.todo.map((t) => swap(t, todoPic(drawn, t))),
    eat: { ...G.eat, items: G.eat.items.map((it) => swap(it, drawn.food[it.id])) },
    buy: { ...G.buy, items: G.buy.items.map((it) => swap(it, drawn.buy[it.id])) },
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
      {/* 見たいもの22か所の名札（名前・座標・窓への錨）。ソフィアと同じ（#1262） */}
      <SpotsLd g={g} path={CITY.href} />
      <article className="gb">
        <Cover g={g} drawn={drawn} />
        <Toc items={toc} />
        <About g={g} drawn={drawn} n={1} />
        <Todo g={g} n={2} />
        <See g={g} n={3} />
        <Eat g={g} n={4} />
        <Buy g={g} n={5} />
        <Basics g={g} n={6} article={prices && { href: prices.href, title: prices.title }} />
        {/* 面のいちばん下。導線は「検索 → ブログ → ショート → アーカイブ → ライブ」（あやと #1228） */}
        <Videos g={g} n={7} articles={articles} />
        <Sources g={g} drawn={usedDrawn} />
      </article>

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
