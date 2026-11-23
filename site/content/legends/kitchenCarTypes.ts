import type { Src } from "@/content/guidebook/types";

/**
 * **ノマドキッチンカーの面（`/legends/nomad-kitchen-car`）の中身の形。**（#1418・M-8・ADR 0018・ADR 0020）
 *
 * 焼くのは `python/legend_kitchen_bake.py`（材料 `python/data/legends/nomad-kitchen-car/book.json` から）。**手で書かない。**
 * 受け渡しの型は材料の置き場の `README.md` が正で、ここはそれを焼いた形。インドの形（`./types.ts` の `LegendBook`）とは別の形なので、
 * 面の名簿・llms.txt・`/all` は共通の頭（`content/legends/index.ts` の `headOf`）だけを読む。
 *
 * 節の並びは #1418 本文2章とあやとの答え: 表紙・目次 → ルートと景色 → 売るもの → 外装と内装 → 収益構造 → 課題一覧 →
 * 30日後にキッチンカーでヨーロッパを一周する人 →（下のほうに畳む）ここまでの進み具合・判断ログ・確かめた事実 → 書き手・出どころ。
 * 付箋の節は、下書きの印を外す日に足す（お題の行がまだ無い。M-33）。
 */

/** 節の id。目次と錨（`#<id>`）になる */
export type KitchenSection = "route" | "menu" | "look" | "money" | "issues" | "shorts";
/** 下のほうに畳む3つ */
export type KitchenFold = "progress" | "log" | "facts";

/**
 * 本人の言葉の場面。場面を持つものは `v`（配信の id）と `t`（頭からの秒）と「2026年11月21日の配信 4:01:00」、
 * 持たないものは日付だけ（「2026年11月9日の配信」）
 */
export type KcScene = { date: string; cite: string; v?: string; t?: number };

/** 幅（`[小, 大]`） */
export type KcRange = [number, number];

/** 食べ物1つ（比較の表とメニュー開発の生地）。`profit`・`rate` は値段と材料の幅の真ん中、税抜の値段から焼いた */
export type KcFood = {
  id: string;
  name: string;
  /** 数える単位（匹・舟・枚） */
  unit: string;
  /** メニュー開発の生地に並ぶか（ピザだけ並ばない） */
  sim: boolean;
  perHour: KcRange;
  price: KcRange;
  cost: KcRange;
  dough: KcRange;
  pack: KcRange;
  machine: string;
  energy: { kind: "電気" | "ガス"; text: string; gasKgH: number; elecKw: number };
  profit: number;
  rate: number;
  src: Src[];
  /** 出どころが見立ての欄の名前（材料の `est`） */
  est: string[];
};

/** 中身1つ。`cost` は1個に3つ入れるときの1つぶん。`known` は初めての人に中身が分かるか（3 分かる・2 分かれる・1 分からない） */
export type KcFilling = {
  id: string;
  name: string;
  foods: string[];
  cost: KcRange;
  known: 1 | 2 | 3;
  allergens: string[];
  flags: string[];
  from: "ayato" | "viewer" | "guide";
  /** 島の焼いた絵（`public/sprites/<名前>.webp`）。無ければ字の札 */
  sprite?: string;
  src: Src[];
  est: string[];
};

/** 面に並べる1行（見出し・字・見立ての印）。字は焼く道具が数から組んだもの */
export type KcRow = { label: string; text: string; est: boolean };

/** 売る場所1つ。出店料は定額（€/日）か売上の割合。`rows` は前提の畳みに並べる字（売る時間・出店料・1日に来て買う人） */
export type KcPlace = {
  id: string;
  name: string;
  fee: { kind: "fixed"; eur: KcRange } | { kind: "share"; pct: KcRange };
  hours: number;
  buyers: KcRange;
  rows: KcRow[];
  src: Src[];
  est: string[];
};

/** 案内鳥のひとことの鍵（先に当たったもの1つ。並びは `sim.sayOrder`） */
export type KcSay = "loss" | "bake" | "crowd" | "pricey" | "unknown" | "thin" | "good";

/**
 * メニュー開発の最初の結果（焼く道具の `menu()` の値。面の部品は同じ式で同じ値を出す）。
 * `buy` は「初めての人が買いたくなるか」の段（0〜2。字は `sim.buy`）
 */
export type KcMenuStart = {
  cost: number;
  net: number;
  margin: number;
  rate: number;
  perHour: number;
  cap: number;
  appeal: number;
  demand: number;
  sold: number;
  feeFixed: number;
  feeShare: number;
  gasKg: number;
  elec: number;
  fuel: number;
  left: number;
  buy: 0 | 1 | 2;
  say: KcSay;
};

/** 収益構造のつまみ1つ。`default` は焼く道具が最初の1匹から組んだ値（刻みの上・幅の中） */
export type KcInput = {
  id: "price" | "sold" | "cost" | "fee-fixed" | "fee-share" | "gas-kg" | "drive-km";
  min: number;
  max: number;
  step: number;
  default: number;
  src: Src[];
  est: string[];
};

/** つまみにしない値（LPG・軽油・燃費・電気・付加価値税）。`est` は見立ての印 */
export type KcFixed = { value: number; unit: string; src: Src[]; est: boolean };
export type KcFixedKey = "lpg_eur_kg" | "diesel_eur_l" | "l_per_100km" | "power_eur_kwh" | "vat_pct";

export type KcLook = { id: string; name: string; lead: string; interior: { name: string; lead: string; src: Src[] } };

export type KcVehicle = {
  id: string;
  name: string;
  /** あやとの言葉（場面つき） */
  said?: KcScene & { text: string };
  price: { eur: KcRange; what: string };
  /** 値段の幅の字（「€5,000〜20,000」） */
  priceText: string;
  license: string;
  good: string;
  weak: string;
  /** 3D の最初の姿（窓口つきの箱バンだけ） */
  first: boolean;
  src: Src[];
};

export type KcBuyOrRent = { id: "buy" | "rent"; name: string; price: string; good: string; weak: string; src: Src[] };

/** 本物のキッチンカーの写真（絵担当の `photos.json`。Commons の縮尺を指す。添えるのは撮った人と許諾だけ） */
export type KcPhoto = { id: string; img: string; thumb: string; page: string; by: string; lic: string; alt: string; w: number; h: number };

export type KcLife = { n: number; id: string; title: string; plan: string; stars: number; src: Src[] };

export type KcLayer = { id: string; title: string; text: string; weight: "light" | "mid" | "heavy" | "heaviest"; weightLabel: string; src: Src[] };

export type KcCompare = { id: string; label: string; japan: string; europe: string; src: Src[] };

export type KcFact = { id: string; text: string; src: Src[]; grade?: string };

export type KitchenCarBook = {
  slug: string;
  /** 材料の日付（中身の字が変わった日。ビルドの日にしない） */
  updated: string;
  /** 焼いた中身の指紋（面には出さない） */
  hash: string;
  /** `goal` は「2027年の秋ごろの開始を目標に進めている（2026年11月）」の字のまま。企画の表の日付は空のまま */
  meta: { title: string; description: string; h1: string; sub: string; goal: string };
  sections: Record<KitchenSection, string>;
  folds: Record<KitchenFold, string>;
  subs: {
    menuSim: string;
    foodCompare: string;
    dress: string;
    vehicles: string;
    photos: string;
    daySim: string;
    big: string;
    life: string;
  };
  /** 添える字（ルート「イメージ。まだ決まっていない」・30本・数字「目安」・課題「2026年11月23日時点の考え」） */
  side: { route: string; shorts: string; money: string; issues: string };
  /** 押しどころ・表の頭・小さな印の字（焼く道具の `UI`） */
  ui: {
    updated: string;
    back: string;
    sources: string;
    drew: string;
    more: string;
    est: string;
    picks: string[];
    why: string;
    ideas: string;
    viewer: string;
    compare: Record<"food" | "perHour" | "price" | "cost" | "profit" | "rate" | "machine" | "energy", string>;
    interior: string;
    vehicle: Record<"price" | "license" | "good" | "weak", string>;
    place: Record<"hours" | "fee" | "buyers", string>;
    star: string;
    buyOrRent: string;
    premise: string;
    notIn: string;
    fixed: Record<KcFixedKey, string>;
    yen: string;
    work: string;
    permit: string;
    japan: string;
    europe: string;
    stars: string;
    who: Record<"ayato" | "guide", string>;
    log: Record<"date" | "what" | "why" | "by", string>;
  };
  /** 目次の札（節の名前と数） */
  toc: { id: KitchenSection; label: string; note: string }[];
  /** 引用2つ（大きく。日付だけ。場面のリンクを持たない）と小さな注 */
  cover: { quotes: (KcScene & { id: string; text: string })[]; note: string };
  /** あやとの例（案内鳥の地の文。「」で引かない）・線（日付・季節・長さを持たない）・地名3つ・島に面の在る国 */
  route: {
    plan: { text: string; date: string };
    line: { lat: number; lon: number }[];
    labels: { id: string; name: string; lat: number; lon: number }[];
    countries: string[];
  };
  views: { id: string; title: string; lead: string; scene: KcScene }[];
  menu: {
    picks: { rank: 1 | 2 | 3; food: string }[];
    /** たい焼きが第1になった場面 */
    decided: KcScene;
    why: { id: string; text: string }[];
    ideas: { id: string; name: string; food: string; from: "ayato" | "viewer"; date: string }[];
  };
  foods: KcFood[];
  /** 食べ物ごとの比較の表（頭と、食べ物ごとの字。`est` は見立ての印） */
  compare: { head: string[]; rows: { id: string; name: string; cells: { text: string; est: boolean }[] }[] };
  fillings: KcFilling[];
  places: KcPlace[];
  /**
   * メニュー開発のシミュレーションの最初の形と、式の決め（`rule`。焼く道具の `RULE`）。
   * **ひとことの分かれ目（crowd・thin）は仮**（焼く道具の `--say-table` を見てから運営が決める）
   */
  sim: {
    food: string;
    fillings: string[];
    price: number;
    place: string;
    say: Record<KcSay, string>;
    sayOrder: KcSay[];
    /** 初めての人が買いたくなるかの3段の字 */
    buy: string[];
    rule: {
      known: Record<"1" | "2" | "3", number>;
      power: number;
      appeal: [number, number];
      buy: [number, number];
      crowd: number;
      thin: number;
    };
    /** 走る距離（km。メニュー開発は1日の収益の最初の値と同じ距離で燃料を数える） */
    driveKm: number;
    start: KcMenuStart;
  };
  looks: KcLook[];
  vehicles: KcVehicle[];
  buyOrRent: KcBuyOrRent[];
  photos: KcPhoto[];
  /** 1日の収益のシミュレーション。**1日まで**（ひと月・車の分割・保険・泊まる所を持たない） */
  money: {
    inputs: KcInput[];
    fixed: Record<KcFixedKey, KcFixed>;
    /** 前提の畳みに並べる字（固定の値と円に直す率） */
    premise: KcRow[];
    /** 最初の1匹の電気（つまみにしない）と、最初の結果（メニュー開発の最初の結果と同じ） */
    start: { elec: number; left: number };
  };
  /** 円に直す1本（円は焼かない。つまみで変わるので面が計算する） */
  rate: { jpyPerEur: number; date: string; src: Src[] };
  issues: {
    asOf: string;
    /** 特大課題1。決めた1文だけ（足さない・削らない・言い換えない・出どころを付けない） */
    work: { title: string; text: string };
    /** 特大課題2。あやとの考え（案内鳥の地の文）・4層・日本との表 */
    permit: { title: string; plan: { text: string; date: string }; layers: KcLayer[]; compare: KcCompare[] };
    /** 暮らしの課題（グループ10の並び） */
    life: { name: string; items: KcLife[] }[];
  };
  /** 30本の題（並びが番号。1〜30） */
  shorts: string[];
  progress: { date: string; title: string; body: string; scene?: KcScene }[];
  log: { date: string; what: string; why: string; by: "ayato" | "guide" }[];
  facts: { id: string; name: string; items: KcFact[] }[];
};
