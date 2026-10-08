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
 * いまあるステッカー。**3枚。並びもあやとが決めたとおり。**
 *
 * 1枚目は**島でほんとうに歩いているあの絵**そのもの
 * （`public/characters/ayato.webp`。`IsleStage` が島に立てているのと同じ1枚）。
 * **写しを作らず、島と同じファイルを指している。** 写すと、島の絵を描き直した日に
 * ステッカーだけ前の絵のまま残る。
 *
 * 3枚目は緑の1枚。**題は「ヒッチハイクするあやと」**（あやと 2026-10-08。
 * 並びも「STOP が3枚目でいいや」）。
 * 親指を立てて道に立っている絵なので、「島を歩く」ではない。
 *
 * **ここの並びが、あやと島カードに入れるあやとの選び先にもなる**
 * （`components/cards/CardSheet.tsx`）。1行足せば、カードでも選べるようになる。
 */
export const STICKERS: Sticker[] = [
  {
    id: "isle",
    name: "島にいるあやと",
    art: "/characters/ayato.webp",
    file: "/characters/ayato.webp",
    saveAs: "ayato-island.webp",
    w: 273,
    h: 319,
  },
  {
    /* **2枚目**（あやと「この子もステッカーに欲しい」2026-10-08）。
       LINEスタンプと同じ線の絵。**透過のまま配る**ので、白地の無いところへも貼れる。
       題はこちらで付けた（あやとは題を言っていない）。変えたければ1行。 */
    id: "walk",
    name: "歩いているあやと",
    art: "/goods/ayato-walk.webp",
    file: "/goods/ayato-walk.png",
    saveAs: "ayato-walk.png",
    w: 480,
    h: 480,
  },
  {
    id: "hitch",
    name: "ヒッチハイクするあやと",
    art: "/goods/ayato-sticker.webp",
    file: "/goods/ayato-sticker.jpg",
    saveAs: "ayato-hitchhike.jpg",
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
  { id: "ohayou", line: "おはよう", art: "/goods/line/ohayou.webp" },
  { id: "konbanwa", line: "こんばんは", art: "/goods/line/konbanwa.webp" },
  { id: "oyasumi", line: "おやすみ", art: "/goods/line/oyasumi.webp" },
  { id: "arigatou", line: "ありがとう", art: "/goods/line/arigatou.webp" },
  { id: "ureshii", line: "うれしい", art: "/goods/line/ureshii.webp" },
  /* **すごいよ は、あとから届いた11枚目。** 気持ちの並びの中に入れてある
     （うれしい → すごいよ → いいやんか）。LINE に出すときの順番は
     あやとが後で決めるので、ここの並びは島の面の並びでしかない。 */
  { id: "sugoiyo", line: "すごいよ", art: "/goods/line/sugoiyo.webp" },
  { id: "iiyanka", line: "いいやんか", art: "/goods/line/iiyanka.webp" },
  { id: "yabai", line: "やばいよやばいよ", art: "/goods/line/yabai.webp" },
  { id: "chottomatte", line: "ちょっとまってよ", art: "/goods/line/chottomatte.webp" },
  { id: "sugumodoru", line: "すぐもどる", art: "/goods/line/sugumodoru.webp" },
  { id: "oumaiga", line: "おーまいがー", art: "/goods/line/oumaiga.webp" },
];

/** スタンプの一言だけ。付箋の中から「この一言のこと」を見分けるのに使う。 */
export const LINE_WORDS = LINE_STAMPS.map((s) => s.line);

/**
 * SUZURI の店の写真1枚。
 *
 * **1枚でも「その1枚しか無い店」に見えないように、2枚以上並べる**（下）。
 */
export type ShopShot = {
  src: string;
  /** 読み上げと、絵が落ちたときに出る字。**品ぞろえを数えない** */
  alt: string;
  w: number;
  h: number;
};

/**
 * SUZURI の店。**島の外へ出る。**
 *
 * ## 字で否定して、絵で肯定しない
 *
 * あやと（2026-10-08、**2回目**）: 「だからイギリストートバッグだけじゃないよ。
 * そのリンク。」
 *
 * 1回目は「トートバッグのほかに、キャラクターのグッズもあります。」という字を
 * 足しただけだった。**札の題は「イギリスのトートバッグ」のままで、写真もトート
 * 1枚。** 読む人が先に見るのは絵と題なので、字が何と書いてあっても
 * 「トートバッグ1枚の店」に見える。
 *
 * だから、札が指すものを**商品から店そのもの**に変えた。
 * 題は店、写真は2枚以上。
 *
 * ## 品ぞろえも値段も個数も書かない
 *
 * どれも向こうが持っていて、こちらに焼くと変わった日から嘘になる
 * （`docs/island-standards.md` 16章）。「4種類あります」も書かない——
 * **1つ増えた日から嘘。** 書いてよいのは、写真に写っているものと、
 * 押したら何が起きるかだけ。
 */
export const SUZURI = {
  href: "https://suzuri.jp/ayato_arigato",
  /**
   * 店に並んでいるもの。**2枚以上。1枚だと、その1枚しか無い店に見える。**
   *
   * 2枚目は SUZURI 自身が作っている店の絵（`og.suzuri.jp/users/2272949.webp`。
   * 1200x630）の**右側だけ**を切ったもの（左上 669,102 ／ 右下 1126,559）。
   * **左半分と、左上に出る印は切り落としてある**——よその会社のマークを
   * 島の面に焼かない。
   */
  shots: [
    { src: "/goods/suzuri-tote.webp", alt: "イギリスの地図が入ったトートバッグ", w: 560, h: 560 },
    { src: "/goods/suzuri-goods.webp", alt: "キャラクターの缶バッジ・ステッカー・アクリルキーホルダー", w: 560, h: 560 },
  ] satisfies ShopShot[],
  /** 札の題。**商品ではなく、店そのもの** */
  cap: "あやとの店",
  /**
   * 何が買えるか。**字はそのまま残す**（あやと 2026-10-08「スズリはトート
   * バッグだけじゃなくてキャラクターのグッズとかも買えます」）。
   * 直したのは、この字と食い違っていた**題と写真**のほう。
   */
  what: "トートバッグのほかに、キャラクターのグッズもあります。",
  /** 押したら何が起きるか */
  note: "押すと、島の外の店にうつる",
};
