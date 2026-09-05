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
      {/* 開きを 17° 付けると V 字の板に見えた。ほぼ平行（差 6°）にして、
          先でつまんでいるところだけ寄せる。太さは持ち手 5px → 先 2.4px */}
      <g transform="rotate(30 32 32)">
        <path d="M28.8 3h5l1.1 50.6a2.1 2.1 0 0 1-2.1 2.2h-3a2.1 2.1 0 0 1-2.1-2.2z" fill={c.wo} />
        <path d="M31.3 3h2.5l1.1 50.6a2.1 2.1 0 0 1-2.1 2.2h-1.5z" fill={c.wod} />
      </g>
      <g transform="rotate(24 32 32)">
        <path d="M28.8 1h5l1.1 52.6a2.1 2.1 0 0 1-2.1 2.2h-3a2.1 2.1 0 0 1-2.1-2.2z" fill={c.wol} />
        <path d="M31.3 1h2.5l1.1 52.6a2.1 2.1 0 0 1-2.1 2.2h-1.5z" fill={c.wo} />
      </g>
      {/* つまんでいるもの。ここが有るだけで「箸」と読める */}
      <circle cx="42" cy="51" r="6.6" fill={c.gr} />
      <path d="M42 44.4a6.6 6.6 0 0 1 0 13.2z" fill={c.grd} />
      <Gl c={c} cx={39.4} cy={48} rx={2.2} ry={1.5} r={-24} o={0.6} />
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
      {/* ごはん。白い器に白い飯だと境が消えるので、**器の側を色にする** */}
      <path d="M15 27c1.6-8 8.6-13 17-13s15.4 5 17 13z" fill={c.w} />
      <path d="M32 14c8.4 0 15.4 5 17 13H32z" fill={c.wd} />
      {/* 器。青磁。ごはん（白）と面で分かれる */}
      <path d="M8 26h48c0 13.4-10.8 23.6-24 23.6S8 39.4 8 26z" fill={c.tl} />
      <path d="M32 26h24c0 13.4-10.8 23.6-24 23.6z" fill={c.tld} />
      <path d="M8.4 29h47.2a25 25 0 0 1-1.5 5.4H9.9A25 25 0 0 1 8.4 29z" fill={c.cr} />
      <path d="M32 29h23.6a25 25 0 0 1-1.5 5.4H32z" fill={c.crd} />
      {/* 高台 */}
      <path d="M23 48h18l-1.6 6a2.4 2.4 0 0 1-2.3 1.8h-10.2a2.4 2.4 0 0 1-2.3-1.8z" fill={c.tld} />
      <Gl c={c} cx={17} cy={36} rx={2.6} ry={6} r={22} o={0.5} />
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

  /**
   * 塩。瓶にすると `spice` と同じ形になるので、**木の小皿に盛った塩**にする。
   * 白い山だけだと明るい下地で消えるから、皿の茶色で下から挟む。
   */
  salt: (c) => (
    <>
      <Sh c={c} cy={55} rx={22} ry={4} />
      <path d="M32 12c6.4 0 12 12 15.6 25H16.4C20 24 25.6 12 32 12z" fill={c.w} />
      <path d="M32 12c6.4 0 12 12 15.6 25H32z" fill={c.wd} />
      <rect x="5" y="35" width="54" height="7" rx="3.5" fill={c.wol} />
      <path d="M8 41h48l-5.2 9.4a6 6 0 0 1-5.2 3.1H18.4a6 6 0 0 1-5.2-3.1z" fill={c.wo} />
      <path d="M32 41h24l-5.2 9.4a6 6 0 0 1-5.2 3.1H32z" fill={c.wod} />
      {/* こぼれた粒。これが無いと砂糖と見分けが付かない */}
      <g fill={c.w}>
        <circle cx="13" cy="31" r="2.2" />
        <circle cx="52" cy="27" r="1.8" />
        <circle cx="47" cy="19" r="1.5" />
      </g>
      <Gl c={c} cx={25} cy={24} rx={2.2} ry={6} r={18} o={0.6} />
    </>
  ),

  /** こしょう。ミルの挽く部分（金属の台）で塩と分ける。 */
  pepper: (c) => (
    <>
      <Sh c={c} cy={57} rx={15} ry={3.2} />
      <rect x="27.6" y="3" width="8.8" height="6" rx="3" fill={c.gyd} />
      <rect x="30" y="8" width="4" height="5" fill={c.gy} />
      <path d="M21 12h22l2.6 16c1.2 7.4-4.4 12.6-13.6 12.6S16.2 35.4 17.4 28z" fill={c.wo} />
      <path d="M32 12h11l2.6 16c1.2 7.4-4.4 12.6-13.6 12.6z" fill={c.wod} />
      <g fill={c.wod} opacity="0.6">
        <rect x="18.6" y="21" width="26.8" height="2.6" rx="1.3" />
        <rect x="17.6" y="28" width="28.8" height="2.6" rx="1.3" />
      </g>
      <path d="M18 40h28l-1.6 8.6A4 4 0 0 1 40.4 52H23.6a4 4 0 0 1-4-3.4z" fill={c.gyd} />
      <rect x="16.6" y="38" width="30.8" height="5" rx="2.5" fill={c.gy} />
      <Gl c={c} cx={24} cy={22} rx={2} ry={7} r={6} o={0.5} />
    </>
  ),

  /** 小麦粉。紙袋の折り口と、こぼれた粉で「粉もの」だと言う。 */
  flour: (c) => (
    <>
      <Sh c={c} cy={56} rx={22} ry={4} />
      <path d="M15 21h34v27a8 8 0 0 1-8 8H23a8 8 0 0 1-8-8z" fill={c.crd} />
      <path d="M32 21h17v27a8 8 0 0 1-8 8H32z" fill={c.wod} opacity="0.45" />
      <path d="M15 21 21 11h22l6 10z" fill={c.cr} />
      <path d="M32 11h11l6 10H32z" fill={c.crd} />
      <rect x="19" y="28" width="26" height="13" rx="3" fill={c.w} />
      <path d="M32 22.6c3.4 2 5 4.6 5 8s-1.6 6-5 8c-3.4-2-5-4.6-5-8s1.6-6 5-8z" fill={c.gd} />
      <g fill={c.w}>
        <circle cx="10" cy="52" r="4.4" />
        <circle cx="16.4" cy="55.4" r="2.6" />
      </g>
      <Gl c={c} cx={21} cy={16} rx={4.4} ry={1.6} r={-8} o={0.5} />
    </>
  ),

  /** 牛乳。屋根型のパックにすると、瓶の油と混ざらない。 */
  milk: (c) => (
    <>
      <Sh c={c} cy={57} rx={17} ry={3.4} />
      <rect x="28" y="4" width="8" height="4" rx="2" fill={c.gy} />
      <path d="M16 21 32 7l16 14z" fill={c.wd} />
      <path d="M32 7l16 14H32z" fill={c.gy} opacity="0.55" />
      <rect x="16" y="20" width="32" height="36" rx="4" fill={c.w} />
      <path d="M32 20h12a4 4 0 0 1 4 4v28a4 4 0 0 1-4 4H32z" fill={c.wd} />
      <rect x="16" y="30" width="32" height="11" fill={c.bl} />
      <rect x="32" y="30" width="16" height="11" fill={c.bld} />
      <path d="M27 33.4c2.6 3 4 4.6 4 6.2a4 4 0 0 1-8 0c0-1.6 1.4-3.2 4-6.2z" fill={c.w} />
      <Gl c={c} cx={21} cy={26} rx={2.2} ry={5} r={4} o={0.55} />
    </>
  ),

  /** バター。切り口の面を1つ見せると、四角い塊ではなく「バター」になる。 */
  butter: (c) => (
    <>
      <Sh c={c} cy={53} rx={24} ry={4.2} />
      <ellipse cx="32" cy="46" rx="27" ry="7" fill={c.w} />
      <ellipse cx="32" cy="44.6" rx="27" ry="7" fill={c.wd} />
      <ellipse cx="32" cy="44" rx="22" ry="5" fill={c.w} />
      <path d="M13 24h32v14a4 4 0 0 1-4 4H17a4 4 0 0 1-4-4z" fill={c.yld} />
      <path d="M13 24 21 16h32l-8 8z" fill={c.gd} />
      <path d="M45 24 53 16v14a4 4 0 0 1-4 4h-8a4 4 0 0 0 4-4z" fill={c.yld} />
      <path d="M13 24h32v6H13z" fill={c.yl} opacity="0.55" />
      {/* 切り取った一片。手前に倒して置く */}
      <path d="M18 34h11l3-3v8a3 3 0 0 1-3 3h-8a3 3 0 0 1-3-3z" fill={c.gd} />
      <Gl c={c} cx={24} cy={20} rx={7} ry={1.8} r={-8} o={0.5} />
    </>
  ),

  /** ケーキ。段（スポンジと生クリーム）を横から見せる。 */
  cake: (c) => (
    <>
      <Sh c={c} cy={56} rx={23} ry={4} />
      <path d="M11 26h42v22a8 8 0 0 1-8 8H19a8 8 0 0 1-8-8z" fill={c.wol} />
      <path d="M32 26h21v22a8 8 0 0 1-8 8H32z" fill={c.wod} />
      <rect x="11" y="33" width="42" height="8" fill={c.cr} />
      <rect x="32" y="33" width="21" height="8" fill={c.crd} />
      <path d="M11 26c0-5 9-8 21-8s21 3 21 8z" fill={c.w} />
      <path d="M32 18c12 0 21 3 21 8H32z" fill={c.wd} />
      {/* いちご。頭に1つ載せると、四角い塊がケーキになる */}
      <path d="M32 8c4.4 0 7.4 2.8 7.4 6.4 0 3.4-3.4 6.6-7.4 6.6s-7.4-3.2-7.4-6.6C24.6 10.8 27.6 8 32 8z" fill={c.rd} />
      <path d="M32 8c4.4 0 7.4 2.8 7.4 6.4 0 3.4-3.4 6.6-7.4 6.6z" fill={c.rdd} />
      <path d="M32 4c2.6 0 4.6 1.4 5.4 3.4-1.6-.8-3.4-1-5.4-1s-3.8.2-5.4 1C27.4 5.4 29.4 4 32 4z" fill={c.gr} />
      <Gl c={c} cx={20} cy={23} rx={5.4} ry={1.8} r={-6} o={0.55} />
    </>
  ),

  /** アイス。コーンの網目を残すと、小さくしても丸い塊に見えない。 */
  icecream: (c) => (
    <>
      <Sh c={c} cy={58} rx={11} ry={3} />
      <path d="M20 32h24l-9.6 25.4a2.6 2.6 0 0 1-4.8 0z" fill={c.wol} />
      <path d="M32 32h12l-9.6 25.4a2.6 2.6 0 0 1-2.4 1.6z" fill={c.wo} />
      <g stroke={c.wod} strokeWidth="1.8" opacity="0.6">
        <path d="M23 38h18M25 45h14M27.5 51h9" />
      </g>
      <circle cx="32" cy="28" r="13" fill={c.cr} />
      <path d="M32 15a13 13 0 0 1 0 26z" fill={c.crd} />
      <circle cx="32" cy="15" r="10" fill={c.pk} />
      <path d="M32 5a10 10 0 0 1 0 20z" fill={c.pkd} />
      <circle cx="32" cy="5.6" r="3.4" fill={c.rd} />
      <Gl c={c} cx={26} cy={11} rx={2.4} ry={3.4} r={-30} o={0.6} />
    </>
  ),

  /** お茶。急須。注ぎ口と持ち手の左右で「湯を注ぐもの」だと分かる。 */
  tea: (c) => (
    <>
      <Sh c={c} cy={55} rx={21} ry={4} />
      <g fill="none" stroke={c.w} strokeWidth="3" strokeLinecap="round" opacity={c.flat ? 1 : 0.85}>
        <path d="M26 14c-3.4-3 1.4-5 0-8" />
        <path d="M36 12c-3.4-3 1.4-5 0-8" />
      </g>
      <path d="M45 26a11 11 0 0 1 0 20" fill="none" stroke={c.tld} strokeWidth="5.4" strokeLinecap="round" />
      <path d="M17 30 4 24l1.6 12L17 39z" fill={c.tl} />
      <path d="M17 34.4 5.2 32.6 5.6 36 17 39z" fill={c.tld} />
      <ellipse cx="30" cy="37" rx="19" ry="15" fill={c.tl} />
      <path d="M30 22a19 15 0 0 1 0 30z" fill={c.tld} />
      <path d="M18 25h24a12 12 0 0 0-24 0z" fill={c.tld} />
      <rect x="12" y="23" width="36" height="5" rx="2.5" fill={c.w} opacity={c.flat ? 1 : 0.7} />
      <circle cx="30" cy="19" r="3.6" fill={c.gd} />
      <Gl c={c} cx={20} cy={31} rx={5} ry={2.6} r={-28} o={0.55} />
    </>
  ),

  /** ビール。泡を大きく取ると、遠目でもジュースと分かれる。 */
  beer: (c) => (
    <>
      <Sh c={c} cy={57} rx={18} ry={3.4} />
      <path d="M42 24h6a9 9 0 0 1 0 18h-6z" fill="none" stroke={c.gy} strokeWidth="5" strokeLinejoin="round" />
      <path d="M12 22h30v29a5 5 0 0 1-5 5H17a5 5 0 0 1-5-5z" fill={c.or} />
      <path d="M32 22h10v29a5 5 0 0 1-5 5h-5z" fill={c.ord} />
      <path d="M12 22c0-7 6.6-11 15-11s15 4 15 11z" fill={c.w} />
      <g fill={c.w}>
        <circle cx="16" cy="16" r="5.4" />
        <circle cx="27" cy="11" r="6.4" />
        <circle cx="38" cy="16" r="5" />
      </g>
      <g fill={c.wd}>
        <circle cx="38" cy="16" r="3.4" />
        <circle cx="33" cy="12" r="2.6" />
      </g>
      <g fill={c.yl} opacity="0.7">
        <circle cx="20" cy="34" r="2.2" />
        <circle cx="26" cy="43" r="1.8" />
        <circle cx="19" cy="46" r="1.5" />
      </g>
      <Gl c={c} cx={17} cy={34} rx={2} ry={9} r={0} o={0.5} />
    </>
  ),

  /** ワイン。脚とふくらみの差を大きく取る。 */
  wine: (c) => (
    <>
      <Sh c={c} cy={57} rx={14} ry={3.2} />
      <path d="M17 6h30v11c0 9.6-6.7 16.4-15 16.4S17 26.6 17 17z" fill={c.w} opacity={c.flat ? 1 : 0.75} />
      <path d="M18.4 18h27.2c-.7 8.4-6.8 14.4-13.6 14.4S19.1 26.4 18.4 18z" fill={c.rdd} />
      <path d="M32 18h13.6c-.7 8.4-6.8 14.4-13.6 14.4z" fill={c.nv} opacity="0.3" />
      <rect x="29.4" y="32" width="5.2" height="16" rx="2.6" fill={c.wd} />
      <path d="M18 54c0-3.6 6.3-6 14-6s14 2.4 14 6z" fill={c.w} />
      <path d="M32 48c7.7 0 14 2.4 14 6H32z" fill={c.wd} />
      <Gl c={c} cx={23} cy={14} rx={2.2} ry={7} r={8} o={0.65} />
    </>
  ),

  /** はちみつ。瓶の布ぶたと、垂れた一滴。 */
  honey: (c) => (
    <>
      <Sh c={c} cy={57} rx={17} ry={3.4} />
      <path d="M15 24h34v22a10 10 0 0 1-10 10H25a10 10 0 0 1-10-10z" fill={c.or} />
      <path d="M32 24h17v22a10 10 0 0 1-10 10h-7z" fill={c.ord} />
      <rect x="18" y="31" width="28" height="12" rx="3" fill={c.cr} />
      <path d="m32 32.6 3 5.2h-6z" fill={c.ord} />
      <path d="M32 41.4 29 36.2h6z" fill={c.ord} />
      <path d="M13 16h38l-2 8H15z" fill={c.rd} />
      <path d="M32 16h19l-2 8H32z" fill={c.rdd} />
      <rect x="17" y="10" width="30" height="7" rx="3.5" fill={c.gd} />
      {/* 垂れた一滴 */}
      <path d="M55 22c2.6 4 4 6 4 8a4 4 0 0 1-8 0c0-2 1.4-4 4-8z" fill={c.gd} />
      <Gl c={c} cx={22} cy={30} rx={2.4} ry={6} r={8} o={0.5} />
    </>
  ),

  /** きのこ。北欧の森の回で使う。白い点で「森のきのこ」だと言う。 */
  mushroom: (c) => (
    <>
      <Sh c={c} cy={55} rx={17} ry={3.6} />
      <path d="M24 28h16v15c0 6.4-3.2 10-8 10s-8-3.6-8-10z" fill={c.cr} />
      <path d="M32 28h8v15c0 6.4-3.2 10-8 10z" fill={c.crd} />
      <path d="M32 7c13.6 0 24 9.6 24 18.2 0 3-2.2 4.8-5.6 4.8H13.6C10.2 30 8 28.2 8 25.2 8 16.6 18.4 7 32 7z" fill={c.rd} />
      <path d="M32 7c13.6 0 24 9.6 24 18.2 0 3-2.2 4.8-5.6 4.8H32z" fill={c.rdd} />
      <g fill={c.w}>
        <ellipse cx="20" cy="20" rx="5" ry="4" />
        <ellipse cx="35" cy="14" rx="4.2" ry="3.4" />
        <ellipse cx="45" cy="23" rx="4.6" ry="3.6" />
        <ellipse cx="29" cy="25" rx="3.4" ry="2.6" />
      </g>
      <Gl c={c} cx={19} cy={14} rx={5} ry={2.4} r={-26} o={0.5} />
    </>
  ),

  /** たまねぎ。縦の筋と、先の緑の芽。 */
  onion: (c) => (
    <>
      <Sh c={c} cy={56} rx={17} ry={3.6} />
      <path d="M32 15c11.4 0 19 8.4 19 19s-8.6 18-19 18-19-8-19-18 7.6-19 19-19z" fill={c.pu} />
      <path d="M32 15c11.4 0 19 8.4 19 19s-8.6 18-19 18z" fill={c.pud} />
      <g stroke={c.pud} strokeWidth="2" opacity="0.55" fill="none" strokeLinecap="round">
        <path d="M24 20c-3 8-3 18 1 27" />
        <path d="M40 20c3 8 3 18-1 27" />
      </g>
      <path d="M28 16c1.4-5 2.6-8 4-11 1.4 3 2.6 6 4 11z" fill={c.wol} />
      <path d="M31 8c-4-2.6-8-2.6-11 0 3.6 3 7.4 3.6 11 2z" fill={c.gr} />
      <path d="M33 8c4-2.6 8-2.6 11 0-3.6 3-7.4 3.6-11 2z" fill={c.grd} />
      <Gl c={c} cx={22} cy={26} rx={2.6} ry={7} r={16} o={0.45} />
    </>
  ),

  /** じゃがいも。芽のくぼみを2つ入れると、パンと見分けが付く。 */
  potato: (c) => (
    <>
      <Sh c={c} cy={54} rx={22} ry={4} />
      <path d="M13 30c-1-10 7-17 18-17 9 0 14 3 18 8s3 12-2 17-11 12-19 12-14-9-15-20z" fill={c.wol} />
      <path d="M31 13c9 0 14 3 18 8s3 12-2 17-11 12-19 12c8-4 12-11 13-19s-3-14-10-18z" fill={c.wo} />
      <g fill={c.wod} opacity="0.7">
        <ellipse cx="24" cy="25" rx="3" ry="2.2" transform="rotate(-20 24 25)" />
        <ellipse cx="37" cy="36" rx="2.6" ry="1.9" transform="rotate(24 37 36)" />
        <ellipse cx="20" cy="38" rx="2.2" ry="1.6" />
      </g>
      <Gl c={c} cx={22} cy={20} rx={6} ry={2.4} r={-24} o={0.45} />
    </>
  ),

  /** レモン。半分に切った面を正面に。房の割れ目を6本入れる。 */
  lemon: (c) => (
    <>
      <Sh c={c} cy={56} rx={20} ry={3.8} />
      <circle cx="32" cy="32" r="23" fill={c.yld} />
      <circle cx="32" cy="32" r="19.5" fill={c.cr} />
      <circle cx="32" cy="32" r="16.5" fill={c.yl} />
      <g stroke={c.cr} strokeWidth="2.6" strokeLinecap="round">
        <path d="M32 32 32 16M32 32l13.8 8M32 32l-13.8 8M32 32l13.8-8M32 32l-13.8-8M32 32v16" />
      </g>
      <circle cx="32" cy="32" r="2.6" fill={c.cr} />
      <path d="M46 12c5-3 10-2 13 1-4 4-9 5-13 3z" fill={c.gr} />
      <path d="M46 16c3.4-2 7-2.4 10-1" fill="none" stroke={c.grd} strokeWidth="1.6" strokeLinecap="round" />
      <Gl c={c} cx={22} cy={21} rx={5} ry={2.6} r={-32} o={0.5} />
    </>
  ),

  /** エプロン。首ひもと腰ひもで「身に着けるもの」だと分かる。 */
  apron: (c) => (
    <>
      <Sh c={c} cy={57} rx={20} ry={3.4} />
      <path d="M24 8a8 8 0 0 1 16 0" fill="none" stroke={c.crd} strokeWidth="3.4" strokeLinecap="round" />
      <path d="M23 11h18v13H23z" fill={c.rd} />
      <path d="M32 11h9v13h-9z" fill={c.rdd} />
      <path d="M14 26c0-2 3.6-3 9-3h18c5.4 0 9 1 9 3v22a8 8 0 0 1-8 8H22a8 8 0 0 1-8-8z" fill={c.rd} />
      <path d="M32 23h9c5.4 0 9 1 9 3v22a8 8 0 0 1-8 8h-10z" fill={c.rdd} />
      <g fill={c.crd}>
        <rect x="2" y="25" width="14" height="4.4" rx="2.2" transform="rotate(-8 9 27)" />
        <rect x="48" y="25" width="14" height="4.4" rx="2.2" transform="rotate(8 55 27)" />
      </g>
      <rect x="23" y="35" width="18" height="12" rx="3" fill={c.cr} />
      <rect x="23" y="35" width="18" height="3.4" rx="1.7" fill={c.w} opacity="0.7" />
      <Gl c={c} cx={20} cy={31} rx={2.4} ry={6} r={12} o={0.4} />
    </>
  ),

  /** オーブン。窓の中を橙にすると「焼いている途中」になる。 */
  oven: (c) => (
    <>
      <Sh c={c} cy={57} rx={26} ry={3.4} />
      <rect x="5" y="8" width="54" height="48" rx="7" fill={c.gy} />
      <path d="M52 8a7 7 0 0 1 7 7v34a7 7 0 0 1-7 7H32V8z" fill={c.gyd} />
      <g fill={c.bk}>
        <circle cx="14" cy="16" r="3.4" />
        <circle cx="25" cy="16" r="3.4" />
      </g>
      <circle cx="50" cy="16" r="4.6" fill={c.rd} />
      <rect x="10" y="24" width="44" height="6" rx="3" fill={c.w} />
      <rect x="10" y="24" width="44" height="2.6" rx="1.3" fill={c.wd} />
      <rect x="10" y="33" width="44" height="18" rx="4" fill={c.bk} />
      <rect x="13" y="36" width="38" height="12" rx="3" fill={c.or} />
      <rect x="13" y="36" width="38" height="5" rx="2.5" fill={c.gd} />
      <rect x="20" y="42" width="24" height="4" rx="2" fill={c.wod} />
      <Gl c={c} cx={13} cy={13} rx={5} ry={1.8} r={-6} o={0.5} />
    </>
  ),

  /** 冷蔵庫。白いままだと明るい下地で消えるので、扉を薄い水色にする。 */
  fridge: (c) => (
    <>
      <Sh c={c} cy={57} rx={17} ry={3.4} />
      <rect x="15" y="3" width="34" height="54" rx="6" fill={c.wd} />
      <path d="M43 3a6 6 0 0 1 6 6v42a6 6 0 0 1-6 6h-11V3z" fill={c.gy} />
      <rect x="15" y="21" width="34" height="3" fill={c.gyd} />
      <g fill={c.gyd}>
        <rect x="39" y="11" width="4" height="8" rx="2" />
        <rect x="39" y="27" width="4" height="12" rx="2" />
      </g>
      <rect x="20" y="8" width="12" height="9" rx="2.4" fill={c.sk} />
      <g fill={c.rd}>
        <circle cx="24" cy="31" r="3" />
      </g>
      <rect x="20" y="38" width="13" height="9" rx="2.4" fill={c.gd} />
      <Gl c={c} cx={20} cy={12} rx={2.2} ry={7} r={6} o={0.6} />
    </>
  ),

  /** お玉。柄を斜めにして、すくった汁を見せる。 */
  ladle: (c) => (
    <>
      <Sh c={c} cy={56} rx={17} ry={3.4} />
      <path d="M40 34 51 9" fill="none" stroke={c.gyd} strokeWidth="7" strokeLinecap="round" />
      <path d="M40 34 51 9" fill="none" stroke={c.gy} strokeWidth="3.4" strokeLinecap="round" />
      <path d="M53 7a4.6 4.6 0 1 1-3.4 8" fill="none" stroke={c.gy} strokeWidth="3.4" strokeLinecap="round" />
      <ellipse cx="26" cy="32" rx="16" ry="5" fill={c.or} />
      <ellipse cx="26" cy="31" rx="16" ry="5" fill={c.ord} />
      <path d="M10 32h32a16 16 0 0 1-32 0z" fill={c.gy} />
      <path d="M26 32h16a16 16 0 0 1-16 16z" fill={c.gyd} />
      <Gl c={c} cx={18} cy={38} rx={4.4} ry={2} r={-24} o={0.6} />
    </>
  ),

  /** レシピ帳。開いた面に、作るものの絵と手順の行。 */
  recipe: (c) => (
    <>
      <Sh c={c} cy={55} rx={26} ry={4} />
      <path d="M3 13c8-3 17-3 27 0v39c-10-3-19-3-27 0z" fill={c.w} />
      <path d="M61 13c-8-3-17-3-27 0v39c10-3 19-3 27 0z" fill={c.cr} />
      <rect x="28.6" y="11" width="6.8" height="42" rx="3.4" fill={c.rdd} />
      <g fill={c.rd}>
        <rect x="28.6" y="14" width="6.8" height="3" rx="1.5" />
        <rect x="28.6" y="24" width="6.8" height="3" rx="1.5" />
        <rect x="28.6" y="34" width="6.8" height="3" rx="1.5" />
        <rect x="28.6" y="44" width="6.8" height="3" rx="1.5" />
      </g>
      <ellipse cx="15" cy="26" rx="10" ry="4" fill={c.gy} />
      <path d="M5 25h20a10 10 0 0 1-20 0z" fill={c.gyd} />
      <path d="M12 17c1.6 2.4 2.6 3.6 2.6 5a2.6 2.6 0 0 1-5.2 0c0-1.4 1-2.6 2.6-5z" fill={c.gy} opacity="0.7" />
      <g fill={c.grd} opacity="0.5">
        <rect x="8" y="36" width="16" height="2.6" rx="1.3" />
        <rect x="8" y="43" width="12" height="2.6" rx="1.3" />
      </g>
      <g fill={c.crd}>
        <rect x="40" y="20" width="16" height="2.6" rx="1.3" />
        <rect x="40" y="28" width="14" height="2.6" rx="1.3" />
        <rect x="40" y="36" width="16" height="2.6" rx="1.3" />
        <rect x="40" y="44" width="10" height="2.6" rx="1.3" />
      </g>
      <Gl c={c} cx={12} cy={18} rx={5} ry={2} r={-14} o={0.5} />
    </>
  ),
};
