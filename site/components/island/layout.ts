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

/** 島に建っている物。入口になっているものと、景色として置いてあるものがある。 */
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
};

/**
 * 島に建っている物、ぜんぶ。
 * 座標はここが唯一の出どころ。飾りの配置も明かりもこれを見て置く。
 */
export const PLACES: Place[] = [
  { id: "streams", x: 520, y: 600, label: "配信やぐら", icon: "tower-studio", size: 128 },
  { id: "kitchen", x: 330, y: 706, label: "キッチン小屋", icon: "hut-kitchen", size: 78 },
  { id: "apps", x: 812, y: 700, label: "アプリ工房", icon: "hut-workshop", size: 78 },
  { id: "map", x: 262, y: 846, label: "旅の桟橋", icon: "signpost", size: 54 },
  { id: "legends", x: 736, y: 462, label: "伝説の丘", icon: "hall-museum", size: 74 },
  { id: "now", x: 452, y: 556, label: "いまのポスト", icon: "mailbox", size: 44 },
  { id: "next", x: 296, y: 548, label: "これから", icon: "tent", size: 66 },
  { id: "board", x: 610, y: 872, label: "企画掲示板", icon: "signboard", size: 62 },
  { id: "friends", x: 886, y: 574, label: "たき火広場", icon: "campfire", size: 46 },
];

export type Spot = Place & {
  href: string;
  /** 名札に添える、そこで分かることの一言 */
  blurb: string;
  /** 出発までの日数を出す入口。いちばん気にされるところなので目立たせる。 */
  countdown?: boolean;
};

/**
 * 島の入口は6つだけ。
 *
 * 来た人が順に浮かべる問いに合わせてある（`docs/island-design.md`）。
 *   あやと島について / どんな配信 / グルメアプリ / これから / 企画掲示板 / これまでの国
 *
 * キッチン小屋・伝説の丘・いまのポストは島に建っているが押せない。
 * それぞれ親のページ（配信やぐら / あやと島について）の中から行く。
 * 入口を増やしたくなったら、どれかの中に入れる。ここは6つのまま。
 */
const ENTRANCE: Record<string, Omit<Spot, keyof Place>> = {
  friends: { href: "/about", blurb: "あやとって、どんな人", },
  streams: { href: "/streams", blurb: "どんな配信をしてるか" },
  apps: { href: "/apps", blurb: "グルメアプリを作ってる" },
  next: { href: "/next", blurb: "これから何をするか", countdown: true },
  board: { href: "/board", blurb: "自分も企画を出せる" },
  map: { href: "/map", blurb: "これまでに歩いた国" },
};

/** 入口の並び順。名札の重なりを避けるため、上（奥）から順に並べる。 */
const ORDER: SpotId[] = ["next", "friends", "streams", "apps", "board", "map"];

export const SPOTS: Spot[] = ORDER.map((id) => {
  const p = PLACES.find((x) => x.id === id)!;
  return { ...p, ...ENTRANCE[id] };
});

export const placeById = (id: SpotId) => PLACES.find((p) => p.id === id)!;

/** あやとの立ち位置(初期) */
export const AYATO_HOME = { x: 646, y: 790 };
