/**
 * 街のガイドの面（`/travel/<国>/<街>`）の中身の形。
 *
 * 中身そのものは `python/guide_bake.py` が台本と facts.json から焼く（`content/travel/<国>/<街>.ts`）。
 * **ここは形だけ。** 焼く道具と面が同じ形を読むように、1か所に置く。
 *
 * 一言の字（`Quote.q`）・額（`PriceRow.amount`）・場面（`Scene`）は、facts から写したもの。
 * 面の側で字を足したり丸めたりしない（`docs/guide-design.md` 5章）。
 */

/** 配信のその場面。`t` は配信の頭からの秒、`date` は現地の日付（YYYY-MM-DD） */
export type Scene = { v: string; t: number; date: string };

/** 本人の一言。字幕の字のまま */
export type Quote = { q: string; at: Scene };

/** 案内鳥の1行。必ずどれかの場面に属す（3章「一言と場面ボタンの使い分け」） */
export type Line = { text: string; at: Scene; quote?: Quote };

/** 外の出どころの行（政府・中央銀行など）。`seen` は見た日 */
export type Ext = { text: string; src: string; name: string; seen: string };

/** 現地のつづり。出どころつき */
export type Local = { text: string; lang: string; src: string };

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
  /** `object-position`。写真のどこを見せるか */
  pos?: string;
};

/** 配信の時刻の差で測った値（字幕が30秒きざみなので、前後30秒） */
export type Measured = { what: string; mins: string; from: Scene; to: Scene };

/** 驚く数 */
export type Big = { n: string; unit: string; cap: string; measured: boolean; at: Scene };

/** 移動の札 */
export type Move = { from: string; to: string; by: string; said?: string; got: string; at: Scene; quote?: Quote; lines: Line[] };

export type PriceRow = { what: string; amount: string; at: Scene };
export type PriceTable = { caption: string; rows: PriceRow[] };

export type Keyword = { title: string; lines: Line[]; ext: Ext[] };

/** 見どころ・店・失敗談・遠出のカード（並びは毎回同じ。最後に情報の塊） */
export type Card = {
  key: string;
  /** 地図・一覧の番号（行った所だけ） */
  n?: number;
  /** 色の小見出し（何の場所か） */
  sub?: string;
  name: string;
  local?: Local;
  /** 行った日（現地） */
  went: string[];
  photo?: Photo;
  lines: Line[];
  /** 見せる一言（3つまで） */
  quotes: Quote[];
  /** 4つ目からの一言（畳む） */
  more: Quote[];
  measured: Measured[];
  /** Google マップ（名前で探す） */
  maps?: string;
  info: (Line & { label: string })[];
  where?: string;
  price?: PriceRow;
  scene?: Scene;
};

export type SectionId = "about" | "move" | "money" | "places" | "food" | "stay" | "caution" | "trip";

export type Section = {
  id: SectionId;
  /** 節の頭の答え（1〜2文） */
  answer: string;
  /** この場面の配信ボタン（節に1つ） */
  scene: Scene | null;
  ext: Ext[];
  lines: Line[];
  quotes: Quote[];
  moves: Move[];
  tables: PriceTable[];
  keyword?: Keyword;
  cards: Card[];
  others: Line[];
  dishes: Card[];
  trips: Card[];
};

export type CityGuide = {
  country: string;
  city: string;
  name: string;
  local: Local | null;
  title: string;
  description: string;
  /** 表紙の一言（40字まで） */
  lead: string;
  cover: Photo | null;
  /** 頭の埋め込み1本。その街で facts の項目がいちばん多い回の、最初に歩いた場面から */
  embed: Scene;
  /** その街の配信の一覧の鍵（`content/cityStreams.ts`） */
  streams: { country: string; city: string } | null;
  nums: Big[];
  sections: Section[];
  sources: Ext[];
  /** 公開（最初に焼いた日） */
  published: string;
  /** 最終更新（中身の字が変わった日だけ進む） */
  updated: string;
  hash: string;
};
