import type { Draw } from "./bits";
import { Sh, Gl } from "./bits";
import type { Pal } from "./pal";

/** 湯気。2本だけ。3本以上入れると小さくしたとき潰れる。 */
const Steam = ({ c, x = 32, y = 6 }: { c: Pal; x?: number; y?: number }) => (
  <g
    fill="none"
    stroke={c.w}
    strokeWidth="3.4"
    strokeLinecap="round"
    opacity={c.flat ? 1 : 0.9}
  >
    <path d={`M${x - 7} ${y + 12}c-4-4 1.6-6 0-10`} />
    <path d={`M${x + 7} ${y + 12}c-4-4 1.6-6 0-10`} />
  </g>
);

/**
 * 料理まわり。
 *
 * クッキング配信の道具と材料。どれも「上に小さなハイライト」を1つ入れて、
 * 金属・陶器・野菜のつるつるした感じを出す。
 */
export const food: Record<string, Draw> = {
  pot: (c) => (
    <>
      <Sh c={c} cy={55} rx={21} ry={4.2} />
      <Steam c={c} x={32} y={2} />
      <rect x="4" y="27" width="10" height="9" rx="4.5" fill={c.gyd} />
      <rect x="50" y="27" width="10" height="9" rx="4.5" fill={c.gyd} />
      <path d="M10 26h44l-3.4 22.4A5 5 0 0 1 45.7 53H18.3a5 5 0 0 1-4.9-4.6z" fill={c.gy} />
      <path d="M32 26h22l-3.4 22.4A5 5 0 0 1 45.7 53H32z" fill={c.gyd} />
      <ellipse cx="32" cy="24" rx="26" ry="5.4" fill={c.rd} />
      <ellipse cx="32" cy="22" rx="26" ry="5.4" fill={c.rdl} />
      <rect x="27" y="14" width="10" height="6" rx="3" fill={c.rdd} />
      <Gl c={c} cx={20} cy={21} rx={7} ry={2} r={-6} o={0.5} />
      <Gl c={c} cx={17} cy={36} rx={2.4} ry={7} r={4} o={0.35} />
    </>
  ),

  /**
   * フライパン。黒い円のままだと小さくすると点になる。
   * 目玉焼きを1つ入れると、黒の中に明るい色ができて形が残る。
   */
  pan: (c) => (
    <>
      <Sh c={c} cy={50} rx={19} ry={4} />
      <rect x="38" y="16" width="26" height="8" rx="4" fill={c.wod} transform="rotate(-14 51 20)" />
      <rect x="38" y="16" width="26" height="4.4" rx="2.2" fill={c.wo} transform="rotate(-14 51 18.2)" />
      <ellipse cx="26" cy="36" rx="24" ry="11" fill={c.bk} />
      <ellipse cx="26" cy="34" rx="24" ry="11" fill={c.gyd} />
      <ellipse cx="26" cy="34" rx="19" ry="7.8" fill={c.bk} />
      {/* 目玉焼き */}
      <path
        d="M20 29c4-1.6 8-1 10.4.8 2.6-1.4 6.4-1 7.4 1.6 1 2.6-1.4 4.6-5 5.2-3.4.6-6 2-10 1.4-4.2-.6-6.4-2.4-6-4.6.4-2 1.8-3.4 3.2-4.4z"
        fill={c.w}
      />
      <ellipse cx="25.5" cy="33.4" rx="4.6" ry="3.4" fill={c.yl} />
      <ellipse cx="24.2" cy="32.4" rx="2" ry="1.3" fill={c.cr} opacity={c.flat ? 1 : 0.85} />
      <Gl c={c} cx={10} cy={33} rx={2} ry={4} r={0} o={0.4} />
    </>
  ),

  /**
   * 包丁。刃を三角にすると左官のコテに見えたので、
   * **峰を曲線・刃を直線**にした（三徳包丁の形）。刃元に口金を入れて柄と切る。
   */
  knife: (c) => (
    <>
      <Sh c={c} cy={55} rx={22} ry={3.4} />
      <g transform="rotate(-9 32 32)">
        <path d="M5 40c1.6-3 4-6 7-9 8.4-8.4 19-13.6 28-14.4V40z" fill={c.gy} />
        {/* 研いだ面。刃先だけ明るいと金属に見える */}
        <path d="M6.4 40h33.6v-5H10.6c-1.8 1.8-3.2 3.4-4.2 5z" fill={c.w} opacity={c.flat ? 1 : 0.7} />
        <rect x="38.5" y="15.4" width="5.5" height="25.4" rx="2" fill={c.gyd} />
        <path d="M44 19h13a5 5 0 0 1 5 5v9a5 5 0 0 1-5 5H44z" fill={c.br} />
        <path d="M44 28.5h18V33a5 5 0 0 1-5 5H44z" fill={c.brd} />
        <g fill={c.crd}>
          <circle cx="49" cy="28.5" r="1.7" />
          <circle cx="56" cy="28.5" r="1.7" />
        </g>
      </g>
      <Gl c={c} cx={22} cy={25} rx={11} ry={1.6} r={-26} o={0.5} />
    </>
  ),

  cuttingboard: (c) => (
    <>
      <Sh c={c} cy={55} rx={24} ry={3.6} />
      <path d="M14 12h40a6 6 0 0 1 6 6v26a6 6 0 0 1-6 6H14a6 6 0 0 1-6-6V18a6 6 0 0 1 6-6z" fill={c.wo} />
      <path d="M32 12h22a6 6 0 0 1 6 6v26a6 6 0 0 1-6 6H32z" fill={c.wod} />
      <circle cx="15" cy="19" r="3.4" fill={c.brd} />
      <g fill={c.gr}>
        <circle cx="27" cy="32" r="6" />
        <circle cx="41" cy="30" r="6" />
        <circle cx="34" cy="42" r="5.4" />
      </g>
      <g fill={c.grl}>
        <circle cx="27" cy="32" r="2.6" />
        <circle cx="41" cy="30" r="2.6" />
        <circle cx="34" cy="42" r="2.3" />
      </g>
      <Gl c={c} cx={17} cy={30} rx={2.4} ry={8} r={0} o={0.3} />
    </>
  ),

  /**
   * 菜箸。2本を離して立てると「棒が2本」にしか見えなかったので、
   * **何かをつまんでいる**ところにする。持ち手を太く、先を細くする。
   */
  chopsticks: (c) => (
    <>
      <Sh c={c} cy={57} rx={15} ry={3.2} />
      {/* 太いと板に見える。持ち手 5px → 先 2.6px まで細らせる */}
      <g transform="rotate(34 32 32)">
        <path d="M28.6 2h5.6l1.4 51.4a2.2 2.2 0 0 1-2.2 2.3h-4a2.2 2.2 0 0 1-2.2-2.3z" fill={c.wo} />
        <path d="M31.4 2h2.8l1.4 51.4a2.2 2.2 0 0 1-2.2 2.3h-2z" fill={c.wod} />
      </g>
      <g transform="rotate(17 32 32)">
        <path d="M28.6 2h5.6l1.4 51.4a2.2 2.2 0 0 1-2.2 2.3h-4a2.2 2.2 0 0 1-2.2-2.3z" fill={c.wol} />
        <path d="M31.4 2h2.8l1.4 51.4a2.2 2.2 0 0 1-2.2 2.3h-2z" fill={c.wo} />
      </g>
      {/* つまんでいるもの。ここが有るだけで「箸」と読める */}
      <circle cx="40.5" cy="48" r="6.4" fill={c.gr} />
      <path d="M40.5 41.6a6.4 6.4 0 0 1 0 12.8z" fill={c.grd} />
      <Gl c={c} cx={38} cy={45.2} rx={2.2} ry={1.5} r={-24} o={0.6} />
    </>
  ),

  cup: (c) => (
    <>
      <Sh c={c} cy={55} rx={17} ry={3.6} />
      <path d="M44 22h6a7 7 0 0 1 0 14h-6z" fill="none" stroke={c.gy} strokeWidth="5" strokeLinejoin="round" />
      <path d="M13 14h32l-3 34a5 5 0 0 1-5 4.6H21a5 5 0 0 1-5-4.6z" fill={c.sk} opacity={c.flat ? 1 : 0.75} />
      <path d="M15.6 33h27.6l-1.2 15a5 5 0 0 1-5 4.6H21a5 5 0 0 1-5-4.6z" fill={c.tl} />
      <g fill={c.gyd}>
        <rect x="17" y="24" width="11" height="2.6" rx="1.3" />
        <rect x="17.6" y="32" width="8" height="2.6" rx="1.3" />
        <rect x="18.2" y="40" width="11" height="2.6" rx="1.3" />
      </g>
      <path d="M11 12h36l-2 6H13z" fill={c.w} />
      <Gl c={c} cx={20} cy={26} rx={2.4} ry={9} r={4} o={0.5} />
    </>
  ),

  stove: (c) => (
    <>
      <Sh c={c} cy={55} rx={22} ry={4} />
      <rect x="6" y="34" width="52" height="18" rx="6" fill={c.gy} />
      <path d="M52 34a6 6 0 0 1 6 6v6a6 6 0 0 1-6 6H32V34z" fill={c.gyd} />
      <circle cx="46" cy="43" r="4.4" fill={c.rd} />
      <ellipse cx="24" cy="34" rx="17" ry="5" fill={c.bk} />
      <ellipse cx="24" cy="32.4" rx="17" ry="5" fill={c.gyd} />
      <ellipse cx="24" cy="32.4" rx="9" ry="2.6" fill={c.bk} />
      {/* 火。小さな青い炎1つだと「点」になるので、輪に3つ立てて、先を橙にする */}
      <g>
        <path d="M24 4c2 6 7.4 8 7.4 14.6a7.4 7.4 0 0 1-14.8 0c0-3.2 1.4-5 2.4-7.4 1.2 1.8 2 2.8 3 3.6-.6-4.2.8-8.2 2-10.8z" fill={c.or} />
        <path d="M24 10.6c1.2 4 4.6 5.2 4.6 9.2a4.6 4.6 0 0 1-9.2 0c0-2 .8-3.2 1.4-4.6.8 1.2 1.2 1.8 1.8 2.2-.4-2.6.6-5.2 1.4-6.8z" fill={c.bl} />
        <path d="M24 19c1.2 1.8 2 2.6 2 4a2 2 0 0 1-4 0c0-1.4.8-2.2 2-4z" fill={c.sk} />
      </g>
      <g fill={c.bl} opacity={c.flat ? 1 : 0.85}>
        <path d="M13.5 22c1 2.4 3 3.2 3 5.6a3 3 0 0 1-6 0c0-2.4 2-3.2 3-5.6z" />
        <path d="M34.5 22c1 2.4 3 3.2 3 5.6a3 3 0 0 1-6 0c0-2.4 2-3.2 3-5.6z" />
      </g>
      <Gl c={c} cx={12} cy={39} rx={2.4} ry={5} r={0} o={0.4} />
    </>
  ),

  /**
   * 皿。真っ白だと明るい下地に溶けて消える。
   * 縁に呉須の帯を1本まわして、輪郭線なしで形の端を決める。
   */
  plate: (c) => (
    <>
      <Sh c={c} cy={48} rx={25} ry={4.4} />
      <ellipse cx="32" cy="34" rx="28" ry="14" fill={c.bld} />
      <ellipse cx="32" cy="31.6" rx="28" ry="14" fill={c.bl} />
      <ellipse cx="32" cy="31.6" rx="24" ry="11.4" fill={c.wd} />
      <ellipse cx="32" cy="30.8" rx="24" ry="11.4" fill={c.w} />
      <ellipse cx="32" cy="31.4" rx="15.5" ry="6.6" fill={c.wd} />
      <ellipse cx="32" cy="30.6" rx="15.5" ry="6.6" fill={c.cr} />
      <Gl c={c} cx={17} cy={26} rx={8} ry={2.4} r={-10} o={0.85} />
    </>
  ),

  /**
   * 丼。白い器を白いままにすると輪郭が消えるので、
   * 縁に呉須の帯、腰に一段濃い面を置いて、色の差だけで丸みを出す。
   */
  bowl: (c) => (
    <>
      <Sh c={c} cy={54} rx={22} ry={4.2} />
      <Steam c={c} x={32} y={2} />
      {/* ごはん。器から盛り上がっているところが見えると「丼」になる */}
      <path d="M15 27c1.6-8 8.6-13 17-13s15.4 5 17 13z" fill={c.w} />
      <path d="M32 14c8.4 0 15.4 5 17 13H32z" fill={c.wd} />
      {/* 器 */}
      <path d="M8 26h48c0 13.4-10.8 23.6-24 23.6S8 39.4 8 26z" fill={c.w} />
      <path d="M32 26h24c0 13.4-10.8 23.6-24 23.6z" fill={c.wd} />
      {/* 呉須の帯。1本だけ。ここが器の輪郭の代わりになる */}
      <path d="M8.4 29h47.2a25 25 0 0 1-1.5 5.4H9.9A25 25 0 0 1 8.4 29z" fill={c.bl} />
      <path d="M32 29h23.6a25 25 0 0 1-1.5 5.4H32z" fill={c.bld} />
      {/* 高台 */}
      <path d="M23 48h18l-1.6 6a2.4 2.4 0 0 1-2.3 1.8h-10.2a2.4 2.4 0 0 1-2.3-1.8z" fill={c.wd} />
      <Gl c={c} cx={17} cy={36} rx={2.6} ry={6} r={22} o={0.6} />
    </>
  ),

  basket: (c) => (
    <>
      <Sh c={c} cy={55} rx={22} ry={4} />
      <circle cx="21" cy="21" r="8" fill={c.rd} />
      <circle cx="34" cy="17" r="9" fill={c.gr} />
      <circle cx="45" cy="22" r="7" fill={c.or} />
      <path d="M14 20a18 18 0 0 1 36 0" fill="none" stroke={c.wod} strokeWidth="4.4" />
      <path d="M6 28h52l-4 20.6a5 5 0 0 1-4.9 4.4H14.9a5 5 0 0 1-4.9-4.4z" fill={c.wo} />
      <path d="M32 28h26l-4 20.6a5 5 0 0 1-4.9 4.4H32z" fill={c.wod} />
      <g fill={c.wod} opacity="0.6">
        <rect x="18" y="28" width="3" height="25" />
        <rect x="30.5" y="28" width="3" height="25" />
        <rect x="43" y="28" width="3" height="25" />
      </g>
      <rect x="6" y="28" width="52" height="6" rx="3" fill={c.wol} />
      <Gl c={c} cx={16} cy={31} rx={5} ry={1.6} r={-4} o={0.5} />
    </>
  ),

  veg: (c) => (
    <>
      <Sh c={c} cy={56} rx={15} ry={3.2} />
      <g fill={c.gr}>
        <path d="M30 20c-4-8-11-10-16-8 3 5 8 9 14 10z" />
        <path d="M34 19c1-9 7-13 12-13-1 6-4 11-9 14z" />
        <path d="M32 18c-1-7 2-13 6-15 1 6 0 11-3 15z" />
      </g>
      <path d="M32 16c5 0 9 4 9 9 0 9-6 22-9 30-3-8-9-21-9-30 0-5 4-9 9-9z" fill={c.or} />
      <path d="M32 16c5 0 9 4 9 9 0 9-6 22-9 30z" fill={c.ord} />
      <g fill={c.ord} opacity="0.75">
        <rect x="24" y="27" width="9" height="2.4" rx="1.2" transform="rotate(18 28 28)" />
        <rect x="30" y="36" width="9" height="2.4" rx="1.2" transform="rotate(-18 34 37)" />
      </g>
      <Gl c={c} cx={27} cy={26} rx={1.8} ry={6} r={8} o={0.5} />
    </>
  ),

  /**
   * 肉。桃色の塊だと何なのか分からなかったので、骨付き肉にする。
   * 骨を上に立てると、遠目でも「肉」と読める形になる。
   */
  meat: (c) => (
    <>
      <Sh c={c} cy={56} rx={20} ry={3.8} />
      {/* 骨。こぶを2つ */}
      <g fill={c.crd}>
        <circle cx="24" cy="9.5" r="7" />
        <circle cx="40" cy="9.5" r="7" />
      </g>
      <rect x="27" y="6" width="10" height="24" fill={c.crd} />
      <g fill={c.cr}>
        <circle cx="24" cy="8" r="6.4" />
        <circle cx="40" cy="8" r="6.4" />
        <rect x="27.5" y="5" width="9" height="22" />
      </g>
      {/* 肉。上を細く、下をどっしり */}
      <path
        d="M32 20c13 0 24 8 24 18.6C56 48.6 45.4 56 32 56S8 48.6 8 38.6C8 28 19 20 32 20z"
        fill={c.rd}
      />
      <path d="M32 20c13 0 24 8 24 18.6C56 48.6 45.4 56 32 56z" fill={c.rdd} />
      {/* 脂身。縁の白い帯 */}
      <path
        d="M32 20c6.4 0 12.4 2 17 5.2-4.6-1.6-10-2.4-17-2.4s-12.4.8-17 2.4C19.6 22 25.6 20 32 20z"
        fill={c.wol}
      />
      <g fill={c.rdl} opacity={c.flat ? 1 : 0.8}>
        <rect x="17" y="35" width="12" height="3" rx="1.5" transform="rotate(-10 23 36.5)" />
        <rect x="33" y="43" width="12" height="3" rx="1.5" transform="rotate(8 39 44.5)" />
      </g>
      <Gl c={c} cx={20} cy={31} rx={6} ry={2.4} r={-16} o={0.4} />
    </>
  ),

  fish: (c) => (
    <>
      <Sh c={c} cy={53} rx={22} ry={3.6} />
      <path d="M60 16v28l-16-14z" fill={c.bld} />
      <path d="M4 30c8-12 20-18 30-18s16 8 16 18-6 18-16 18S12 42 4 30z" fill={c.bl} />
      <path d="M34 12.2c9 .8 16 8.4 16 17.8s-7 17-16 17.8z" fill={c.bld} />
      <path d="M26 12.6c2 4 3 8 3 12h-8c1-4 2.6-8 5-12z" fill={c.sk} />
      <circle cx="16" cy="26" r="3.6" fill={c.w} />
      <circle cx="15.4" cy="26" r="2" fill={c.ink} />
      <g fill={c.sk} opacity="0.7">
        <circle cx="30" cy="30" r="4" />
        <circle cx="39" cy="27" r="4" />
        <circle cx="39" cy="35" r="4" />
      </g>
      <Gl c={c} cx={20} cy={19} rx={7} ry={2.4} r={-20} o={0.45} />
    </>
  ),

  bread: (c) => (
    <>
      <Sh c={c} cy={53} rx={24} ry={4} />
      <path d="M8 30c0-11 10-18 24-18s24 7 24 18v12a6 6 0 0 1-6 6H14a6 6 0 0 1-6-6z" fill={c.wo} />
      <path d="M32 12c14 0 24 7 24 18v12a6 6 0 0 1-6 6H32z" fill={c.wod} />
      <path d="M14 26c4-6 10-9 18-9s14 3 18 9c-6-3-11-4.4-18-4.4S20 23 14 26z" fill={c.cr} />
      <g fill={c.wod} opacity="0.7">
        <rect x="19" y="16" width="4" height="12" rx="2" transform="rotate(-24 21 22)" />
        <rect x="31" y="14" width="4" height="12" rx="2" transform="rotate(-6 33 20)" />
        <rect x="42" y="16" width="4" height="12" rx="2" transform="rotate(12 44 22)" />
      </g>
      <Gl c={c} cx={18} cy={33} rx={3} ry={7} r={16} o={0.35} />
    </>
  ),

  egg: (c) => (
    <>
      <Sh c={c} cy={50} rx={24} ry={4} />
      <path d="M14 18c6-8 18-9 24-4s14 1 18 8-2 14-8 17-8 9-16 9-12-5-18-7-8-10-6-16 2-5 6-7z" fill={c.w} />
      <path d="M32 14.6c2.6 0 4.8.6 6 2.4 6 5 14 1 18 8s-2 14-8 17-8 9-16 9z" fill={c.wd} />
      <circle cx="30" cy="28" r="10" fill={c.yl} />
      <path d="M30 18a10 10 0 0 1 0 20z" fill={c.yld} />
      <Gl c={c} cx={26} cy={23} rx={3.4} ry={2.2} r={-24} o={0.75} />
    </>
  ),

  spice: (c) => (
    <>
      <Sh c={c} cy={56} rx={14} ry={3.2} />
      <path d="M22 22h20a4 4 0 0 1 4 4v24a4 4 0 0 1-4 4H22a4 4 0 0 1-4-4V26a4 4 0 0 1 4-4z" fill={c.crd} />
      <path d="M32 22h10a4 4 0 0 1 4 4v24a4 4 0 0 1-4 4H32z" fill={c.wod} />
      <path d="M22 32h20v18H22z" fill={c.ord} />
      <path d="M32 32h10v18H32z" fill={c.brd} />
      <path d="M23 10h18a3 3 0 0 1 3 3v9H20v-9a3 3 0 0 1 3-3z" fill={c.gyd} />
      <g fill={c.cr}>
        <circle cx="27" cy="15" r="1.7" />
        <circle cx="32" cy="13" r="1.7" />
        <circle cx="37" cy="15" r="1.7" />
        <circle cx="32" cy="18.6" r="1.7" />
      </g>
      <Gl c={c} cx={24} cy={38} rx={2} ry={6} r={0} o={0.3} />
    </>
  ),

  oil: (c) => (
    <>
      <Sh c={c} cy={56} rx={14} ry={3.2} />
      <path d="M40 14 56 8l-2 5.6-13 5.4z" fill={c.gyd} />
      <path d="M27 6h10v8l4 6a10 10 0 0 1 2 6v20a6 6 0 0 1-6 6H23a6 6 0 0 1-6-6V26a10 10 0 0 1 2-6l4-6z" fill={c.grl} opacity={c.flat ? 1 : 0.8} />
      <path d="M18 32h27v18a6 6 0 0 1-6 6H24a6 6 0 0 1-6-6z" fill={c.yl} />
      <path d="M32 32h13v18a6 6 0 0 1-6 6h-7z" fill={c.yld} />
      <rect x="25" y="4" width="14" height="6" rx="3" fill={c.gyd} />
      <Gl c={c} cx={23} cy={30} rx={2.4} ry={9} r={4} o={0.5} />
    </>
  ),

  /**
   * 食べる。灰色の食器2本だと明るい下地で消えるので、
   * 皿を敷いて色を作り、そのうえに食器を置く。
   */
  eat: (c) => (
    <>
      <Sh c={c} cy={54} rx={25} ry={4.2} />
      <circle cx="32" cy="32" r="26" fill={c.tld} />
      <circle cx="32" cy="30.6" r="26" fill={c.tl} />
      <circle cx="32" cy="30.6" r="19.5" fill={c.wd} />
      <circle cx="32" cy="29.8" r="19.5" fill={c.w} />
      {/* フォーク */}
      <path
        d="M17 10h3v10h2.2V10h3v10h2.2V10h3v13c0 3.4-1.6 5.6-4 6.4V51a2.6 2.6 0 0 1-5.2 0V29.4c-2.4-.8-4-3-4-6.4z"
        fill={c.gy}
      />
      <path d="M26.4 10h3.8v13c0 3.4-1.6 5.6-4 6.4V51a2.6 2.6 0 0 1-2.6 2.6V10z" fill={c.gyd} />
      {/* ナイフ */}
      <path d="M44 10c4.6 1.8 7 8 7 15 0 5.6-1.8 9.6-4.4 11.4V51a2.6 2.6 0 0 1-5.2 0V10z" fill={c.gy} />
      <path d="M46.4 12c2.8 3 4.2 7.8 4.2 13 0 5.6-1.8 9.6-4.4 11.4V51a2.6 2.6 0 0 1-2.6 2.6V10.6z" fill={c.gyd} />
      <Gl c={c} cx={19} cy={19} rx={4.6} ry={2.4} r={-34} o={0.7} />
    </>
  ),

  /** コーヒー。撮影の合間。 */
  coffee: (c) => (
    <>
      <Sh c={c} cy={55} rx={20} ry={4} />
      <Steam c={c} x={26} y={2} />
      <path d="M44 24h6a10 10 0 0 1 0 20h-6z" fill="none" stroke={c.w} strokeWidth="6" strokeLinejoin="round" />
      <path d="M44 24h6a10 10 0 0 1 0 20h-6z" fill="none" stroke={c.wd} strokeWidth="2.6" strokeLinejoin="round" />
      <path d="M8 20h38v18c0 8.8-7.2 16-16 16h-6c-8.8 0-16-7.2-16-16z" fill={c.w} />
      <path d="M27 20h19v18c0 8.8-7.2 16-16 16h-3z" fill={c.wd} />
      <ellipse cx="27" cy="20" rx="19" ry="6" fill={c.brd} />
      <ellipse cx="27" cy="19" rx="15" ry="4.4" fill={c.br} />
      <ellipse cx="22" cy="18" rx="5" ry="1.8" fill={c.wol} opacity={c.flat ? 1 : 0.7} />
      <Gl c={c} cx={14} cy={30} rx={2.4} ry={7} r={6} o={0.6} />
    </>
  ),

  /** ごはん。茶碗に山盛り。 */
  rice: (c) => (
    <>
      <Sh c={c} cy={54} rx={20} ry={4} />
      <path d="M14 30c1.4-9 8.4-15 18-15s16.6 6 18 15z" fill={c.w} />
      <path d="M32 15c9.6 0 16.6 6 18 15H32z" fill={c.wd} />
      <path d="M11 29h42c0 12-9.4 21-21 21s-21-9-21-21z" fill={c.gr} />
      <path d="M32 29h21c0 12-9.4 21-21 21z" fill={c.grd} />
      <path d="M12.6 33h38.8a20 20 0 0 1-1.6 5H14.2a20 20 0 0 1-1.6-5z" fill={c.cr} />
      <path d="M24 47h16l-1.4 6a2.4 2.4 0 0 1-2.3 1.8h-8.6a2.4 2.4 0 0 1-2.3-1.8z" fill={c.grd} />
      <Gl c={c} cx={19} cy={36} rx={2.6} ry={5} r={22} o={0.5} />
    </>
  ),

  /** 麺。丼から箸で持ち上げる。 */
  noodle: (c) => (
    <>
      <Sh c={c} cy={55} rx={21} ry={4} />
      <rect x="40" y="2" width="4.6" height="34" rx="2.3" fill={c.wo} transform="rotate(14 42 19)" />
      <rect x="46" y="2" width="4.6" height="34" rx="2.3" fill={c.wod} transform="rotate(20 48 19)" />
      <g fill="none" stroke={c.cr} strokeWidth="3.4" strokeLinecap="round">
        <path d="M42 22c-2 8-8 10-10 16" />
        <path d="M46 24c-1 8-9 11-10 16" />
        <path d="M38 22c-2 8-6 12-7 17" />
      </g>
      <path d="M9 28h46c0 12.6-10.3 22.6-23 22.6S9 40.6 9 28z" fill={c.rd} />
      <path d="M32 28h23c0 12.6-10.3 22.6-23 22.6z" fill={c.rdd} />
      <ellipse cx="32" cy="28" rx="23" ry="7" fill={c.crd} />
      <ellipse cx="32" cy="27" rx="19" ry="5.4" fill={c.cr} />
      <circle cx="24" cy="26.6" r="4" fill={c.w} />
      <circle cx="24" cy="26.6" r="2" fill={c.yl} />
      <Gl c={c} cx={17} cy={34} rx={2.4} ry={5} r={22} o={0.5} />
    </>
  ),

  /** スープ。深皿とスプーン。 */
  soup: (c) => (
    <>
      <Sh c={c} cy={54} rx={24} ry={4} />
      <Steam c={c} x={30} y={0} />
      <rect x="46" y="14" width="4.4" height="34" rx="2.2" fill={c.gyd} transform="rotate(9 48 31)" />
      <ellipse cx="51" cy="17" rx="5.4" ry="7" fill={c.gy} transform="rotate(9 51 17)" />
      <path d="M4 28h50c0 11.6-9.6 20.6-22 20.6h-6C13.6 48.6 4 39.6 4 28z" fill={c.w} />
      <path d="M29 28h25c0 11.6-9.6 20.6-22 20.6h-3z" fill={c.wd} />
      <ellipse cx="29" cy="28" rx="25" ry="7.4" fill={c.crd} />
      <ellipse cx="29" cy="27" rx="20" ry="5.4" fill={c.or} />
      <g fill={c.gr}>
        <circle cx="23" cy="26" r="2.4" />
        <circle cx="34" cy="27.6" r="2.2" />
      </g>
      <circle cx="29" cy="24.6" r="2" fill={c.rd} />
      <Gl c={c} cx={14} cy={32} rx={2.4} ry={5} r={22} o={0.5} />
    </>
  ),

  /** くだもの。市場で買うもの。 */
  fruit: (c) => (
    <>
      <Sh c={c} cy={56} rx={20} ry={3.8} />
      <path d="M30 18c-5-4-12-3-14 2 5 1 9 1 13 0z" fill={c.gr} />
      <rect x="30" y="8" width="4" height="12" rx="2" fill={c.wod} transform="rotate(8 32 14)" />
      <path d="M22 20c4-3 7-2 10 0 3-2 6-3 10 0 6 4 8 13 5 21-3 9-9 15-15 15s-12-6-15-15c-3-8-1-17 5-21z" fill={c.rd} />
      <path d="M32 20c3-2 6-3 10 0 6 4 8 13 5 21-3 9-9 15-15 15z" fill={c.rdd} />
      <circle cx="46" cy="34" r="9" fill={c.or} />
      <path d="M46 25a9 9 0 0 1 0 18z" fill={c.ord} />
      <Gl c={c} cx={24} cy={28} rx={3} ry={6} r={22} o={0.55} />
      <Gl c={c} cx={43} cy={30} rx={2} ry={3} r={-24} o={0.5} />
    </>
  ),

  /** チーズ。北欧の朝ごはん。 */
  cheese: (c) => (
    <>
      <Sh c={c} cy={54} rx={24} ry={4} />
      <path d="M6 26 52 12a6 6 0 0 1 8 5.7V26z" fill={c.gd} />
      <path d="M6 26h54v14a6 6 0 0 1-6 6H12a6 6 0 0 1-6-6z" fill={c.yl} />
      <path d="M32 26h28v14a6 6 0 0 1-6 6H32z" fill={c.yld} />
      <g fill={c.crd}>
        <circle cx="18" cy="35" r="4.4" />
        <circle cx="33" cy="39" r="3.4" />
        <circle cx="46" cy="33" r="3.8" />
      </g>
      <Gl c={c} cx={20} cy={22} rx={9} ry={1.8} r={-16} o={0.45} />
    </>
  ),

  /** 飲みもの。氷とストロー。 */
  drink: (c) => (
    <>
      <Sh c={c} cy={57} rx={15} ry={3.2} />
      <rect x="38" y="2" width="4.6" height="26" rx="2.3" fill={c.rd} transform="rotate(18 40 15)" />
      <path d="M15 16h34l-4 36a5 5 0 0 1-5 4.4H24a5 5 0 0 1-5-4.4z" fill={c.w} opacity={c.flat ? 1 : 0.55} />
      <path d="M17 28h30l-2.6 24a5 5 0 0 1-5 4.4H24.6a5 5 0 0 1-5-4.4z" fill={c.or} />
      <path d="M32 28h15l-2.6 24a5 5 0 0 1-5 4.4H32z" fill={c.ord} />
      <g fill={c.w} opacity={c.flat ? 1 : 0.7}>
        <rect x="21" y="31" width="9" height="8" rx="2.4" transform="rotate(-12 25 35)" />
        <rect x="34" y="36" width="8" height="7" rx="2.2" transform="rotate(14 38 39)" />
      </g>
      <rect x="13" y="13" width="38" height="6" rx="3" fill={c.w} />
      <Gl c={c} cx={22} cy={30} rx={2} ry={9} r={4} o={0.55} />
    </>
  ),

  /** 時間をはかる。煮込みの時間。 */
  timer: (c) => (
    <>
      <Sh c={c} cy={57} rx={17} ry={3.2} />
      <circle cx="32" cy="35" r="24" fill={c.rdd} />
      <circle cx="32" cy="33.5" r="24" fill={c.rd} />
      <circle cx="32" cy="33.5" r="18" fill={c.cr} />
      <circle cx="32" cy="33.5" r="18" fill="none" stroke={c.w} strokeWidth="2.4" />
      <path d="M32 20v13.5h11" fill="none" stroke={c.ink} strokeWidth="3.4" strokeLinecap="round" />
      <circle cx="32" cy="33.5" r="2.6" fill={c.rdd} />
      <rect x="26" y="4" width="12" height="8" rx="3" fill={c.gyd} />
      <rect x="28.6" y="10" width="6.8" height="5" rx="2" fill={c.gy} />
      <Gl c={c} cx={20} cy={22} rx={5} ry={2.6} r={-32} o={0.5} />
    </>
  ),
};
