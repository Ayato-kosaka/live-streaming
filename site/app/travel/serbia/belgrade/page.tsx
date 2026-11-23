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
import Writer from "@/components/travel/article/Writer";
import StickyNotes from "@/components/live/Notes";
import Icon from "@/components/ui/Icon";
import PageShell from "@/components/ui/PageShell";
import { GUIDE_BY, firstWent } from "@/content/guidebook/heading";
import { coverShare, dress, readDrawn } from "@/content/guidebook/manifest";
import { BELGRADE } from "@/content/guidebook/serbia-belgrade";
import { travelCity, travelCityCrumbs, travelCityShare } from "@/content/travel";
import { JsonLd, articleLd } from "@/lib/jsonld";

import "@/components/guidebook/guidebook.css";

/**
 * ベオグラード（セルビア）のガイドブック。#1228
 *
 * ## 行く前の街
 *
 * あやとがセルビアへ移る日はまだ決まっていない。行く前なので、骨組み
 * （どんな街 → やりたいこと → 見たい → 食べたい → 買いたい → 基本情報）だけで、行った印・カード・話・一言は無い。
 * 行ったら、スコピエと同じく配信の facts を材料に結んで焼き直す（`docs/guide-design.md` ★4-2）。
 *
 * ## 誰が、何を調べて読むか
 *
 * 読む人と狙う語は組み立て（`python/data/guide/serbia/belgrade/compose.json` の `persona` `terms`）。
 * いちばん大事なのは、ブカレストかソフィアから「ベオグラードに何日寄って何をするか」を決めかねている、
 * バルカンを安く回る個人旅行者。狙う語は ベオグラード 観光／ベオグラード 見どころ／ベオグラード 地図／ベオグラード グルメ。
 *
 * **字は1つもここに書かない。** 中身は `content/guidebook/serbia-belgrade.ts`
 * （`python/guidebook_bake.py` が材料 `guidebook.json`・組み立て `compose.json` から焼く）、部品は `components/guidebook/`。
 * 描いた絵（表紙・見どころマップ・やりたいこと・料理・土産）は `public/guide/serbia/belgrade/manifest.json` から読み、
 * 無ければ借りた写真か色の札に落ちる。
 *
 * ## 公開
 *
 * 運営が型の数と見張りを見て公開前の印を外した（`content/travel.ts`）。
 */

const G = BELGRADE;
const CITY = travelCity(G.country, G.city);

/* 貼られたときの絵は、字の無い表紙（#332 の決めごと3。題を焼いた絵は面の表紙と画像検索に） */
const DRAWN = readDrawn(G.country, G.city);
export const metadata: Metadata = coverShare(
  travelCityShare(G.country, G.city, { title: G.title, description: G.description }),
  DRAWN,
  DRAWN.cover?.alt ?? G.title,
);

export default function BelgradePage() {
  const drawn = DRAWN;
  /* 札の絵は、描いた絵（料理・土産）→ 借りた写真の順。見たいもの（実在の場所）には描いた絵を当てない
     （#1228 Q1 の A）。決めかたは `dress`（ソフィア・スコピエ・ブカレストと同じ） */
  const dressed = dress(G, drawn);
  /* 借りた写真が取れていない見たいものは並べない（ブカレストと同じ）。実在の場所に描いた絵は当てない・
     字1つの空の札も置かない。マイマップには全部のピンが在る。写真が取れて材料に戻ったら、ひとりでに並ぶ */
  const g = { ...dressed, see: { ...dressed.see, items: dressed.see.items.filter((it) => it.pic) } };
  const went = firstWent(g);
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
          /* 記事の絵は字の無い表紙の 16:9・4:3・1:1（Google の Article の手引き。#332）。切っていなければ表紙の1枚 */
          image: drawn.ld.length ? drawn.ld.map((x) => x.src) : (drawn.cover ?? G.cover).src,
        })}
      />
      <VideoLds g={g} />
      <SpotsLd g={g} path={CITY.href} />
      <article className="gb">
        <Cover g={g} drawn={drawn} />
        <Toc items={toc} />
        <About g={g} drawn={drawn} n={1} />
        <Todo g={g} n={2} />
        <See g={g} n={3} />
        <Eat g={g} n={4} />
        <Buy g={g} n={5} />
        <Basics g={g} n={6} />
        <Videos g={g} n={7} />
        <Writer by={went ? GUIDE_BY.after : GUIDE_BY.before} went={went ? { city: G.name, from: went } : undefined} />
        <Sources g={g} drawn={usedDrawn} />
      </article>

      {/* 付箋。ブカレストと同じ置き場所（面のいちばん下）。**宛先の id（`serbia`）は Firestore に入るので変えない**（`content/themes.ts`） */}
      <StickyNotes theme="serbia" title="ベオグラードでこれやって" />

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
