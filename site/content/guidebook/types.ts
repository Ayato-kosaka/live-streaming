import type { IconName } from "@/components/ui/icons";

/**
 * **街のガイドブック（`/travel/<国>/<街>`）の形。1つの街＝1つのデータ。**（#1228）
 *
 * 面の並びは決めてある（あやと 2026-11-15・参考はパリのガイドブック）:
 *
 *   表紙 → 目次 → どんな街 → やりたいことN選 → 見たい → 食べたい → 買いたい → 基本情報
 *
 * 部品は `components/guidebook/`。**街ごとの字は1つもそちらに書かない**——ここの形を満たせば、
 * どの街も同じ面になる。
 *
 * ## 行ったあとの肉付け（`went`）
 *
 * 行く前のガイドが骨組みで、行ったあとは同じ面に「行った」の印・その日の写真・一言・場面が乗る
 * （#1228 決めたこと6・`docs/guide-design.md` ★1）。**骨組みは消さない**——行っていない所もそのまま並ぶ。
 * 欄は `Item` と `Todo` と表紙（`stay`）に1つずつ持たせてある。使い始めるのはスコピエ。
 *
 * ## 好みの印は持たない（#1228。`docs/island-misses.md` #326・#328）
 *
 * 読む人はあやとではない。好みで品を外したり印を付けたりしない。豚肉あり・アルコールあり（`flags`）は
 * **窓の中だけ**で知らせて、選ぶのは読む人。**札と一覧に出す印は `Mark` の3種類だけ**（その国ならでは・値段・季節）。
 */

/** 出どころ1つ。**事実を書いたら必ず連れてくる**（`docs/guide-design.md` 4-4） */
export type Src = {
  name: string;
  url: string;
  /** 見た日（`YYYY-MM-DD`）。在れば出どころの行に「◯月◯日に見た」と出す（`docs/country-guide.md` 1-2） */
  seen?: string;
};

/**
 * 絵1枚。**どの種類かで、添える字が変わる**（`docs/guide-design.md` 4章・★7）。
 *
 * | `kind` | 何 | 添える字 |
 * | --- | --- | --- |
 * | `photo` | 借りた写真（Wikimedia ほか）。実在の場所はこれ | 撮った人／ライセンス（`credit` 必須） |
 * | `card` | あやと島カード（行ったあと） | 「あやと撮影」と日付 |
 * | `illust` | AI で描いた絵（表紙・エリア地図・料理・土産） | 絵の上にも下にも付けない。面の終わりの出どころの欄に1行（あやと 2026-11-16「イラストのチップ要らない」） |
 */
export type Pic = {
  src: string;
  /** 狭い画面で使う小さい版（無ければ `src`） */
  small?: string;
  /** 大きい版（窓の中・広い画面） */
  big?: string;
  w?: number;
  h?: number;
  alt: string;
  kind: "photo" | "card" | "illust";
  credit?: { by: string; lic: string; page: string };
  /** カードの撮影日（`YYYY-MM-DD`） */
  date?: string;
};

/** 現地のつづり。`lang` を付けて出す（読み上げと検索のため） */
export type Local = { text: string; lang: string; roman?: string; kana?: string };

/** 配信の場面（その時刻から開く） */
export type Scene = { v: string; t: number; date: string };

/**
 * **行ったあとの肉付け。** 1件に1つまで（一言は1節に1つ。`docs/guide-design.md` ★2）
 *
 * ## 動画の並び（あやと #1228・2026-11-15）
 *
 * 導線は「検索 → ブログ → ショート → アーカイブ → ライブ」。だから札の動画は
 * **① ショート（`short`）→ ② 配信アーカイブの時刻つきの場面（`scene`）** の順に出す。ショートの無い所は ② だけ。
 * ショートは縦の枠で、押すまではサムネイルだけ（`components/guidebook/Videos.tsx` の `ShortPlayer`）。
 */
export type Went = {
  /** 行った日（`YYYY-MM-DD`） */
  date: string;
  /** その日の写真（あやと島カード） */
  pic?: Pic;
  /** 本人の一言。字幕の字のまま */
  say?: string;
  /** ① ショートの id（`content/shorts.ts` に在ること） */
  short?: string;
  /** ② 配信アーカイブの場面（その時刻から開く） */
  scene?: Scene;
  /**
   * 短い話（案内鳥の文。言っていないことを足さない）。段落ごと。**数は結んだ facts の行どおり**
   * （焼く道具 `python/guidebook_bake.py` が止める）
   */
  story?: string[];
};

/** 豚肉・アルコール。**好みではなく事実**。窓の中のアイコンで知らせて、選ぶのは読む人（札と一覧には出さない。#328） */
export type Flags = { pork?: boolean; alcohol?: boolean };

/**
 * 札の上の印。**3種類だけ**（あやと 2026-11-16「豚・酒も私の好みに偏ってて微妙。『ヨーグルト』とか『薔薇』とか
 * ブルガリアならではのチップならまだわかる」・`docs/island-misses.md` #328）。
 *
 * | `kind` | 何 | 例 |
 * | --- | --- | --- |
 * | `local` | その国ならではのもの | ヨーグルト・バラ |
 * | `price` | 値段（出どころの字に在る額だけ） | 1個 1ユーロ前後・無料 |
 * | `season` | 季節（期間を出どころで確かめたものだけ） | 冬だけ |
 *
 * 「必見」「イラスト」「豚」「酒」は札に出さない（星は窓の中・豚と酒は窓の中・イラストは出どころの欄）。
 * 行ったあとの「行った」は肉付けの印で、この3種類とは別に出す（`docs/guide-design.md` ★1）
 */
export type Mark = { kind: "local" | "price" | "season"; text: string };

/** 窓の中の、事実の1行（入場料・行きかた・所要時間…）。見出しに絵は付けない（`components/guidebook/parts.tsx` の `Facts`） */
export type Fact = { label: string; text: string };

/** 見たい・食べたい・買いたいの1件。**札は絵と名前だけ、字は窓の中** */
export type Item = {
  /** 窓の id の後ろ半分（`#see-<id>`）。**ラテン文字の小文字とハイフン**。描いた絵の置き場（manifest）の鍵と同じ */
  id: string;
  name: string;
  local?: Local;
  /** 一般の重要度。1＝必見・2＝行けたら・3＝余裕があれば */
  rank?: 1 | 2 | 3;
  pic?: Pic;
  /** 札の名前の下の1行（値段・所要時間）。無ければ出さない */
  line?: string;
  /** 窓の本文 */
  body: string;
  facts: Fact[];
  /** コツ（窓の最後に、地を変えて） */
  tip?: string;
  /**
   * Google マップの道。**名前で検索した状態で開く**（座標で開かない。#1228 決めたこと4）。場所は「現地の字の名前＋街」、
   * 料理・土産は「品の名前＋街」で近くの店が並ぶ。組むのは `lib/mapsSearch.ts`（焼くほうは `python/maps_link.py`）
   */
  maps?: string;
  /** 食べられる・買える所（`Place` の id）。**決まった店の無い品には置かない** */
  places?: string[];
  /** 食べたいもので絞る札（`Guidebook["eat"]["kinds"]` の id） */
  kinds?: string[];
  /** 札の上の印（その国ならでは・値段・季節） */
  marks?: Mark[];
  /** 豚肉あり・アルコールあり。**窓の中だけ**に出す */
  flags?: Flags;
  /** どのエリアか（`Area` の id） */
  area?: string;
  /** この場所が出てくるやりたいこと（`Todo` の id）。**互いに繋ぐ**（#1228 決めたこと1） */
  todo?: string[];
  src: Src[];
  went?: Went;
};

/** 店・市場（料理と土産がひもづく所） */
export type Place = {
  id: string;
  name: string;
  roman?: string;
  what: string;
  /** Google マップの道（名前で検索した状態） */
  maps: string;
  /** 中心から何km か。歩いて行かない所だけ */
  km?: number;
  /** あやとが入った店（行ったあと） */
  went?: boolean;
  /** `what` の出どころ（在れば、一覧の下に出どころの行を出す） */
  src?: Src[];
};

/**
 * やりたいこと1つ。**「ソフィアといえばこれ！」の、やってみたい体験**（#1228。あやと 2026-11-16「ソフィア 60点」）。
 *
 * 名所の紹介にしない。ミーハーでベタな欲求（本場のヨーグルト・バラのお土産・温泉・冬のマーケット）を、
 * 「行ってこれをしてきた！」と言える形で選ぶ（`docs/island-misses.md` #327）。場所の一覧は見たいもの（`Item`）の仕事で、
 * 出てくる場所は `see` で見たいものへ繋ぐ。
 *
 * 札に出すのは絵・番号・題・印（`marks`）。**札は全部同じ大きさ（4:3）で縦1列**（あやと 2026-11-16「すべてのカードを
 * 同じサイズ・比率に統一し、縦1列に並べたい」）。`catch` と字は窓の中。
 * 窓（見開き）に出すのは: どこで・何をする・いつ・行き方・時間・お金・コツ・回りかた。**出どころつき。作らない・推測で埋めない**
 */
export type Todo = {
  id: string;
  /** 体験の題。「〜したい！」の調子（読む人の頭の中の欲しいもの） */
  title: string;
  /** 大きなキャッチコピー1行（窓の頭） */
  catch?: string;
  /** 札の小さな印（「冬だけ」「1個 1ユーロ前後」）。**値段か季節の事実だけ**——額・季節・無料は `src` の字に在るもの */
  marks?: Mark[];
  /** 絵の無いあいだ、色の地に大きく置く絵（`components/ui/Icon`）。描いた絵か写真が来たら出ない */
  icon?: IconName;
  /** 札の下の1行（窓の頭にも出す） */
  lead: string;
  pic?: Pic;
  what: string;
  /** いつ（季節もの・期間のあるものだけ） */
  when?: string;
  how: string;
  time: string;
  money: string;
  tip: string;
  route: string;
  /** 出てくる見たいもの（`Item` の id）。窓の「どこで」と、見たいもの側からの繋ぎ */
  see: string[];
  /** 出てくる食べたいもの（`Item` の id）。窓の「どこで」の下に並ぶ */
  eat?: string[];
  /** 出てくる買いたいもの（`Item` の id）。窓の「どこで」の下に並ぶ */
  buy?: string[];
  src: Src[];
  went?: Went;
};

/**
 * エリア。どんな街の地図（`components/guidebook/SpotMap.tsx`）の地区の色と名前・雰囲気のひとこと、窓の中身。
 *
 * **地図に描いてある地区だけを持つ。** 絵の外の所（山・郊外・日帰り）はエリアにしない——地図の縁の矢印
 * （`MapBeyond`）に出す（#1228。スコピエのヴォドノ山・ソフィアの山と郊外）
 */
export type Area = {
  id: string;
  name: string;
  /** 現地の呼び名（地図の札は短い名前のまま、一覧と窓に添える。例: おしゃれエリア → デバル・マーロ） */
  local?: Local;
  /** 塗りの色（地図の札・窓の頭）。濃い字を乗せるので明るい色 */
  color: string;
  lead: string;
  body?: string;
  /** このエリアの見たいもの（`Item` の id） */
  see: string[];
  /**
   * 絵のエリア地図が無いあいだの、色の札の置き場（3列の格子。北が上）。`[列, 行, 横に何列ぶん]`。
   * **大まかな位置関係だけ**——正確な位置はマイマップの仕事
   */
  plan: [number, number, number];
  src: Src[];
  /** 行ったあと: そのエリアを歩いた日と場面 */
  went?: Went;
};

/**
 * どんな街の問いと答え1組。**短い問い（「歴史は？」）と、2〜3文の答え**（#1228。あやと 2026-11-16）。
 *
 * 前は大きい数1つ（「前7000年ごろから」「49の温泉」）の札だった。数を大きく見せる札は AI の作った面に見える、と
 * 言われてやめた（`docs/island-misses.md` #327）。答えは出どころの字のまま、つないでよい（数字と固有名は材料どおり）
 */
export type About = {
  id: string;
  /** 問いの頭の絵（歴史＝遺跡・お金＝硬貨…）。字だけの札が並ぶと、読む前に重く見える */
  icon?: IconName;
  /** 読む人の頭の中の問い。15字まで・「？」で終わる（焼く道具が止める） */
  q: string;
  /** 2〜3文の答え */
  a: string;
  src: Src[];
};

/** 実用ガイド・季節など、押すと開く読みもの1枚 */
export type Guide = {
  id: string;
  icon: IconName;
  title: string;
  lead: string;
  /** 本文の段落。見出しつき */
  parts: { h: string; text: string }[];
  /** ことばの一覧（ひとこと現地語だけ） */
  words?: { local: Local; jp: string }[];
  src: Src[];
  /** 行ったあと: あやとの場合（話と場面1つ） */
  went?: Went;
};

/** 基本情報の頭の4枚。押すと `to` へ（窓の id か、面の中の錨） */
export type Summary = {
  id: string;
  icon: IconName;
  label: string;
  value: string;
  lead: string;
  to: string;
};

/** 1日の予算の1行（宿代は別。値はユーロ） */
export type BudgetRow = { label: string; what: string; eur: [number, number]; src: Src[] };

/**
 * 行ったあと: あやとの1日（**本人がその場で円に直して言った額**）。内訳は facts の行に1つずつ結ぶ。
 * 合計は面の側で足す（足し算だけ。`python/guide_watch.py` が、合計が内訳の和かを見る）
 */
export type BudgetDay = { label: string; parts: { label: string; yen: number; at: Scene }[] };

/** 小さな出費の目安（現地のお金と円。外の出どころ） */
export type BudgetExtra = { label: string; local: string; yen: string; src: Src[] };

export type Climate = {
  /** 月ごとの平均最高・平均最低（℃）と降水量（mm） */
  months: { hi: number; lo: number; mm: number }[];
  /** 何年の平年値か（見出しの下の1行） */
  note: string;
  src: Src[];
};

export type Pack = { icon: IconName; label: string; why: string; src: Src[] };

/** 困ったとき */
export type Help = {
  calls: { num: string; label: string; note: string; src: Src[] }[];
  embassy: { name: string; address: string; tel: string; hours?: string; note?: string; maps: string; src: Src[] };
};

/** 8方位（絵の上が北） */
export type MapDir = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";

/**
 * 地図の外の所（manifest の `areamap.beyond`）。絵の縁に、向きの矢印と名前で出す。
 *
 * - `x` `y` は矢印の札の位置（絵の上の割合）。**本当の向き（地図の真ん中から見た方角）の縁に置く**
 * - 押すと開く先は `id` で決める: 同じ id の見たいもの（`#see-<id>`）→ やりたいこと（`#do-<id>`）→
 *   どちらも無ければ、現地の名前で Google マップを開く（「マップで見る」）
 */
export type MapBeyond = { id: string; name: string; local?: string; lat?: number; lon?: number; x: number; y: number; dir: MapDir };

/** Google マイマップの埋め込み（`docs/mymaps.md`）。中心と縮尺はピンの広がりから焼いたもの */
export type MyMap = { mid: string; title: string; ll: string; z: number; pins: number };

export type Guidebook = {
  /** 国の slug（`content/travel.ts`） */
  country: string;
  /** 街の slug */
  city: string;
  /** 街の名前（h1・パンくずの最後と同じ字） */
  name: string;
  /** 表紙の小見出し（国の名前） */
  kicker: string;
  local: Local;
  /** 表紙の一言（40字まで） */
  lead: string;
  cover: Pic;
  /** 題と一文（`<title>` と `description`） */
  title: string;
  description: string;
  /** 公開と最終更新（中身の字が変わった日。ビルドの日にしない） */
  published: string;
  updated: string;
  /** 焼いた中身の指紋（焼く道具が「最終更新」を進めるかを決める。面には出さない） */
  hash?: string;
  /** 行ったあと: 居た期間（表紙の「あやとが◯日いた」） */
  stay?: { from: string; to: string };
  /** 円に直すときのレート（字で「1ユーロ＝177円（2026年11月6日）」のように出す） */
  rate: { unit: string; yen: number; date: string };
  about: { cards: About[]; areas: Area[] };
  todo: Todo[];
  /** `map` はマイマップを作るまで無い。無いあいだは枠を出さず、一覧と「マップ」の札だけで成り立つ */
  see: { items: Item[]; map?: MyMap; far: Place[] };
  eat: { kinds: { id: string; label: string }[]; items: Item[]; places: Place[]; map?: MyMap };
  buy: { items: Item[]; places: Place[]; map?: MyMap };
  /**
   * 面のいちばん下の「この街の動画」: ショートの横並び → アーカイブの一覧 → 配信を見に来る（チャンネル）。
   * `streams` は `content/cityStreams.ts` の鍵（国・街）。`shorts` はこの街のショート（`content/shorts.ts` の id）で、
   * 行った所の `went.short` もここに並ぶ（同じ id は1回）
   */
  videos: { streams?: { country: string; city: string }; shorts: string[] };
  basics: {
    summary: Summary[];
    guides: Guide[];
    /** 季節の窓（旬の季節の札から開く。行事も入る） */
    season: Guide;
    budget: {
      rows: BudgetRow[];
      tips: { text: string; src: Src[] }[];
      /** 行ったあと: あやとの1日 */
      days?: BudgetDay[];
      extras?: BudgetExtra[];
      /** 円に直したレートの1文と、その出どころ */
      rate?: string;
      rateSrc?: Src[];
      /** あやとの額の読みかた（話と場面1つ） */
      note?: Went;
      /** 物価の記事（`/travel/<国>/<街>/prices`） */
      article?: string;
    };
    pack: Pack[];
    climate: Climate;
    help: Help;
  };
};
