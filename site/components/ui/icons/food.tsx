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

  pan: (c) => (
    <>
      <Sh c={c} cy={50} rx={19} ry={4} />
      <rect x="38" y="17" width="26" height="8" rx="4" fill={c.wo} transform="rotate(-14 51 21)" />
      <ellipse cx="26" cy="36" rx="24" ry="11" fill={c.bk} />
      <ellipse cx="26" cy="34" rx="24" ry="11" fill={c.gyd} />
      <ellipse cx="26" cy="34" rx="18.5" ry="7.6" fill={c.bk} />
      <ellipse cx="20" cy="31.5" rx="6" ry="2.4" fill={c.w} opacity={c.flat ? 1 : 0.22} />
      <Gl c={c} cx={10} cy={33} rx={2} ry={4} r={0} o={0.4} />
    </>
  ),

  knife: (c) => (
    <>
      <Sh c={c} cy={56} rx={20} ry={3.4} />
      <path d="M9 34 40 9c2.6-2 5.4 1.4 5.4 8.4 0 6.6-2.6 13-8 16.6z" fill={c.gy} />
      <path d="M9 34h28.4c-2.6 1.6-5.6 2.4-9 2.4H9z" fill={c.gyd} />
      <rect x="38" y="32" width="24" height="10" rx="4.4" fill={c.br} transform="rotate(24 50 37)" />
      <rect x="36" y="31" width="6" height="10" rx="2.4" fill={c.gyd} transform="rotate(24 39 36)" />
      <Gl c={c} cx={26} cy={22} rx={12} ry={1.8} r={-38} o={0.55} />
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

  chopsticks: (c) => (
    <>
      <Sh c={c} cy={56} rx={16} ry={3.2} />
      <rect x="6" y="6" width="7" height="52" rx="3.5" fill={c.wo} transform="rotate(-14 9.5 32)" />
      <rect x="6" y="6" width="4.6" height="52" rx="2.3" fill={c.wod} transform="rotate(-14 8.3 32)" />
      <rect x="46" y="6" width="7" height="52" rx="3.5" fill={c.wo} transform="rotate(11 49.5 32)" />
      <rect x="48.4" y="6" width="4.6" height="52" rx="2.3" fill={c.wod} transform="rotate(11 50.7 32)" />
      <ellipse cx="32" cy="49" rx="17" ry="6" fill={c.crd} />
      <ellipse cx="32" cy="47.4" rx="17" ry="6" fill={c.cr} />
      <Gl c={c} cx={24} cy={46} rx={5} ry={1.6} r={-6} o={0.6} />
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
      <path d="M24 8c1.6 5 6 6.6 6 12a6 6 0 0 1-12 0c0-2.6 1.2-4 2-6 1 1.4 1.6 2.2 2.4 2.8-.4-3.4.6-6.6 1.6-8.8z" fill={c.bl} />
      <path d="M24 18c1.4 2 2.4 3 2.4 4.6a2.4 2.4 0 0 1-4.8 0c0-1.6 1-2.6 2.4-4.6z" fill={c.sk} />
      <Gl c={c} cx={12} cy={39} rx={2.4} ry={5} r={0} o={0.4} />
    </>
  ),

  plate: (c) => (
    <>
      <Sh c={c} cy={48} rx={25} ry={4.4} />
      <ellipse cx="32" cy="34" rx="28" ry="14" fill={c.wd} />
      <ellipse cx="32" cy="31.6" rx="28" ry="14" fill={c.w} />
      <ellipse cx="32" cy="31.6" rx="19" ry="8.6" fill={c.wd} />
      <ellipse cx="32" cy="31" rx="19" ry="8.6" fill={c.cr} />
      <Gl c={c} cx={17} cy={26} rx={9} ry={2.6} r={-10} o={0.85} />
    </>
  ),

  bowl: (c) => (
    <>
      <Sh c={c} cy={54} rx={22} ry={4.2} />
      <Steam c={c} x={32} y={2} />
      <ellipse cx="32" cy="27" rx="21" ry="7" fill={c.w} />
      <ellipse cx="32" cy="25.6" rx="16" ry="5" fill={c.cr} />
      <path d="M7 25h50c0 13.6-11.2 24-25 24S7 38.6 7 25z" fill={c.w} />
      <path d="M32 25h25c0 13.6-11.2 24-25 24z" fill={c.wd} />
      <path d="M12 30h40c-1.4 4.6-4 8.4-7.4 11H19.4A25 25 0 0 1 12 30z" fill={c.bl} opacity={c.flat ? 1 : 0.28} />
      <Gl c={c} cx={17} cy={33} rx={3} ry={7} r={22} o={0.6} />
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

  meat: (c) => (
    <>
      <Sh c={c} cy={55} rx={21} ry={3.8} />
      <g fill={c.cr}>
        <circle cx="12" cy="17" r="6.4" />
        <circle cx="12" cy="27" r="6.4" />
        <rect x="8" y="17" width="9" height="10" />
      </g>
      <path d="M18 16c14-8 34-4 38 9 4 13-9 25-23 25-12 0-21-9-21-19 0-6 2-11 6-15z" fill={c.pk} />
      <path d="M32 12.4c9 .6 20 5 24 12.6 4 13-9 25-23 25-1.4 0-2.7-.1-4-.3z" fill={c.pkd} />
      <path d="M26 24c7-4 15-3 19 3-6-2-13-2-19-3z" fill={c.w} opacity={c.flat ? 1 : 0.55} />
      <Gl c={c} cx={26} cy={20} rx={7} ry={2.4} r={-18} o={0.5} />
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

  eat: (c) => (
    <>
      <Sh c={c} cy={57} rx={19} ry={3.2} />
      <path d="M12 6h4.4v14h3V6h4.4v14h3V6H31v18c0 5-2.6 8-6 9v23a3 3 0 0 1-3 3h-1a3 3 0 0 1-3-3V33c-3.4-1-6-4-6-9z" fill={c.gy} />
      <path d="M44 6c6 2 9 10 9 19 0 7-2.4 12-6 14v17a3 3 0 0 1-3 3h-1a3 3 0 0 1-3-3V6z" fill={c.gy} />
      <path d="M22 6h1.4v14h3V6H31v18c0 5-2.6 8-6 9v23a3 3 0 0 1-3 3z" fill={c.gyd} />
      <path d="M47 8c3.4 3.4 5 9.4 5 16 0 7-2 12-5.6 14v18a3 3 0 0 1-2.4 2.9V6z" fill={c.gyd} />
      <Gl c={c} cx={16} cy={12} rx={1.4} ry={5} r={0} o={0.6} />
    </>
  ),
};
