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
const FK = "./models/food";    // food-kit

/* ---------------- 建物の配色 ---------------- */
const WALL = { h: 0.098, s: 0.62, l: [0.80, 0.94] }; // クリーム色の壁
const TRIM = { h: 0.075, s: 0.38, l: [0.52, 0.70] }; // あたたかい木の柱
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
/** 広葉樹。樹冠を房に分ける。1で既定の効き、小さいほど元の塊に近い。
 *
 * 掛けてよいのは「樹冠がひと塊のモデル」だけ。tree_detailed / tree_blocks /
 * tree_plateau のように、はじめから葉のかたまりが枝ごとに分かれているものに
 * 掛けると、その散らばりごと12個に複製されて、立方体が空中にばらけた絵になる。
 * 分かれている木は、それ自体がもう「房の集まり」なので何もしない。 */
const LEAFY = { lobes: 1 };
/** 細い木。房を大きく散らすと枝から離れて見えるので、控えめにする。 */
const LEAFY_SOFT = { lobes: 0.72 };

/** 岩。nature-kit の岩は土の色をしているので、灰色へ置き換える。
 * 苔は別マテリアルの面なので、そのままだと緑のシールに見える。
 * `moss` を付けると、縁が石の色へ溶けてギザギザになる。 */
const STONE = {
  mat: { dirt: [0.105, 0.10, 0.70], grass: [0.298, 0.46, 0.46] },
  moss: { from: "dirt" },
};
/** 灰色の石(stone_*)。土ではなく石のマテリアルを持っている。 */
const GREYSTONE = {
  mat: { stone: [0.105, 0.09, 0.74], stonedark: [0.105, 0.09, 0.60], grass: [0.298, 0.46, 0.46] },
  moss: { from: "stone" },
};

/* ---------------- たき火 ----------------
 * 石の輪だけだと、ただの石の輪にしか見えない。
 * 薪・炎・地面の明かりを足して「火が焚かれている」ところまで作る。
 * /about のたき火広場の看板になる絵なので、島でいちばん目立つ。 */
const campfire = () => [
  part(`${NK}/campfire_stones.glb`),
  part(`${NK}/campfire_logs.glb`),
  // 地面の明かり。石より先に描いて、石の足元が暖まって見えるようにする
  { glow: { r: 0.46, color: 0xffffff, strength: 0.46 }, pos: [0, -0.046, 0] },
  // 炎。奥に濃いオレンジ、手前へ来るほど明るい舌を重ねる。
  // [横, 前後, 傾き(度), 大きさ, 色の番号]。前後を +Z にすると手前に来る
  {
    flame: {
      r: 0.085, h: 0.38,
      tongues: [
        [-0.042, -0.058, 12, 0.82, 0],
        [0.058, -0.042, -14, 0.72, 1],
        [-0.014, 0.008, 3, 1.00, 1],
        [-0.056, 0.042, 17, 0.54, 2],
        [0.042, 0.056, -9, 0.64, 2],
        [0.008, 0.080, -3, 0.44, 3],
      ],
    },
    pos: [0, -0.02, 0],
  },
];
/** たき火の指定。炎そのものが光源なので、石と薪を下から暖める */
const CAMPFIRE = {
  lights: [{ color: 0xff9838, intensity: 0.055, distance: 1.4, decay: 2, pos: [0, 0.11, 0] }],
  shadowSpread: 1.6,
};

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
  { name: "tent-small", parts: [`${NK}/tent_smallOpen.glb`] },
  { name: "campfire", parts: campfire(), opts: CAMPFIRE },
  { name: "signpost", parts: [`${NK}/sign.glb`] },
  { name: "statue", parts: [`${NK}/statue_obelisk.glb`] },
  { name: "statue-head", parts: [`${NK}/statue_head.glb`] },
  { name: "canoe", parts: [`${NK}/canoe.glb`] },
  { name: "bridge", parts: [`${NK}/bridge_wood.glb`], opts: { mat: { stone: [0.086, 0.46, 0.62] } } },
  { name: "bench", parts: [`${HK}/bench.glb`] },
  { name: "lantern", parts: [`${HK}/lantern.glb`] },
  { name: "stall", parts: [`${BK}/stall.glb`], opts: { ...WOODEN, neutral: ROOF.coral } },
  { name: "stall-green", parts: [`${BK}/stall-green.glb`], opts: { ...WOODEN, neutral: ROOF.mint } },
  { name: "stall-bench", parts: [`${BK}/stall-bench.glb`], opts: WOODEN },
  { name: "stall-stool", parts: [`${BK}/stall-stool.glb`], opts: WOODEN },
  { name: "fountain", parts: [`${BK}/fountain-round.glb`], opts: WOODEN },
  { name: "fountain-square", parts: [`${BK}/fountain-square-detail.glb`], opts: WOODEN },
  { name: "bench-short", parts: [`${HK}/bench-short.glb`] },
  { name: "lantern-hanging", parts: [`${HK}/lantern-hanging.glb`] },
  // 樽と袋は food-kit のモデル。models/ 直下にも同じものがあるが、
  // そちらは building-kit の colormap を引いてしまって色が壊れる
  { name: "barrel", parts: [`${FK}/barrel.glb`], opts: WOODEN },
  { name: "sack", parts: [`${FK}/bag.glb`], opts: WOODEN },
  { name: "cart", parts: [`${BK}/cart.glb`], opts: WOODEN },
  { name: "hedge", parts: [`${BK}/hedge.glb`] },
  { name: "hedge-gate", parts: [`${BK}/hedge-gate.glb`] },

  /* ---------- 島の景色 ----------
     押せない飾り。遠くに置いて島を広く見せる。 */
  { name: "windmill", parts: [`${BK}/windmill.glb`], opts: house("sky") },
  { name: "watermill", parts: [`${BK}/watermill.glb`], opts: house("coral") },

  /* ---------- 木 ----------
     広葉樹は樹冠を房に分ける(LEAFY)。針葉樹とヤシは葉がもともと分かれているので掛けない。 */
  { name: "tree-round", parts: [`${NK}/tree_oak.glb`], opts: LEAFY },
  { name: "tree-fat", parts: [`${NK}/tree_fat.glb`], opts: LEAFY },
  { name: "tree-tall", parts: [`${NK}/tree_detailed.glb`] },
  // tree_blocks は葉が立方体の集まりだが、法線をならすと1個の丸い塊に
  // なってしまい、tree-round と見分けが付かない。房をごく弱く掛けて、
  // 面の向きを崩し、キットの「積み木の木」らしさを戻す
  { name: "tree-blocks", parts: [`${NK}/tree_blocks.glb`], opts: { lobes: 0.34 } },
  { name: "tree-default", parts: [`${NK}/tree_default.glb`], opts: LEAFY },
  { name: "tree-small", parts: [`${NK}/tree_small.glb`], opts: LEAFY },
  { name: "tree-plateau", parts: [`${NK}/tree_plateau.glb`] },
  { name: "tree-thin", parts: [`${NK}/tree_thin.glb`], opts: LEAFY_SOFT },
  { name: "tree-pine", parts: [`${NK}/tree_pineDefaultA.glb`] },
  { name: "tree-pine-tall", parts: [`${NK}/tree_pineTallA.glb`] },
  { name: "tree-pine-round", parts: [`${NK}/tree_pineRoundC.glb`] },
  { name: "tree-pine-small", parts: [`${NK}/tree_pineSmallB.glb`] },
  { name: "tree-cone", parts: [`${NK}/tree_cone.glb`] },
  { name: "tree-palm", parts: [`${NK}/tree_palmDetailedTall.glb`] },
  { name: "tree-palm-short", parts: [`${NK}/tree_palmDetailedShort.glb`] },
  { name: "tree-palm-bend", parts: [`${NK}/tree_palmBend.glb`] },
  // 同じ木ばかり並ぶと林が壁紙に見える。輪郭の違うものを足す
  { name: "tree-simple", parts: [`${NK}/tree_simple.glb`], opts: LEAFY },
  { name: "tree-narrow", parts: [`${NK}/tree_tall.glb`], opts: LEAFY_SOFT },
  { name: "tree-pine-ground", parts: [`${NK}/tree_pineGroundA.glb`] },
  { name: "tree-pine-round-b", parts: [`${NK}/tree_pineRoundE.glb`] },
  { name: "stump", parts: [`${NK}/stump_roundDetailed.glb`] },
  { name: "stump-old", parts: [`${NK}/stump_oldTall.glb`] },
  { name: "stump-square", parts: [`${NK}/stump_squareDetailed.glb`] },
  { name: "stump-round", parts: [`${NK}/stump_round.glb`] },

  /* ---------- 下草 ---------- */
  { name: "bush", parts: [`${NK}/plant_bushDetailed.glb`] },
  { name: "bush-small", parts: [`${NK}/plant_bushSmall.glb`] },
  { name: "bush-large", parts: [`${NK}/plant_bushLarge.glb`] },
  { name: "grass", parts: [`${NK}/grass.glb`] },
  { name: "grass-large", parts: [`${NK}/grass_large.glb`] },
  { name: "grass-leafs", parts: [`${NK}/grass_leafsLarge.glb`] },
  { name: "flower-red", parts: [`${NK}/flower_redA.glb`] },
  { name: "flower-yellow", parts: [`${NK}/flower_yellowA.glb`] },
  { name: "flower-purple", parts: [`${NK}/flower_purpleA.glb`] },
  { name: "flower-red-tall", parts: [`${NK}/flower_redC.glb`] },
  { name: "flower-yellow-tall", parts: [`${NK}/flower_yellowC.glb`] },
  { name: "flower-purple-tall", parts: [`${NK}/flower_purpleC.glb`] },
  { name: "mushroom", parts: [`${NK}/mushroom_redGroup.glb`] },
  { name: "mushroom-tan", parts: [`${NK}/mushroom_tanGroup.glb`] },
  { name: "cactus", parts: [`${NK}/cactus_tall.glb`] },
  { name: "cactus-short", parts: [`${NK}/cactus_short.glb`] },
  { name: "log", parts: [`${NK}/log.glb`] },
  { name: "log-large", parts: [`${NK}/log_large.glb`] },
  { name: "firewood", parts: [`${NK}/log_stack.glb`] },
  { name: "lily", parts: [`${NK}/lily_large.glb`] },
  { name: "lily-small", parts: [`${NK}/lily_small.glb`] },
  { name: "pot-plant", parts: [`${NK}/pot_large.glb`] },
  { name: "pot-plant-small", parts: [`${NK}/pot_small.glb`] },

  /* ---------- 畑（キッチン小屋のまわり） ---------- */
  { name: "crop-corn", parts: [`${NK}/crops_cornStageD.glb`] },
  { name: "crop-wheat", parts: [`${NK}/crops_wheatStageB.glb`] },
  { name: "crop-pumpkin", parts: [`${NK}/crop_pumpkin.glb`] },
  { name: "crop-melon", parts: [`${NK}/crop_melon.glb`] },
  { name: "crop-carrot", parts: [`${NK}/crop_carrot.glb`] },
  { name: "crop-turnip", parts: [`${NK}/crop_turnip.glb`] },
  { name: "crop-row", parts: [`${NK}/crops_dirtRow.glb`] },

  /* ---------- 岩・道 ---------- */
  { name: "rock-large", opts: STONE, parts: [`${NK}/rock_largeA.glb`] },
  { name: "rock-large-b", opts: STONE, parts: [`${NK}/rock_largeE.glb`] },
  { name: "rock-small", opts: STONE, parts: [`${NK}/rock_smallA.glb`] },
  { name: "rock-tall", opts: STONE, parts: [`${NK}/rock_tallC.glb`] },
  { name: "rock-flat", opts: STONE, parts: [`${NK}/rock_smallFlatA.glb`] },
  { name: "stone-large", opts: GREYSTONE, parts: [`${NK}/stone_largeC.glb`] },
  { name: "stone-tall", opts: GREYSTONE, parts: [`${NK}/stone_tallB.glb`] },
  { name: "stone-small", opts: GREYSTONE, parts: [`${NK}/stone_smallD.glb`] },
  { name: "path-stone", parts: [`${NK}/path_stone.glb`] },
  { name: "path-stone-circle", parts: [`${NK}/path_stoneCircle.glb`] },
  { name: "path-wood", parts: [`${NK}/path_wood.glb`] },
  { name: "fence", parts: [`${NK}/fence_simple.glb`] },
  { name: "fence-gate", parts: [`${NK}/fence_gate.glb`] },
  { name: "fence-planks", parts: [`${NK}/fence_planksDouble.glb`] },
  { name: "bridge-stone", parts: [`${NK}/bridge_stone.glb`], opts: { mat: { stone: [0.105, 0.10, 0.72] } } },
  { name: "statue-column", parts: [`${NK}/statue_column.glb`], opts: GREYSTONE },
  { name: "statue-ring", parts: [`${NK}/statue_ring.glb`], opts: GREYSTONE },

  /* ---------- 料理 ----------
     クッキングのスタンプ帳で使う。food-kit の配色はそのままで美味しそうなので、
     島の配色には寄せない(plain)。 */
  ...[
    "sandwich", "turkey", "taco", "tomato", "salad", "pan-stew", "dim-sum",
    "plate-dinner", "bowl-soup", "skewer", "tajine", "bowl", "bread",
    "bowl-cereal", "pancakes", "fries", "bowl-broth", "pudding", "waffle",
    "croissant", "meat-patty", "fish", "pan", "egg-cooked", "pizza",
    "plate-sauerkraut", "soda-glass", "meat-ribs", "cup-coffee", "cake",
    // ここから下は「レパートリーが少ない」というレビューを受けて足したぶん
    "burger-cheese", "hot-dog", "corn-dog", "sub", "chinese", "steamer",
    "sushi-salmon", "maki-salmon", "rice-ball", "loaf-baguette", "pie",
    "donut-sprinkles", "cupcake", "muffin", "cookie-chocolate", "sundae",
    "ice-cream-cup", "cheese", "grapes", "strawberry", "watermelon",
    "pineapple", "coconut", "frappe", "cup-tea", "cocktail", "honey",
    "mortar-pestle", "frying-pan", "pot-stew", "cutting-board-japanese",
    "carrot", "broccoli", "eggplant", "leek", "paprika", "onion",
  ].map((id) => ({ name: `food-${id}`, parts: [`${FK}/${id}.glb`], opts: { plain: true } })),

  /* ---------- 住人 ---------- */
  // Kenney の配色がそのままで可愛いので、色は置き換えない
  ...["male-a", "male-b", "male-c", "male-d", "male-e", "male-f",
    "female-a", "female-b", "female-c", "female-d", "female-e", "female-f",
  ].map((id) => ({ name: `villager-${id}`, parts: [`${BK}/character-${id}.glb`], opts: { plain: true } })),
];
