/**
 * 島のワールド定義。
 * 絵・当たり判定・カメラ・歩行が全部この座標系(WORLD x WORLD)を共有する。
 */

export const WORLD = 1200;

/** 島(砂浜)の中心と輪郭 */
export const ISLAND = {
  cx: 600,
  cy: 640,
  squash: 0.9,
  /** 16方位の半径。上(北)から時計回り。 */
  radii: [352, 372, 404, 432, 442, 428, 400, 388, 406, 434, 448, 428, 396, 368, 350, 344],
};

/** 草地は砂浜より内側 */
export const GRASS_INSET = 34;
/** 高台(2段目)。島の縁に寄せすぎると画面外に出るので、内側に置く。 */
export const PLATEAU = {
  cx: 726,
  cy: 486,
  squash: 0.78,
  radii: [128, 138, 148, 152, 144, 132, 122, 118, 124, 136, 148, 150, 140, 130, 122, 120],
  /** 崖の高さ(見た目の落差) */
  drop: 34,
};

export type SpotId =
  | "streams"
  | "map"
  | "kitchen"
  | "apps"
  | "legends"
  | "now"
  | "next"
  | "board"
  | "friends"
  | "fellows";

/**
 * 島に建っている物。
 *
 * **建っているものは全部押せる**（`docs/island-design.md` 6章）。
 * 建物の形をしていて押せないものを置くと、人は押して、何も起きなくて
 * 「壊れている」と思う。景色が要るなら木・岩・花・柵を置く。
 *
 * 押せることと、案内することは別。看板（島の「！」の札と下のバー）に
 * 出すのは `sign` の付いた6つだけ。残りは静かに建っていて、
 * 近づいた人にだけ名前が出る。
 */
export type Place = {
  id: SpotId;
  /** 建物の足元 */
  x: number;
  y: number;
  /** 建物の名前 */
  label: string;
  /** スプライト名。バーの小さな絵にも同じものを使う。 */
  icon: string;
  /** 絵の高さ(ワールド単位)。押せる範囲もこの大きさから作るので、絵と一致させる。 */
  size: number;
  /** 押すと行く先 */
  href: string;
  /** 名札に添える、そこで分かることの一言 */
  blurb: string;
  /** 看板を出す6つ。島の「！」の札と、下のバーに出るのはこれだけ。 */
  sign?: true;
  /** 出発までの日数を出す入口。いちばん気にされるところなので目立たせる。 */
  countdown?: true;
};

/**
 * 島に建っている物、ぜんぶ。
 * 座標はここが唯一の出どころ。飾りの配置も明かりも絵も、これを見て置く。
 *
 * 並びは足元の y の順（奥から手前）。名札が重なるときに、
 * 手前のものが上に来るようにするため。
 */
export const PLACES: Place[] = [
  {
    id: "legends",
    x: 736,
    y: 462,
    label: "伝説の企画",
    icon: "hall-museum",
    size: 74,
    href: "/legends",
    blurb: "イラン380km、年越し24時間",
  },
  {
    id: "next",
    x: 296,
    y: 548,
    label: "これから",
    icon: "tent",
    size: 66,
    href: "/next",
    blurb: "次にやる企画と、行き先",
    sign: true,
    countdown: true,
  },
  {
    id: "now",
    x: 452,
    y: 556,
    label: "いまどこ",
    // 郵便受けは「知らせが届く」の絵で、「いま居る場所」を指していなかった。
    // 地球にピンが1本立っていれば、名前と絵が同じことを言う
    icon: "globe-stand",
    size: 48,
    href: "/now",
    blurb: "いまいる国と、今週やること",
  },
  {
    id: "friends",
    x: 886,
    y: 574,
    label: "あやとのこと",
    // たき火は「あやと本人」を指さない。人のことを知りたければ、その人の家へ行く。
    // 台所・工房と間違えないように、間口を1マス広げた家にしてある
    icon: "hut-ayato",
    size: 78,
    href: "/about",
    blurb: "どんな人で、なぜ旅してるか",
    sign: true,
  },
  {
    id: "streams",
    x: 520,
    y: 600,
    label: "配信",
    icon: "tower-studio",
    size: 128,
    href: "/streams",
    blurb: "毎晩22時。5つの型でやってる",
    sign: true,
  },
  {
    id: "apps",
    x: 812,
    y: 700,
    label: "アプリ",
    icon: "hut-workshop",
    size: 78,
    href: "/apps",
    blurb: "旅先で作ってるグルメアプリ",
    sign: true,
  },
  {
    id: "kitchen",
    x: 330,
    y: 706,
    label: "作った料理",
    icon: "hut-kitchen",
    size: 78,
    href: "/kitchen",
    blurb: "その土地のものを、買い出しから",
  },
  {
    id: "fellows",
    x: 770,
    y: 800,
    label: "住んでる人",
    icon: "tent-small",
    size: 56,
    href: "/friends",
    blurb: "毎晩集まる人と、そのキャラクター",
  },
  {
    id: "map",
    x: 262,
    y: 846,
    label: "歩いた国",
    // 桟橋は「船で出ていく」の絵で、中身（歩いた国）を指していなかった。
    // 国旗を何枚も掛けた道しるべにして、名前と絵を同じことにする
    icon: "signpost-flags",
    size: 64,
    href: "/map",
    blurb: "パリからトビリシまでの道のり",
    sign: true,
  },
  {
    id: "board",
    x: 610,
    y: 872,
    label: "企画をだす",
    icon: "signboard",
    size: 62,
    href: "/board",
    blurb: "誰でも出せる。通ったらやる",
    sign: true,
  },
];

export type Spot = Place;

/**
 * 押せる建物ぜんぶ。島の当たり判定と名札は、これを見て作る。
 *
 * `SPOTS`（看板を出す6つ）と分けてあるのは、島の外のページの
 * ヘッダーが「行き先6つ」を並べるところで使っているから。
 * ヘッダーに10個並べると、そちらが行き先を選べない列になる。
 */
export const DOORS: Spot[] = PLACES;

/**
 * 看板を出す6つ。
 *
 * 島の「！」の札、下のバー、島の外のページのヘッダーに出るのはこれだけ。
 * 増やしたくなったら、どれかの中に入れる。ここは6つのまま。
 */
export const SPOTS: Spot[] = PLACES.filter((p) => p.sign);

export const placeById = (id: SpotId) => PLACES.find((p) => p.id === id)!;

/** あやとの立ち位置(初期) */
export const AYATO_HOME = { x: 646, y: 790 };
