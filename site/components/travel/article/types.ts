import type { IconName } from "@/components/ui/Icon";

/**
 * 旅のガイドの記事（`/travel/<国>/<街>/<話>`）の中身の形。
 *
 * 中身そのものは `python/guide_article.py` が台本と facts.json から焼く（`content/travel/<国>/<街>-<話>.ts`）。
 * **ここは形だけ。** 焼く道具と面が同じ形を読むように、1か所に置く。
 *
 * 街の面の形（`content/travel/types.ts`）は使わずに、ここに写してある。街の面は別の担当が作り直している
 * 最中で、あちらの形が動いても記事が巻き込まれないように（#1203）。字の意味は同じ。
 */

/** 配信のその場面。`t` は配信の頭からの秒、`date` は現地の日付（YYYY-MM-DD） */
export type Scene = { v: string; t: number; date: string };

/** 本人の一言。字幕の字のまま */
export type Quote = { q: string; at: Scene };

/** 外の出どころの行（中央銀行など）。`seen` は見た日 */
export type Ext = { text: string; src: string; name: string; seen: string };

/** あやと島カードの素の写真（その日に貼られたもの。住人は立てない） */
export type Photo = {
  src: string;
  srcSet: string;
  w: number;
  h: number;
  alt: string;
  /** 撮った日（現地） */
  day: string;
  /** その日の配信（出どころの行のリンク先） */
  v: string;
  pos?: string;
};

/** 値段の表の1行。`total` は会計（品の数に入れない行） */
export type PriceRow = { what: string; amount: string; at: Scene; total?: true };

/** 先に答えの「1日いくら」。`sum` は道具が部品を足した額（`value` はその数。面の `data-sum` になる） */
export type Day = { label: string; sum: string; value: number; parts: { label: string; amount: string; at: Scene }[] };

export type Block = { text: string } | { quote: Quote } | { photo: Photo };

export type ArticleSection = {
  id: string;
  h: string;
  toc: string;
  icon: IconName;
  /** 節の頭の答え（1〜2文） */
  answer: string;
  body: Block[];
  table?: { caption: string; rows: PriceRow[] };
  /** 比べ（見出しと1文の組） */
  pairs?: { head: string; text: string }[];
  keyword?: { title: string; lines: string[]; ext: Ext[] };
  /** この場面の配信ボタン（記事の山場に1つ） */
  scene?: Scene;
};

export type GuideArticle = {
  slug: string;
  title: string;
  /** 見出し。つなぐと `title` と同じ字（焼く道具が止める） */
  h1: string[];
  description: string;
  lead: string;
  cover: Photo | null;
  /** 値段の表の品の数（会計の行を除く）。題の数と同じ */
  items: number;
  /** 配信の一覧。`videos` は場面を引いた回（多い順） */
  streams: { country: string; city: string; videos: string[] };
  answer: {
    id: string;
    h: string;
    toc: string;
    icon: IconName;
    text: string;
    days: Day[];
    points: { head: string; text: string }[];
    note: string;
  };
  sections: ArticleSection[];
  published: string;
  updated: string;
  hash: string;
};
