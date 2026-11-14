/**
 * 街のガイドの面（`/travel/<国>/<街>`）の中身の形。
 *
 * 中身そのものは `python/guide_bake.py` が台本と facts.json から焼く（`content/travel/<国>/<街>.ts`）。
 * **ここは形だけ。** 焼く道具と面が同じ形を読むように、1か所に置く。
 *
 * ## 骨組みと肉付け（2026-11-14 の作り直し。`docs/guide-design.md` の頭の章・`docs/island-misses.md` #323）
 *
 * 面の骨はガイド（`Item`）で、**外の出どころつきの事実**で立つ。行った所には、
 * 行った人の話（`Went`）が1つ乗る。**行っていない所も骨から消さない。**
 *
 * | | 何が正か | 面での見え方 |
 * | --- | --- | --- |
 * | `Item.what` `Item.info` | 外の出どころ（`Item.src`。URL と見た日） | 行く前のガイド |
 * | `Went` | 配信（facts の行。場面は1つ） | 「行った」と、その日の写真と、話 |
 * | `Section.quote` | 配信（本人の一言。**節に1つまで**） | 吹き出し |
 *
 * 一言の字・額・場面の秒は facts から写したもの。面の側で字を足したり丸めたりしない。
 */

/** 配信のその場面。`t` は配信の頭からの秒、`date` は現地の日付（YYYY-MM-DD） */
export type Scene = { v: string; t: number; date: string };

/** 本人の一言。字幕の字のまま */
export type Quote = { q: string; at: Scene };

/** 外の出どころ。`seen` は見た日（YYYY-MM-DD） */
export type Src = { name: string; url: string; seen: string };

/** 現地のつづり。出どころつき。`roman`・`kana` は看板と地図で突き合わせるため */
export type Local = { text: string; lang: string; roman?: string; kana?: string; src: string };

/**
 * 写真。2通りある。
 *
 * - **あやとの写真**: あやと島カードの素の写真（住人は立てない）。`day` と `v`（その日の配信）
 * - **借りた写真**: Wikimedia Commons。`by`・`lic`・`page`（行っていない所にだけ使う）
 */
export type Photo = {
  src: string;
  srcSet: string;
  w: number;
  h: number;
  alt: string;
  /** 撮った日（現地）。あやとの写真だけ */
  day?: string;
  /** その日の配信。あやとの写真だけ */
  v?: string;
  /** 借りた写真の作者・ライセンス・元のページ */
  by?: string;
  lic?: string;
  page?: string;
  /** `object-position`。写真のどこを見せるか */
  pos?: string;
};

/** 配信の時刻の差で測った値（字幕が30秒きざみなので、前後30秒） */
export type Measured = { what: string; mins: string; from: Scene; to: Scene };

/** 驚く数 */
export type Big = { n: string; unit: string; cap: string; measured: boolean; at: Scene };

export type PriceRow = { what: string; amount: string; at: Scene };

/** あやとの好みに合うか（★の重要度とは混ぜない。`docs/country-guide.md` 0-1） */
export type Mark = "good" | "ok" | "warn";

/**
 * 行った人の肉付け。**話は1つ、場面のリンクも1つ。**
 *
 * 話は facts の行をつないだもの（数と固有名は結んだ行どおり。焼く道具が確かめる）。
 * 一文ごとに場面を付けない——「どの一文も配信へ辿れる」は裏の facts で守る（#323 の決めごと2）。
 */
export type Went = {
  stamp: "行った" | "前を通った" | "行く前に調べた";
  /** 行った日（現地） */
  days: string[];
  text: string;
  at: Scene;
  photo?: Photo;
  measured?: Measured;
  /** 払った額（あれば）。1行ずつその場面へ */
  rows: PriceRow[];
};

/** 骨組みの1件（見たい・食べたい・買いたい・したい・基本情報） */
export type Item = {
  key: string;
  name: string;
  local?: Local;
  /** 絵の無い件の札に出す絵の名前（`components/ui/Icon`） */
  icon: string;
  /** 一般の重要度（★1 必見／★2 行けたら／★3 余裕があれば）。基本情報には無い */
  rank?: 1 | 2 | 3;
  mark?: Mark;
  markWhy?: string;
  /** 外の事実。**無い件は、行った人の話だけで立っている**（店・その街だけの体験） */
  what?: string;
  /** 外の事実の欄（入場料・行きかた・値段・どこで） */
  info: { label: string; text: string }[];
  /** `what` と `info` の出どころ。どちらかが在れば1つ以上 */
  src: Src[];
  /** Google マップ（名前で探す） */
  maps?: string;
  /** タイルの絵。行った件はその日の写真、行っていない件は借りた写真 */
  photo?: Photo;
  went?: Went;
};

export type SectionId = "see" | "eat" | "buy" | "todo" | "basics";

export type Section = {
  id: SectionId;
  /** 節の頭の1〜2文（案内鳥の話） */
  lead: string;
  /** 本人の一言。**節に1つまで** */
  quote: Quote | null;
  /** 一言がどの件の話か（吹き出しの下に名前を出す） */
  quoteOf: string | null;
  items: Item[];
};

/** 記事（`/travel/<国>/<街>/<話>`）への札。名簿（`content/travel.ts` の `TRAVEL_ARTICLES`）と記事の中身から面の側が組む */
export type Article = { href: string; title: string; note: string; icon: string };

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
  /** 頭の話（どんな街か）。外の事実と、行った人の話 */
  intro: { ext: { text: string; src: Src[] }; went: { text: string; at: Scene } };
  /** 円とお金の換算の1行（出どころつき） */
  rate: { text: string; src: Src[] };
  /** 埋め込み1本。その街で facts の項目がいちばん多い回の、最初に歩いた場面から */
  embed: Scene;
  /** その街の配信の一覧の鍵（`content/cityStreams.ts`） */
  streams: { country: string; city: string } | null;
  nums: Big[];
  sections: Section[];
  /** 公開（最初に焼いた日） */
  published: string;
  /** 最終更新（中身の字が変わった日だけ進む） */
  updated: string;
  hash: string;
};
