import fs from "node:fs";

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
/* 幹の太さ。
 *
 * 公式スクショの木を測ると、幹の幅は樹冠の幅の 0.35 倍ある
 * （`/tmp/acref/crop_tree.png`。樹冠 254px に幹 90px）。
 * Kenney の広葉樹は 0.22〜0.29 倍しかなく、樹冠の重さに対して
 * 幹が細い棒で、遠目には「緑の玉が浮いている」ように見えていた。
 * 1.28 倍にすると 0.28 → 0.36 で、公式とほぼ同じ比になる。
 *
 * 針葉樹とヤシには掛けない。あちらは公式でも細い。 */
const TRUNK = { trunk: 1.28 };

/** 広葉樹。樹冠を房に分ける。1で既定の効き、小さいほど元の塊に近い。
 *
 * 掛けてよいのは「樹冠がひと塊のモデル」だけ。tree_detailed / tree_blocks /
 * tree_plateau のように、はじめから葉のかたまりが枝ごとに分かれているものに
 * 掛けると、その散らばりごと12個に複製されて、立方体が空中にばらけた絵になる。
 * 分かれている木は、それ自体がもう「房の集まり」なので何もしない。 */
const LEAFY = { lobes: 1, ...TRUNK };
/** 細い木。房を大きく散らすと枝から離れて見えるので、控えめにする。 */
const LEAFY_SOFT = { lobes: 0.72, ...TRUNK };

/* 足元に敷く葉もの(シダ・スイレン・畑の葉)。
 *
 * モデルのマテリアル名が樹冠と同じ `leafs*` になっている。樹冠を公式へ
 * 寄せて青緑側(焼くと h0.43)へ振ったぶん、そのまま焼くと地面の草(h0.33)から
 * 0.10 も離れて、足元だけ灰緑の別の植物が生えているように見えた。
 * `grass`(茂み・草の株が使っている下草の緑)へ寄せ直す。
 *
 * サボテンは入れない。あちらは砂の上に立つ砂漠の植物で、
 * 青みの残った緑のほうが正しい。 */
const UNDERLEAF = { mat: { leafsgreen: [0.342, 0.50, 0.54], leafsdark: [0.360, 0.46, 0.44] } };

/** 雪。「わずかに青い白」を無彩色として拾わせる(render.html の chromaMax)。 */
const SNOWY = { neutral: { chromaMax: 0.20 } };

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
 * いまは島に置いていない（/about の看板はあやとの家にした）。 */
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

/**
 * 間口3マス・奥行1マスの、横に長い小屋。
 *
 * `/about`（あやとのこと）の入口。たき火は「あやと本人」を指さないので、
 * **あやとの家**に建て替えた。人のことを知りたければ、その人の家へ行く。
 * 台所(2マス・珊瑚色)と工房(2マス・空色)と間違えないように、
 * 間口をもう1マス広げてある。遠目で分かれるのは屋根の色と横幅なので、
 * その両方を変える。
 */
const cottageWide = () => [
  W(-1, 0, 270, "wall-window-shutters"),
  W(0, 0, 270, "wall-door"),
  W(1, 0, 270, "wall-window-shutters"),
  W(-1, 0, 90),
  W(0, 0, 90),
  W(1, 0, 90),
  W(-1, 0, 180),
  W(1, 0, 0),
  ROOF_G(-1, 0),
  ROOF_G(0, 0),
  ROOF_G(1, 0),
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

/* ---------------- 煙突 ----------------
 * あつ森の家の煙突は「棟からまっすぐ立った素焼きのレンガ」で、
 * 笠が一段太い。壁と同じクリーム色にすると、屋根から出た柱にしか見えない。
 *
 * これまでは chimney.glb 1本を [0.5, 1, 0] に置いていた。
 * モデルの原点は中心ではなく x=0.213 から始まるので、実際に立っていたのは
 * 中心 x=0.82 ——壁の外面が x=1.0 なので、ほぼ軒の真上だった。
 * 棟ではなく軒から突き出しているように見えていたのはこれ。
 *
 * 中心を x=0.38 へ戻す。棟(z=0, y=1.571)をまたぐので、
 * モデルに描いてある水切りの帯が、ちょうど屋根を抜けるところに来る。
 *
 * 色は壁と分ける。キットの煙突は木の色相帯に落ちてクリーム色の壁と
 * 同じ色になり、屋根から出た柱にしか見えていなかった。 */
const CHIMNEY_TINT = {
  wood: { h: 0.045, s: 0.42, l: [0.40, 0.58] },  // レンガ本体。素焼きの赤茶
  green: { h: 0.015, s: 0.44, l: [0.30, 0.46] }, // 水切り。屋根より一段暗い赤
};
/** 煙突ひと組。x は世界座標での中心。 */
const chimney = (x) => [
  { url: `${BK}/chimney.glb`, pos: [x - 0.319, 1.02, 0], tint: CHIMNEY_TINT },
  // 笠。あつ森の煙突は必ず一段太い石が載っている。
  // これが無いと、ただの角柱が屋根から生えているように見える
  box([0.27, 0.065, 0.40], [0.085, 0.12, 0.76], [x, 2.05, 0]),
];

/** 住人。48枚を1つの画角で焼くための箱と、足元だけに落とす影。
 * 骨の原点は足元(y=0)。立ちで 0.67、歩きで少しはみ出すので 0.78 取る。 */
const VILLAGER = {
  plain: true,
  fit: [[-0.42, 0, -0.42], [0.42, 0.78, 0.42]],
  zoom: 0.80,
  // 影の広がりは箱の対角から出るので、そのままだと人1人には広すぎる
  shadowSpread: 0.5,
};

/** キットに無い小物は箱を組んで作る。 */
const box = (size, color, pos, rot = [0, 0, 0]) => ({ box: size, color, pos, rot });

/** 箱を組むときの色。[色相, 彩度, 明度] の sRGB。 */
const C = {
  post: [0.080, 0.44, 0.42],   // 杭・柱。樹皮より一段暗い
  plank: [0.088, 0.46, 0.62],  // 板
  face: [0.100, 0.24, 0.88],   // 板に貼った白い面
  rope: [0.105, 0.30, 0.66],   // 麻の綱
  gold: [0.122, 0.80, 0.60],
  red: [0.010, 0.66, 0.52],
  blue: [0.560, 0.52, 0.56],
  yellow: [0.128, 0.86, 0.62],
  // 旗と地球儀のぶん。島の草(h0.33)より青へ寄せて、地面に埋もれないようにする
  green: [0.372, 0.46, 0.44],
  white: [0.100, 0.10, 0.93],
  sea: [0.552, 0.48, 0.52],
};

/**
 * 組み立てたものを、まとめて縮めて置き直す。
 * 建物のパーツは 1マス = 1.0 で作られているので、岩の上に載せるような
 * 「小さい建物」は、部品ごとに倍率と座標を掛け直さないと組めない。
 */
const scaled = (parts, k, [dx, dy, dz] = [0, 0, 0]) => parts.map((p) => {
  const [x, y, z] = p.pos ?? [0, 0, 0];
  const q = { ...p, pos: [x * k + dx, y * k + dy, z * k + dz] };
  // 箱は寸法そのものを縮める。scale を足すと二重に効く
  if (p.box) q.box = p.box.map((v) => v * k);
  else q.scale = (p.scale ?? 1) * k;
  return q;
});

/**
 * 2点に渡した綱。
 * たるみ(sag)を付けないと、突っ張った棒にしか見えない。
 * 短い箱をつないで作るので、節ごとに傾きを計算する。
 */
const rope = (a, b, sag, seg = 8, w = 0.05) => {
  const at = (t) => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t - sag * Math.sin(Math.PI * t),
    a[2] + (b[2] - a[2]) * t,
  ];
  const out = [];
  for (let i = 0; i < seg; i++) {
    const p = at(i / seg);
    const q = at((i + 1) / seg);
    const [dx, dy, dz] = [q[0] - p[0], q[1] - p[1], q[2] - p[2]];
    out.push(box(
      // 節どうしを少し重ねる。隙間が空くと綱ではなく点線に見える
      [Math.hypot(dx, dy, dz) + w * 0.9, w, w], C.rope,
      [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2],
      [0, 0, (Math.atan2(dy, dx) * 180) / Math.PI],
    ));
  }
  return out;
};

/* ---------------- 桟橋 ----------------
 * かつての「旅の桟橋」に立っていたのは、何も書いていない道しるべ(sign.glb)。
 * 名前は桟橋なのに絵は道端の標識で、指しているものが違っていた(issue #114)。
 * 名前は変えない判断をしたので、絵のほうを桟橋に寄せる。
 *
 * 桟橋の見分けは「水から突き出た杭」と「杭に巻いたもやい綱」。
 * 板だけ並べると、ただの木の道になる。杭を板より高く出すのが要。 */
const pier = () => [
  // 板。2枚 × 2列。奥から手前へ張り出す
  ...[-0.5, 0.5].flatMap((x) => [
    part(`${NK}/path_wood.glb`, [x, 0.46, -0.26]),
    part(`${NK}/path_wood.glb`, [x, 0.46, 0.26]),
  ]),
  // 杭。手前の2本だけ板を突き抜けて高く出し、そこに綱を渡す
  box([0.17, 1.12, 0.17], C.post, [-0.84, 0.56, 0.30]),
  box([0.17, 0.92, 0.17], C.post, [0.84, 0.46, 0.30]),
  box([0.15, 0.46, 0.15], C.post, [-0.84, 0.23, -0.30]),
  box([0.15, 0.46, 0.15], C.post, [0.84, 0.23, -0.30]),
  ...rope([-0.84, 1.04, 0.30], [0.84, 0.84, 0.30], 0.36),
  // 杭に巻いてある綱。巻きが無いと、ただ棒に引っ掛けただけに見える
  box([0.21, 0.07, 0.21], C.rope, [-0.84, 0.94, 0.30]),
  box([0.21, 0.07, 0.21], C.rope, [0.84, 0.75, 0.30]),
  // 板の上の積み荷。ここから出ていく所だ、というひとこと。
  // 1周目は綱のとぐろを置いたが、上から見ると板の染みにしか見えなかった
  { url: `${FK}/barrel.glb`, pos: [0.24, 0.46, 0.02], scale: 0.62, tint: WOODEN },
  { url: `${FK}/bag.glb`, pos: [-0.16, 0.46, 0.16], rot: [0, 28, 0], scale: 0.52 },
];

/* ---------------- 歩いた国の道しるべ ----------------
 * 桟橋は「船で出ていく」を指していて、`/map` の中身（歩いた17カ国）を
 * 指していなかった。名前を「歩いた国」に変えたので、絵もそちらへ寄せる。
 *
 * 国の数を言うのは、板の枚数ではなく**色**。板を白のままにすると
 * 丘の道しるべ(legendWalk)と同じ絵になるので、
 * 1枚を2色の横縞にして、国旗が何枚も掛かっているように見せる。 */
const flagPost = () => {
  /** 旗1枚。y は高さ、len は張り出し、dir は向き(度)、a/b は上下の色。 */
  const flag = (y, len, dir, a, b) => {
    const rad = (dir * Math.PI) / 180;
    // 柱(半径0.08)の外から張り出す。回すと +X が (cos, 0, -sin) へ向く
    const d = 0.08 + len / 2;
    const pos = (dy) => [Math.cos(rad) * d, y + dy, -Math.sin(rad) * d];
    return [
      box([len, 0.125, 0.035], a, pos(0.066), [0, dir, 0]),
      box([len, 0.125, 0.035], b, pos(-0.066), [0, dir, 0]),
    ];
  };
  return [
    box([0.16, 1.56, 0.16], C.post, [0, 0.78, 0]),
    // 笠。無いと柱の上が切り落とされたように見える
    box([0.24, 0.10, 0.24], C.post, [0, 1.60, 0]),
    // 向きは 0 度と 180 度のあたりに寄せる。真横へ振ると絵の奥へ回って、
    // 焼いたときに板が線になって消える(1周目はこれで2枚が見えなかった)
    ...flag(1.36, 0.62, 8, C.blue, C.white),
    ...flag(1.10, 0.56, 192, C.red, C.white),
    ...flag(0.84, 0.58, -10, C.green, C.gold),
    ...flag(0.58, 0.50, 174, C.white, C.red),
    ...flag(0.32, 0.52, 14, C.gold, C.green),
  ];
};

/* ---------------- いまどこの地球儀 ----------------
 * 郵便受けは「知らせが届く」を指していて、「いま居る場所」を指していなかった。
 * 地球にピンが1本立っていれば、押さなくても何の面か分かる。
 * 大陸は小さい球を半分埋めて作る。板を貼ると、丸いものに平らな面が付いて
 * シールを貼ったように見えた。 */
const globeStand = () => {
  const cy = 0.86;
  const r = 0.40;
  /** 大陸1つ。球の中心から向き n の方向へ、半分だけ出す。 */
  const land = (n, rr) => {
    const k = Math.hypot(...n);
    const d = r - rr * 0.58;
    return { ball: { r: rr }, color: C.green,
      pos: [n[0] / k * d, cy + n[1] / k * d, n[2] / k * d] };
  };
  return [
    // 台。円盤2枚で、下ほど広げる
    { disc: { r: 0.30, r2: 0.36, h: 0.10 }, color: C.plank, pos: [0, 0.05, 0] },
    { disc: { r: 0.20, h: 0.06 }, color: C.post, pos: [0, 0.13, 0] },
    box([0.11, 0.34, 0.11], C.post, [0, 0.30, 0]),
    { ball: { r }, color: C.sea, pos: [0, cy, 0] },
    land([-0.50, 0.26, 0.82], 0.21),
    land([0.66, -0.16, 0.55], 0.17),
    land([0.16, 0.78, 0.30], 0.13),
    land([-0.78, -0.46, 0.20], 0.15),
    // ピン。真上に立てると北極に刺さって見えるので、手前へ倒す
    { disc: { r: 0.022, r2: 0.055, h: 0.20 }, color: C.red,
      pos: [-0.10, cy + r + 0.07, 0.15], rot: [22, 0, 8] },
    { ball: { r: 0.085 }, color: C.red, pos: [-0.13, cy + r + 0.19, 0.22] },
  ];
};

/* ---------------- 丘の記念碑（伝説の企画） ----------------
 * 丘に並ぶのは「380kmイラン横断」「GWエジプト祭り」のように、
 * 一つひとつ性格の違う企画。看板と石碑を使い回すと、どれがどれなのか
 * 分からない棚になる。企画ごとに、その日を指す形を組む。 */

/**
 * 道しるべ。歩いた企画。
 *
 * 板の端に45度の四角を重ねて矢印の先を作る。1周目は四角を板の高さより
 * 小さくしたので、対角線が板に収まってしまい、ただの長方形に見えていた。
 * 板の外へはみ出す大きさにしないと、矢印にならない。
 * 足元には荷物。「歩いて行った」を言うのは、板ではなくこちら。
 */
const legendWalk = () => {
  /** 行き先の板1枚。x は柱からの張り出し、d は張り出す向き。 */
  const arrow = (y, len, d, tilt) => {
    const half = len / 2;
    const tip = d * (half * 2 + 0.02);
    return [
      box([len, 0.22, 0.055], C.face, [d * half, y, 0.03], [0, 0, tilt]),
      box([0.24, 0.24, 0.055], C.face, [tip, y + (d > 0 ? 0.01 : -0.01), 0.03], [0, 0, 45]),
    ];
  };
  return [
    box([0.15, 1.40, 0.15], C.post, [0, 0.70, 0]),
    box([0.22, 0.09, 0.22], C.post, [0, 1.42, 0]),
    ...arrow(1.14, 0.80, 1, 2),
    ...arrow(0.82, 0.66, -1, -3),
    // 足元の荷物。柱に寄せると柱の一部に見えるので、離して置く
    { url: `${FK}/bag.glb`, pos: [-0.44, 0, 0.56], rot: [0, 24, 0], scale: 0.84 },
    { url: `${FK}/bag-flat.glb`, pos: [0.40, 0, 0.50], rot: [0, -34, 0], scale: 0.80 },
  ];
};

/** 遺跡。エジプト祭り。オベリスクと折れた柱と石の顔。 */
const legendRuins = () => [
  { url: `${NK}/statue_obelisk.glb`, pos: [-0.10, 0, -0.16], scale: 1.25 },
  { url: `${NK}/statue_columnDamaged.glb`, pos: [0.50, 0, 0.16], scale: 0.92 },
  // 石だけ3つ並べると、どこの遺跡だか分からない。ナツメヤシを1本足す
  { url: `${NK}/tree_palmDetailedShort.glb`, pos: [-0.95, 0, 0.60], scale: 0.74 },
];
/** 遺跡の石。灰色にすると北欧の石になるので、砂の色へ寄せる。 */
const SANDSTONE = {
  mat: {
    stone: [0.105, 0.34, 0.78], stonedark: [0.100, 0.32, 0.62],
    dirt: [0.098, 0.36, 0.70], grass: [0.298, 0.40, 0.50],
  },
  moss: { from: "stone" },
};

/* 年越し24時間配信。
 *
 * 1周目は街灯と丸太を置いて「夜通し」を言おうとしたが、島にある街灯と
 * ベンチをそのまま並べただけで、どの企画かが読めなかった。
 * この日を指しているのは時刻そのもの——0時をまたいで回り続けた針。
 * 文字盤を組んで、針を12時に立てる。
 *
 * 文字盤の向き。既定の軸は Y なので、rot [0,135,90] で
 * 「カメラの方位(yaw45)へ向いた軸」にする。こうすると円が
 * 縦つぶれだけで済み、45度のまま置いたときより丸く見える。 */
const CLOCK_Y = 1.40;
/** 文字盤の面の法線。手前へ 0.07 出したところに針と目盛りを置く */
const CLOCK_N = [0.0495, 0.0495];
/** 文字盤の面の横方向(3時と9時の向き)。カメラ方位と直交する */
const CLOCK_U = [0.7071, -0.7071];
const clockAt = (u, y, out = 1) => [
  CLOCK_U[0] * u + CLOCK_N[0] * out, y, CLOCK_U[1] * u + CLOCK_N[1] * out,
];
const legendVigil = () => [
  // 柱は文字盤の下で止める。1周目は文字盤と同じ高さまで伸ばしてしまい、
  // 針が柱の裏に隠れて、ただの丸い板になっていた
  box([0.17, 0.98, 0.17], C.post, [0, 0.49, 0]),
  box([0.34, 0.10, 0.34], C.post, [0, 0.05, 0]),
  // 文字盤。ふちを一回り大きい輪で囲って、板ではなく時計にする
  { disc: { r: 0.46, h: 0.09 }, color: C.gold, pos: [0, CLOCK_Y, 0], rot: [0, 135, 90] },
  { disc: { r: 0.40, h: 0.12 }, color: C.face, pos: [0, CLOCK_Y, 0], rot: [0, 135, 90] },
  // 目盛りは12・3・6・9の4本だけ。12本入れると小さく出したとき潰れる
  box([0.07, 0.10, 0.07], C.post, clockAt(0, CLOCK_Y + 0.31)),
  box([0.07, 0.10, 0.07], C.post, clockAt(0, CLOCK_Y - 0.31)),
  box([0.10, 0.07, 0.10], C.post, clockAt(0.31, CLOCK_Y), [0, 45, 0]),
  box([0.10, 0.07, 0.10], C.post, clockAt(-0.31, CLOCK_Y), [0, 45, 0]),
  // 針。長針は12ちょうど、短針は少し手前。重ねると1本に見える
  box([0.075, 0.36, 0.075], C.post, clockAt(0, CLOCK_Y + 0.18, 1.6)),
  box([0.085, 0.24, 0.085], C.post, clockAt(-0.03, CLOCK_Y + 0.12, 2.2), [0, 45, 8]),
  { disc: { r: 0.06, h: 0.08 }, color: C.red, pos: clockAt(0, CLOCK_Y, 2.4), rot: [0, 135, 90] },
  // 夜通しの明かり。時計の足元だけ暖める
  { glow: { r: 0.62, color: 0xffd9a0, strength: 0.44 }, pos: [0, 0.006, 0] },
];
/** 文字盤を下から暖める。夜のあいだずっと点いていた、という色 */
const VIGIL = {
  lights: [{ color: 0xffbe6a, intensity: 0.09, distance: 2.4, decay: 2, pos: [0, 0.50, 0.40] }],
};

/* 100万再生。
 *
 * 1周目は石の台に金の輪(statue_ring)を立てたが、金具の取っ手にしか
 * 見えなかった。賞だと分かるのは、輪ではなく杯の形。
 * 円盤の上下の太さを変えられるので(disc の r2)、口の開いた杯を組む。 */
const legendMedal = () => [
  part(`${NK}/statue_block.glb`),
  { disc: { r: 0.17, h: 0.06 }, color: C.gold, pos: [0, 0.38, 0] },
  box([0.075, 0.16, 0.075], C.gold, [0, 0.49, 0]),
  { disc: { r: 0.25, r2: 0.13, h: 0.30 }, color: C.gold, pos: [0, 0.72, 0] },
  { disc: { r: 0.27, h: 0.055 }, color: C.gold, pos: [0, 0.885, 0] },
  // 取っ手。これが無いと、金の植木鉢に見える
  box([0.075, 0.20, 0.075], C.gold, [0.28, 0.76, 0], [0, 0, 22]),
  box([0.075, 0.20, 0.075], C.gold, [-0.28, 0.76, 0], [0, 0, -22]),
];

/* ルーレットで行く、ぶらり旅。
 *
 * 1周目はキットの車輪(wheel.glb)を軸受けに載せたが、荷車の車輪にしか
 * 見えなかった。回して行き先を決めるものは、輻(スポーク)ではなく
 * 「色の分かれた縁」と「止まった所を指す針」で分かる。
 * 円盤を組んで、縁に出目を並べる。 */
const WHEEL_Y = 0.86;
const WHEEL_R = 0.40;
/** 出目。輪の縁を等分に色分けする。角度は12時から時計回り。 */
const pips = () => {
  const cols = [C.red, C.yellow, C.blue, C.face, C.red, C.yellow, C.blue, C.face];
  return cols.map((c, i) => {
    const a = (i / cols.length) * Math.PI * 2;
    return box(
      [0.19, 0.17, 0.15], c,
      [0, WHEEL_Y + Math.cos(a) * WHEEL_R, Math.sin(a) * WHEEL_R],
      [(a * 180) / Math.PI, 0, 0],
    );
  });
};
const legendWheel = () => [
  box([0.90, 0.11, 0.40], C.plank, [0, 0.055, 0]),
  box([0.12, 0.60, 0.12], C.post, [-0.32, 0.36, 0]),
  box([0.12, 0.60, 0.12], C.post, [0.32, 0.36, 0]),
  { disc: { r: 0.47, h: 0.10 }, color: C.post, pos: [0, WHEEL_Y, 0], rot: [0, 0, 90] },
  { disc: { r: 0.40, h: 0.14 }, color: C.face, pos: [0, WHEEL_Y, 0], rot: [0, 0, 90] },
  ...pips(),
  { disc: { r: 0.09, h: 0.20 }, color: C.post, pos: [0, WHEEL_Y, 0], rot: [0, 0, 90] },
  // 止まった所を指す針。輪より上から降ろす
  box([0.10, 0.24, 0.10], C.red, [0, WHEEL_Y + 0.60, 0]),
];

/** 山の上の教会。カズベキ遠征。岩の台地に小さい礼拝堂を1つ載せる。 */
const chapel = () => [
  ...[0, 90, 180, 270].map((d) => W(0, 0, d, d === 270 ? "wall-door" : "wall-window-small")),
  part(`${BK}/roof-point.glb`, [0, 1, 0]),
];
/* カズベキ遠征。
 *
 * 1周目は cliff の立方体に礼拝堂を載せたが、天面が芝のままで
 * 「土の箱の上に建った家」にしかならなかった。カズベキで写っているのは
 * 尖った岩山と、その手前の小さい礼拝堂。岩は cliff ではなく rock_tall を
 * 大きくして使う。輪郭が不揃いなぶん、山に見える。 */
const legendPeak = () => [
  { url: `${NK}/rock_tallG.glb`, pos: [-0.62, 0, -0.62], scale: 2.5, tint: STONE },
  { url: `${NK}/rock_tallC.glb`, pos: [0.42, 0, -0.95], scale: 1.5, tint: STONE },
  { url: `${HK}/snow-pile.glb`, pos: [-0.62, 1.52, -0.62], scale: 0.78 },
  { url: `${HK}/snow-pile.glb`, pos: [0.42, 0.86, -0.95], scale: 0.46 },
  // 手前の丘。礼拝堂を地面に直接置くと、山の裾に埋まって見えなくなる
  { url: `${NK}/rock_largeA.glb`, pos: [0.52, 0, 0.62], scale: 1.35, tint: STONE },
  ...scaled(chapel(), 0.50, [0.52, 0.31, 0.62]).map((p) => ({ ...p, tint: house("coral") })),
  { url: `${HK}/tree-snow-b.glb`, pos: [-1.18, 0, 0.72], scale: 0.62 },
];

/** イワシ3日連続。まな板に3尾。1尾だけだと、ただの魚の絵になる。 */
const legendFish = () => [
  { url: `${FK}/cutting-board.glb`, rot: [0, 90, 0], scale: 1.15 },
  // 3尾。まな板からはみ出すと皿に乗っていないように見えるので、少し縮める
  ...[[-0.21, -7], [0.01, 6], [0.22, -3]].map(([z, ry], i) => ({
    url: `${FK}/fish.glb`, pos: [i === 1 ? 0.03 : -0.02, 0.07, z], rot: [0, 90 + ry, 0], scale: 0.82,
  })),
];

/** お祝いの電飾。登録1,000人。柱2本に電飾を渡して、下に切株の台を置く。 */
const legendLights = () => [
  box([0.12, 1.24, 0.12], C.post, [-0.72, 0.62, 0]),
  box([0.12, 1.06, 0.12], C.post, [0.72, 0.53, 0]),
  { url: `${HK}/lights-colored.glb`, pos: [0, 0.90, 0], scale: [1.52, 1.20, 1.4] },
  { url: `${NK}/stump_roundDetailed.glb`, pos: [0.02, 0, 0.34], scale: 0.9 },
  { url: `${FK}/cake-birthday.glb`, pos: [0.02, 0.36, 0.34], scale: 0.8, plain: true },
];

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

const SPRITES_BASE = [
  /* ---------- 建物 ---------- */
  { name: "hut-kitchen", parts: [...cottage(), ...chimney(0.38)], opts: house("coral") },
  { name: "hut-workshop", parts: cottage(), opts: house("sky") },
  { name: "hut-home", parts: cottage(), opts: house("mint") },
  { name: "hut-ayato", parts: [...cottageWide(), ...chimney(0.5)], opts: house("mint") },
  { name: "hall-museum", parts: hall(), opts: house("sun") },
  { name: "tower-studio", parts: tower(), opts: house("plum") },
  { name: "signboard", parts: board(), opts: WOODEN },
  { name: "mailbox", parts: mailbox() },

  /* ---------- 場所の目印 ---------- */
  { name: "tent", parts: [`${NK}/tent_detailedOpen.glb`] },
  { name: "tent-small", parts: [`${NK}/tent_smallOpen.glb`] },
  { name: "tent-closed", parts: [`${NK}/tent_detailedClosed.glb`] },
  { name: "canoe-paddle", parts: [`${NK}/canoe_paddle.glb`] },
  { name: "campfire", parts: campfire(), opts: CAMPFIRE },
  { name: "signpost", parts: [`${NK}/sign.glb`] },
  { name: "pier", parts: pier() },
  { name: "signpost-flags", parts: flagPost() },
  { name: "globe-stand", parts: globeStand() },
  { name: "statue", parts: [`${NK}/statue_obelisk.glb`] },
  { name: "statue-head", parts: [`${NK}/statue_head.glb`] },
  { name: "canoe", parts: [`${NK}/canoe.glb`] },
  // 橋板は stone という名前だが木。樹皮を明るくしたので、ここも上げないと
  // 手すりだけ明るくて板だけ焦げ茶の、木が2種類の橋になる
  { name: "bridge", parts: [`${NK}/bridge_wood.glb`], opts: { mat: { stone: [0.088, 0.58, 0.66] } } },
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

  /* ---------- 丘の記念碑 ----------
     `site/content/legends.ts` の企画1つに絵1つ。名前は slug に合わせる。 */
  { name: "legend-iran-walk", parts: legendWalk() },
  { name: "legend-egypt-festival", parts: legendRuins(), opts: SANDSTONE },
  { name: "legend-newyear-24h", parts: legendVigil(), opts: VIGIL },
  { name: "legend-million-views", parts: legendMedal(), opts: GREYSTONE },
  { name: "legend-roulette-georgia", parts: legendWheel(), opts: WOODEN },
  { name: "legend-kazbegi", parts: legendPeak(), opts: SNOWY },
  { name: "legend-iwashi-festival", parts: legendFish(), opts: { plain: true } },
  { name: "legend-thousand-subs", parts: legendLights() },

  /* ---------- 島の景色 ----------
     押せない飾り。遠くに置いて島を広く見せる。 */
  { name: "windmill", parts: [`${BK}/windmill.glb`], opts: house("sky") },
  { name: "watermill", parts: [`${BK}/watermill.glb`], opts: house("coral") },

  /* ---------- 木 ----------
     広葉樹は樹冠を房に分ける(LEAFY)。針葉樹とヤシは葉がもともと分かれているので掛けない。 */
  { name: "tree-round", parts: [`${NK}/tree_oak.glb`], opts: LEAFY },
  { name: "tree-fat", parts: [`${NK}/tree_fat.glb`], opts: LEAFY },
  { name: "tree-tall", parts: [`${NK}/tree_detailed.glb`], opts: { lobes: 0.3, ...TRUNK } },
  // tree_blocks は葉が立方体の集まりだが、法線をならすと1個の丸い塊に
  // なってしまい、tree-round と見分けが付かない。房をごく弱く掛けて、
  // 面の向きを崩し、キットの「積み木の木」らしさを戻す
  { name: "tree-blocks", parts: [`${NK}/tree_blocks.glb`], opts: { lobes: 0.34, ...TRUNK } },
  { name: "tree-default", parts: [`${NK}/tree_default.glb`], opts: LEAFY },
  { name: "tree-small", parts: [`${NK}/tree_small.glb`], opts: LEAFY },
  { name: "tree-plateau", parts: [`${NK}/tree_plateau.glb`], opts: TRUNK },
  { name: "tree-thin", parts: [`${NK}/tree_thin.glb`], opts: LEAFY_SOFT },
  { name: "tree-pine", parts: [`${NK}/tree_pineDefaultA.glb`] },
  { name: "tree-pine-tall", parts: [`${NK}/tree_pineTallA.glb`] },
  { name: "tree-pine-round", parts: [`${NK}/tree_pineRoundC.glb`] },
  { name: "tree-pine-small", parts: [`${NK}/tree_pineSmallB.glb`] },
  { name: "tree-cone", parts: [`${NK}/tree_cone.glb`], opts: TRUNK },
  { name: "tree-palm", parts: [`${NK}/tree_palmDetailedTall.glb`] },
  { name: "tree-palm-short", parts: [`${NK}/tree_palmDetailedShort.glb`] },
  { name: "tree-palm-bend", parts: [`${NK}/tree_palmBend.glb`] },
  /* ナツメヤシ。中東の島の木。
     Kenney のキットに無いので render.html の datePalm で組む
     （`docs/island-atlas.md` 9章「まだ無いもの」に挙がっていたもの）。
     大人の木・若木・実の付いていない木の3本。同じ木が並ぶと林が壁紙に見えるので、
     種を変えて葉の向きと長さを振ってある。 */
  { name: "tree-date", parts: [{ palm: {
    seed: 7, h: 1.95, r0: 0.175, r1: 0.132, rings: 13, fronds: 13,
    len: 1.18, w: 0.42, dates: 3,
  } }] },
  { name: "tree-date-short", parts: [{ palm: {
    seed: 23, h: 0.92, r0: 0.16, r1: 0.128, rings: 7, fronds: 11,
    len: 0.98, w: 0.40, dates: 0,
  } }] },
  { name: "tree-date-young", parts: [{ palm: {
    seed: 91, h: 1.42, r0: 0.165, r1: 0.128, rings: 10, fronds: 12,
    len: 1.06, w: 0.40, lean: -0.11, dates: 1,
  } }] },
  // 同じ木ばかり並ぶと林が壁紙に見える。輪郭の違うものを足す
  { name: "tree-simple", parts: [`${NK}/tree_simple.glb`], opts: LEAFY },
  { name: "tree-narrow", parts: [`${NK}/tree_tall.glb`], opts: LEAFY_SOFT },
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
  { name: "lily", parts: [`${NK}/lily_large.glb`], opts: UNDERLEAF },
  { name: "lily-small", parts: [`${NK}/lily_small.glb`], opts: UNDERLEAF },
  { name: "pot-plant", parts: [`${NK}/pot_large.glb`] },
  { name: "pot-plant-small", parts: [`${NK}/pot_small.glb`] },
  // 地面がまだ更地に見える（ac-reference.md 4）。木と建物のあいだを埋める草を足す。
  // 葉の形が違うものを混ぜないと、同じ株を敷き詰めた絨毯になる
  { name: "fern", parts: [`${NK}/plant_flatTall.glb`], opts: UNDERLEAF },
  { name: "fern-short", parts: [`${NK}/plant_flatShort.glb`], opts: UNDERLEAF },
  { name: "bush-spiky", parts: [`${NK}/plant_bushTriangle.glb`] },
  { name: "bush-spiky-large", parts: [`${NK}/plant_bushLargeTriangle.glb`] },
  { name: "bamboo", parts: [`${NK}/crops_bambooStageB.glb`] },
  { name: "mushroom-tall", parts: [`${NK}/mushroom_redTall.glb`] },
  { name: "mushroom-tan-tall", parts: [`${NK}/mushroom_tanTall.glb`] },
  { name: "flower-red-mid", parts: [`${NK}/flower_redB.glb`] },
  { name: "flower-yellow-mid", parts: [`${NK}/flower_yellowB.glb`] },
  { name: "flower-purple-mid", parts: [`${NK}/flower_purpleB.glb`] },
  { name: "firewood-large", parts: [`${NK}/log_stackLarge.glb`] },

  /* ---------- 畑（台所の小屋のまわり） ---------- */
  { name: "crop-corn", parts: [`${NK}/crops_cornStageD.glb`] },
  { name: "crop-wheat", parts: [`${NK}/crops_wheatStageB.glb`] },
  { name: "crop-pumpkin", parts: [`${NK}/crop_pumpkin.glb`] },
  { name: "crop-melon", parts: [`${NK}/crop_melon.glb`], opts: UNDERLEAF },
  { name: "crop-carrot", parts: [`${NK}/crop_carrot.glb`] },
  { name: "crop-turnip", parts: [`${NK}/crop_turnip.glb`] },
  { name: "crop-row", parts: [`${NK}/crops_dirtRow.glb`] },
  // 育ちかけの畝。実った物ばかり並べると、育てている場所に見えない
  { name: "crop-corn-young", parts: [`${NK}/crops_cornStageB.glb`] },
  { name: "crop-wheat-young", parts: [`${NK}/crops_wheatStageA.glb`] },
  { name: "crop-leafs", parts: [`${NK}/crops_leafsStageB.glb`] },
  { name: "crop-row-double", parts: [`${NK}/crops_dirtDoubleRow.glb`] },

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
  // 岩は同じ形が2つ並ぶとすぐ「使い回し」に見える。輪郭の違うものを増やす
  { name: "rock-wide", opts: STONE, parts: [`${NK}/rock_largeC.glb`] },
  { name: "rock-tall-b", opts: STONE, parts: [`${NK}/rock_tallG.glb`] },
  { name: "rock-top", opts: STONE, parts: [`${NK}/rock_smallTopA.glb`] },
  { name: "stone-flat", opts: GREYSTONE, parts: [`${NK}/stone_smallFlatA.glb`] },
  { name: "stone-top", opts: GREYSTONE, parts: [`${NK}/stone_smallTopB.glb`] },
  // 道と柵は、曲がり角と端が無いと途中で切れて見える
  { name: "path-stone-corner", parts: [`${NK}/path_stoneCorner.glb`] },
  { name: "path-stone-end", parts: [`${NK}/path_stoneEnd.glb`] },
  { name: "fence-high", parts: [`${NK}/fence_simpleHigh.glb`] },
  { name: "fence-corner", parts: [`${NK}/fence_corner.glb`] },
  { name: "fence-bend", parts: [`${NK}/fence_bend.glb`] },
  { name: "statue-block", parts: [`${NK}/statue_block.glb`], opts: GREYSTONE },
  { name: "statue-column-broken", parts: [`${NK}/statue_columnDamaged.glb`], opts: GREYSTONE },

  /* ---------- 北欧の旅 ----------
     /nordic で使う雪の景色。holiday-kit。
     色は島と同じ帯の置き換えを通す。ここだけ Kenney の配色のまま出すと、
     旅のページだけ別のゲームの絵に見える(island-world.md 6)。

     雪だけは帯の振り分けに手を入れる。Kenney の雪は「わずかに青い白」で
     彩度が 0.3 前後あり、そのままだと青の帯に落ちて水色になる。
     白かどうかを彩度ではなく明暗の差で見て、島と同じ生成りの白へ送る。 */
  ...[
    ["snowman", "snowman"], ["snowman-hat", "snowman-hat"],
    ["snow-pile", "snow-pile"], ["tree-snow", "tree-snow-b"],
    ["tree-snow-tall", "tree-snow-a"], ["rocks-snow", "rocks-medium"],
  ].map(([name, file]) => ({ name, parts: [`${HK}/${file}.glb`], opts: SNOWY })),
  { name: "sled", parts: [`${HK}/sled.glb`] },
  { name: "sled-long", parts: [`${HK}/sled-long.glb`] },
  { name: "reindeer", parts: [`${HK}/reindeer.glb`] },

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
    // recipes.ts が food-plate-dinner を5品、food-fish を3品に使い回していた。
    // 「どれも同じ絵」に見えるのは品数のせいなので、皿・果物・甘い物を増やす
    "sushi-egg", "maki-vegetable", "maki-roe", "frikandel-speciaal",
    "mincemeat-pie", "ice-cream-cne", "popsicle", "lollypop", "candy-bar",
    "cherries", "banana", "orange", "pear", "lemon", "apple", "avocado",
    "corn", "pumpkin", "mushroom", "cabbage", "cauliflower", "celery-stick",
    "radish", "beet", "pepper", "whole-ham", "meat-sausage", "bacon", "egg",
    "cheese-cut", "glass-wine", "soda-can", "mug", "plate-deep",
    "burger-double", "cake-birthday", "chocolate", "pizza-box",
  ].map((id) => ({ name: `food-${id}`, parts: [`${FK}/${id}.glb`], opts: { plain: true } })),

  /* ---------- 住人 ----------
     Kenney の配色がそのままで可愛いので、色は置き換えない(plain)。

     読んだままの姿勢は腕を真横に広げた T字で、島に置いても人形にしか
     見えなかった。mini-characters は骨とアニメを持っているので、
     クリップの1コマで止めて姿勢を焼く(render.html の applyPose)。

     カメラは他のスプライトと同じ(yaw45 / pitch32)のまま。
     低い位置から撮ったほうが頭でっかちに見えにくいが、そうすると
     接地影の楕円だけが小屋や木と違う平たさになって、貼り付けたように見える。
     頭の大きさはモデルの持ち味なので、影のほうを揃える。

     歩きは2コマ。同じ周期の逆位相(0.25 と 0.75)を取ると、
     踏み出す足が左右で入れ替わり、絵の大きさもほぼ同じになる。

     48枚とも同じ画角(fit)で焼く。姿勢ごとに測り直すと、
     site の Sprite が「物体の高さ = 指定した大きさ」に合わせて拡大するので、
     しゃがんだコマだけ大きく描かれて、差し替えた瞬間に跳ねる。 */
  ...["male-a", "male-b", "male-c", "male-d", "male-e", "male-f",
    "female-a", "female-b", "female-c", "female-d", "female-e", "female-f",
  ].flatMap((id) => [
    // 立ち。名前を変えないのは、いま参照している所があっても壊さないため
    ["", "idle", 0],
    ["-walk-a", "walk", 0.25],
    ["-walk-b", "walk", 0.75],
    ["-sit", "sit", 0.5],
  ].map(([suffix, clip, t]) => ({
    name: `villager-${id}${suffix}`,
    parts: [{ url: `${BK}/character-${id}.glb`, pose: { clip, t } }],
    opts: VILLAGER,
  }))),
];

/* ---------------- 図鑑の主役だけ、もう1枚大きく焼く ----------------
 *
 * `/kitchen/[品]` と `/legends` は、絵1つでその面が持っている。画面では
 * 高さ 300px 近くまで出るのに、焼いてあるのは長辺 320px（卵サンドで 197×253）。
 * 高精細画面では2倍に引き伸ばされて、主役の絵だけがぼけていた。
 *
 * 全部を大きくすると一覧のマスまで重くなるので、**主役として出る絵だけ**
 * 長辺 640px でもう1枚焼き、`sprites/hero/` に置く。画面側は srcset で
 * 2倍の画面にだけそちらを配るので、増えるのは詳細を開いた人の1枚だけ。
 *
 * どれが主役かは recipes.ts と legends.ts が決めている。ここに名前を写すと
 * 品が増えたとき片方だけ古くなるので、その2つを読んで拾う。 */
const HERO_PX = 640;
const CONTENT = new URL("../../site/content/", import.meta.url);

const heroNames = () => {
  const out = new Set();
  for (const f of ["recipes.ts", "legends.ts"]) {
    for (const m of fs.readFileSync(new URL(f, CONTENT), "utf8").matchAll(/^\s*icon: "([^"]+)"/gm)) {
      out.add(m[1]);
    }
  }
  return [...out].sort();
};

export const SPRITES = [
  ...SPRITES_BASE,
  ...heroNames().map((name) => {
    const base = SPRITES_BASE.find((s) => s.name === name);
    // 一覧に無い名前を主役に指定している。焼けないので、黙って飛ばさず止める
    if (!base) throw new Error(`主役に指定された絵が manifest に無い: ${name}`);
    return { ...base, name: `hero/${name}`, opts: { ...(base.opts ?? {}), px: HERO_PX } };
  }),
];

