import type { Fact, Item, Pic, Src } from "@/content/guidebook/types";

/**
 * **企画の面（`/legends/<企画>`）の中身の形。** 面の印の付いた企画（`content/projects.ts` の `book`。M-8）が持つ。
 *
 * 焼くのは `python/legend_book_bake.py`（材料 `python/data/legends/<企画>/book.json` から）。**手で書かない。**
 * 節の並びは企画書（#1404 本文5章）: 表紙・目次 → 決まり → 食べた100食 → 基本用語 → 地域ごとの料理の違い →
 * 街ごとの食べ比べ → 食べるべき100品 → 回りかた（見ておきたい5か所）→ お腹を壊さないコツ → よくある質問。
 * 付箋と「この企画の配信」は、動線を繋ぐ日・始まった日に足す（企画書12章）。
 *
 * 部品は街のガイドと同じもの（`components/guidebook/`）を並べる。**100品の札と窓は `Item` のまま**渡す
 * （`components/guidebook/Items.tsx` の `Tiles`）ので、品はその形に焼いてある。
 */

/** 節の id。目次と錨（`#<id>`）になる。並びは企画書5章 */
export type BookSection = "rules" | "stamps" | "words" | "regions" | "compare" | "dishes" | "route" | "sights" | "tips" | "faq";

/** 基本用語1つ（ダル・マトン…）。札は名前と一行、押すと窓 */
export type BookWord = { id: string; name: string; lead: string; body: string; src: Src[] };

/** 地域1つ（北・西・東・南インドとスリランカ）。主食・油・よく食べるもの（100品の id） */
export type BookRegion = { id: string; name: string; staple: string; oil: string; dishes: string[]; body: string; src: Src[] };

/** 街ごとの食べ比べ1組。同じ料理が街で変わる品（100品の id）と、その違い */
export type BookCompare = { id: string; title: string; lead: string; items: { dish: string; note: string }[]; src: Src[] };

/**
 * 食べるべき100品の1品。**札と窓はガイドブックの `Item`**（`rank` 1＝必食・`line`＝街・`kinds`＝地域・`flags` は窓の中だけ）。
 * 後ろの欄は、食べ比べ・名札（`ItemList`）・絵の無いあいだの扱いが読む
 */
export type BookDish = Item & {
  region: string;
  city: string;
  /** 屋台・食堂・朝ごはん・甘いもの・飲みもの */
  kind: string;
  /** 25字前後の一行（名札の説明） */
  lead: string;
  /** 値段の字（「13〜25ルピー（約22〜43円・2026年11月23日の換算）」） */
  price: string;
  season?: string;
  facts: Fact[];
};

/** 回りかたの1つ（順番だけ。日付は持たない。企画書8章） */
export type BookStop = { city: string; region: string; lat: number; lon: number };

/** 見ておきたい所1つ */
export type BookSight = { id: string; name: string; lead: string; what: string; price: string; maps: string; src: Src[] };

export type BookTip = { id: string; title: string; body: string; src: Src[] };

export type BookFaq = { q: string; a: string; src: Src[] };

export type LegendBook = {
  slug: string;
  /** 材料の日付（中身の字が変わった日。ビルドの日にしない） */
  updated: string;
  /** 焼いた中身の指紋（面には出さない） */
  hash: string;
  /** `<title>`・説明・h1・見出しの下の一行。`start` は始まる日（`YYYY-MM-DD`）、`from` は入る街 */
  meta: { title: string; description: string; h1: string; sub: string; start: string; from: string };
  /** 始まる日と入る街の字（「2027年1月15日ごろ ムンバイから」）。**あと◯日は言わない**（企画書14章） */
  start: string;
  /** 数えるゴールと単位（100・食） */
  goal: { n: number; unit: string };
  /** 節の名前（企画書5章の字） */
  sections: Record<BookSection, string>;
  /** ★の言葉（`rank` の順。0 は空。企画書5章の6「必食／行けたら／余裕があれば」） */
  stars: string[];
  /** 地域のカードの欄の名前（企画書6章の表の頭） */
  regionLabels: { staple: string; oil: string; dishes: string };
  rules: string[];
  /** 本人の言葉1つ。`cite` は「2026年8月2日の配信 0:25:30」、`t` はその秒 */
  quote: { text: string; date: string; at: string; v: string; t: number; cite: string };
  words: BookWord[];
  regions: BookRegion[];
  compare: BookCompare[];
  dishes: BookDish[];
  route: BookStop[];
  sights: BookSight[];
  tips: BookTip[];
  faq: BookFaq[];
};

/**
 * **食べた1食（スタンプラリーの丸1つ）。** 企画の記録で、ガイドの100品とは別の表（企画書11章・Q3）。
 * 旅のあいだに、配信の議事録から1行ずつ足す（`/island-daily`）。**旅の前は0行。**
 *
 * 写真は配信の画面から切ったもの（あやと島カードに同じ日の写真があれば、そちら）。額は本人がその場で言ったものだけ
 * （`docs/guide-design.md` 5-4。言っていなければ持たない——空欄にしない）
 */
export type Eaten = {
  /** 何食目（1から、食べた順。抜けを作らない） */
  n: number;
  /** 食べた日（現地の暦日 `YYYY-MM-DD`） */
  date: string;
  city: string;
  /** 料理の名前（配信で言った名前） */
  name: string;
  /** 食べるべき100品のどれか（`BookDish.id`）。100品に無い料理は持たない */
  dish?: string;
  /** 払った額（円。本人がその場で円に直して言った額） */
  yen?: number;
  /** その1食の場面（配信の id と、頭からの秒） */
  scene?: { v: string; t: number };
  pic?: Pic;
};
