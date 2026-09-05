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
  /**
   * その日の日付(YYYY-MM-DD)。**分かっている日にだけ入れる。**
   *
   * 陸路はぜんぶヒッチハイクなので、いつどこに着くかは乗せてもらえた日でずれる。
   * 決まっているのは切符のある2日だけ。**残りを埋めない。**
   * あとから決まったら、ここに1行足せば旅程表に出る（GitHub #107 と同じ扱い）。
   */
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
   * 前の区間と同じ日に動く。旅程表で1日にまとめる。
   * ヘルシンキで泊まらないので、タリンから渡ってきた日の夜に夜行フェリーへ乗る。
   */
  sameDay?: boolean;
  /**
   * この区間の絵（`components/nordic/Marks.tsx` の名前）。
   * **区間ごとに必ず違うものにする。** 同じ印を10回並べると、
   * どの日も同じことをしているように見えてしまう。
   */
  art: string;
  /**
   * その日、お金が要るもの。**実際に払うもの1つ。**
   *
   * 「1kmあたり◯円」にしない。何に使うか分からない金は出しづらいし、
   * 出したあとに何が変わったのかも分からない。
   *
   * 使い先は面のいちばん下の「応援する」だけ。旅程表には金額を出さない。
   * `yen` は空にしておける（陸路6区間の宿代はまだ決まっていない・GitHub #107）。
   * 空のものは「調べています」と出して、金額を作らない。
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
   *
   * `fork` のある区間では、これは**書く欄の中に降ろす**。
   * 席の見出しに問いを2つ並べると、どちらも読まれない。
   */
  ask: string;
  /**
   * わかれ道。**押すだけで答えられる、参加のいちばん下の段。**
   *
   * 道しるべの席は「文章を書く」しか入口が無かった。
   * 書くのは重い。投げ銭をしたことがある人は55人（3%）しかいないうえに、
   * 残りの97%に用意してあるのが作文だけでは、席が2つあるとは言えない。
   *
   * だから**こちらから問いを出して、押すだけで答えられるようにする**
   * （`docs/island-play.md` の3つの原理の3番「世界のほうが先に口を開く」）。
   *
   * **本当に決まっていない分かれ目にしか置かない。** 決まっていることを
   * 聞いても、押した数はどこにも効かない。それは1回で見抜かれる。
   * 10区間のうち6区間にしか無いのは、そのため。
   *
   * 字はここ（Git）にあって、サーバーは id と数しか持たない。
   * 変えてもいいのは `q` と `label` だけで、**`id` は変えない。**
   * 変えると、それまでに押された数が行方不明になる。
   */
  fork?: {
    /** 分かれ目の問い。40字まで。答えが2つに割れるものだけ */
    q: string;
    /** 選択肢。2つ。id は `[a-z][a-z0-9-]{0,15}`、変えない */
    options: { id: string; label: string }[];
  };
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
    fork: {
      q: "始発まで、空港で数時間あります。",
      options: [
        { id: "sleep", label: "寝て、朝から動く" },
        { id: "awake", label: "起きたまま、深夜の空港を歩く" },
      ],
    },
    art: "nightflight",
  },
  {
    id: "katowice-krakow",
    from: "カトヴィツェ",
    to: "クラクフ",
    move: "hitch",
    km: 80,
    time: "1〜3時間",
    // 01:05 にカトヴィツェへ着く便なので、この日だけは切符から決まる
    date: "2026-09-12",
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
    ask: "行くとしたら、どう伝えるのがいいと思いますか？",
    fork: {
      q: "この寄り道、行くかどうかまだ決めていません。",
      options: [
        { id: "go", label: "行ってほしい" },
        { id: "skip", label: "今回は行かないでほしい" },
      ],
    },
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
    ask: "大きなガソリンスタンドで声をかける295km。どうやって声をかけたらいいと思う？",
    fork: {
      q: "断られた回数、数えますか。",
      options: [
        { id: "count", label: "数えてほしい" },
        { id: "no", label: "数えないでほしい" },
      ],
    },
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
    ask: "十字架の丘に寄ったら、そこで何をしてほしい？",
    fork: {
      q: "シャウレイの十字架の丘に、寄れます。",
      options: [
        { id: "stop", label: "寄ってほしい" },
        { id: "hurry", label: "先を急いでほしい" },
      ],
    },
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
    fork: {
      q: "雨に降られたら、どうしますか。",
      options: [
        { id: "stand", label: "濡れても立ち続ける" },
        { id: "wait", label: "屋根のあるところで待つ" },
      ],
    },
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
    // ヘルシンキで泊まらないので、タリンから渡ってきた日の夜にそのまま乗る
    sameDay: true,
    enters: "sweden",
    fare: { what: "夜行フェリーの席と船室", yen: 20300, src: "€43＋船室€75.50" },
    ask: "17時間の夜行フェリー。朝、着いたら終点です。最後の夜に何をしてほしい？",
    fork: {
      q: "最後の夜。着くのは、会いたい人がいる街の朝です。",
      options: [
        { id: "deck", label: "甲板で、朝が来るのを待つ" },
        { id: "sleep", label: "寝て、着く朝にそなえる" },
      ],
    },
    art: "ferrynight",
    stay: "ストックホルム（友だちの家に約1週間）",
  },
];

/**
 * 旅のよてい。**日付ごとに1つ。**
 *
 * 面の本体はここ。前は区間ごとのカードを10枚並べて、その1枚ずつに
 * 「席」という作りものの言葉を置いていた。読む人には通じなかったし、
 * 通じさせるために説明が要る言葉は、そもそも画面に出すものではない
 * （`docs/nordic-fund.md` 「捨てた設計」）。
 *
 * 1日に1区間。ただしヘルシンキでは泊まらないので、タリンから渡ってきた日の夜に
 * そのまま夜行フェリーへ乗る（`sameDay`）。寄り道はその日のうちに戻ってくるので、
 * 泊まる場所は前の日と同じ。
 *
 * **日付は、分かっている日にだけ入る。** 陸路はぜんぶヒッチハイクなので、
 * 何日目にどこへ着くかは乗せてもらえた日でずれる。埋めない。
 */
export type Day = {
  /** 何日目。1から */
  n: number;
  /** 決まっている日付(YYYY-MM-DD)。分からない日は付かない */
  date?: string;
  /** その日に動く区間。ふつうは1つ、夜行フェリーの日だけ2つ */
  legs: Leg[];
  /** その日の終わりに泊まるところ */
  stay?: string;
};

export const DAYS: Day[] = (() => {
  const out: Day[] = [];
  for (const l of ROUTE) {
    const prev = out[out.length - 1];
    if (l.sameDay && prev) {
      prev.legs.push(l);
      if (l.stay) prev.stay = l.stay;
      continue;
    }
    out.push({ n: out.length + 1, date: l.date, legs: [l], stay: l.stay });
  }
  // 寄り道の日は、その日のうちに戻ってくる。泊まるのは前の日と同じ街
  for (let i = 1; i < out.length; i++) {
    if (!out[i].stay && out[i].legs.every((l) => l.side)) out[i].stay = out[i - 1].stay;
  }
  return out;
})();

/**
 * お金が要るもの。**面のいちばん下の「応援する」だけで使う。**
 * 旅程表には金額を出さない。旅の話と、お金の話を混ぜない。
 */
export const FARES = ROUTE.filter((l) => l.fare).map((l) => ({
  id: l.id,
  ...l.fare!,
}));

/**
 * その日に、実際に起きたこと。**旅が終わってから入る。**
 *
 * よていだけの旅程表は、出発前にしか読む理由がない。
 * 越えた日から順にこれが入ると、旅程表がそのまま日記になる。
 * 旅が終わったあとも `/nordic` が読み返される理由は、ここにしかない。
 *
 * 手で書く。10日で10回なので、運用として重くない。
 * 逆に、金額のように毎日入力してもらうものはここに置かない（自動で取れる）。
 *
 * 別ファイルにしないのは、区間の id をここが持っているから。
 * 離すと、id を打ち間違えても誰も気づかないまま出ない。
 *
 * 出発は 2026年9月11日。**着くまでは空のまま。** 空なら行そのものを出さない。
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
