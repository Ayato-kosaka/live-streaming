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
  | "friends";

export type Spot = {
  id: SpotId;
  /** 建物の足元 */
  x: number;
  y: number;
  label: string;
  emoji: string;
  /** 目印になるスプライト名。ラベルの絵に使う。 */
  icon: string;
  href: string;
  blurb: string;
  /** ラベルの向き。建物と重ならないように。 */
  labelAt?: "below" | "above";
};

export const SPOTS: Spot[] = [
  {
    id: "streams",
    x: 520,
    y: 600,
    label: "配信やぐら",
    emoji: "📺",
    icon: "tower-studio",
    href: "/streams",
    blurb: "どんな配信をしてるか",
    labelAt: "below",
  },
  {
    id: "kitchen",
    x: 330,
    y: 706,
    label: "キッチン小屋",
    emoji: "🍳",
    icon: "hut-kitchen",
    href: "/kitchen",
    blurb: "作ってきたごはん",
    labelAt: "below",
  },
  {
    id: "apps",
    x: 812,
    y: 700,
    label: "アプリ工房",
    emoji: "💻",
    icon: "hut-workshop",
    href: "/apps",
    blurb: "旅先で作ってるアプリ",
    labelAt: "below",
  },
  {
    id: "map",
    x: 262,
    y: 846,
    label: "旅の桟橋",
    emoji: "🗺️",
    icon: "signpost",
    href: "/map",
    blurb: "これまでに歩いた17カ国",
    labelAt: "below",
  },
  {
    id: "legends",
    x: 736,
    y: 462,
    label: "伝説の丘",
    emoji: "🏆",
    icon: "hall-museum",
    href: "/legends",
    blurb: "語り継がれてる企画",
    labelAt: "below",
  },
  {
    id: "now",
    x: 452,
    y: 556,
    label: "いまのポスト",
    emoji: "📮",
    icon: "lantern",
    href: "/now",
    blurb: "今どこで何してる",
    labelAt: "above",
  },
  {
    id: "next",
    x: 296,
    y: 548,
    label: "これから",
    emoji: "✈️",
    icon: "tent",
    href: "/next",
    blurb: "次に行くところ",
    labelAt: "below",
  },
  {
    id: "board",
    x: 610,
    y: 872,
    label: "企画掲示板",
    emoji: "📋",
    icon: "signboard",
    href: "/board",
    blurb: "みんなの企画提案",
    labelAt: "below",
  },
  {
    id: "friends",
    x: 886,
    y: 574,
    label: "たき火広場",
    emoji: "⛺",
    icon: "campfire",
    href: "/friends",
    blurb: "愉快な仲間達",
    labelAt: "below",
  },
];

/** あやとの立ち位置(初期) */
export const AYATO_HOME = { x: 646, y: 790 };
