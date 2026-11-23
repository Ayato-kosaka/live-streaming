import type { MetadataRoute } from "next";
import { RECIPES } from "@/content/recipes";
import { MONTHS } from "@/content/months";
import { APPS, PAST_APPS } from "@/content/apps";
import { LEGENDS } from "@/content/legends";
import { STREAM_TYPES } from "@/content/streamTypes";
import { SITE } from "@/content/site";
import { DAY_PAGES, NORDIC_GUIDE_HREF, dayHref } from "@/content/nordic";
import { TRAVEL, TRAVEL_PLACES, publicArticles, publicCities } from "@/content/travel";
import { articleOf } from "@/content/travel/articles";
import { guidebookOf } from "@/content/guidebook";
import { readDrawn } from "@/content/guidebook/manifest";
import { ISLE_CHAPTERS, ISLE_STREAM_CHAPTERS, chapterHref } from "@/components/chain/route";
import { LASTMOD } from "@/lib/lastmod";
import { countryMapArt } from "@/components/atlas/mapArt";

export const dynamic = "force-static";

/**
 * 1行ぶん。**`lastModified` は、分かる面にだけ付ける**（`lib/lastmod.ts`）。
 *
 * 前は全行が `new Date()`（書き出した時刻）で、150行ぜんぶが毎晩「今日変わった」と
 * 名乗っていた。`priority` も付けていたが、読む側（Google）が使わないと明言している欄で、
 * 0.5〜1.0 を手で振り分ける意味が無いので消した。
 */
const row = (p: string, lastModified?: string): MetadataRoute.Sitemap[number] =>
  lastModified ? { url: `${SITE.url}${p}`, lastModified } : { url: `${SITE.url}${p}` };

/** 索引の面のうち、並んでいるものの日付から「最後に増えた日」が言える面 */
const TOP_LASTMOD: Record<string, () => string | undefined> = {
  "/kitchen": LASTMOD.kitchen,
  "/apps": LASTMOD.apps,
  "/legends": LASTMOD.legends,
  // 月の表はここで読んで渡す（`lib/lastmod.ts` は `content/months.ts` を読まない。理由はあちらに）
  "/months": () => LASTMOD.months(MONTHS),
  "/updates": LASTMOD.updates,
};

export default function sitemap(): MetadataRoute.Sitemap {
  const top = [
    "",
    // 行き先をぜんぶ並べた面。ここから全部の紙へリンクが1本ずつ出ているので、
    // 検索の側から見ても島の索引になる。
    "/all",
    "/streams", TRAVEL, "/kitchen", "/apps", "/legends", "/now", "/board", "/friends",
    // 月ごとのふりかえり（#844）。**足し忘れて、配ったあとの見回りが赤くなった**（#872）
    "/months",
    /* あやと島案内鳥からのお知らせ（#851）。あやとの「気にしてる人少ないので、
       さりげなく」は**島の中での出しかた**の話で、検索から探せなくてよい、
       ではない。`robots` も `index: false` を持っていない。
       索引から落とすと「あの変更どこに書いてあった」で検索して来た人が着けない。
       表紙に帯を立てないことと、探せないことは別。
       **ここに1回だけ。** 2026-11-13 まで下にもう1行あって、本番の sitemap に
       同じ URL が2回載っていた（150行・一意な URL は 149）。いまは下で落ちる。 */
    "/updates",
    // その日いてくれた人に渡る1枚（#173）。誰でも見られる面
    "/cards",
    // 企画の面（`/next`）と「企画のページを作る」（`/next/new`）は並べない。どちらも `/board` へ 301（#1277）。
    // 索引に出すと、検索から来た人が送り返される。
    // これからの大きい企画。専用ページを持つものはここに足す。
    // **足し忘れると `prodsweep.mjs` が「sitemap.xml に無い」で赤くする。**
    // 2026-10-08 に `/north-macedonia` を作ったとき、面と `/all` の棚は足したのに
    // ここを忘れて、配ったあとの見張りで見つかった。面を1枚増やす仕事は3か所ある。
    // **国の面はここに書かない。** 下の `TRAVEL_PLACES`（`content/travel.ts`）から出る（#1201）
    // 北欧の旅そのもの（前の `/nordic`）は章の島（`/island/nordic`）へ寄せた。下の章の島の行に入っている
    NORDIC_GUIDE_HREF,
    // ソフィア（前の `/bulgaria`）は街の面になった。下の `publicCities` から出る（#1228）
    // 島から持って帰れるものと、お店で買えるもの（2026-10-08。言い方は 2026-10-14）。
    // **面を1枚増やす仕事は3か所**（上の注）。ここが3か所目
    "/goods",
    // ステッカーの面（2026-10-13）。`/goods` の索引から1枚だけ分かれた面で、
    // **行き先は `/goods` と別**（あやと「あやとステッカーとして個別ページ一枚ね」）
    "/goods/stickers",
    // 読み物ではないが、Google の OAuth 審査に URL を出す都合で持っている
    "/privacy",
    // **看板の6つは全部ここに並べる。** `/about` は頭のバーにも名刺にも
    // 出ているのに、索引から落ちていた（2026-09-13。109面を数えて見つけた）
    "/about",
    // 島の地図（前の `/atlas`）。ここから章の島（`/island/<章>`）へ1本ずつ出ている。
    // 字で書く（面の道は `app/island/` の箱の名前そのもの。`sitemapgap_selftest` が字で数える）
    "/island",
  ];
  const rows: MetadataRoute.Sitemap = [
    ...top.map((p) => row(p, TOP_LASTMOD[p]?.())),
    ...STREAM_TYPES.map((t) => row(`/streams/${t.slug}`, LASTMOD.streamType(t))),
    /* 国の面。歩いた国と、行く前の案内だけの国。**名簿は1つ**（`content/travel.ts`）。
       北欧の6か国は前、行く前の案内（`/nordic/<国>`）がもう1行ずつ載っていた。
       歩いた記録の面へ寄せたので、1国1行（#1201） */
    ...TRAVEL_PLACES.map((p) => {
      const r = row(p.href, p.country ? LASTMOD.country(p.country) : undefined);
      /* **国の地図の絵（「〈国〉の地図」）を画像のサイトマップに**（#1262・#332）。面の主役の絵で、島が描いたもの。
         焼いた絵が古い・無い国は面が SVG を直に描くので、ここにも載せない（`components/atlas/mapArt.ts`） */
      const art = countryMapArt(p.slug, p.name);
      return art ? { ...r, images: [encodeURI(`${SITE.url}${art.src}`)] } : r;
    }),
    /* 街のガイド（`/travel/<国>/<街>`）。**公開前の印（`draft`）が付いた街は並べない**
       （`content/travel.ts` の `publicCities`）。更新日は、中身の字が変わった日（焼く道具が持つ） */
    /* 街の中身はガイドブック（`content/guidebook/`。#1228）が更新日を持つ。**中身の無い街は書き出しを止める** */
    ...publicCities().map((c) => {
      const g = guidebookOf(c.country, c.slug);
      if (!g) throw new Error(`app/sitemap.ts: ${c.country}/${c.slug} の中身が content/guidebook/ に無い`);
      /* **面に出ている描いた絵を、ぜんぶ画像のサイトマップ（`<image:image>`）に載せる**（#1262・#332）。
         前は地区の名前を焼いた見どころマップの1枚だけで、表紙・やりたいこと・料理・土産の絵は Google が面を読んで
         見つけるのを待つしかなかった。見どころマップを先頭に（画像検索に出したい1枚）。道に日本語が入るので %XX に。
         **見たいもの（実在の場所）の写真は載せない**——借りた写真で、島の絵ではない */
      const d = readDrawn(c.country, c.slug);
      const pics = [
        d.areamap?.baked ? d.areamap.src : undefined,
        d.cover?.src,
        ...[d.do, d.food, d.buy].flatMap((m) => Object.values(m).map((p) => p.src)),
      ].filter((s): s is string => !!s);
      const r = row(c.href, g.updated);
      return pics.length ? { ...r, images: [...new Set(pics)].map((s) => encodeURI(`${SITE.url}${s}`)) } : r;
    }),
    /* 街の記事（`/travel/<国>/<街>/<話>`）。街と同じく、公開前の印が付いた記事は並べない（`publicArticles`） */
    ...publicArticles().map((a) => row(a.href, articleOf(a.country, a.city, a.slug).updated)),
    ...RECIPES.map((r) => row(`/kitchen/${r.slug}`, LASTMOD.recipe(r))),
    /* **`PAST_APPS` も並べる。** `appBySlug` は `APPS` だけを見ていて
       `/apps/spelieve` が 404 だった、という直しが `content/apps.ts` に
       書いてあるのに、**索引のほうは `APPS` だけのまま残っていた。**
       1件直したら横を見に行く（`docs/island-misses.md` #73・#76）。 */
    ...[...APPS, ...PAST_APPS].map((a) => row(`/apps/${a.slug}`, LASTMOD.app(a))),
    ...LEGENDS.map((l) => row(`/legends/${l.slug}`, LASTMOD.legend(l))),
    // 月ごとのふりかえり、1か月ぶん
    ...MONTHS.map((m) => row(`/months/${m.key}`, LASTMOD.month(m))),
    // 旅の1日ぶん。出発の日と1日目から7日目まで。
    ...DAY_PAGES.map((d) => row(dayHref(d))),
    /* 章の島の1章ぶん。島の地図から辿れる面で、中身は残り続ける。
       **いまいる章の島も、自分が正**（`chapterHref`。前は canonical が `/` で、ここに載せた URL と食い違っていた） */
    ...ISLE_CHAPTERS.map((c) => row(chapterHref(c))),
    /* その章のあいだにやった配信の一覧。**索引から丸ごと落ちていた**
       （2026-09-19。`/all` からも章の島からも1回で行ける本物の面が4枚、
       検索からだけ見つからない状態が続いていた。いちばん大きいのは
       `/island/caucasus/streams` の 949,893B）。
       **手で4つ並べない。** 配信を持つ章が増えれば、ここも一緒に増える
       （`docs/island-standards.md` §8）。 */
    ...ISLE_STREAM_CHAPTERS.map((c) => row(`/island/${c.slug}/streams`, LASTMOD.chapterStreams(c.slug))),
  ];

  /* **同じ URL を2回載せない。黙って1つに畳まず、書き出しを止める。**
     畳むと、2回書いてあること（＝上の配列のどこかが間違っていること）が残り続ける。
     `/updates` は足した日が違う2か所に書いてあって、1か月気づかれなかった。
     ここで投げれば `next build` が落ちるので、配る前に必ず見つかる。 */
  const seen = new Set<string>();
  const twice = rows.map((r) => r.url).filter((u) => seen.size === seen.add(u).size);
  if (twice.length) {
    throw new Error(`sitemap に同じ URL が2回載っています（${rows.length}行・一意 ${seen.size}）: ${twice.join(", ")}`);
  }
  return rows;
}
