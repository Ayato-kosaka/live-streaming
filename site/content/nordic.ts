/**
 * 北欧ヒッチハイク旅のデータ。
 *
 * 企画の芯は「ヒッチハイクで北欧を回る」ではない。
 * **スウェーデンに会いたい人がいて、そこまで行く。**
 * 飛行機がポーランド行きしか安くなかったので、そこから先を人の車でつなぐ。
 * この順で読めるように、`WHY` に経緯を置いてある。
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
   * わかれ道。**押すだけで答えられる、参加のいちばん下の段。**
   *
   * **本当に決まっていない分かれ目にしか置かない。** 決まっていることを
   * 聞いても、押した数はどこにも効かない。それは1回で見抜かれる。
   *
   * **問いは、それだけ読んで何の話か分かる形で書く。**
   * 「始発まで、空港で数時間あります」は、どこの空港のいつの話かが問いの中に無い。
   * オーナーに「何のこと？ ってなる」と止められた。場所と時と、
   * 何が分かれているのかを、問いの文そのものに入れる。
   * 上に出る「何日目・どこからどこへ」の一行（`Asks`）は、その念押しであって、
   * それを読まないと通じない問いは書かない。
   *
   * 字はここ（Git）にあって、サーバーは id と数しか持たない。
   * 変えてもいいのは `q` と `label` だけで、**`id` は変えない。**
   * 変えると、それまでに押された数が行方不明になる。
   */
  fork?: {
    /** 分かれ目の問い。答えが2つに割れるものだけ */
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
    note: "唯一の飛行機。スウェーデン行きが高くて、安かったのがこのポーランド行きだった。機内持ち込みのカバンひとつだけで乗る。",
    enters: "poland",
    fare: { what: "クタイシ→カトヴィツェの飛行機", yen: 13000, src: "219ラリ" },
    fork: {
      q: "カトヴィツェの空港に着くのは、深夜1時です。始発が動きだすまで数時間あります。",
      options: [
        { id: "sleep", label: "寝て朝から動く" },
        { id: "awake", label: "起きたまま歩く" },
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
    note: "最初の親指をここで上げる。空港で朝を待ってから動きだす。",
    stay: "クラクフ",
    fare: { what: "クラクフの一泊" },
    art: "airportwait",
  },
  {
    id: "krakow-oswiecim",
    from: "クラクフ",
    to: "オシフィエンチム（アウシュヴィッツ）",
    move: "hitch",
    km: 66,
    time: "1〜2時間",
    // 行くかどうかを聞くわかれ道を置いていたが、1日目に行くと決まった。
    // 決まったことを聞き続けると、押した数がどこにも効かない。
    note: "アウシュヴィッツ強制収容所の跡地。日帰りで行って、その日はクラクフに戻って泊まる。",
    side: true,
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
    fork: {
      q: "乗せてもらえるまでに、何回も断られます。その回数を数えますか。",
      options: [
        { id: "count", label: "数えてほしい" },
        { id: "no", label: "数えないでいい" },
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
    fork: {
      q: "ヴィリニュスからリガへ向かう途中のシャウレイに、十字架が20万本立つ丘があります。",
      options: [
        { id: "stop", label: "寄ってほしい" },
        { id: "hurry", label: "先を急いで" },
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
    fork: {
      q: "リガからタリンまでのバルト海沿い307kmで、雨に降られたらどうしますか。",
      options: [
        { id: "stand", label: "濡れても立つ" },
        { id: "wait", label: "屋根の下で待つ" },
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
    fork: {
      q: "最後はヘルシンキからストックホルムまで17時間の夜行フェリー。着いた朝が、この旅の終点です。",
      options: [
        { id: "deck", label: "甲板で朝を待つ" },
        { id: "sleep", label: "寝ておく" },
      ],
    },
    art: "ferrynight",
    stay: "ストックホルム（友だちの家に約1週間）",
  },
];

/**
 * 旅のよてい。**オーナーが言い切った日だけを、言い切ったとおりに並べる。**
 *
 * 1日目にアウシュヴィッツへ行ってクラクフあたりに泊まる。2日目ワルシャワ、
 * 3日目ビャウィストク、6日目ヴィリニュス、7日目リガ。**ここまでが本人の言葉。**
 * 4日目・5日目と、リガから先が何日目になるかは言われていないので、
 * 数字を入れない。**分からない日を埋めない**（ここを埋めると、旅程表ぜんぶが
 * 「たぶんこうだろう」に見えて、決まっている5日ぶんまで信じられなくなる）。
 *
 * ROUTE から機械的に組み立てていたのをやめて、ここは手で並べる。
 * 1日に1区間という決まりが、そもそも本人の言い方と合っていなかった
 * （1日目は2区間、リガから先はいくつかの区間で何日か）。
 */
export type Day = {
  /** 何日目。**本人が言い切った日にだけ入る。** */
  n?: number;
  /** 数字の代わりに出す札。「出発」「4日目・5日目」「リガのあと」「予備の2日」 */
  label?: string;
  /** 面の中の名前。上の司令塔から `#day-…` で飛んでくる。**変えない。** */
  id: string;
  /** 決まっている日付(YYYY-MM-DD)。切符のある2日だけ */
  date?: string;
  /** その日に動く区間 */
  legs?: Leg[];
  /** その日の終わりに泊まるところ */
  stay?: string;
  /** その行に添える一行。決まっていない日と、予備の日はこれだけを持つ */
  say?: string;
  /** 区間の入っていない行。罫線と字だけにする */
  bare?: boolean;
};

const leg = (id: string) => {
  const l = ROUTE.find((x) => x.id === id);
  if (!l) throw new Error(`旅程表に無い区間: ${id}`);
  return l;
};

export const DAYS: Day[] = [
  {
    id: "day-depart",
    label: "出発",
    date: "2026-09-11",
    legs: [leg("kutaisi-katowice")],
  },
  {
    id: "day-1",
    n: 1,
    date: "2026-09-12",
    // 深夜1時にカトヴィツェへ着いて、その日のうちにアウシュヴィッツへ行く。
    // 寄り道なので夜はクラクフに戻る（本人の「クラクフあたりに泊まる」）。
    legs: [leg("katowice-krakow"), leg("krakow-oswiecim")],
    stay: "クラクフ",
  },
  { id: "day-2", n: 2, legs: [leg("krakow-warszawa")], stay: "ワルシャワ" },
  { id: "day-3", n: 3, legs: [leg("warszawa-bialystok")], stay: "ビャウィストク" },
  {
    id: "day-open",
    label: "4日目・5日目",
    bare: true,
    say: "まだ決めていません。ビャウィストクを出てから、ヴィリニュスに着くまでのあいだの2日です。",
  },
  { id: "day-6", n: 6, legs: [leg("bialystok-vilnius")], stay: "ヴィリニュス" },
  { id: "day-7", n: 7, legs: [leg("vilnius-riga")], stay: "リガ" },
  {
    id: "day-after",
    label: "リガのあと",
    legs: [leg("riga-tallinn"), leg("tallinn-helsinki"), leg("helsinki-stockholm")],
    say: "何日目になるかは、ここまでの進み方で決まります。泊まるのはタリンで一泊。ヘルシンキでは泊まらず、その日の夜に夜行フェリーへ乗ります。",
  },
  {
    id: "day-spare",
    label: "予備の2日",
    bare: true,
    say: "雨で動けない日と、車がつかまらない日のために、2日ぶん空けてあります。ぜんぶで9日ぐらいの見立てです。",
  },
];

/** 区間の id → 旅程表のどの行か。上の司令塔が「今日のところへ」で使う。 */
export const DAY_OF: Record<string, Day> = Object.fromEntries(
  DAYS.flatMap((d) => (d.legs ?? []).map((l) => [l.id, d])),
);

/** その行の呼び名。「2日目」か、数字が無ければ札のほう。 */
export const dayName = (d: Day) => (d.n ? `${d.n}日目` : (d.label ?? ""));

/**
 * お金が要るもの。**面のいちばん下の「応援する」だけで使う。**
 * 旅程表には金額を出さない。旅の話と、お金の話を混ぜない。
 *
 * 値段の分かっていないものは、1行にまとめる。「いくらで見ているか、いま調べています」が
 * 6行並ぶと、調べていないことのほうが目立つ（実測で 220px）。
 */
export const FARES: { what: string; src?: string }[] = [
  ...ROUTE.filter((l) => l.fare?.yen).map((l) => ({
    what: l.fare!.what,
    src: l.fare!.src ?? `${l.fare!.yen!.toLocaleString()}円`,
  })),
];

const TODO_FARES = ROUTE.filter((l) => l.fare && !l.fare.yen);
if (TODO_FARES.length > 0) {
  FARES.push({
    what: `泊まる街の一泊（${TODO_FARES.length}か所）`,
    src: "いくらで見ているか、いま調べています",
  });
}

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

/**
 * 会いに行く相手。**名前も素性も出さない**（GitHub #106）。
 *
 * その人はこの企画に応募していない。目標にされることに同意していない実在の人なので、
 * 出していいと本人の口から確かめられるまでは、ページの上ではずっと「その人」のまま
 * （`docs/nordic-fund.md` 1章）。
 *
 * 出していいと分かったら `name` に名前を入れる。`WHY` の文の中の `{who}` が
 * 置き換わるだけなので、**文章のほうは1文字も書き直さなくていい。**
 */
export const FRIEND = { name: "" };

/**
 * どうしてこの旅が起きるのか。**面のいちばん上の説明。**
 *
 * ここが無いあいだ、面には「ヒッチハイクで行く」としか書いていなかった。
 * なぜ行くのか（会いたい人がいる）も、なぜ歩くのか（スウェーデン行きの飛行機が
 * 高いから）も、どこにも書いていなかった。オーナーに「企画の説明が足りない」と
 * 止められたのがここ。
 *
 * **箇条書きにしない。** 出会って、帰ってしまって、何度も近くまで来て、
 * 呼んでもらえた、という順で読めることに意味がある。
 * 事実だけを書く。本人から「ここだけの話」と言われたことは書かない。
 */
export const WHY: string[] = [
  "{who}と出会ったのは、2023年8月1日です。留学で3ヶ月だけ日本に来ていた人で、そのころのいちばんの親友でした。遊ぶのが好きで、東京にこれだけ遊ぶところがあることに、すごく惚れ込んでいました。",
  "3ヶ月で帰らないといけなくて、帰ってしまいました。そこからずっと、また会いたいと思っています。ヨーロッパには何度も来ました。スウェーデンまであともう少し、というところまで来たこともあります。それでも、まだ会えていません。",
  "{who}から「ぜひ会いに来てよ」と言ってもらえました。だから今回は、スウェーデンまで会いに行きます。",
  `ただ、スウェーデンまでの飛行機は高いです。安かったのはポーランド行きでした。だからポーランドまで飛んで、そこから先は人の車に乗せてもらって北へ上がります。地面のぶんが${HITCH_KM.toLocaleString()}km。ヒッチハイクなのは、そういう理由です。`,
].map((s) => s.replaceAll("{who}", FRIEND.name || "その人"));

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
