/**
 * あやと島で使うスプライトの一覧。
 * 建物はモジュールパーツを組み立てて1枚に焼く。
 *
 * 素材: Kenney (CC0) — nature-kit / holiday-kit / building-kit / mini-characters
 *
 * 色は render.html の「色相帯」ごとに置き換わる。建物キットでは
 *   green   → 壁の本体
 *   blue    → 柱・窓枠などの縁取り
 *   neutral → 屋根
 * なので、屋根の色は neutral を上書きして決める。
 */

const NK = "./models/gltf";    // nature-kit
const HK = "./models/holiday"; // holiday-kit
const BK = "./models";         // building-kit / mini-characters

/* ---------------- 建物の配色 ---------------- */
const WALL = { h: 0.105, s: 0.60, l: [0.68, 0.88] }; // クリーム色の壁
const TRIM = { h: 0.075, s: 0.40, l: [0.34, 0.52] }; // あたたかい木の柱
const ROOF = {
  coral: { h: 0.015, s: 0.60, l: [0.42, 0.62] },
  mint: { h: 0.44, s: 0.40, l: [0.42, 0.62] },
  sky: { h: 0.55, s: 0.48, l: [0.44, 0.64] },
  sun: { h: 0.11, s: 0.70, l: [0.48, 0.68] },
  plum: { h: 0.86, s: 0.38, l: [0.46, 0.66] },
};
const house = (roof) => ({ green: WALL, blue: TRIM, neutral: ROOF[roof] });

/** 木製の物(掲示板・屋台)。板が青くならないように帯ごと木の色へ寄せる。 */
const WOODEN = {
  green: { h: 0.09, s: 0.45, l: [0.58, 0.80] },
  blue: { h: 0.072, s: 0.42, l: [0.34, 0.52] },
  neutral: { h: 0.10, s: 0.30, l: [0.62, 0.86] },
};
/** 岩。nature-kit の岩は土の色をしているので、灰色へ置き換える。 */
const STONE = { mat: { dirt: [0.095, 0.09, 0.64], grass: [0.245, 0.58, 0.48] } };

/* ---------------- 建物の組み立て ---------------- */
const part = (url, pos = [0, 0, 0], rot = [0, 0, 0]) => ({ url, pos, rot });

/**
 * 壁1マスぶん。既定の壁は +X 面を向いているので、
 * 回転で「どの面か」を指定する。0:+X / 90:-Z / 180:-X / 270:+Z
 */
const W = (x, z, dir, kind = "wall") => part(`${BK}/${kind}.glb`, [x, 0, z], [0, dir, 0]);
const ROOF_G = (x, z) => part(`${BK}/roof-gable.glb`, [x, 1, z]);

/** 間口2マス・奥行1マスの小屋。正面(手前)に扉と窓。 */
const cottage = () => [
  W(-0.5, 0, 270, "wall-door"),
  W(0.5, 0, 270, "wall-window-shutters"),
  W(-0.5, 0, 90),
  W(0.5, 0, 90),
  W(-0.5, 0, 180),
  W(0.5, 0, 0),
  ROOF_G(-0.5, 0),
  ROOF_G(0.5, 0),
];

/** 間口3マス・奥行2マスの大きい建物。 */
const hall = () => {
  const cells = [];
  for (const x of [-1, 0, 1]) {
    for (const z of [-0.5, 0.5]) {
      cells.push(
        z === 0.5 ?
          W(x, z, 270, x === 0 ? "wall-door" : "wall-window-shutters") :
          W(x, z, 90),
      );
      if (x === -1) cells.push(W(x, z, 180));
      if (x === 1) cells.push(W(x, z, 0));
      cells.push(ROOF_G(x, z));
    }
  }
  return cells;
};

/** 2階建ての物見やぐら。配信の拠点。 */
const tower = () => [
  ...[0, 90, 180, 270].map((d) => W(0, 0, d, d === 270 ? "wall-door" : "wall")),
  ...[0, 90, 180, 270].map((d) => ({
    ...W(0, 0, d, d === 270 ? "wall-window-shutters" : "wall-window-small"),
    pos: [0, 1, 0],
  })),
  part(`${BK}/roof-point.glb`, [0, 2, 0]),
];

/** キットに無い小物は箱を組んで作る。 */
const box = (size, color, pos, rot = [0, 0, 0]) => ({ box: size, color, pos, rot });

/** 掲示板。丸太2本に板を渡して、企画の紙を貼る。 */
const board = () => [
  part(`${BK}/pillar-wood.glb`, [-0.42, 0, 0]),
  part(`${BK}/pillar-wood.glb`, [0.42, 0, 0]),
  part(`${BK}/planks.glb`, [0, 0.62, 0.06], [90, 0, 0]),
  box([0.23, 0.29, 0.02], [0.13, 0.80, 0.76], [-0.27, 0.72, 0.16], [0, 0, 5]),
  box([0.23, 0.27, 0.02], [0.97, 0.62, 0.78], [0.01, 0.66, 0.16], [0, 0, -7]),
  box([0.21, 0.25, 0.02], [0.45, 0.50, 0.76], [0.28, 0.74, 0.16], [0, 0, 3]),
];

/** 郵便受け。「いま何してる」の目印。 */
const mailbox = () => [
  box([0.13, 0.5, 0.13], [0.075, 0.42, 0.36], [0, 0.25, 0]),
  box([0.46, 0.34, 0.38], [0.985, 0.62, 0.60], [0, 0.72, 0]),
  box([0.5, 0.08, 0.42], [0.1, 0.22, 0.94], [0, 0.93, 0]),
  box([0.1, 0.06, 0.1], [0.1, 0.22, 0.94], [0, 0.7, 0.2]),
  box([0.035, 0.22, 0.02], [0.13, 0.85, 0.58], [0.25, 0.84, 0]),
  box([0.02, 0.07, 0.15], [0.13, 0.85, 0.58], [0.25, 0.93, 0.075]),
];

export const SPRITES = [
  /* ---------- 建物 ---------- */
  { name: "hut-kitchen", parts: [...cottage(), part(`${BK}/chimney.glb`, [0.5, 1, 0])], opts: house("coral") },
  { name: "hut-workshop", parts: cottage(), opts: house("sky") },
  { name: "hut-home", parts: cottage(), opts: house("mint") },
  { name: "hall-museum", parts: hall(), opts: house("sun") },
  { name: "tower-studio", parts: tower(), opts: house("plum") },
  { name: "signboard", parts: board(), opts: WOODEN },
  { name: "mailbox", parts: mailbox() },

  /* ---------- 場所の目印 ---------- */
  { name: "tent", parts: [`${NK}/tent_detailedOpen.glb`] },
  { name: "campfire", parts: [`${NK}/campfire_stones.glb`] },
  { name: "signpost", parts: [`${NK}/sign.glb`] },
  { name: "statue", parts: [`${NK}/statue_obelisk.glb`] },
  { name: "statue-head", parts: [`${NK}/statue_head.glb`] },
  { name: "canoe", parts: [`${NK}/canoe.glb`] },
  { name: "bridge", parts: [`${NK}/bridge_wood.glb`], opts: { mat: { stone: [0.086, 0.46, 0.62] } } },
  { name: "bench", parts: [`${HK}/bench.glb`] },
  { name: "lantern", parts: [`${HK}/lantern.glb`] },
  { name: "stall", parts: [`${BK}/stall.glb`], opts: { ...WOODEN, neutral: ROOF.coral } },
  { name: "fountain", parts: [`${BK}/fountain-round.glb`], opts: WOODEN },

  /* ---------- 木 ---------- */
  { name: "tree-round", parts: [`${NK}/tree_oak.glb`] },
  { name: "tree-fat", parts: [`${NK}/tree_fat.glb`] },
  { name: "tree-tall", parts: [`${NK}/tree_detailed.glb`] },
  { name: "tree-blocks", parts: [`${NK}/tree_blocks.glb`] },
  { name: "tree-pine", parts: [`${NK}/tree_pineDefaultA.glb`] },
  { name: "tree-pine-tall", parts: [`${NK}/tree_pineTallA.glb`] },
  { name: "tree-palm", parts: [`${NK}/tree_palmDetailedTall.glb`] },
  { name: "tree-thin", parts: [`${NK}/tree_thin.glb`] },
  { name: "stump", parts: [`${NK}/stump_roundDetailed.glb`] },

  /* ---------- 下草 ---------- */
  { name: "bush", parts: [`${NK}/plant_bushDetailed.glb`] },
  { name: "bush-small", parts: [`${NK}/plant_bushSmall.glb`] },
  { name: "grass", parts: [`${NK}/grass.glb`] },
  { name: "grass-large", parts: [`${NK}/grass_large.glb`] },
  { name: "flower-red", parts: [`${NK}/flower_redA.glb`] },
  { name: "flower-yellow", parts: [`${NK}/flower_yellowA.glb`] },
  { name: "flower-purple", parts: [`${NK}/flower_purpleA.glb`] },
  { name: "mushroom", parts: [`${NK}/mushroom_redGroup.glb`] },
  { name: "log", parts: [`${NK}/log.glb`] },
  { name: "lily", parts: [`${NK}/lily_large.glb`] },

  /* ---------- 岩・道 ---------- */
  { name: "rock-large", opts: STONE, parts: [`${NK}/rock_largeA.glb`] },
  { name: "rock-small", opts: STONE, parts: [`${NK}/rock_smallA.glb`] },
  { name: "rock-tall", opts: STONE, parts: [`${NK}/rock_tallC.glb`] },
  { name: "rock-flat", opts: STONE, parts: [`${NK}/rock_smallFlatA.glb`] },
  { name: "path-stone", parts: [`${NK}/path_stone.glb`] },
  { name: "path-stone-circle", parts: [`${NK}/path_stoneCircle.glb`] },
  { name: "fence", parts: [`${NK}/fence_simple.glb`] },

  /* ---------- 住人 ---------- */
  // Kenney の配色がそのままで可愛いので、色は置き換えない
  ...["male-a", "male-b", "male-c", "male-d", "male-e", "male-f",
    "female-a", "female-b", "female-c", "female-d", "female-e", "female-f",
  ].map((id) => ({ name: `villager-${id}`, parts: [`${BK}/character-${id}.glb`], opts: { plain: true } })),
];
