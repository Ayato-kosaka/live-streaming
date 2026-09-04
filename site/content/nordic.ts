/**
 * 北欧ヒッチハイク旅のデータ。
 *
 * 企画の芯は「陸路をぜんぶヒッチハイクでつなぐ」こと。
 * バスに乗れば半日で着く区間を、あえて親指1本で行く。だから距離を前に出す。
 *
 * 国ごとの見どころ（161件）と旅のしおりは content/nordic/*.json にある。
 * あれは python/build_nordic.py が、あやとの用意したガイドから作っている。
 * 手で書き換えず、元データを直してから作り直すこと。
 */

import INDEX from "./nordic/index.json";

/** 移動のしかた。ヒッチハイクかどうかが、この企画ではいちばん大事な区別。 */
export type Move = "fly" | "hitch" | "ferry" | "walk";

export type Leg = {
  /** どこから */
  from: string;
  /** どこへ */
  to: string;
  move: Move;
  /** 距離(km)。飛行機とフェリーは目安。 */
  km?: number;
  /** かかる時間の目安 */
  time?: string;
  /** その区間の話。読んで面白いことだけ書く。 */
  note?: string;
  /** 決まっている日付(YYYY-MM-DD) */
  date?: string;
  /** 決まっている時刻など、動かせない事実 */
  fixed?: string;
  /** 国が変わる区間なら、その国の slug */
  enters?: string;
  /** 泊まる予定 */
  stay?: string;
};

/**
 * ルート。ジョージア・クタイシを出て、ストックホルムで終わる一方通行の旅。
 * 戻ってこないので、荷物も含めて全部持って動く。
 */
export const ROUTE: Leg[] = [
  {
    from: "クタイシ",
    to: "カトヴィツェ",
    move: "fly",
    km: 2450,
    time: "3時間35分",
    date: "2026-09-11",
    fixed: "Wizz Air W6 1200 / 9月11日(金) 23:30 発 → 9月12日(土) 01:05 着",
    note: "唯一の飛行機。219ラリ（約1.3万円）、機内持ち込みのカバンひとつだけ。ここから先は地面を這っていく。",
    enters: "poland",
  },
  {
    from: "カトヴィツェ",
    to: "クラクフ",
    move: "hitch",
    km: 80,
    time: "1〜3時間",
    note: "深夜1時に空港に着くので、初日は空港で朝を待つことになりそう。最初の親指はここで上げる。",
    stay: "クラクフ",
  },
  {
    from: "クラクフ",
    to: "オシフィエンチム（アウシュヴィッツ）",
    move: "hitch",
    km: 66,
    time: "1〜2時間",
    note: "日帰りの寄り道。行くかどうかも含めて、配信で相談したい場所。",
  },
  {
    from: "クラクフ",
    to: "ワルシャワ",
    move: "hitch",
    km: 295,
    time: "半日",
    note: "高速A4/S7沿い。ポーランドは大きなガソリンスタンドが多くて、声をかけやすいらしい。",
    stay: "ワルシャワ",
  },
  {
    from: "ワルシャワ",
    to: "ビャウィストク",
    move: "hitch",
    km: 200,
    time: "半日",
    note: "ワルシャワからヴィリニュスまでは513km。1日で抜けるのは無理があるので、ここで一泊はさむ。",
    stay: "ビャウィストク",
  },
  {
    from: "ビャウィストク",
    to: "ヴィリニュス",
    move: "hitch",
    km: 300,
    time: "1日",
    note: "オグロドニキの国境を越えてリトアニアへ。この区間はとにかく車が少ない。最初の山場。",
    enters: "lithuania",
    stay: "ヴィリニュス",
  },
  {
    from: "ヴィリニュス",
    to: "リガ",
    move: "hitch",
    km: 293,
    time: "1日",
    note: "途中でシャウレイの「十字架の丘」に寄れる。20万本の十字架が立っている丘。",
    enters: "latvia",
    stay: "リガ",
  },
  {
    from: "リガ",
    to: "タリン",
    move: "hitch",
    km: 307,
    time: "1日",
    note: "バルト海沿いのVia Baltica。9月のバルトは3日に1日は雨が降る。濡れながら立つ日が必ずある。",
    enters: "estonia",
    stay: "タリン",
  },
  {
    from: "タリン",
    to: "ヘルシンキ",
    move: "ferry",
    km: 80,
    time: "2時間",
    note: "1日10〜13便のフェリー。ここだけは親指では渡れない。徒歩客なら片道10.5ユーロから。",
    enters: "finland",
  },
  {
    from: "ヘルシンキ",
    to: "ストックホルム",
    move: "ferry",
    time: "17時間（船中泊）",
    note: "夜に出て朝に着く一泊フェリー。宿代が浮くので、ヘルシンキではホテルを取らない。",
    enters: "sweden",
    stay: "ストックホルム（友だちの家に約1週間）",
  },
];

/** ヒッチハイクでつなぐ距離の合計。企画の重さがひと目で分かる数字。 */
export const HITCH_KM = ROUTE.filter((l) => l.move === "hitch" && l.km).reduce(
  (a, b) => a + (b.km ?? 0),
  0,
);

/** 出発の日時。カウントダウンはここを見る。ジョージア時間の 23:30。 */
export const DEPART = "2026-09-11T23:30:00+04:00";

export type NordicCountry = (typeof INDEX)["countries"][number];
export const NORDIC_COUNTRIES = INDEX.countries as NordicCountry[];
export const nordicCountry = (slug: string) => NORDIC_COUNTRIES.find((c) => c.slug === slug);

/** 旅のしおり。お金・通信・服装・サウナ・食べもの・おみやげ・困ったとき。 */
export const NORDIC_GUIDE = INDEX.guide;

/** 見どころの種類。 */
export const CATS: Record<string, { label: string; icon: string }> = {
  see: { label: "見る", icon: "🏛" },
  do: { label: "やる", icon: "🎈" },
  eat: { label: "食べる", icon: "🍽" },
  buy: { label: "買う", icon: "🛍" },
};

export type NordicSpot = {
  id: string;
  cat: string;
  title: string;
  local: string;
  city: string;
  area: string;
  body: string;
  point: string;
  tips: string[];
  info: string;
  budget: string;
  time: string;
  season: string;
  tags: string[];
  img: string;
  big: string;
  cm: string;
};

/** 国ごとの見どころを読む。ページごとに1国ぶんだけ読み込む。 */
export async function loadSpots(slug: string): Promise<NordicSpot[]> {
  switch (slug) {
    case "poland":
      return (await import("./nordic/poland.json")).default.spots as NordicSpot[];
    case "lithuania":
      return (await import("./nordic/lithuania.json")).default.spots as NordicSpot[];
    case "latvia":
      return (await import("./nordic/latvia.json")).default.spots as NordicSpot[];
    case "estonia":
      return (await import("./nordic/estonia.json")).default.spots as NordicSpot[];
    case "finland":
      return (await import("./nordic/finland.json")).default.spots as NordicSpot[];
    case "sweden":
      return (await import("./nordic/sweden.json")).default.spots as NordicSpot[];
    default:
      return [];
  }
}
