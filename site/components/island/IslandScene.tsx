import { ISLAND, GRASS_INSET, PLACES, PLATEAU, SPOTS, WORLD, type SpotId } from "./layout";
import {
  blob,
  inset,
  insideRadii,
  pointAt,
  radiiToPoints,
  resample,
  ring,
  rng,
  wobble,
  type Pt,
} from "./geometry";
import { Sprite } from "./Sprite";

/* ------------------------------------------------------------------ */
/* 地形                                                                */
/* ------------------------------------------------------------------ */

const { cx: CX, cy: CY, squash: SQ } = ISLAND;

const sandR = ISLAND.radii;
const grassR = inset(sandR, GRASS_INSET);

/**
 * 岸は5本の帯でできている（`docs/ac-reference.md` 2章）。
 * 海から陸へ「深い青 → 明るいターコイズの浅瀬 → 真っ白な泡 → 濡れた砂 → 乾いた砂」。
 * 2 と 3 が無いと、境がただの色の切り替わりになって水辺に見えない。
 *
 * 数字は砂浜の輪郭からの距離。マイナスが沖、プラスが陸。
 */
const SHORE = {
  /** 深い青がゆるむところ */
  haze: -300,
  /** 中くらいの青 */
  mid: -205,
  /** 明るいターコイズの浅瀬。ここは幅をしっかり取る */
  shallow: -122,
  /** いちばん明るい、砂のすぐ沖 */
  shelf: -48,
  /** 泡の外側と内側。細くしないと、せっかくの浅瀬を白が食べてしまう */
  foamOut: -17,
  foamIn: 3,
  /** 濡れた砂の内側の縁。砂浜は 34 しか幅がないので、
      濡れた帯を広く取ると乾いた砂が残らない。 */
  wet: 12,
};

const sandPath = blob(CX, CY, sandR, SQ);
const grassPath = blob(CX, CY, grassR, SQ);

/** 沖の帯。輪郭をそのまま外へ出すと真円に見えるので、帯ごとに違う起伏を足す。 */
const hazePath = blob(CX, CY, wobble(resample(inset(sandR, SHORE.haze), 48), 71, 30), SQ);
const midPath = blob(CX, CY, wobble(resample(inset(sandR, SHORE.mid), 48), 72, 24), SQ);
const shallowPath = blob(CX, CY, wobble(resample(inset(sandR, SHORE.shallow), 64), 73, 17), SQ);
const shelfPath = blob(CX, CY, wobble(resample(inset(sandR, SHORE.shelf), 64), 74, 10), SQ);

/**
 * 濡れた砂。乾いた砂より一段濃い帯を、波打ち際の側に敷く。
 * 乾いた砂に外へ向かう暗いグラデをかけると、こちらのほうが明るくなって逆になる。
 * だから乾いた砂は平らな明るい色にして、濃さはこの帯だけで作る。
 */
const wetRing = ring(
  CX,
  CY,
  sandR,
  wobble(resample(inset(sandR, SHORE.wet), 64), 75, 5),
  SQ,
);
/** 波が引いたばかりのところ。いちばん濃い。 */
const wetEdgeRing = ring(
  CX,
  CY,
  sandR,
  wobble(resample(inset(sandR, 5), 64), 76, 2.5),
  SQ,
);

/**
 * 泡。ぼかさず、真っ白でくっきり描く。
 *
 * 1本の線にすると縫い目のように見えてしまうので、
 *   ・不規則な幅の帯（レースの土台）
 *   ・大小の弧をびっしり重ねたふち（レースの縁）
 *   ・ちぎれた泡の粒
 * の3つを重ねる。弧の向きは、その位置での外向きに合わせる。
 */
const foamBand = ring(
  CX,
  CY,
  wobble(resample(inset(sandR, SHORE.foamOut), 96), 81, 7, [5, 11, 19]),
  wobble(resample(inset(sandR, SHORE.foamIn), 96), 82, 5, [4, 9, 17]),
  SQ,
);

/**
 * 波打ち際のレース。
 *
 * 弧を1本ずつ <path> にすると数百要素になって、
 * カメラを動かすたび（viewBox が毎フレーム変わる）に全部を描き直すことになる。
 * 見た目は同じなので、置き場所と向きを座標に焼き込んで
 * 「太さの違う3本のパス」にまとめる。
 */
function foamLace(
  count: number,
  seed: number,
  offMin: number,
  offMax: number,
  sizeMin: number,
  sizeMax: number,
): string[] {
  const r = rng(seed);
  const buckets = ["", "", ""];
  for (let i = 0; i < count; i++) {
    const t = (i + r() * 0.9) / count;
    const [x, y] = pointAt(CX, CY, sandR, SQ, t, offMin + r() * (offMax - offMin));
    const w = sizeMin + r() * (sizeMax - sizeMin);
    const h = w * (0.14 + r() * 0.22); // 平たい弧。丸いとバネの落書きに見える
    // ふくらみが沖を向く角度。輪郭の位置 t がそのまま回転角になる。
    const a = t * Math.PI * 2;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    const f = (n: number) => n.toFixed(1);
    buckets[i % 3] +=
      `M${f(x - w * c)},${f(y - w * sn)}` +
      `Q${f(x + h * sn)},${f(y - h * c)} ${f(x + w * c)},${f(y + w * sn)}`;
  }
  return buckets;
}

/** 泡のふち。外側の大きい弧と、内側の細かい弧。 */
const foamLaceOut = foamLace(72, 8801, -26, -13, 15, 32);
const foamLaceIn = foamLace(112, 8802, -11, 6, 7, 17);
/** 3本それぞれの太さと濃さ。ばらけていないとレースに見えない。 */
const LACE_STYLE: [number, number][] = [
  [3.4, 0.9],
  [2.4, 0.7],
  [1.7, 0.5],
];

/** ちぎれた泡の粒。円をひとつずつ置かず、円弧コマンドで1本のパスにまとめる。 */
const foamDots = (() => {
  const r = rng(8803);
  const buckets = ["", ""];
  for (let i = 0; i < 74; i++) {
    const t = (i + r() * 0.9) / 74;
    const [x, y] = pointAt(CX, CY, sandR, SQ, t, -36 + r() * 26);
    const rad = 1.4 + r() * 2.8;
    const f = (n: number) => n.toFixed(1);
    buckets[i % 2] +=
      `M${f(x - rad)},${f(y)}a${f(rad)},${f(rad)} 0 1,0 ${f(rad * 2)},0a${f(rad)},${f(rad)} 0 1,0 ${f(-rad * 2)},0`;
  }
  return buckets;
})();

/**
 * 海面のきらめき。
 * 全幅の帯を並べると縞に見えるので、短い線を散らす。島の上には出さない。
 * これも本数ぶんの要素にせず、濃さごとに1本のパスへまとめる。
 */
const glints = (() => {
  const r = rng(6161);
  const shallowEdge = inset(sandR, SHORE.shallow);
  const buckets = ["", "", ""];
  let n = 0;
  let guard = 0;
  while (n < 120 && guard++ < 4000) {
    const x = -80 + r() * (WORLD + 160);
    const y = -80 + r() * (WORLD + 160);
    // 浅瀬より内側には出さない。島の縁で光っていると泡と喧嘩する。
    if (insideRadii(CX, CY, shallowEdge, x, y, SQ, -10)) continue;
    const w = 4 + r() * 13;
    buckets[n % 3] += `M${x.toFixed(1)},${y.toFixed(1)}h${w.toFixed(1)}`;
    n++;
  }
  return buckets;
})();
/** きらめき3本の [太さ, 濃さ]。 */
const GLINT_STYLE: [number, number][] = [
  [2.8, 0.26],
  [2.1, 0.16],
  [1.6, 0.1],
];

/** 沖のうねり。島を囲む輪にして、水面が動いているように見せる。 */
const swellPaths = [190, 268, 350].map((d, i) =>
  blob(CX, CY, wobble(resample(inset(sandR, -d), 40), 91 + i, 16 + i * 6), SQ),
);

/**
 * 草の地模様。
 *
 * 本物の草地は一面に細かい葉が入っていて、のっぺりした面がどこにも無い。
 * 葉を1枚ずつ置くと数百要素になるので、タイル1枚に焼いて敷く。
 * 明るい葉と暗い葉で2枚に分け、大きさと角度を変えて重ねると、
 * タイルの継ぎ目と繰り返しが目につかなくなる。
 */
function grassTile(seed: number, count: number, size: number) {
  const r = rng(seed);
  const f = (n: number) => n.toFixed(1);
  const SHAPES = [
    // 三角の葉
    (x: number, y: number, s: number) => `M${x},${y}l${f(-3.4 * s)},${f(-6.2 * s)}h${f(6.8 * s)}Z`,
    // 二股の草
    (x: number, y: number, s: number) =>
      `M${x},${y}l${f(-2.6 * s)},${f(-6.6 * s)}l${f(2.6 * s)},${f(3.2 * s)}l${f(2.6 * s)},${f(-3.2 * s)}Z`,
    // 小さなクローバー
    (x: number, y: number, s: number) =>
      `M${f(x - 2.2 * s)},${y}a${f(2.2 * s)},${f(1.7 * s)} 0 1,0 ${f(4.4 * s)},0a${f(2.2 * s)},${f(1.7 * s)} 0 1,0 ${f(-4.4 * s)},0`,
  ];
  let hi = "";
  let lo = "";
  for (let i = 0; i < count; i++) {
    // 継ぎ目に葉がまたがらないよう、ふちから少し内側にだけ置く
    const x = +(6 + r() * (size - 12)).toFixed(1);
    const y = +(8 + r() * (size - 12)).toFixed(1);
    const k = r();
    const d = SHAPES[k < 0.44 ? 0 : k < 0.8 ? 1 : 2](x, y, 0.8 + r() * 0.9);
    if (r() < 0.55) hi += d;
    else lo += d;
  }
  return { hi, lo, size };
}

/** 2枚のタイルを、大きさと角度を変えて重ねる。 */
const GRASS_TILES = [grassTile(1207, 46, 152), grassTile(3311, 30, 97)];

const plateauTopPath = blob(PLATEAU.cx, PLATEAU.cy - PLATEAU.drop, PLATEAU.radii, PLATEAU.squash);

/** 高台の崖。手前側の弧だけを帯にして、そこに岩肌を描く。 */
const cliff = (() => {
  const lower = radiiToPoints(PLATEAU.cx, PLATEAU.cy, PLATEAU.radii, PLATEAU.squash);
  const upper = radiiToPoints(PLATEAU.cx, PLATEAU.cy - PLATEAU.drop, PLATEAU.radii, PLATEAU.squash);
  const n = lower.length;
  const seq: number[] = [];
  for (let i = 0; i < n; i++) {
    const k = (i + Math.floor(n / 4)) % n; // 右→下→左 の順に見る
    if (upper[k][1] >= PLATEAU.cy - PLATEAU.drop - 2) seq.push(k);
  }
  if (seq.length < 2) return { band: "", lines: [] as Pt[] };
  let d = `M${upper[seq[0]][0].toFixed(1)},${upper[seq[0]][1].toFixed(1)}`;
  for (const i of seq.slice(1)) d += `L${upper[i][0].toFixed(1)},${upper[i][1].toFixed(1)}`;
  for (let k = seq.length - 1; k >= 0; k--) d += `L${lower[seq[k]][0].toFixed(1)},${lower[seq[k]][1].toFixed(1)}`;
  return { band: d + "Z", lines: seq.map((i) => upper[i]) };
})();

/** 川。高台の滝から浜へ流れ落ちる。 */
const RIVER = "M812 500 C856 566 826 640 862 702 C892 754 918 786 956 806";
/** 池 */
const POND = { x: 452, y: 806, rx: 66, ry: 32 };

/* ------------------------------------------------------------------ */
/* 置くもの                                                            */
/* ------------------------------------------------------------------ */

export type Item = {
  n: string;
  x: number;
  y: number;
  s: number;
  flip?: boolean;
  /** そよ風で揺らす。値は揺れ始めをずらすための秒数 */
  sway?: number;
  /** 入口になっている建物。押せるようにするため、どの場所かを持たせる。 */
  spot?: SpotId;
  /** 揺らさない。地面の細かい飾りまで揺らすと、毎フレーム動かす要素が一気に増える。 */
  still?: boolean;
};

/** 揺れるもの(草木)かどうか。建物や岩は揺れない。 */
const SWAYS = /^(tree|bush|grass|flower|mushroom|lily)/;

const P = Object.fromEntries(PLACES.map((s) => [s.id, s])) as Record<SpotId, (typeof PLACES)[number]>;

/** 建物。押せる範囲と絵がズレると「押したのに反応しない」になるので、
    絵は PLACES の定義そのものから作る。ここが唯一の出どころ。
    押せるのは入口の6つだけ。残りは景色として建っているだけで、spot を付けない。 */
const ENTRANCES = new Set(SPOTS.map((s) => s.id));
const BUILDINGS: Item[] = PLACES.map((sp) => ({
  n: sp.icon,
  x: sp.x,
  y: sp.y,
  s: sp.size,
  spot: ENTRANCES.has(sp.id) ? sp.id : undefined,
}));

/** 建物のまわりの飾り。場所ごとに「何をしている所か」が伝わるように置く。 */
const DRESSING: Item[] = [
  // 配信やぐら: 見物用のベンチ
  { n: "bench", x: P.streams.x - 62, y: P.streams.y + 26, s: 26 },
  { n: "bench", x: P.streams.x + 66, y: P.streams.y + 30, s: 26, flip: true },
  { n: "path-stone-circle", x: P.streams.x, y: P.streams.y + 40, s: 5 },
  // キッチン小屋: 畑と樽がわりの切り株
  { n: "fence", x: P.kitchen.x - 62, y: P.kitchen.y + 34, s: 22 },
  { n: "fence", x: P.kitchen.x - 22, y: P.kitchen.y + 40, s: 22 },
  { n: "stump", x: P.kitchen.x + 52, y: P.kitchen.y + 20, s: 20 },
  { n: "mushroom", x: P.kitchen.x + 74, y: P.kitchen.y + 34, s: 16 },
  // アプリ工房: 作業台と丸太
  { n: "stall", x: P.apps.x + 62, y: P.apps.y + 26, s: 26 },
  { n: "log", x: P.apps.x - 58, y: P.apps.y + 30, s: 15 },
  // 伝説の丘: 記念碑
  { n: "statue", x: P.legends.x - 62, y: P.legends.y + 16, s: 54 },
  { n: "statue-head", x: P.legends.x + 66, y: P.legends.y + 20, s: 40 },
  // これから: たきぎとカヌー(旅立ちの支度)
  { n: "log", x: P.next.x + 40, y: P.next.y + 18, s: 14 },
  { n: "bush", x: P.next.x - 44, y: P.next.y + 14, s: 20 },
  // たき火広場: 座る丸太
  { n: "log", x: P.friends.x - 44, y: P.friends.y + 6, s: 15 },
  { n: "log", x: P.friends.x + 46, y: P.friends.y + 10, s: 15, flip: true },
  { n: "bench", x: P.friends.x + 4, y: P.friends.y + 42, s: 26 },
  // 企画掲示板: 立ち読み用の灯り
  { n: "lantern", x: P.board.x + 74, y: P.board.y + 6, s: 52 },
  { n: "bench", x: P.now.x - 56, y: P.now.y + 24, s: 26 },
  // 旅の桟橋: 舟
  { n: "canoe", x: 214, y: 916, s: 20, flip: true },
  { n: "rock-flat", x: 300, y: 906, s: 12 },
  // 池
  { n: "lily", x: POND.x - 24, y: POND.y + 4, s: 8 },
  { n: "lily", x: POND.x + 26, y: POND.y + 10, s: 7 },
  { n: "rock-small", x: POND.x + 56, y: POND.y + 16, s: 16 },
  { n: "bridge", x: 872, y: 716, s: 22 },
];

/** 木のふち飾り。浜に近い外周はヤシ、内側は広葉樹。 */
const shoreTrees: Item[] = (() => {
  const r = rng(9901);
  const out: Item[] = [];
  for (let i = 0; i < 26; i++) {
    const t = i / 26 + (r() - 0.5) * 0.012;
    const [x, y] = pointAt(ISLAND.cx, ISLAND.cy, grassR, ISLAND.squash, t, 6 + r() * 16);
    if (PLACES.some((s) => Math.hypot(s.x - x, s.y - y) < 92)) continue;
    const palm = y > ISLAND.cy - 40 && r() < 0.55;
    out.push({
      n: palm ? "tree-palm" : r() < 0.34 ? "tree-fat" : r() < 0.6 ? "tree-round" : "tree-tall",
      x,
      y,
      s: (palm ? 96 : 88) + r() * 26,
      flip: r() < 0.5,
    });
  }
  return out;
})();

/** 島の中の散らし。道と建物を避けて置く。 */
function scatter(
  count: number,
  seed: number,
  radii: number[],
  margin: number,
  pick: (r: () => number) => Item | null,
  spread = 46,
) {
  const r = rng(seed);
  const out: Item[] = [];
  let guard = 0;
  while (out.length < count && guard++ < count * 80) {
    const x = ISLAND.cx + (r() - 0.5) * 900;
    const y = ISLAND.cy + (r() - 0.5) * 840;
    if (!insideRadii(ISLAND.cx, ISLAND.cy, radii, x, y, ISLAND.squash, margin)) continue;
    if (PLACES.some((s) => Math.hypot(s.x - x, s.y - y) < 78)) continue;
    if (Math.hypot(POND.x - x, (POND.y - y) * 1.8) < 84) continue;
    if (out.some((p) => Math.hypot(p.x - x, p.y - y) < spread)) continue;
    const it = pick(r);
    if (!it) continue;
    out.push({ ...it, x, y });
  }
  return out;
}

const innerTrees = scatter(
  15,
  20260904,
  inset(grassR, 60),
  10,
  (r) => ({
    n: r() < 0.3 ? "tree-round" : r() < 0.55 ? "tree-fat" : r() < 0.78 ? "tree-tall" : "tree-thin",
    x: 0,
    y: 0,
    s: 80 + r() * 24,
    flip: r() < 0.5,
  }),
  120,
);

const shrubs = scatter(
  40,
  4477,
  grassR,
  22,
  (r) => {
    const k = r();
    if (k < 0.2) return { n: "bush", x: 0, y: 0, s: 22 + r() * 8 };
    if (k < 0.34) return { n: "bush-small", x: 0, y: 0, s: 17 + r() * 6 };
    if (k < 0.44) return { n: "rock-small", x: 0, y: 0, s: 16 + r() * 8 };
    if (k < 0.5) return { n: "stump", x: 0, y: 0, s: 17 };
    if (k < 0.62) return { n: "grass-large", x: 0, y: 0, s: 13 + r() * 4 };
    if (k < 0.74) return { n: "grass", x: 0, y: 0, s: 12 + r() * 4 };
    if (k < 0.83) return { n: "flower-red", x: 0, y: 0, s: 15 };
    if (k < 0.92) return { n: "flower-yellow", x: 0, y: 0, s: 15 };
    return { n: "flower-purple", x: 0, y: 0, s: 15 };
  },
  52,
);

/** 高台の上は針葉樹と岩。 */
const plateauItems: Item[] = (() => {
  const r = rng(313);
  const out: Item[] = [];
  const top = { ...PLATEAU, cy: PLATEAU.cy - PLATEAU.drop };
  for (let i = 0; i < 14; i++) {
    const t = r();
    const [x, y] = pointAt(top.cx, top.cy, top.radii, top.squash, t, 16 + r() * 46);
    if (Math.hypot(P.legends.x - x, P.legends.y - y) < 96) continue;
    if (out.some((p) => Math.hypot(p.x - x, p.y - y) < 46)) continue;
    const k = r();
    out.push({
      n: k < 0.5 ? "tree-pine" : k < 0.78 ? "tree-pine-tall" : "rock-tall",
      x,
      y,
      s: k < 0.78 ? 78 + r() * 26 : 34,
      flip: r() < 0.5,
    });
  }
  return out;
})();

/** 浜辺の岩。波打ち際に置くと島の縁が締まる。 */
const shoreRocks: Item[] = (() => {
  const r = rng(555);
  const out: Item[] = [];
  for (let i = 0; i < 14; i++) {
    const t = r();
    const [x, y] = pointAt(ISLAND.cx, ISLAND.cy, sandR, ISLAND.squash, t, -6 + r() * 22);
    if (out.some((p) => Math.hypot(p.x - x, p.y - y) < 60)) continue;
    const k = r();
    out.push({ n: k < 0.5 ? "rock-flat" : k < 0.8 ? "rock-small" : "rock-large", x, y, s: 14 + r() * 16 });
  }
  return out;
})();

/* ------------------------------------------------------------------ */
/* 石畳の道                                                            */
/* ------------------------------------------------------------------ */

/** ふたつの場所をつなぐ道。飛び石を等間隔に並べる。 */
function pathBetween(a: Pt, b: Pt, bend: number, seed: number): Item[] {
  const r = rng(seed);
  const mx = (a[0] + b[0]) / 2;
  const my = (a[1] + b[1]) / 2;
  const nx = -(b[1] - a[1]);
  const ny = b[0] - a[0];
  const len = Math.hypot(nx, ny) || 1;
  const c: Pt = [mx + (nx / len) * bend, my + (ny / len) * bend];
  const steps = Math.max(4, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 42));
  const out: Item[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    out.push({
      n: "path-stone",
      x: u * u * a[0] + 2 * u * t * c[0] + t * t * b[0] + (r() - 0.5) * 6,
      y: u * u * a[1] + 2 * u * t * c[1] + t * t * b[1] + (r() - 0.5) * 4,
      s: 3.4,
      flip: r() < 0.5,
    });
  }
  return out;
}

const foot = (id: SpotId, dy = 16): Pt => [P[id].x, P[id].y + dy];

const PATHS: Item[] = [
  ...pathBetween(foot("streams", 34), foot("kitchen"), 30, 2),
  ...pathBetween(foot("streams", 34), foot("apps"), -32, 3),
  ...pathBetween(foot("streams", 34), foot("board", 8), 24, 4),
  ...pathBetween(foot("streams", 34), foot("now", 10), -16, 5),
  ...pathBetween(foot("now", 10), foot("next", 10), 20, 6),
  ...pathBetween(foot("kitchen"), foot("map", 6), -18, 7),
  ...pathBetween(foot("apps"), foot("friends", 10), 24, 8),
  ...pathBetween(foot("friends", 10), foot("legends", 24), -26, 9),
];

/* ------------------------------------------------------------------ */
/* 地面の飾り                                                          */
/* ------------------------------------------------------------------ */

/**
 * 草地に散らす小物。花・雑草・小石。
 *
 * 建物のあいだが更地に見えるのがいちばん安っぽい（`docs/ac-reference.md` 4章）。
 * 石畳の上と、建物・入口のまわり 92px には置かない。押す場所を飾りで隠さないため。
 */
const groundDetail: Item[] = (() => {
  const r = rng(770311);
  const out: Item[] = [];
  let guard = 0;
  while (out.length < 84 && guard++ < 16000) {
    const x = ISLAND.cx + (r() - 0.5) * 900;
    const y = ISLAND.cy + (r() - 0.5) * 840;
    if (!insideRadii(ISLAND.cx, ISLAND.cy, grassR, x, y, ISLAND.squash, 16)) continue;
    if (PLACES.some((s) => Math.hypot(s.x - x, s.y - y) < 92)) continue;
    if (Math.hypot(POND.x - x, (POND.y - y) * 1.8) < 78) continue;
    if (PATHS.some((p) => Math.hypot(p.x - x, p.y - y) < 20)) continue;
    if (out.some((p) => Math.hypot(p.x - x, p.y - y) < 21)) continue;
    if (shrubs.some((p) => Math.hypot(p.x - x, p.y - y) < 22)) continue;
    const k = r();
    const it: Item =
      k < 0.16
        ? { n: "flower-red", x, y, s: 11 + r() * 4 }
        : k < 0.32
          ? { n: "flower-yellow", x, y, s: 11 + r() * 4 }
          : k < 0.46
            ? { n: "flower-purple", x, y, s: 11 + r() * 4 }
            : k < 0.66
              ? { n: "grass", x, y, s: 9 + r() * 4 }
              : k < 0.82
                ? { n: "grass-large", x, y, s: 10 + r() * 4 }
                : k < 0.93
                  ? { n: "rock-small", x, y, s: 9 + r() * 5 }
                  : { n: "mushroom", x, y, s: 9 + r() * 3 };
    out.push({ ...it, flip: r() < 0.5, still: true });
  }
  return out;
})();

/**
 * 浜に打ち上がるもの。砂の帯だけが無地だと、岸が板に見える。
 * 濡れた砂の帯を避けて、乾いた砂の側に置く。
 */
const beachDetail: Item[] = (() => {
  const r = rng(4130);
  const out: Item[] = [];
  for (let i = 0; i < 20; i++) {
    const t = (i + r() * 0.8) / 20;
    const [x, y] = pointAt(ISLAND.cx, ISLAND.cy, sandR, ISLAND.squash, t, 17 + r() * 13);
    if (PLACES.some((s) => Math.hypot(s.x - x, s.y - y) < 92)) continue;
    if (out.some((p) => Math.hypot(p.x - x, p.y - y) < 34)) continue;
    const k = r();
    out.push({
      n: k < 0.42 ? "rock-small" : k < 0.72 ? "rock-flat" : k < 0.88 ? "grass" : "log",
      x,
      y,
      s: k < 0.72 ? 8 + r() * 6 : 9 + r() * 4,
      flip: r() < 0.5,
      still: true,
    });
  }
  return out;
})();

/**
 * 夜にともる灯り。[x, y, 半径]。
 * 島の絵に混ぜると時間帯の色かぶせに沈むので、その上の層で描く。
 */
export const LAMPS: [number, number, number][] = [
  [P.friends.x, P.friends.y - 10, 104],
  [P.board.x + 74, P.board.y - 36, 60],
  [P.now.x, P.now.y - 32, 52],
  [P.kitchen.x + 14, P.kitchen.y - 30, 70],
  [P.apps.x + 12, P.apps.y - 30, 70],
  [P.streams.x + 4, P.streams.y - 80, 72],
  [P.legends.x + 8, P.legends.y - 28, 72],
];

/**
 * 島に置いてある物。手前(y が大きい)ほど後に描く。
 * 住人やあやとと重ね順を混ぜたいので、絵ではなく配列のまま外へ出す。
 */
export const PROPS: Item[] = [
  ...shoreRocks,
  ...shoreTrees,
  ...plateauItems,
  ...innerTrees,
  ...shrubs,
  ...groundDetail,
  ...beachDetail,
  ...BUILDINGS,
  ...DRESSING,
]
  .map((p, i) => (SWAYS.test(p.n) && !p.still ? { ...p, sway: (i % 13) * 0.36 } : p))
  .sort((a, b) => a.y - b.y);

export default function IslandScene() {
  return (
    <>
      <defs>
        <linearGradient id="seaG" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--sea-mid)" />
          <stop offset="1" stopColor="var(--sea-deep)" />
        </linearGradient>
        <radialGradient id="grassG" cx="38%" cy="28%">
          <stop offset="0" stopColor="var(--grass-hi)" />
          <stop offset="1" stopColor="var(--grass)" />
        </radialGradient>
        <radialGradient id="grass2G" cx="38%" cy="24%">
          <stop offset="0" stopColor="var(--grass2-hi)" />
          <stop offset="1" stopColor="var(--grass2)" />
        </radialGradient>
        <linearGradient id="cliffG" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--cliff)" />
          <stop offset="1" stopColor="var(--cliff-lo)" />
        </linearGradient>
        {/* 草の地模様。葉を1枚ずつ置かず、タイル1枚を敷いて済ませる。 */}
        {GRASS_TILES.map((t, i) => (
          <pattern
            key={i}
            id={`grassTex${i}`}
            width={t.size}
            height={t.size}
            patternUnits="userSpaceOnUse"
            patternTransform={i === 0 ? undefined : "rotate(24)"}
          >
            <path d={t.hi} fill="var(--grass-hi)" opacity={i === 0 ? 0.52 : 0.4} />
            <path d={t.lo} fill="var(--grass-lo)" opacity={i === 0 ? 0.34 : 0.26} />
          </pattern>
        ))}
        <clipPath id="grassClip">
          <path d={grassPath} />
        </clipPath>

      </defs>

      {/* ------- 海 ------- */}
      <rect x={-500} y={-500} width={WORLD + 1000} height={WORLD + 1000} fill="url(#seaG)" />
      {/* 沖のうねり。島を囲む輪にすると、海が島に向かって寄せてくるように見える。 */}
      <g fill="none" stroke="#ffffff" strokeLinecap="round">
        {swellPaths.map((d, i) => (
          <path key={i} d={d} strokeWidth={26 - i * 5} strokeOpacity={0.055 - i * 0.012} />
        ))}
      </g>
      {/* きらめき。短い線を散らす。長さと濃さをばらけさせないと点描に見える。 */}
      <g stroke="#ffffff" strokeLinecap="round" fill="none" aria-hidden>
        {glints.map((d, i) => (
          <path key={i} d={d} strokeWidth={GLINT_STYLE[i][0]} strokeOpacity={GLINT_STYLE[i][1]} />
        ))}
      </g>
      <g fill="none" stroke="#ffffff" strokeOpacity="0.24" strokeWidth="5" strokeLinecap="round">
        {[
          [70, 210], [980, 130], [130, 1090], [1010, 1040], [30, 640],
          [1130, 700], [300, 70], [820, 1150], [560, 30], [200, 1180],
        ].map(([x, y], i) => (
          <path key={i} d={`M${x} ${y} q22 -11 44 0 t44 0`} />
        ))}
      </g>

      {/* ------- 浅瀬。沖から順に明るくしていく ------- */}
      <path d={hazePath} fill="var(--sea-mid)" opacity="0.42" />
      <path d={midPath} fill="var(--sea-shallow)" opacity="0.42" />
      <path d={shallowPath} fill="var(--sea-shallow)" />
      <path d={shelfPath} fill="var(--sea-shelf)" />
      {/* 浅瀬の底に落ちる光。1本だけ流す。
          破線を動かすと輪ぜんぶを描き直すので、増やすと起動直後にひっかかる。 */}
      <g className="foam" fill="none" stroke="#ffffff" strokeLinecap="round">
        <path d={shelfPath} strokeWidth="6" strokeOpacity="0.24" strokeDasharray="32 104" />
      </g>

      {/* ------- 島 ------- */}
      {/* 影。feGaussianBlur は面積に比例して重くなるので、
          ずらした写しを薄く重ねてぼかしの代わりにする。 */}
      <g fill="#06364a" aria-hidden>
        {[6, 12, 19, 27].map((dy) => (
          <path key={dy} d={sandPath} transform={`translate(0 ${dy})`} opacity="0.075" />
        ))}
      </g>
      <g>
        <path d={sandPath} fill="var(--sand)" />
        {/* 濡れた砂は波打ち際の側。内側に敷くと逆になる。 */}
        <path d={wetRing} fill="var(--sand-wet)" fillRule="evenodd" />
        <path d={wetEdgeRing} fill="var(--sand-edge)" fillRule="evenodd" opacity="0.55" />
        {/* 草の落とす影。砂が草に接するところを締める。 */}
        <path d={grassPath} fill="none" stroke="var(--sand-edge)" strokeOpacity="0.45" strokeWidth="4.5" />
        <path d={grassPath} fill="url(#grassG)" />
      </g>

      {/* ------- 泡。島の上に重ねて、砂の縁にかぶせる ------- */}
      <g fill="var(--foam)" aria-hidden>
        <path d={foamBand} fillRule="evenodd" opacity="0.95" />
        <path d={foamDots[0]} opacity="0.72" />
        <path d={foamDots[1]} opacity="0.42" />
      </g>
      <g fill="none" stroke="var(--foam)" strokeLinecap="round" aria-hidden>
        {foamLaceOut.map((d, i) => (
          <path key={`fo${i}`} d={d} strokeWidth={LACE_STYLE[i][0]} strokeOpacity={LACE_STYLE[i][1]} />
        ))}
        {foamLaceIn.map((d, i) => (
          <path key={`fi${i}`} d={d} strokeWidth={LACE_STYLE[i][0] * 0.75} strokeOpacity={LACE_STYLE[i][1]} />
        ))}
      </g>

      {/* ------- 草地 ------- */}
      <path d={grassPath} fill="none" stroke="#ffffff" strokeOpacity="0.26" strokeWidth="5" strokeDasharray="240 460" strokeDashoffset="-40" />
      <g clipPath="url(#grassClip)">
        <path d={blob(CX, CY + 15, grassR, SQ)} fill="none" stroke="#2f6b34" strokeOpacity="0.14" strokeWidth="18" />
        <ellipse cx={430} cy={752} rx={158} ry={74} fill="var(--grass-hi)" opacity="0.3" />
        <ellipse cx={824} cy={846} rx={136} ry={60} fill="var(--grass-lo)" opacity="0.16" />
        <ellipse cx={620} cy={556} rx={120} ry={52} fill="var(--grass-hi)" opacity="0.22" />
        {/* 草の地模様。更地の面をなくす。タイルなので要素は2つで済む。 */}
        <rect x={CX - 480} y={CY - 460} width={960} height={920} fill="url(#grassTex0)" />
        <rect x={CX - 480} y={CY - 460} width={960} height={920} fill="url(#grassTex1)" />
      </g>

      {/* ------- 高台 ------- */}
      <g>
        <path d={blob(PLATEAU.cx, PLATEAU.cy + 12, PLATEAU.radii, PLATEAU.squash)} fill="#1f5a2e" opacity="0.15" />
        <path d={cliff.band} fill="url(#cliffG)" />
        <g opacity="0.28" stroke="var(--cliff-line)" strokeWidth="2.6" strokeLinecap="round">
          {cliff.lines.map(([lx, ly], i) =>
            i % 2 === 0 ? <line key={i} x1={lx} y1={ly + 5} x2={lx + 2} y2={ly + PLATEAU.drop - 3} /> : null,
          )}
        </g>
        <path d={plateauTopPath} fill="url(#grass2G)" />
        <path d={plateauTopPath} fill="none" stroke="#ffffff" strokeOpacity="0.4" strokeWidth="4" strokeDasharray="130 300" />
        <path d={plateauTopPath} fill="none" stroke="var(--grass-lo)" strokeOpacity="0.5" strokeWidth="2.5" />
      </g>

      {/* ------- 川と池 ------- */}
      <g>
        <path d={RIVER} fill="none" stroke="var(--sea-shallow)" strokeWidth="28" strokeLinecap="round" />
        <path d={RIVER} fill="none" stroke="var(--sea-shelf)" strokeWidth="17" strokeLinecap="round" />
        <path d={RIVER} fill="none" stroke="#e8fbff" strokeWidth="6" strokeLinecap="round" opacity="0.6" />
        <ellipse cx={POND.x} cy={POND.y} rx={POND.rx} ry={POND.ry} fill="var(--sea-shallow)" />
        <ellipse cx={POND.x} cy={POND.y - 3} rx={POND.rx - 13} ry={POND.ry - 10} fill="var(--sea-shelf)" />
        <ellipse cx={POND.x - 14} cy={POND.y - 8} rx={20} ry={7} fill="#e8fbff" opacity="0.55" />
      </g>

      {/* ------- 石畳 ------- */}
      <g opacity="0.92">
        {PATHS.map((p, i) => (
          <Sprite key={`p${i}`} name={p.n} x={p.x} y={p.y} size={p.s} flip={p.flip} />
        ))}
      </g>

      {/* ------- 沖を行く舟と、空のカモメ ------- */}
      {/* CSS の animation は transform 属性を上書きしてしまうので、
          置き場所は外側の g で決めて、動きは内側の g に持たせる。 */}
      <g transform="translate(-260 208)" aria-hidden>
        <g className="boat">
          <ellipse cx={0} cy={7} rx={26} ry={6} fill="#0b3f52" opacity={0.16} />
          <path d="M-26 0 q26 16 52 0 q-7 11 -26 11 q-19 0 -26 -11Z" fill="#f0798d" />
          <path d="M-26 0 q26 16 52 0 q-4 4 -8 6 q-18 5 -36 0 q-4 -2 -8 -6Z" fill="#fff" opacity={0.22} />
          <rect x={-2} y={-26} width={4} height={26} rx={2} fill="#c98d55" />
          <path d="M2 -25 L24 -5 L2 -5 Z" fill="#fffdf6" />
        </g>
      </g>
      {[
        [70, 380, 1, 0],
        [1120, 470, 0.82, 13],
        [40, 900, 0.7, 24],
      ].map(([gx, gy, k, delay], i) => (
        <g key={i} transform={`translate(${gx} ${gy}) scale(${k})`} aria-hidden>
          <g className="skygull" style={{ animationDelay: `${delay}s` }}>
            <path d="M-17 0 q9 -10 17 0 q8 -10 17 0 q-9 -4 -17 3 q-8 -7 -17 -3Z" fill="#fffdf6" opacity={0.85} />
          </g>
        </g>
      ))}

      {/* ------- ちょうちょ ------- */}
      <g className="bugs" aria-hidden>
        {[
          [420, 690, 0, "#ffd35e"],
          [700, 620, 3.1, "#ffffff"],
          [560, 830, 6.2, "#c79bff"],
          [860, 760, 9.4, "#ff9fb6"],
        ].map(([bx, by, delay, color], i) => (
          <g key={i} className="bug" style={{ animationDelay: `${delay}s` }} transform={`translate(${bx} ${by})`}>
            <g className="bug-wing">
              <ellipse cx={-6} cy={-2} rx={6} ry={8} fill={color as string} />
              <ellipse cx={6} cy={-2} rx={6} ry={8} fill={color as string} />
              <ellipse cx={-6} cy={-5} rx={3} ry={3.4} fill="#ffffff" opacity={0.45} />
              <ellipse cx={6} cy={-5} rx={3} ry={3.4} fill="#ffffff" opacity={0.45} />
              <ellipse cx={0} cy={0} rx={1.8} ry={7} fill="#5b4630" />
            </g>
          </g>
        ))}
      </g>

      {/* ------- 桟橋 ------- */}
      <g>
        <ellipse cx={236} cy={882} rx={68} ry={17} fill="#134a2c" opacity={0.15} />
        <g transform="rotate(24 250 866)">
          <rect x={168} y={852} width={172} height={30} rx={7} fill="#d0a068" />
          <rect x={168} y={852} width={172} height={8} rx={4} fill="#e6bb87" />
          {Array.from({ length: 7 }, (_, i) => (
            <rect key={i} x={176 + i * 24} y={852} width={4} height={30} fill="#a9713d" opacity={0.45} />
          ))}
        </g>
      </g>
    </>
  );
}
