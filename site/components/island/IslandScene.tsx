import { ISLAND, GRASS_INSET, PLATEAU, SPOTS, WORLD, type SpotId } from "./layout";
import { blob, inset, insideRadii, pointAt, radiiToPoints, rng, type Pt } from "./geometry";
import { Sprite } from "./Sprite";

/* ------------------------------------------------------------------ */
/* 地形                                                                */
/* ------------------------------------------------------------------ */

const sandR = ISLAND.radii;
const grassR = inset(sandR, GRASS_INSET);
const wetR = inset(sandR, 13);
const shelfR = inset(sandR, -42);
const shelf2R = inset(sandR, -92);

const sandPath = blob(ISLAND.cx, ISLAND.cy, sandR, ISLAND.squash);
const wetPath = blob(ISLAND.cx, ISLAND.cy, wetR, ISLAND.squash);
const grassPath = blob(ISLAND.cx, ISLAND.cy, grassR, ISLAND.squash);
const shelfPath = blob(ISLAND.cx, ISLAND.cy, shelfR, ISLAND.squash);
const shelf2Path = blob(ISLAND.cx, ISLAND.cy, shelf2R, ISLAND.squash);
const foamPath = blob(ISLAND.cx, ISLAND.cy, inset(sandR, -16), ISLAND.squash);

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
};

/** 揺れるもの(草木)かどうか。建物や岩は揺れない。 */
const SWAYS = /^(tree|bush|grass|flower|mushroom|lily)/;

const P = Object.fromEntries(SPOTS.map((s) => [s.id, s])) as Record<SpotId, (typeof SPOTS)[number]>;

/** 建物。ここが島の骨格になるので、手で置く。 */
const BUILDINGS: Item[] = [
  { n: "tower-studio", x: P.streams.x, y: P.streams.y, s: 128 },
  { n: "hut-kitchen", x: P.kitchen.x, y: P.kitchen.y, s: 78 },
  { n: "hut-workshop", x: P.apps.x, y: P.apps.y, s: 78 },
  { n: "hall-museum", x: P.legends.x, y: P.legends.y, s: 74 },
  { n: "tent", x: P.next.x, y: P.next.y, s: 56 },
  { n: "signboard", x: P.board.x, y: P.board.y, s: 62 },
  { n: "signpost", x: P.map.x, y: P.map.y, s: 54 },
  { n: "mailbox", x: P.now.x, y: P.now.y, s: 44 },
  { n: "campfire", x: P.friends.x, y: P.friends.y, s: 24 },
];

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
    if (SPOTS.some((s) => Math.hypot(s.x - x, s.y - y) < 92)) continue;
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
    if (SPOTS.some((s) => Math.hypot(s.x - x, s.y - y) < 78)) continue;
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
  ...BUILDINGS,
  ...DRESSING,
]
  .map((p, i) => (SWAYS.test(p.n) ? { ...p, sway: (i % 13) * 0.36 } : p))
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
        <radialGradient id="sandG" cx="40%" cy="32%">
          <stop offset="0" stopColor="var(--sand)" />
          <stop offset="1" stopColor="var(--sand-edge)" />
        </radialGradient>
        <linearGradient id="cliffG" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--cliff)" />
          <stop offset="1" stopColor="var(--cliff-lo)" />
        </linearGradient>
        <filter id="islandShadow" x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow dx="0" dy="18" stdDeviation="20" floodColor="#06364a" floodOpacity="0.32" />
        </filter>
        <clipPath id="grassClip">
          <path d={grassPath} />
        </clipPath>

      </defs>

      {/* ------- 海 ------- */}
      <rect x={-500} y={-500} width={WORLD + 1000} height={WORLD + 1000} fill="url(#seaG)" />
      <g opacity="0.07" fill="#ffffff">
        {Array.from({ length: 10 }, (_, i) => (
          <rect key={i} x={-500} y={-300 + i * 190} width={WORLD + 1000} height={24} rx={12} />
        ))}
      </g>
      <g fill="none" stroke="#ffffff" strokeOpacity="0.28" strokeWidth="5" strokeLinecap="round">
        {[
          [70, 210], [980, 130], [130, 1090], [1010, 1040], [30, 640],
          [1130, 700], [300, 70], [820, 1150], [560, 30], [200, 1180],
        ].map(([x, y], i) => (
          <path key={i} d={`M${x} ${y} q22 -11 44 0 t44 0`} />
        ))}
      </g>

      {/* ------- 浅瀬 ------- */}
      <path d={shelf2Path} fill="var(--sea-shallow)" opacity="0.5" />
      <path d={shelfPath} fill="var(--sea-shelf)" opacity="0.85" />
      <g className="foam">
        <path d={shelfPath} fill="none" stroke="var(--foam)" strokeWidth="9" strokeOpacity="0.7" strokeDasharray="28 22" strokeLinecap="round" />
        <path d={foamPath} fill="none" stroke="var(--foam)" strokeWidth="6" strokeOpacity="0.55" strokeDasharray="14 26" strokeLinecap="round" />
      </g>

      {/* ------- 島 ------- */}
      <g filter="url(#islandShadow)">
        <path d={sandPath} fill="url(#sandG)" />
        <path d={wetPath} fill="var(--sand-wet)" opacity="0.45" />
        <path d={grassPath} fill="url(#grassG)" />
      </g>
      <path d={grassPath} fill="none" stroke="#ffffff" strokeOpacity="0.26" strokeWidth="5" strokeDasharray="240 460" strokeDashoffset="-40" />
      <g clipPath="url(#grassClip)">
        <path d={blob(ISLAND.cx, ISLAND.cy + 15, grassR, ISLAND.squash)} fill="none" stroke="#2f6b34" strokeOpacity="0.14" strokeWidth="18" />
        <ellipse cx={430} cy={752} rx={158} ry={74} fill="var(--grass-hi)" opacity="0.3" />
        <ellipse cx={824} cy={846} rx={136} ry={60} fill="var(--grass-lo)" opacity="0.16" />
        <ellipse cx={620} cy={556} rx={120} ry={52} fill="var(--grass-hi)" opacity="0.22" />
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
