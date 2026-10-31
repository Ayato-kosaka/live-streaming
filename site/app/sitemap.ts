import type { MetadataRoute } from "next";
import { COUNTRIES } from "@/content/countries";
import { RECIPES } from "@/content/recipes";
import { MONTHS } from "@/content/months";
import { APPS, PAST_APPS } from "@/content/apps";
import { LEGENDS } from "@/content/legends";
import { STREAM_TYPES } from "@/content/streamTypes";
import { SITE } from "@/content/site";
import { DAY_PAGES, NORDIC_COUNTRIES, dayHref } from "@/content/nordic";
import { ISLE_CHAPTERS, ISLE_STREAM_CHAPTERS } from "@/components/chain/route";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const url = (p: string) => `${SITE.url}${p}`;
  const top = [
    "",
    // 行き先をぜんぶ並べた面。ここから全部の紙へリンクが1本ずつ出ているので、
    // 検索の側から見ても島の索引になる。
    "/all",
    "/streams", "/map", "/kitchen", "/apps", "/legends", "/now", "/next", "/board", "/friends",
    // 月ごとのふりかえり（#844）。**足し忘れて、配ったあとの見回りが赤くなった**（#872）
    "/months",
    /* あやと島案内鳥からのお知らせ（#851）。あやとの「気にしてる人少ないので、
       さりげなく」は**島の中での出しかた**の話で、検索から探せなくてよい、
       ではない。`robots` も `index: false` を持っていない。 */
    "/updates",
    // その日いてくれた人に渡る1枚（#173）。誰でも見られる面
    "/cards",
    // 「企画のページを作る」（`/next/new`）は並べない（2026-10-01）。
    // 視聴者さんが企画を出す道を畳んで、いまは `/board` へ送るだけの1枚
    // （`robots: index: false`）。索引に出すと、検索から来た人が送り返される。
    // これからの大きい企画。専用ページを持つものはここに足す。
    // **足し忘れると `prodsweep.mjs` が「sitemap.xml に無い」で赤くする。**
    // 2026-10-08 に `/north-macedonia` を作ったとき、面と `/all` の棚は足したのに
    // ここを忘れて、配ったあとの見張りで見つかった。面を1枚増やす仕事は3か所ある。
    "/nordic", "/nordic/guide",
    "/north-macedonia",
    // 島から持って帰れるものと、お店で買えるもの（2026-10-08。言い方は 2026-10-14）。
    // **面を1枚増やす仕事は3か所**（上の注）。ここが3か所目
    "/goods",
    // ステッカーの面（2026-10-13）。`/goods` の索引から1枚だけ分かれた面で、
    // **行き先は `/goods` と別**（あやと「あやとステッカーとして個別ページ一枚ね」）
    "/goods/stickers",
    // 島を直したところ（2026-10-08 の注と同じ。**面を1枚増やす仕事は3か所**）。
    // さりげなく置く面だが、索引から落とすと「あの変更どこに書いてあった」で
    // 検索して来た人が着けない。表紙に帯を立てないことと、探せないことは別
    "/updates",
    // 読み物ではないが、Google の OAuth 審査に URL を出す都合で持っている
    "/privacy",
    // **看板の6つは全部ここに並べる。** `/about` は頭のバーにも名刺にも
    // 出ているのに、索引から落ちていた（2026-09-13。109面を数えて見つけた）
    "/about",
    // 過去の島を並べた面。ここから `/island/*` へ1本ずつ出ている
    "/atlas",
  ];
  return [
    ...top.map((p) => ({ url: url(p), lastModified: now, priority: p === "" ? 1 : 0.8 })),
    ...STREAM_TYPES.map((t) => ({ url: url(`/streams/${t.slug}`), lastModified: now, priority: 0.7 })),
    ...COUNTRIES.map((c) => ({ url: url(`/map/${c.slug}`), lastModified: now, priority: 0.6 })),
    ...RECIPES.map((r) => ({ url: url(`/kitchen/${r.slug}`), lastModified: now, priority: 0.6 })),
    /* **`PAST_APPS` も並べる。** `appBySlug` は `APPS` だけを見ていて
       `/apps/spelieve` が 404 だった、という直しが `content/apps.ts` に
       書いてあるのに、**索引のほうは `APPS` だけのまま残っていた。**
       1件直したら横を見に行く（`docs/island-misses.md` #73・#76）。 */
    ...[...APPS, ...PAST_APPS].map((a) => ({ url: url(`/apps/${a.slug}`), lastModified: now, priority: 0.6 })),
    ...LEGENDS.map((l) => ({ url: url(`/legends/${l.slug}`), lastModified: now, priority: 0.6 })),
    // 月ごとのふりかえり、1か月ぶん
    ...MONTHS.map((m) => ({ url: url(`/months/${m.key}`), lastModified: now, priority: 0.5 })),
    ...NORDIC_COUNTRIES.map((c) => ({ url: url(`/nordic/${c.slug}`), lastModified: now, priority: 0.6 })),
    // 旅の1日ぶん。出発の日と1日目から7日目まで。
    ...DAY_PAGES.map((d) => ({ url: url(dayHref(d)), lastModified: now, priority: 0.6 })),
    // 過去の島の1章ぶん。`/atlas` から辿れる面で、中身は残り続ける
    ...ISLE_CHAPTERS.map((c) => ({ url: url(`/island/${c.slug}`), lastModified: now, priority: 0.5 })),
    /* その章のあいだにやった配信の一覧。**索引から丸ごと落ちていた**
       （2026-09-19。`/all` からも章の島からも1回で行ける本物の面が4枚、
       検索からだけ見つからない状態が続いていた。いちばん大きいのは
       `/island/caucasus/streams` の 949,893B）。
       **手で4つ並べない。** 配信を持つ章が増えれば、ここも一緒に増える
       （`docs/island-standards.md` §8）。 */
    ...ISLE_STREAM_CHAPTERS.map((c) => ({
      url: url(`/island/${c.slug}/streams`), lastModified: now, priority: 0.5,
    })),
  ];
}
