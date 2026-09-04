import { Fragment } from "react";
import {
  ISLAND,
  GRASS_INSET,
  PLATEAU,
  SPOTS,
  WORLD,
} from "./layout";
import { alongCubic, blob, inset, insideRadii, radiiToPoints, rng } from "./geometry";

/* ------------------------------------------------------------------ */
/* パーツ                                                              */
/* ------------------------------------------------------------------ */

/** 接地影。すべての立体物の足元に敷いて、島に「乗っている」感を出す。 */
function Contact({ x, y, rx, ry = rx * 0.38, o = 0.22 }: { x: number; y: number; rx: number; ry?: number; o?: number }) {
  return <ellipse cx={x} cy={y} rx={rx} ry={ry} fill="#134a2c" opacity={o} />;
}

function RoundTree({ x, y, s = 1, tone = 0 }: { x: number; y: number; s?: number; tone?: number }) {
  const leaf = ["var(--leaf-a)", "var(--leaf-b)", "var(--leaf-c)"][tone % 3];
  return (
    <g>
      <Contact x={x} y={y} rx={20 * s} />
      <rect x={x - 4 * s} y={y - 20 * s} width={8 * s} height={20 * s} rx={4 * s} fill="var(--trunk)" />
      <circle cx={x - 11 * s} cy={y - 30 * s} r={15 * s} fill={leaf} />
      <circle cx={x + 11 * s} cy={y - 28 * s} r={14 * s} fill={leaf} />
      <circle cx={x} cy={y - 42 * s} r={19 * s} fill={leaf} />
      <circle cx={x - 6 * s} cy={y - 48 * s} r={7 * s} fill="#ffffff" opacity={0.26} />
      <path
        d={`M${x + 8 * s},${y - 18 * s} a${16 * s},${16 * s} 0 0 0 ${11 * s},${-14 * s}`}
        fill="none"
        stroke="#0d3f22"
        strokeOpacity={0.14}
        strokeWidth={5 * s}
        strokeLinecap="round"
      />
    </g>
  );
}

function PineTree({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g>
      <Contact x={x} y={y} rx={16 * s} />
      <rect x={x - 3.5 * s} y={y - 16 * s} width={7 * s} height={16 * s} rx={3 * s} fill="var(--trunk)" />
      {[0, 1, 2].map((i) => {
        const w = (22 - i * 5) * s;
        const yy = y - (16 + i * 15) * s;
        return (
          <Fragment key={i}>
            <path d={`M${x - w},${yy} Q${x},${yy - 6 * s} ${x + w},${yy} L${x},${yy - 24 * s} Z`} fill="var(--leaf-c)" />
            <path d={`M${x - w},${yy} L${x},${yy - 24 * s} L${x},${yy} Z`} fill="var(--leaf-a)" opacity={0.85} />
          </Fragment>
        );
      })}
    </g>
  );
}

function PalmTree({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g>
      <Contact x={x} y={y} rx={18 * s} />
      <path
        d={`M${x},${y} C${x + 3 * s},${y - 20 * s} ${x - 6 * s},${y - 36 * s} ${x + 4 * s},${y - 52 * s}`}
        fill="none"
        stroke="#a9784c"
        strokeWidth={8 * s}
        strokeLinecap="round"
      />
      {[-1, -0.5, 0, 0.5, 1].map((k, i) => (
        <path
          key={i}
          d={`M${x + 4 * s},${y - 52 * s} q${k * 30 * s},${-16 * s - Math.abs(k) * 4 * s} ${k * 44 * s},${4 * s - Math.abs(k) * 10 * s}`}
          fill="none"
          stroke={i % 2 ? "var(--leaf-b)" : "var(--leaf-a)"}
          strokeWidth={9 * s}
          strokeLinecap="round"
        />
      ))}
      <circle cx={x + 9 * s} cy={y - 47 * s} r={4 * s} fill="#c9722f" />
    </g>
  );
}

function Bush({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g>
      <Contact x={x} y={y} rx={14 * s} o={0.16} />
      <circle cx={x - 8 * s} cy={y - 7 * s} r={9 * s} fill="var(--leaf-b)" />
      <circle cx={x + 8 * s} cy={y - 6 * s} r={8 * s} fill="var(--leaf-a)" />
      <circle cx={x} cy={y - 13 * s} r={11 * s} fill="var(--leaf-b)" />
      <circle cx={x - 3 * s} cy={y - 17 * s} r={4 * s} fill="#fff" opacity={0.24} />
    </g>
  );
}

function Rock({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g>
      <Contact x={x} y={y} rx={13 * s} o={0.18} />
      <path
        d={`M${x - 14 * s},${y} L${x - 9 * s},${y - 13 * s} L${x + 2 * s},${y - 17 * s} L${x + 13 * s},${y - 8 * s} L${x + 11 * s},${y} Z`}
        fill="#a9a094"
      />
      <path d={`M${x - 9 * s},${y - 13 * s} L${x + 2 * s},${y - 17 * s} L${x - 1 * s},${y - 6 * s} Z`} fill="#c6bdb0" />
    </g>
  );
}

function Flowers({ x, y, c, seed }: { x: number; y: number; c: string; seed: number }) {
  const r = rng(seed);
  return (
    <g>
      {Array.from({ length: 5 }, (_, i) => {
        const fx = x + (r() - 0.5) * 34;
        const fy = y + (r() - 0.5) * 18;
        return (
          <g key={i}>
            <circle cx={fx} cy={fy} r={4.2} fill={c} />
            <circle cx={fx} cy={fy} r={1.6} fill="#fffbe8" />
          </g>
        );
      })}
    </g>
  );
}

/** 草のふさ。地面がのっぺりするのを防ぐ。 */
function Tuft({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <path
      d={`M${x - 7 * s},${y} q${3 * s},${-9 * s} ${5 * s},${-11 * s} q${1 * s},${5 * s} ${1 * s},${11 * s}
          M${x},${y} q${1 * s},${-11 * s} ${2 * s},${-14 * s} q${1 * s},${6 * s} ${1 * s},${14 * s}
          M${x + 7 * s},${y} q${-1 * s},${-8 * s} ${1 * s},${-10 * s} q${2 * s},${4 * s} ${2 * s},${10 * s}`}
      fill="none"
      stroke="var(--grass-lo)"
      strokeWidth={2.6 * s}
      strokeLinecap="round"
      opacity={0.72}
    />
  );
}

/* ------------------------------------------------------------------ */
/* 建物                                                                */
/* ------------------------------------------------------------------ */

type HouseProps = {
  x: number;
  y: number;
  w?: number;
  h?: number;
  roof: string;
  chimney?: boolean;
  windows?: number;
};

function House({ x, y, w = 74, h = 44, roof, chimney = false, windows = 1 }: HouseProps) {
  const rh = w * 0.52;
  const left = x - w / 2;
  const top = y - h;
  return (
    <g>
      <Contact x={x} y={y + 2} rx={w * 0.62} ry={w * 0.2} o={0.24} />
      {/* 壁 */}
      <rect x={left} y={top} width={w} height={h} rx={7} fill="var(--wall)" />
      <rect x={left} y={top} width={w} height={h} rx={7} fill="url(#wallShade)" />
      {/* ドア */}
      <rect x={x - 10} y={y - 24} width={20} height={24} rx={5} fill="var(--door)" />
      <circle cx={x + 4} cy={y - 12} r={2} fill="#ffe6a3" />
      {/* 窓 */}
      {Array.from({ length: windows }, (_, i) => (
        <g key={i}>
          <rect x={left + 9 + i * 26} y={top + 10} width={18} height={15} rx={4} fill="var(--window)" />
          <rect x={left + 9 + i * 26} y={top + 10} width={18} height={7} rx={4} fill="#fff" opacity={0.5} />
        </g>
      ))}
      {chimney && (
        <>
          <rect x={x + w * 0.22} y={top - rh * 0.9} width={13} height={26} rx={4} fill="#b9793f" />
          <rect x={x + w * 0.22} y={top - rh * 0.9} width={13} height={7} rx={3} fill="#d7935a" />
        </>
      )}
      {/* 屋根 */}
      <path d={`M${left - 9},${top + 3} L${x},${top - rh} L${x + w / 2 + 9},${top + 3} Z`} fill={roof} />
      <path d={`M${left - 9},${top + 3} L${x},${top - rh} L${x},${top + 3} Z`} fill="#fff" opacity={0.18} />
      <path
        d={`M${left - 9},${top + 3} L${x},${top - rh} L${x + w / 2 + 9},${top + 3}`}
        fill="none"
        stroke="#00000022"
        strokeWidth={2}
      />
      <rect x={left - 9} y={top + 1} width={w + 18} height={6} rx={3} fill={roof} />
      <rect x={left - 9} y={top + 1} width={w + 18} height={3} rx={1.5} fill="#fff" opacity={0.28} />
    </g>
  );
}

/* ------------------------------------------------------------------ */
/* 島本体                                                              */
/* ------------------------------------------------------------------ */

const sandR = ISLAND.radii;
const grassR = inset(sandR, GRASS_INSET);
const wetR = inset(sandR, 12);
const shelfR = inset(sandR, -40);
const shelf2R = inset(sandR, -84);

const sandPath = blob(ISLAND.cx, ISLAND.cy, sandR, ISLAND.squash);
const wetPath = blob(ISLAND.cx, ISLAND.cy, wetR, ISLAND.squash);
const grassPath = blob(ISLAND.cx, ISLAND.cy, grassR, ISLAND.squash);
const shelfPath = blob(ISLAND.cx, ISLAND.cy, shelfR, ISLAND.squash);
const shelf2Path = blob(ISLAND.cx, ISLAND.cy, shelf2R, ISLAND.squash);

const plateauPath = blob(PLATEAU.cx, PLATEAU.cy, PLATEAU.radii, PLATEAU.squash);
const plateauTopPath = blob(PLATEAU.cx, PLATEAU.cy - PLATEAU.drop, PLATEAU.radii, PLATEAU.squash);

/** 崖の面。高台の「手前側の弧」だけを帯にして、そこに岩肌を描く。 */
const cliff = (() => {
  const lower = radiiToPoints(PLATEAU.cx, PLATEAU.cy, PLATEAU.radii, PLATEAU.squash);
  const upper = radiiToPoints(PLATEAU.cx, PLATEAU.cy - PLATEAU.drop, PLATEAU.radii, PLATEAU.squash);
  const n = lower.length;
  // 時計回りに並んでいるので、手前側(下半分)は連続した index の並びになる
  const seq: number[] = [];
  for (let i = 0; i < n; i++) {
    const k = (i + Math.floor(n / 4)) % n; // 右→下→左 の順に見る
    if (upper[k][1] >= PLATEAU.cy - PLATEAU.drop - 2) seq.push(k);
  }
  if (seq.length < 2) return { band: "", lines: [] as [number, number][] };
  let d = `M${upper[seq[0]][0].toFixed(1)},${upper[seq[0]][1].toFixed(1)}`;
  for (const i of seq.slice(1)) d += `L${upper[i][0].toFixed(1)},${upper[i][1].toFixed(1)}`;
  for (let k = seq.length - 1; k >= 0; k--) d += `L${lower[seq[k]][0].toFixed(1)},${lower[seq[k]][1].toFixed(1)}`;
  const lines = seq.map((i) => [upper[i][0], upper[i][1]] as [number, number]);
  return { band: d + "Z", lines };
})();

/** 散らし配置 */
function scatter(count: number, seed: number, radii: number[], margin: number, avoidSpots = 62) {
  const r = rng(seed);
  const out: { x: number; y: number; k: number }[] = [];
  let guard = 0;
  while (out.length < count && guard++ < count * 60) {
    const x = ISLAND.cx + (r() - 0.5) * 940;
    const y = ISLAND.cy + (r() - 0.5) * 860;
    if (!insideRadii(ISLAND.cx, ISLAND.cy, radii, x, y, ISLAND.squash, margin)) continue;
    if (SPOTS.some((s) => Math.hypot(s.x - x, s.y - y) < avoidSpots)) continue;
    if (out.some((p) => Math.hypot(p.x - x, p.y - y) < 34)) continue;
    out.push({ x, y, k: Math.floor(r() * 100) });
  }
  return out.sort((a, b) => a.y - b.y);
}

const greens = scatter(30, 20260904, grassR, 16);
const smalls = scatter(46, 777, grassR, 26, 40);

/** 石畳の道 */
function StonePath({ from, to, bend = 0, seed = 1 }: { from: [number, number]; to: [number, number]; bend?: number; seed?: number }) {
  const mx = (from[0] + to[0]) / 2;
  const my = (from[1] + to[1]) / 2;
  const nx = -(to[1] - from[1]);
  const ny = to[0] - from[0];
  const len = Math.hypot(nx, ny) || 1;
  const c: [number, number] = [mx + (nx / len) * bend, my + (ny / len) * bend];
  const pts = alongCubic(from, c, c, to, Math.max(6, Math.round(Math.hypot(to[0] - from[0], to[1] - from[1]) / 26)));
  const r = rng(seed);
  return (
    <g>
      {pts.map((p, i) => (
        <ellipse
          key={i}
          cx={p[0] + (r() - 0.5) * 5}
          cy={p[1] + (r() - 0.5) * 3}
          rx={11 + r() * 3}
          ry={7 + r() * 2}
          fill="var(--sand)"
          opacity={0.9}
        />
      ))}
    </g>
  );
}

const P = Object.fromEntries(SPOTS.map((s) => [s.id, s])) as Record<string, (typeof SPOTS)[number]>;
/** 描いた時のアンカーを、layout.ts の座標へ寄せる */
const at = (id: string, ax: number, ay: number) => `translate(${(P[id].x - ax).toFixed(1)},${(P[id].y - ay).toFixed(1)})`;

export default function IslandScene() {
  return (
    <>
      <defs>
        <linearGradient id="seaG" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--sea-mid)" />
          <stop offset="1" stopColor="var(--sea-deep)" />
        </linearGradient>
        <radialGradient id="grassG" cx="38%" cy="30%">
          <stop offset="0" stopColor="var(--grass-hi)" />
          <stop offset="1" stopColor="var(--grass)" />
        </radialGradient>
        <radialGradient id="grass2G" cx="38%" cy="26%">
          <stop offset="0" stopColor="var(--grass2-hi)" />
          <stop offset="1" stopColor="var(--grass2)" />
        </radialGradient>
        <radialGradient id="sandG" cx="40%" cy="32%">
          <stop offset="0" stopColor="var(--sand)" />
          <stop offset="1" stopColor="var(--sand-edge)" />
        </radialGradient>
        <linearGradient id="wallShade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0.35" />
          <stop offset="0.55" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#8a6a42" stopOpacity="0.16" />
        </linearGradient>
        <linearGradient id="cliffG" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--cliff)" />
          <stop offset="1" stopColor="var(--cliff-lo)" />
        </linearGradient>
        <filter id="islandShadow" x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow dx="0" dy="16" stdDeviation="18" floodColor="#06364a" floodOpacity="0.3" />
        </filter>
        <filter id="softShadow" x="-40%" y="-40%" width="180%" height="200%">
          <feDropShadow dx="0" dy="5" stdDeviation="5" floodColor="#0a3a26" floodOpacity="0.3" />
        </filter>
        <clipPath id="grassClip">
          <path d={grassPath} />
        </clipPath>
        <clipPath id="plateauClip">
          <path d={plateauTopPath} />
        </clipPath>
      </defs>

      {/* ------- 海 ------- */}
      <rect x={-400} y={-400} width={WORLD + 800} height={WORLD + 800} fill="url(#seaG)" />
      <g opacity="0.075" fill="#ffffff">
        {Array.from({ length: 9 }, (_, i) => (
          <rect key={i} x={-400} y={-200 + i * 190} width={WORLD + 800} height={26} rx={13} />
        ))}
      </g>
      {/* 遠くの波 */}
      <g fill="none" stroke="#ffffff" strokeOpacity="0.3" strokeWidth="5" strokeLinecap="round">
        {[
          [70, 210], [980, 150], [130, 1080], [1010, 1040], [40, 640], [1120, 700], [300, 90], [820, 1140],
        ].map(([x, y], i) => (
          <path key={i} d={`M${x} ${y} q22 -11 44 0 t44 0`} />
        ))}
      </g>

      {/* ------- 浅瀬 ------- */}
      <path d={shelf2Path} fill="var(--sea-shallow)" opacity="0.55" />
      <path d={shelfPath} fill="var(--sea-shelf)" opacity="0.85" />

      {/* ------- 波打ち際の泡 ------- */}
      <g className="foam">
        <path d={shelfPath} fill="none" stroke="var(--foam)" strokeWidth="9" strokeOpacity="0.75" strokeDasharray="26 20" strokeLinecap="round" />
        <path d={inset(sandR, -18) ? blob(ISLAND.cx, ISLAND.cy, inset(sandR, -18), ISLAND.squash) : ""} fill="none" stroke="var(--foam)" strokeWidth="6" strokeOpacity="0.55" strokeDasharray="14 26" strokeLinecap="round" />
      </g>

      {/* ------- 島 ------- */}
      <g filter="url(#islandShadow)">
        <path d={sandPath} fill="url(#sandG)" />
        <path d={wetPath} fill="var(--sand-wet)" opacity="0.5" />
        <path d={grassPath} fill="url(#grassG)" />
      </g>
      {/* 草地のふち: 上側にリムライト、下側に接地の陰 */}
      <path d={grassPath} fill="none" stroke="#ffffff" strokeOpacity="0.3" strokeWidth="5" strokeDasharray="240 460" strokeDashoffset="-40" />
      <g clipPath="url(#grassClip)">
        <path d={blob(ISLAND.cx, ISLAND.cy + 16, grassR, ISLAND.squash)} fill="none" stroke="#2f6b34" strokeOpacity="0.16" strokeWidth="18" />
        {/* 芝の色ムラ */}
        <ellipse cx={430} cy={760} rx={150} ry={70} fill="var(--grass-hi)" opacity="0.35" />
        <ellipse cx={820} cy={840} rx={130} ry={58} fill="var(--grass-lo)" opacity="0.18" />
      </g>

      {/* ------- 高台 ------- */}
      <g>
        {/* 高台が地面に落とす影 */}
        <path d={blob(PLATEAU.cx, PLATEAU.cy + 12, PLATEAU.radii, PLATEAU.squash)} fill="#1f5a2e" opacity="0.16" />
        <path d={cliff.band} fill="url(#cliffG)" />
        <g opacity="0.3" stroke="var(--cliff-line)" strokeWidth="2.6" strokeLinecap="round">
          {cliff.lines.map(([lx, ly], i) =>
            i % 2 === 0 ? <line key={i} x1={lx} y1={ly + 4} x2={lx + 2} y2={ly + PLATEAU.drop - 3} /> : null,
          )}
        </g>
        <path d={plateauTopPath} fill="url(#grass2G)" />
        {/* ふちのリムライト */}
        <path d={plateauTopPath} fill="none" stroke="#ffffff" strokeOpacity="0.42" strokeWidth="4" strokeDasharray="130 300" />
        <path d={plateauTopPath} fill="none" stroke="var(--grass-lo)" strokeOpacity="0.55" strokeWidth="2.5" />
      </g>

      {/* ------- 川と滝 ------- */}
      <g>
        <path
          d="M792 470 C838 540 806 620 842 690 C872 748 906 786 946 806"
          fill="none"
          stroke="var(--sea-shallow)"
          strokeWidth="26"
          strokeLinecap="round"
        />
        <path
          d="M792 470 C838 540 806 620 842 690 C872 748 906 786 946 806"
          fill="none"
          stroke="#bff0f8"
          strokeWidth="11"
          strokeLinecap="round"
          opacity="0.75"
        />
        {/* 池 */}
        <ellipse cx={452} cy={806} rx={62} ry={30} fill="var(--sea-shallow)" />
        <ellipse cx={452} cy={801} rx={48} ry={21} fill="#bff0f8" opacity="0.8" />
        <ellipse cx={432} cy={800} rx={11} ry={6} fill="var(--leaf-b)" />
        <ellipse cx={468} cy={810} rx={9} ry={5} fill="var(--leaf-a)" />
      </g>

      {/* ------- 道 ------- */}
      <g opacity="0.95">
        <StonePath from={[P.streams.x, P.streams.y + 22]} to={[P.kitchen.x, P.kitchen.y + 12]} bend={26} seed={2} />
        <StonePath from={[P.streams.x, P.streams.y + 22]} to={[P.apps.x, P.apps.y + 12]} bend={-30} seed={3} />
        <StonePath from={[P.streams.x, P.streams.y + 22]} to={[P.board.x, P.board.y - 6]} bend={22} seed={4} />
        <StonePath from={[P.streams.x, P.streams.y + 22]} to={[P.now.x, P.now.y + 8]} bend={-14} seed={5} />
        <StonePath from={[P.now.x, P.now.y + 8]} to={[P.next.x, P.next.y + 8]} bend={18} seed={6} />
        <StonePath from={[P.kitchen.x, P.kitchen.y + 12]} to={[P.map.x + 16, P.map.y - 8]} bend={-16} seed={7} />
        <StonePath from={[P.apps.x, P.apps.y + 12]} to={[P.friends.x, P.friends.y + 6]} bend={22} seed={8} />
        <StonePath from={[P.friends.x, P.friends.y + 6]} to={[P.legends.x, P.legends.y + 22]} bend={-24} seed={9} />
      </g>

      {/* ------- 桟橋 ------- */}
      <g>
        <Contact x={236} y={880} rx={66} ry={16} o={0.18} />
        <g transform="rotate(24 250 866)">
          <rect x={168} y={852} width={168} height={30} rx={7} fill="#c98d55" />
          <rect x={168} y={852} width={168} height={8} rx={4} fill="#e0aa73" />
          {Array.from({ length: 7 }, (_, i) => (
            <rect key={i} x={176 + i * 23} y={852} width={4} height={30} fill="#a9713d" opacity={0.5} />
          ))}
        </g>
        {/* ボート */}
        <g transform="translate(178,930)">
          <ellipse cx={0} cy={10} rx={40} ry={9} fill="#0b3f52" opacity={0.2} />
          <path d="M-38 0 q38 22 76 0 q-10 14 -38 14 q-28 0 -38 -14Z" fill="#f0798d" />
          <rect x={-3} y={-34} width={6} height={34} rx={3} fill="#c98d55" />
          <path d="M3 -32 L34 -6 L3 -6 Z" fill="#fffdf6" />
        </g>
      </g>

      {/* ------- 植生（奥→手前） ------- */}
      <g>
        {greens.map((p, i) =>
          p.k % 7 === 0 ? (
            <PalmTree key={`g${i}`} x={p.x} y={p.y} s={0.9 + (p.k % 5) * 0.06} />
          ) : p.k % 3 === 0 ? (
            <PineTree key={`g${i}`} x={p.x} y={p.y} s={0.9 + (p.k % 4) * 0.08} />
          ) : (
            <RoundTree key={`g${i}`} x={p.x} y={p.y} s={0.86 + (p.k % 6) * 0.07} tone={p.k % 3} />
          ),
        )}
        {smalls.map((p, i) =>
          p.k % 5 === 0 ? (
            <Rock key={`s${i}`} x={p.x} y={p.y} s={0.7 + (p.k % 4) * 0.12} />
          ) : p.k % 3 === 0 ? (
            <Bush key={`s${i}`} x={p.x} y={p.y} s={0.8 + (p.k % 3) * 0.12} />
          ) : p.k % 2 === 0 ? (
            <Flowers key={`s${i}`} x={p.x} y={p.y} c={["#ff8fb0", "#ffd35e", "#c79bff", "#fff"][p.k % 4]} seed={p.k + i} />
          ) : (
            <Tuft key={`s${i}`} x={p.x} y={p.y} s={0.8 + (p.k % 3) * 0.15} />
          ),
        )}
      </g>

      {/* ------- 建物 ------- */}
      <g>
        {/* 伝説の丘（記念碑） */}
        <g transform={at("legends", 700, 432)}>
          <Contact x={700} y={432} rx={44} ry={15} o={0.24} />
          <path d="M676 432 L676 392 Q700 372 724 392 L724 432 Z" fill="#efe3c8" />
          <path d="M676 432 L676 392 Q688 380 700 376 L700 432 Z" fill="#fffaf0" />
          <circle cx={700} cy={398} r={15} fill="var(--gold)" />
          <path d="M694 398 l4 5 8 -9" fill="none" stroke="#8a5d1a" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
          <rect x={664} y={430} width={72} height={12} rx={5} fill="#d9cbae" />
        </g>

        {/* これから（気球） */}
        <g transform={at("next", 336, 430)}>
          <Contact x={336} y={430} rx={30} ry={11} o={0.2} />
          <g className="float-slow">
            <path d="M336 316 c31 0 50 24 50 47 c0 25 -24 43 -50 61 c-26 -18 -50 -36 -50 -61 c0 -23 19 -47 50 -47Z" fill="#ff9e7a" />
            <path d="M336 316 c14 0 23 24 23 47 c0 25 -11 43 -23 61 c-12 -18 -23 -36 -23 -61 c0 -23 9 -47 23 -47Z" fill="#ffd07a" />
            <path d="M336 316 c-6 0 -10 24 -10 47 c0 25 5 43 10 61" fill="none" stroke="#e8734f" strokeWidth="2.5" opacity="0.5" />
            <rect x={323} y={424} width={26} height={19} rx={6} fill="#c98d55" />
            <rect x={323} y={424} width={26} height={6} rx={3} fill="#dda772" />
          </g>
        </g>

        {/* いまのポスト */}
        <g transform={at("now", 470, 502)}>
          <Contact x={470} y={502} rx={20} ry={8} o={0.22} />
          <rect x={462} y={470} width={16} height={32} rx={4} fill="#8a6a42" />
          <rect x={452} y={452} width={36} height={34} rx={9} fill="#f0798d" />
          <path d="M450 456 a20 16 0 0 1 40 0 z" fill="#ff9db0" />
          <rect x={458} y={464} width={24} height={7} rx={3.5} fill="#7d2233" />
          <circle cx={470} cy={480} r={5} fill="#fffdf6" opacity="0.85" />
        </g>

        {/* 配信やぐら */}
        <g transform={at("streams", 520, 620)}>
          <Contact x={520} y={620} rx={56} ry={19} o={0.26} />
          <path d="M492 620 L500 566 L540 566 L548 620 Z" fill="#c98d55" />
          <path d="M492 620 L500 566 L520 566 L520 620 Z" fill="#dda772" />
          <rect x={494} y={588} width={52} height={7} rx={3} fill="#a9713d" />
          <path d="M486 566 L520 540 L554 566 Z" fill="var(--roof-mint)" />
          <path d="M486 566 L520 540 L520 566 Z" fill="#fff" opacity="0.2" />
          <rect x={484} y={562} width={72} height={7} rx={3.5} fill="var(--roof-mint)" />
          {/* カメラ */}
          <g transform="translate(520,576)">
            <rect x={-13} y={-10} width={22} height={16} rx={4} fill="#45372a" />
            <path d="M9 -6 L19 -12 L19 4 L9 -2 Z" fill="#45372a" />
            <circle cx={-2} cy={-2} r={4} fill="#8fd9ff" />
            <circle cx={-15} cy={-13} r={3.4} fill="#ff5a72" className="blink" />
          </g>
        </g>

        {/* キッチン小屋 */}
        <g transform={at("kitchen", 336, 700)}>
          <House x={336} y={700} w={78} h={46} roof="var(--roof-coral)" chimney windows={1} />
          <g className="smoke">
            <circle cx={356} cy={666} r={7} fill="#fff" opacity="0.55" />
            <circle cx={364} cy={648} r={9} fill="#fff" opacity="0.4" />
            <circle cx={374} cy={628} r={11} fill="#fff" opacity="0.26" />
          </g>
        </g>

        {/* アプリ工房 */}
        <g transform={at("apps", 806, 706)}>
          <House x={806} y={706} w={86} h={50} roof="var(--roof-sky)" windows={2} />
          <rect x={780} y={664} width={26} height={18} rx={3} fill="#45372a" />
          <rect x={782} y={666} width={22} height={13} rx={2} fill="#8fd9ff" />
        </g>

        {/* たき火広場 */}
        <g transform={at("friends", 880, 562)}>
          <Contact x={880} y={562} rx={46} ry={16} o={0.2} />
          <g stroke="#a9713d" strokeWidth="7" strokeLinecap="round">
            <line x1={862} y1={562} x2={898} y2={548} />
            <line x1={898} y1={562} x2={862} y2={548} />
          </g>
          <g className="flame">
            <path d="M880 544 c9 -9 6 -18 2 -24 c10 5 16 15 16 24 c0 10 -8 17 -18 17 c-10 0 -18 -7 -18 -17 c0 -6 4 -12 9 -15 c-1 6 2 12 9 15Z" fill="#ff9e3d" />
            <path d="M880 550 c5 -5 4 -10 1 -14 c6 3 9 9 9 14 c0 6 -4 10 -10 10 c-6 0 -10 -4 -10 -10 c0 -3 2 -6 5 -8 c0 4 1 6 5 8Z" fill="#ffdc5e" />
          </g>
          {/* 丸太のベンチ */}
          <rect x={824} y={572} width={40} height={11} rx={5.5} fill="#c98d55" />
          <rect x={900} y={572} width={40} height={11} rx={5.5} fill="#c98d55" />
        </g>

        {/* 企画掲示板 */}
        <g transform={at("board", 618, 864)}>
          <Contact x={618} y={864} rx={46} ry={15} o={0.24} />
          <rect x={612} y={834} width={13} height={30} rx={5} fill="#a9713d" />
          <rect x={570} y={798} width={96} height={54} rx={9} fill="#c98d55" />
          <rect x={577} y={805} width={82} height={40} rx={5} fill="#fffdf6" />
          <rect x={583} y={810} width={30} height={17} rx={3} fill="#ffd6de" />
          <rect x={619} y={810} width={34} height={17} rx={3} fill="#d7ecff" />
          <rect x={591} y={831} width={44} height={10} rx={3} fill="#ffeaa8" />
          <rect x={568} y={794} width={100} height={9} rx={4.5} fill="#a9713d" />
        </g>

        {/* 旅の桟橋の看板 */}
        <g transform={at("map", 296, 824)}>
          <Contact x={296} y={824} rx={26} ry={9} o={0.2} />
          <rect x={290} y={790} width={12} height={34} rx={5} fill="#a9713d" />
          <g transform="rotate(-6 296 780)">
            <rect x={252} y={760} width={90} height={34} rx={7} fill="#e0aa73" />
            <rect x={257} y={765} width={80} height={24} rx={4} fill="#fffdf6" />
            <path d="M266 777 h62" stroke="#c98d55" strokeWidth="3" strokeLinecap="round" strokeDasharray="5 6" />
            <circle cx={276} cy={777} r={4} fill="#f0798d" />
            <circle cx={318} cy={777} r={4} fill="#37b6d8" />
          </g>
        </g>
      </g>
    </>
  );
}
