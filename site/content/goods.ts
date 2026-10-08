/**
 * あやとグッズ。**面（`app/goods/page.tsx`）は、ここを読むだけ。**
 *
 * あやとの言葉（2026-10-08）:
 *
 * > 「あやとグッズ」ページを作って欲しい、ページはこんなイメージ
 * > ・あやとステッカー（無料）→ みんなも投稿できる。ダウンロードもできる。
 * >   付箋の読み書きもできる。あやと島カードに一緒に貼れる。
 * >   今は一つで、あやと島を歩いてるキャラクター画像
 * > ・あやと島カード（無料）→ あやと島内のリンクだけ
 * > ・キャラクター（無料）→ あやと島内リンクだけ
 * > ・カレンダー（検討中）→ イメージを画像で投稿できるように。
 * >   付箋でアイデア出しするイメージ
 * > ・LINEスタンプ（検討中）→ 検討中は色々候補を出していいねとか押せるように。
 * >   みんなも投稿できる。該当の付箋も読み書きできる。
 * >   ダウンロードできないように透かし（「LINEスタンプ」みたいな）
 * > ・SUZURI グッズ → サムネ画像はトートバッグ、リンクは suzuri.jp/ayato_arigato
 *
 * ## 「もう在る」と「まだ決めていない」を、字ではなく形で分ける
 *
 * 6つのうち3つは**もう手に入る**（ステッカー・カード・キャラクター）、
 * 2つは**まだ何も決まっていない**（カレンダー・LINEスタンプ）、
 * 1つは**外の店**（SUZURI）。読む人にとっては別の用事なので、
 * `stage` で分けて、面の側が見た目を変える。
 *
 * **仕組みの説明は1文字も書かない**（`docs/island-standards.md` 6章）。
 * 書いてよいのは「その人がこれから何をするか／何が起きるか」だけ。
 */

/** 欄のいまの段。見た目はここで決まる（`app/goods/goods.css`） */
export type Stage =
  /** もう手に入る */
  | "ready"
  /** まだ何も決まっていない。みんなで決めるところ */
  | "thinking";

/** 付箋の宛先（`content/themes.ts` の id）。**新しく作らない。** */
export type GoodsTheme = "goods-art" | "goods-calendar" | "goods-linestamp";

/**
 * ステッカー1枚。
 *
 * **落とすのは元絵そのまま**（`file`）。手を入れていないので、印刷しても
 * 画面に貼っても、あやとが描いたものがそのまま出る。
 * 面に並べるのは小さく焼いたほう（`art`）で、原寸は押したときだけ取りにいく。
 */
export type Sticker = {
  id: string;
  name: string;
  /** 面に並べる1枚（長辺480） */
  art: string;
  /** 落とすときの1枚（元絵） */
  file: string;
  /** 落ちてくるファイルの名前 */
  saveAs: string;
  /** `art` の寸法。場所を先に取るために要る */
  w: number;
  h: number;
};

/**
 * いまあるステッカー。**1枚**（あやと「今は一つで、あやと島を歩いてる
 * キャラクター画像」）。増えたらここに1行足す。
 */
export const STICKERS: Sticker[] = [
  {
    id: "walk",
    name: "島を歩くあやと",
    art: "/goods/ayato-sticker.webp",
    file: "/goods/ayato-sticker.jpg",
    saveAs: "ayato-sticker.jpg",
    w: 320,
    h: 480,
  },
];

/**
 * LINEスタンプの1枚。
 *
 * **セリフは決まっていて、絵はまだ届いていない。**
 * 絵が届いた日にやることは2つだけ:
 *
 *   1. 元絵を `tools/goods/line-src/<id>.png` に置く
 *   2. `python3 tools/goods/stampbake.py` を回す（透かしが焼ける）
 *
 * そのあと、ここの `art` に `/goods/line/<id>.webp` と書けば面に出る。
 * **焼いていない絵を `art` に書くと、`python/goods_stamp_selftest.py` が
 * 赤くなる**——透かしの無い絵が面に出る道を閉じてある。
 */
export type LineStamp = {
  /** 変えない。焼いた絵のファイル名になる */
  id: string;
  /** スタンプの一言 */
  line: string;
  /** 焼いた絵。**まだ届いていないあいだは書かない** */
  art?: string;
};

/**
 * 絵がまだ無いあいだ、枠に出しておく板。
 *
 * **これも `stampbake.py` が焼いたもの**で、透かしが載っている。
 * 枠だけを黙って並べない（あやと「空の枠を黙って並べないで」）ので、
 * 面の側は「絵はこれから」を字で添える。
 */
export const LINE_PENDING = "/goods/line/pending.webp";

/**
 * あやとの10枚。**順番もあやとが決めたとおり。**
 *
 * 並べ替えない——「おはよう・こんばんは・おやすみ」で1日が回って、
 * そのあとに気持ちが4つ、最後に使いどころのある3つ、という並びになっている。
 */
export const LINE_STAMPS: LineStamp[] = [
  { id: "ohayou", line: "おはよう" },
  { id: "konbanwa", line: "こんばんは" },
  { id: "oyasumi", line: "おやすみ" },
  { id: "arigatou", line: "ありがとう" },
  { id: "ureshii", line: "うれしい" },
  { id: "iiyanka", line: "いいやんか" },
  { id: "yabai", line: "やばいよやばいよ" },
  { id: "chottomatte", line: "ちょっとまってよ" },
  { id: "sugumodoru", line: "すぐもどる" },
  { id: "oumaiga", line: "おーまいがー" },
];

/** スタンプの一言だけ。付箋の中から「この一言のこと」を見分けるのに使う。 */
export const LINE_WORDS = LINE_STAMPS.map((s) => s.line);

/**
 * SUZURI の店。**島の外へ出る。**
 *
 * サムネはあやとが選んだトートバッグの写真。
 *
 * **品ぞろえも値段も書かない。** どちらも向こうが持っていて、こちらに
 * 焼くと変わった日から嘘になる（`docs/island-standards.md` 16章）。
 * 書いてよいのは、写真に写っているものと、押したら何が起きるかだけ。
 */
export const SUZURI = {
  href: "https://suzuri.jp/ayato_arigato",
  thumb: "/goods/suzuri-tote.webp",
  w: 560,
  h: 560,
  /** 写真の中身。見えているものだけを言う */
  cap: "イギリスのトートバッグ",
  /** 押したら何が起きるか */
  note: "押すと、島の外の店にうつる",
};
