import type { Draw } from "./bits";
import { Sh, Gl } from "./bits";

/** 気持ちと反応の印。👍の代わりに使う。 */
export const feel: Record<string, Draw> = {
  heart: (c) => (
    <>
      <Sh c={c} cy={56} rx={17} ry={3.2} />
      <path d="M32 55C15 42 6 33.6 6 23.6 6 15.8 12 10 19.6 10c5 0 9.6 2.6 12.4 6.6C34.8 12.6 39.4 10 44.4 10 52 10 58 15.8 58 23.6 58 33.6 49 42 32 55z" fill={c.rd} />
      <path d="M32 16.6C34.8 12.6 39.4 10 44.4 10 52 10 58 15.8 58 23.6 58 33.6 49 42 32 55z" fill={c.rdd} />
      <Gl c={c} cx={19} cy={22} rx={6} ry={3.6} r={-38} o={0.6} />
    </>
  ),

  star: (c) => (
    <>
      <Sh c={c} cy={56} rx={18} ry={3.2} />
      <path
        d="m32 4 8.4 17 18.8 2.7-13.6 13.3 3.2 18.7L32 46.9 15.2 55.7l3.2-18.7L4.8 23.7 23.6 21z"
        fill={c.gd}
        stroke={c.gd}
        strokeWidth="3.4"
        strokeLinejoin="round"
      />
      <path d="m32 4 8.4 17 18.8 2.7-13.6 13.3 3.2 18.7L32 46.9z" fill={c.gdd} />
      <Gl c={c} cx={22} cy={18} rx={3.6} ry={5.6} r={-34} o={0.55} />
    </>
  ),

  clap: (c) => (
    <>
      <g fill={c.yl}>
        <path d="m9 8 1.6 4 4 1.6-4 1.6L9 19.2l-1.6-4-4-1.6 4-1.6z" />
        <path d="m56 12 1.3 3.2 3.2 1.3-3.2 1.3L56 21l-1.3-3.2-3.2-1.3 3.2-1.3z" />
        <path d="m32 3 1.4 3.4 3.4 1.4-3.4 1.4L32 12.6l-1.4-3.4L27.2 7.8l3.4-1.4z" />
      </g>
      <Sh c={c} cy={58} rx={19} ry={3.2} />
      {/* 奥の手。指を4本出さないと、丸い塊にしか見えない */}
      <g transform="rotate(-26 26 40)">
        <g fill={c.snd}>
          <rect x="13" y="17" width="5.4" height="16" rx="2.7" />
          <rect x="19.4" y="14" width="5.4" height="19" rx="2.7" />
          <rect x="25.8" y="15" width="5.4" height="18" rx="2.7" />
          <rect x="32.2" y="18" width="5.4" height="15" rx="2.7" />
          <rect x="12" y="26" width="26" height="22" rx="9" />
        </g>
        <rect x="9" y="43" width="32" height="13" rx="6" fill={c.bld} />
      </g>
      {/* 手前の手。明るい肌にして、奥の手と面で分ける */}
      <g transform="rotate(24 38 40)">
        <g fill={c.sn}>
          <rect x="26" y="15" width="5.4" height="16" rx="2.7" />
          <rect x="32.4" y="12" width="5.4" height="19" rx="2.7" />
          <rect x="38.8" y="13" width="5.4" height="18" rx="2.7" />
          <rect x="45.2" y="16" width="5.4" height="15" rx="2.7" />
          <rect x="25" y="24" width="26" height="22" rx="9" />
        </g>
        <g fill={c.snd} opacity="0.7">
          <rect x="31" y="31" width="14" height="2.4" rx="1.2" />
          <rect x="31" y="37" width="14" height="2.4" rx="1.2" />
        </g>
        <rect x="22" y="41" width="32" height="13" rx="6" fill={c.bl} />
      </g>
    </>
  ),

  /** ひらめき。 */
  idea: (c) => (
    <>
      <Sh c={c} cy={57} rx={12} ry={3} />
      <g stroke={c.yl} strokeWidth="4.4" strokeLinecap="round">
        <path d="M32 2v5" />
        <path d="M11 11.6 14.6 15" />
        <path d="M53 11.6 49.4 15" />
        <path d="M5 30h5" />
        <path d="M59 30h-5" />
      </g>
      <circle cx="32" cy="26" r="16" fill={c.yl} />
      <path d="M32 10a16 16 0 0 1 0 32z" fill={c.yld} />
      <path d="M24 38h16v5a3 3 0 0 1-3 3H27a3 3 0 0 1-3-3z" fill={c.gyd} />
      <path d="M26 48h12v2.6a3 3 0 0 1-3 3h-6a3 3 0 0 1-3-3z" fill={c.gy} />
      <path d="M28 34c0-4-3-6-3-9a7 7 0 0 1 14 0c0 3-3 5-3 9z" fill={c.w} opacity={c.flat ? 1 : 0.6} />
      <Gl c={c} cx={24} cy={19} rx={3.4} ry={5} r={-34} o={0.6} />
    </>
  ),

  question: (c) => (
    <>
      <Sh c={c} cy={57} rx={17} ry={3.2} />
      <circle cx="32" cy="30" r="27" fill={c.pud} />
      <circle cx="32" cy="28.6" r="27" fill={c.pu} />
      <path
        d="M22.6 22.6a9.6 9.6 0 0 1 18.8 3c0 6-7.6 7-7.6 12.4"
        fill="none"
        stroke={c.w}
        strokeWidth="6.4"
        strokeLinecap="round"
      />
      <circle cx="33.4" cy="45.6" r="4" fill={c.w} />
      <Gl c={c} cx={20} cy={17} rx={5} ry={7.4} r={40} o={0.35} />
    </>
  ),

  alert: (c) => (
    <>
      <Sh c={c} cy={56} rx={22} ry={3.4} />
      <path d="M27.2 7.4a5.6 5.6 0 0 1 9.6 0l24 40A5.6 5.6 0 0 1 56 56H8a5.6 5.6 0 0 1-4.8-8.6z" fill={c.yld} />
      <path d="M27.2 7.4a5.6 5.6 0 0 1 9.6 0l24 40A5.6 5.6 0 0 1 56 56H32z" fill={c.yl} />
      <path d="M32 7.4a5.6 5.6 0 0 0-4.8 2.6l-24 40A5.6 5.6 0 0 0 8 56h24z" fill={c.yl} />
      <rect x="28" y="20" width="8" height="19" rx="4" fill={c.bk} />
      <circle cx="32" cy="46" r="4.4" fill={c.bk} />
      <Gl c={c} cx={22} cy={30} rx={2.4} ry={8} r={16} o={0.35} />
    </>
  ),

  crown: (c) => (
    <>
      <Sh c={c} cy={55} rx={20} ry={3.4} />
      <path d="M6 18.6 18 30l11-16a3.6 3.6 0 0 1 6 0l11 16 12-11.4a2.8 2.8 0 0 1 4.7 2.5L57 47H7L2.3 21.1a2.8 2.8 0 0 1 4.7-2.5z" fill={c.gd} />
      <path d="M32 12.4c1.2 0 2.4.6 3 1.6l11 16 12-11.4a2.8 2.8 0 0 1 4.7 2.5L57 47H32z" fill={c.gdd} />
      <rect x="6" y="45" width="52" height="8" rx="3.4" fill={c.gd} />
      <rect x="32" y="45" width="26" height="8" rx="3.4" fill={c.gdd} />
      <g>
        <circle cx="32" cy="26" r="3.6" fill={c.rd} />
        <circle cx="13" cy="30" r="3" fill={c.tl} />
        <circle cx="51" cy="30" r="3" fill={c.tl} />
      </g>
      <Gl c={c} cx={16} cy={28} rx={2.4} ry={5} r={16} o={0.5} />
    </>
  ),

  medal: (c) => (
    <>
      <Sh c={c} cy={58} rx={14} ry={3} />
      <path d="M14 4h11l10 22H24z" fill={c.bl} />
      <path d="M50 4H39L29 26h11z" fill={c.rd} />
      <circle cx="32" cy="41" r="19" fill={c.gdd} />
      <circle cx="32" cy="39.6" r="19" fill={c.gd} />
      <circle cx="32" cy="39.6" r="13.6" fill={c.yl} />
      <path d="m32 30 2.7 5.5 6 .9-4.3 4.2 1 6-5.4-2.8-5.4 2.8 1-6-4.3-4.2 6-.9z" fill={c.gdd} />
      <Gl c={c} cx={22} cy={31} rx={5} ry={2.4} r={-32} o={0.55} />
    </>
  ),

  trophy: (c) => (
    <>
      <Sh c={c} cy={57} rx={17} ry={3.2} />
      <path d="M12 12H4v6a12 12 0 0 0 12 12v-6a6 6 0 0 1-6-6z" fill={c.gdd} />
      <path d="M52 12h8v6a12 12 0 0 1-12 12v-6a6 6 0 0 0 6-6z" fill={c.gdd} />
      <path d="M13 6h38v16c0 10.5-8.5 19-19 19s-19-8.5-19-19z" fill={c.gd} />
      <path d="M32 6h19v16c0 10.5-8.5 19-19 19z" fill={c.gdd} />
      <rect x="27" y="39" width="10" height="9" rx="3" fill={c.gdd} />
      <rect x="16" y="47" width="32" height="9" rx="4" fill={c.gd} />
      <rect x="32" y="47" width="16" height="9" rx="4" fill={c.gdd} />
      <path d="m32 14 2.6 5.4 6 .9-4.3 4.1 1 5.9-5.3-2.8-5.3 2.8 1-5.9-4.3-4.1 6-.9z" fill={c.yl} />
      <Gl c={c} cx={20} cy={15} rx={2.6} ry={7} r={12} o={0.5} />
    </>
  ),

  talk: (c) => (
    <>
      <Sh c={c} cy={57} rx={20} ry={3.2} />
      <path d="M26 20h26a8 8 0 0 1 8 8v13a8 8 0 0 1-8 8h-4v8.4L36 49h-10a8 8 0 0 1-8-8V28a8 8 0 0 1 8-8z" fill={c.tl} />
      <path d="M40 20h12a8 8 0 0 1 8 8v13a8 8 0 0 1-8 8h-4v8.4L40 49z" fill={c.tld} />
      {/* 手前の吹き出しは暖色にする。白いままだと明るい下地で縁が消える */}
      <path d="M11 4h27a8 8 0 0 1 8 8v11a8 8 0 0 1-8 8H21l-9 7.4V31h-1a8 8 0 0 1-8-8V12a8 8 0 0 1 8-8z" fill={c.or} />
      <path d="M32 4h6a8 8 0 0 1 8 8v11a8 8 0 0 1-8 8H21z" fill={c.ord} />
      <g fill={c.w}>
        <circle cx="17" cy="17" r="3" />
        <circle cx="25" cy="17" r="3" />
        <circle cx="33" cy="17" r="3" />
      </g>
      <Gl c={c} cx={14} cy={9} rx={5} ry={1.8} r={-4} o={0.5} />
    </>
  ),

  bell: (c) => (
    <>
      <Sh c={c} cy={57} rx={17} ry={3.2} />
      <rect x="28" y="3" width="8" height="7" rx="4" fill={c.gyd} />
      <path d="M32 8a17 17 0 0 1 17 17v11l4.4 6a2.6 2.6 0 0 1-2.1 4.2H12.7a2.6 2.6 0 0 1-2.1-4.2l4.4-6V25A17 17 0 0 1 32 8z" fill={c.gd} />
      <path d="M32 8a17 17 0 0 1 17 17v11l4.4 6a2.6 2.6 0 0 1-2.1 4.2H32z" fill={c.gdd} />
      <path d="M25 48h14a7 7 0 0 1-14 0z" fill={c.gdd} />
      <Gl c={c} cx={22} cy={22} rx={3} ry={8} r={22} o={0.5} />
    </>
  ),

  gift: (c) => (
    <>
      <Sh c={c} cy={57} rx={22} ry={3.4} />
      <path d="M22.4 20c-6 0-9.4-3-9.4-7.2S16 6 20.4 6c5.4 0 9 4.6 11.6 14z" fill={c.pk} />
      <path d="M41.6 20c6 0 9.4-3 9.4-7.2S48 6 43.6 6C38.2 6 34.6 10.6 32 20z" fill={c.pkd} />
      <rect x="4" y="19" width="56" height="14" rx="4" fill={c.rd} />
      <rect x="32" y="19" width="28" height="14" rx="4" fill={c.rdd} />
      <rect x="9" y="33" width="46" height="23" rx="4" fill={c.rd} />
      <rect x="32" y="33" width="23" height="23" rx="4" fill={c.rdd} />
      <rect x="26" y="19" width="12" height="37" fill={c.yl} />
      <rect x="32" y="19" width="6" height="37" fill={c.yld} />
      <Gl c={c} cx={14} cy={23} rx={6} ry={1.8} r={-4} o={0.4} />
    </>
  ),

  coin: (c) => (
    <>
      <Sh c={c} cy={56} rx={19} ry={3.4} />
      <circle cx="32" cy="33" r="25" fill={c.gdd} />
      <circle cx="32" cy="31" r="25" fill={c.gd} />
      <circle cx="32" cy="31" r="18.5" fill={c.yl} />
      <path d="m32 18 3.6 7.3 8 1.2-5.8 5.7 1.4 8-7.2-3.8-7.2 3.8 1.4-8-5.8-5.7 8-1.2z" fill={c.gdd} />
      <Gl c={c} cx={20} cy={21} rx={7} ry={3} r={-32} o={0.6} />
    </>
  ),
};
