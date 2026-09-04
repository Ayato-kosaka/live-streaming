/**
 * あやと島で使うスプライトの一覧。
 * 建物はモジュールパーツを組み立てて1枚に焼く。
 *
 * 素材: Kenney (CC0) — nature-kit / holiday-kit / mini-characters / food-kit
 */

/** 島全体の色味を決めるパレット。差し替えると全部の色が変わる。 */
export const COLORMAP = "./palette/island.png";

const NK = "./models/gltf";   // nature-kit
const HK = "./models/holiday"; // holiday-kit
const MC = "./models";         // mini-characters ほか

/** 1×1 の小屋を組む。屋根の色などは colormap 側で決まる。 */
const cabin = (doorRot = 0) => {
  const walls = [0, 90, 180, 270].map((r) => ({
    url: r === doorRot ? `${HK}/cabin-doorway.glb` : `${HK}/cabin-wall.glb`,
    rot: [0, r, 0],
  }));
  return [
    ...walls,
    { url: `${HK}/cabin-roof.glb`, pos: [0, 1, 0] },
    { url: `${HK}/cabin-roof-point.glb`, pos: [0, 1, 0] },
  ];
};

export const SPRITES = [
  /* ---------- 建物 ---------- */
  { name: "hut-kitchen", parts: [...cabin(180), { url: `${HK}/cabin-roof-chimney.glb`, pos: [0, 1, 0] }] },
  { name: "hut-workshop", parts: cabin(180) },
  { name: "hut-museum", parts: [...cabin(180), { url: `${HK}/lantern-hanging.glb`, pos: [0.55, 0.75, 0.55] }] },

  /* ---------- 場所の目印 ---------- */
  { name: "tent", parts: [`${NK}/tent_detailedOpen.glb`] },
  { name: "campfire", parts: [`${NK}/campfire_stones.glb`] },
  { name: "signpost", parts: [`${NK}/sign.glb`] },
  { name: "statue", parts: [`${NK}/statue_head.glb`] },
  { name: "canoe", parts: [`${NK}/canoe.glb`] },
  { name: "bridge", parts: [`${NK}/bridge_wood.glb`] },
  { name: "bench", parts: [`${HK}/bench.glb`] },
  { name: "lantern", parts: [`${HK}/lantern.glb`] },

  /* ---------- 木 ---------- */
  { name: "tree-pine", parts: [`${NK}/tree_pineDefaultA.glb`] },
  { name: "tree-pine-tall", parts: [`${NK}/tree_pineTallA.glb`] },
  { name: "tree-round", parts: [`${NK}/tree_default.glb`] },
  { name: "tree-round-fall", parts: [`${NK}/tree_fat.glb`] },
  { name: "tree-palm", parts: [`${NK}/tree_palmDetailedTall.glb`] },
  { name: "tree-thin", parts: [`${NK}/tree_thin.glb`] },

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

  /* ---------- 岩 ---------- */
  { name: "rock-large", parts: [`${NK}/rock_largeA.glb`] },
  { name: "rock-small", parts: [`${NK}/rock_smallA.glb`] },
  { name: "rock-tall", parts: [`${NK}/rock_tallC.glb`] },

  /* ---------- 柵・道 ---------- */
  { name: "fence", parts: [`${NK}/fence_simple.glb`] },
  { name: "path-stone", parts: [`${NK}/path_stone.glb`] },

  /* ---------- 住人 ---------- */
  ...["male-a", "male-b", "male-c", "male-d", "male-e", "female-a", "female-b", "female-c", "female-d", "female-e"].map(
    (id) => ({ name: `villager-${id}`, parts: [`${MC}/character-${id}.glb`], outline: 0.013 }),
  ),
];
