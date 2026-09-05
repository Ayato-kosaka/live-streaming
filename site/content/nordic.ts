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
  /**
   * 区間の名前。意見を区間ごとに分けて貼るときの札に使う（`【区間:riga-tallinn】`）。
   * **変えない。** 変えると、それまでに集まった道しるべが行方不明になる。
   */
  id: string;
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
  /**
   * 寄り道。行って戻ってくる区間で、旅の進み方には数えない。
   * （`TripNow` の「いま／つぎ」は、これを外した一本道で組み立てる）
   */
  side?: boolean;
  /**
   * この区間の絵（`components/nordic/Marks.tsx` の名前）。
   * **区間ごとに必ず違うものにする。** 同じ印を10回並べると、
   * どの日も同じことをしているように見えてしまう。
   */
  art: string;
  /**
   * 足代。**その区間を越えるのに、実際に要るもの1つ。**
   *
   * 「1kmあたり◯円」にしない。何に使うか分からない金は出しづらいし、
   * 出したあとに何が変わったのかも分からない（`docs/nordic-fund.md` 提案1）。
   *
   * `yen` は空にしておける。陸路6区間の宿代はまだ決まっていない（GitHub #107）。
   * **空でもボードが成立する形にしてある。** 値段が決まるまでは
   * 「いま調べています」と出して、バーも金額も出さない。
   * `fare` そのものが無い区間は、越えるのにお金が要らない区間（寄り道）。
   */
  fare?: {
    /** 何に要るのか。「リガの一泊」のように、必ず物に紐づける */
    what: string;
    /** 円。決まっていないうちは付けない */
    yen?: number;
    /** 現地の値段。円に直す前の数字を添えると、何を見て決めたかが分かる */
    src?: string;
  };
  /**
   * その区間で「何をしてほしいか」を聞く一行。
   *
   * 「この旅、どうなってほしい？」は問いが大きすぎて答えられない。
   * 区間まで下ろすと、300km 車が来ない日の話や、雨の中で立つ日の話になって、
   * 書ける人が出てくる（`docs/nordic-fund.md` 提案2）。
   */
  ask: string;
};

/**
 * ルート。ジョージア・クタイシを出て、ストックホルムで終わる一方通行の旅。
 * 戻ってこないので、荷物も含めて全部持って動く。
 */
export const ROUTE: Leg[] = [
  {
    id: "kutaisi-katowice",
    from: "クタイシ",
    to: "カトヴィツェ",
    move: "fly",
    km: 2450,
    time: "3時間35分",
    date: "2026-09-11",
    fixed: "Wizz Air W6 1200 / 9月11日(金) 23:30 発 → 9月12日(土) 01:05 着",
    note: "唯一の飛行機。219ラリ（約1.3万円）、機内持ち込みのカバンひとつだけ。ここから先は地面を這っていく。",
    enters: "poland",
    fare: { what: "クタイシ→カトヴィツェの飛行機", yen: 13000, src: "219ラリ" },
    ask: "深夜1時にカトヴィツェ着。始発までの数時間、空港で何をしてたら面白い？",
    art: "nightflight",
  },
  {
    id: "katowice-krakow",
    from: "カトヴィツェ",
    to: "クラクフ",
    move: "hitch",
    km: 80,
    time: "1〜3時間",
    note: "深夜1時に空港に着くので、初日は空港で朝を待つことになりそう。最初の親指はここで上げる。",
    stay: "クラクフ",
    fare: { what: "クラクフの一泊" },
    ask: "いちばん最初に親指を立てる80km。最初に乗せてくれた人に、何を聞いてほしい？",
    art: "airportwait",
  },
  {
    id: "krakow-oswiecim",
    from: "クラクフ",
    to: "オシフィエンチム（アウシュヴィッツ）",
    move: "hitch",
    km: 66,
    time: "1〜2時間",
    note: "日帰りの寄り道。行くかどうかも含めて、配信で相談したい場所。",
    side: true,
    ask: "行くかどうかも、まだ決めていません。行くとしたら、どう伝えるのがいいと思いますか？",
    art: "rails",
  },
  {
    id: "krakow-warszawa",
    from: "クラクフ",
    to: "ワルシャワ",
    move: "hitch",
    km: 295,
    time: "半日",
    note: "高速A4/S7沿い。ポーランドは大きなガソリンスタンドが多くて、声をかけやすいらしい。",
    stay: "ワルシャワ",
    fare: { what: "ワルシャワの一泊" },
    ask: "大きなガソリンスタンドで声をかける295km。断られた回数も数えたほうがいい？",
    art: "gasstation",
  },
  {
    id: "warszawa-bialystok",
    from: "ワルシャワ",
    to: "ビャウィストク",
    move: "hitch",
    km: 200,
    time: "半日",
    note: "ワルシャワからヴィリニュスまでは513km。1日で抜けるのは無理があるので、ここで一泊はさむ。",
    stay: "ビャウィストク",
    fare: { what: "ビャウィストクの一泊" },
    ask: "ほとんど何もない平原の200km。ここで撮っておいてほしいものは？",
    art: "longroad",
  },
  {
    id: "bialystok-vilnius",
    from: "ビャウィストク",
    to: "ヴィリニュス",
    move: "hitch",
    km: 300,
    time: "1日",
    note: "オグロドニキの国境を越えてリトアニアへ。この区間はとにかく車が少ない。最初の山場。",
    enters: "lithuania",
    fare: { what: "ヴィリニュスの一泊" },
    ask: "車が少ない300kmと、歩いて越える国境。この日に何をしてほしい？",
    art: "border",
    stay: "ヴィリニュス",
  },
  {
    id: "vilnius-riga",
    from: "ヴィリニュス",
    to: "リガ",
    move: "hitch",
    km: 293,
    time: "1日",
    note: "途中でシャウレイの「十字架の丘」に寄れる。20万本の十字架が立っている丘。",
    enters: "latvia",
    fare: { what: "リガの一泊" },
    ask: "十字架の丘に寄れる293km。寄ってほしい？ それとも先を急いでほしい？",
    art: "crosses",
    stay: "リガ",
  },
  {
    id: "riga-tallinn",
    from: "リガ",
    to: "タリン",
    move: "hitch",
    km: 307,
    time: "1日",
    note: "バルト海沿いのVia Baltica。9月のバルトは3日に1日は雨が降る。濡れながら立つ日が必ずある。",
    enters: "estonia",
    fare: { what: "タリンの一泊" },
    ask: "3日に1日は雨のバルト海沿い307km。濡れながら立つ日に、何をしてほしい？",
    art: "rainroad",
    stay: "タリン",
  },
  {
    id: "tallinn-helsinki",
    from: "タリン",
    to: "ヘルシンキ",
    move: "ferry",
    km: 80,
    time: "2時間",
    note: "1日10〜13便のフェリー。ここだけは親指では渡れない。徒歩客なら片道10.5ユーロから。",
    enters: "finland",
    fare: { what: "タリン→ヘルシンキのフェリー", yen: 1800, src: "徒歩客 €10.50" },
    ask: "ここだけは親指で渡れない2時間。船の上で何をする？",
    art: "ferryday",
  },
  {
    id: "helsinki-stockholm",
    from: "ヘルシンキ",
    to: "ストックホルム",
    move: "ferry",
    time: "17時間（船中泊）",
    note: "夜に出て朝に着く一泊フェリー。宿代が浮くので、ヘルシンキではホテルを取らない。",
    enters: "sweden",
    fare: { what: "夜行フェリーの席と船室", yen: 20300, src: "€43＋船室€75.50" },
    ask: "17時間の夜行フェリー。朝、着いたら終点です。最後の夜に何をしてほしい？",
    art: "ferrynight",
    stay: "ストックホルム（友だちの家に約1週間）",
  },
];

/**
 * 足代を、通る順に上から流したときの区間ごとの位置。
 *
 * 「どの区間が埋まったか」をどこにも持たない。集まった合計と区間の値段だけで決まるので、
 * 手で管理する場所が増えない（`docs/nordic-fund.md` 5章）。
 *
 * - `before` … この区間より手前の足代の合計。合計からこれを引いたぶんが、この区間に入る
 * - `reach`  … ここまで流していいか
 *
 * **値段が分かっていない区間から先へは流さない。** 手前がいくらか分からないのに
 * その先が埋まっているように見せると、値段が決まった日に、埋まっていたものが減る。
 * 増えることはあっても減らない、という並びにしておく。
 */
export const FARE_POUR: Record<string, { before: number; reach: boolean }> = (() => {
  const o: Record<string, { before: number; reach: boolean }> = {};
  let before = 0;
  let open = true;
  for (const l of ROUTE) {
    if (!l.fare) {
      // お金の要らない区間。流れは止めないし、消費もしない
      o[l.id] = { before, reach: false };
      continue;
    }
    o[l.id] = { before, reach: open && !!l.fare.yen };
    if (!l.fare.yen) open = false;
    before += l.fare.yen ?? 0;
  }
  return o;
})();

/**
 * 区間で、実際に起きたこと。**旅が終わってから入る、3つめの席**
 * （`docs/nordic-fund.md` 提案4）。
 *
 * 区間カードは「出した人（足代）／言った人（道しるべ）」の2層でできているが、
 * それだけだと出発前にしか読む理由がない。**3つめが入ると読み物になる。**
 * 旅が終わったあとも `/nordic` が読み返される理由は、ここにしかない。
 *
 * 手で書く。10区間で10回なので、運用として重くない。
 * 逆に、金額のように毎日入力してもらうものはここに置かない（自動で取れる）。
 *
 * 別ファイルにしないのは、区間の id をここが持っているから。
 * 離すと、id を打ち間違えても誰も気づかないまま席が出ない。
 *
 * 出発は 2026年9月11日。**着くまでは空のまま。** 空なら席そのものを出さない。
 * 「まだ何も起きていません」と書くと、旅がうまくいっていないように読める。
 */
export type LegLog = {
  /** その区間を越えた日（YYYY-MM-DD） */
  date: string;
  /** 何が起きたか。2〜3行。あとから読んで面白いことだけ書く */
  body: string;
  /** その日の配信。YouTube の videoId。無いときは行ごと出さない */
  video?: string;
};

export const NORDIC_LOG: Record<string, LegLog> = {};

/**
 * 寄り道を外した一本道。「いま どこにいて、つぎ どこへ行くか」はこれで数える。
 * 出発地（クタイシ）が先頭に入るので、区間の数より1つ多い。
 */
export const MAIN: Leg[] = ROUTE.filter((l) => !l.side);

/** 一本道の止まる場所。地図の街の id と突き合わせるのに使う。 */
export const STOPS: { name: string; leg?: Leg }[] = [
  { name: MAIN[0].from },
  ...MAIN.map((l) => ({ name: l.to.replace(/（.*$/, ""), leg: l })),
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

/** 見どころの種類。印は components/ui/Icon.tsx の同名アイコンを使う。 */
export const CATS: Record<string, { label: string }> = {
  see: { label: "見る" },
  do: { label: "やる" },
  eat: { label: "食べる" },
  buy: { label: "買う" },
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
