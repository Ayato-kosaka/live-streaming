import type { Metadata } from "next";
import { SITE } from "@/content/site";
import CARDS_JSON from "./ogCards.json";

/**
 * **貼られたときの顔**（`og:*` / `twitter:*`）を、面ごとに1か所から出す。
 *
 * ## なぜ要るか
 *
 * 2026-10-14 に焼き出した 137面を数えたら、**`og:image` は 137面とも
 * 同じ1枚**（`/og.png` の島）で、**`og:url` は 137面とも無かった。**
 * 料理のスタンプ帳も、住人図鑑も、北欧の旅も、LINE に貼ると同じ絵が出る。
 * 貼り分けた意味が無いし、貼った人は「この島のどこか」としか伝えられない。
 *
 * 題と一文（`og:title` / `og:description`）は面ごとに在ったので、
 * **足りないのは絵と、自分の居場所（`og:url`）だけ**だった。
 *
 * ## 絵は「区画ごと」に1枚
 *
 * 面ごとに137枚焼くことはしない。料理33面はどれも台所の話なので、
 * **台所の1枚**でいい。題と一文が面ごとに違うので、貼られた相手の画面では
 * ちゃんと別の面に見える。**区画をまたぐときだけ絵を変える。**
 *
 * ## 絵に焼く字は、この面の呼び名ひとつ
 *
 * `docs/island-design.md` 8章は「字を、絵に焼かない」と決めている。
 * 理由は**旅が進んでも絵だけが止まる**から（本番の og.png に
 * 「いま ジョージア・トビリシ」が焼かれたまま1週間配られた）。
 * 呼び名は旅で動かないので焼くが、**焼いた字と `og:title` が食い違ったら
 * 赤くなる**ようにしてある（`tools/sprites/ogmeta.mjs`）。
 * 呼び名を変えた日に、絵だけ古いまま残ることはない。
 *
 * ## 使い方
 *
 *   export const metadata: Metadata = share({
 *     key: "kitchen",
 *     title: "クッキング・スタンプ帳",
 *     description: "…",
 *     path: "/kitchen",
 *   });
 *
 * **`openGraph` は Next が親と混ぜない。** 面が1つでも `openGraph` を書くと
 * 器（`app/layout.tsx`）の指定は丸ごと置き換わるので、`type` も `siteName` も
 * `locale` もここで毎回そろえて出す。
 */

type Card = { file: string; label: string; alt: string; made?: boolean };

/** `site/lib/ogCards.json` が1つの出どころ。道具（`tools/sprites/*`）も同じものを読む */
export const CARDS = CARDS_JSON.cards as Record<string, Card>;

export type ShareKey = keyof typeof CARDS_JSON.cards;

/** 題の後ろに付ける島の名前。`app/layout.tsx` の `title.template` と同じ形にそろえる */
const suffix = (title: string) => `${title}｜${SITE.name}`;

export function share(opts: {
  key: ShareKey;
  title: string;
  description: string;
  /** その面自身の道。`og:url` になる（`metadataBase` で絶対 URL に直る） */
  path: string;
  /** 別の面を正とするときだけ。既定は `path` */
  canonical?: string;
  robots?: Metadata["robots"];
}): Metadata {
  const card = CARDS[opts.key];
  const head = suffix(opts.title);
  return {
    title: opts.title,
    description: opts.description,
    alternates: { canonical: opts.canonical ?? opts.path },
    openGraph: {
      type: "website",
      siteName: SITE.name,
      locale: "ja_JP",
      title: head,
      description: opts.description,
      url: opts.path,
      images: [{ url: card.file, width: 1200, height: 630, alt: card.alt }],
    },
    twitter: {
      card: "summary_large_image",
      title: head,
      description: opts.description,
      images: [card.file],
    },
    ...(opts.robots ? { robots: opts.robots } : {}),
  };
}
