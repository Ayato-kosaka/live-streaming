import type { Draw } from "./bits";
import { Sh, Gl } from "./bits";

/** 天気と時間、それに火まわり。 */
export const nature: Record<string, Draw> = {
  sun: (c) => (
    <>
      <g stroke={c.yl} strokeWidth="6" strokeLinecap="round">
        <path d="M32 2v7" />
        <path d="M32 55v7" />
        <path d="M2 32h7" />
        <path d="M55 32h7" />
        <path d="m10.8 10.8 5 5" />
        <path d="m48.2 48.2 5 5" />
        <path d="m53.2 10.8-5 5" />
        <path d="m15.8 48.2-5 5" />
      </g>
      <circle cx="32" cy="32" r="17" fill={c.yld} />
      <circle cx="32" cy="31" r="17" fill={c.yl} />
      <Gl c={c} cx={25} cy={25} rx={4.4} ry={6.4} r={-36} o={0.6} />
    </>
  ),

  moon: (c) => (
    <>
      <path d="M38 5a27 27 0 1 0 20 36 21 21 0 0 1-20-36z" fill={c.crd} />
      <path d="M34 8a27 27 0 0 0-2 54 27 27 0 0 1 2-54z" fill={c.cr} />
      <g fill={c.crd} opacity="0.85">
        <circle cx="24" cy="24" r="4" />
        <circle cx="19" cy="38" r="3" />
        <circle cx="31" cy="44" r="2.4" />
      </g>
      <path d="m54 8 1.6 4 4 1.6-4 1.6-1.6 4-1.6-4-4-1.6 4-1.6z" fill={c.yl} />
      <Gl c={c} cx={22} cy={16} rx={3.4} ry={5} r={-30} o={0.5} />
    </>
  ),

  cloud: (c) => (
    <>
      {/* 雲の陰は灰ではなく空色寄り。白のままだと明るい下地で形が消える */}
      <path d="M17 47a13 13 0 0 1-1.6-25.9A16 16 0 0 1 45.3 18 12.5 12.5 0 0 1 47 47z" fill={c.w} />
      <path d="M32 47h15a12.5 12.5 0 0 0 1.7-24.9 16 16 0 0 0-16.7-9z" fill={c.gy} />
      <path d="M17 47a13 13 0 0 1-9.4-4h48a12.5 12.5 0 0 1-8.6 4z" fill={c.skd} opacity={c.flat ? 1 : 0.45} />
      <Gl c={c} cx={22} cy={28} rx={6} ry={3.4} r={-24} o={0.8} />
    </>
  ),

  rain: (c) => (
    <>
      <g fill={c.bl}>
        <path d="M18 44c2.4 3 3.6 4.6 3.6 6.4a3.6 3.6 0 0 1-7.2 0c0-1.8 1.2-3.4 3.6-6.4z" />
        <path d="M32 49c2.4 3 3.6 4.6 3.6 6.4a3.6 3.6 0 0 1-7.2 0c0-1.8 1.2-3.4 3.6-6.4z" />
        <path d="M46 44c2.4 3 3.6 4.6 3.6 6.4a3.6 3.6 0 0 1-7.2 0c0-1.8 1.2-3.4 3.6-6.4z" />
      </g>
      <path d="M17 40a12.6 12.6 0 0 1-1.6-25.1A15.6 15.6 0 0 1 44.6 11 12.2 12.2 0 0 1 46.2 40z" fill={c.w} />
      <path d="M32 40h14.2a12.2 12.2 0 0 0 1.6-24.3 15.6 15.6 0 0 0-16.2-8.8z" fill={c.wd} />
      <Gl c={c} cx={22} cy={22} rx={6} ry={3.2} r={-24} o={0.8} />
    </>
  ),

  snow: (c) => (
    <>
      <g stroke={c.sk} strokeWidth="5" strokeLinecap="round">
        <path d="M32 5v54" />
        <path d="M8.6 18.5 55.4 45.5" />
        <path d="M55.4 18.5 8.6 45.5" />
      </g>
      <g stroke={c.w} strokeWidth="4.4" strokeLinecap="round">
        <path d="M32 15 25 9M32 15l7-6M32 49l-7 6M32 49l7 6" />
        <path d="m17.5 23.4-8.8-1.6M17.5 23.4l-2-8.8M46.5 40.6l8.8 1.6M46.5 40.6l2 8.8" />
        <path d="m46.5 23.4 8.8-1.6M46.5 23.4l2-8.8M17.5 40.6l-8.8 1.6M17.5 40.6l-2 8.8" />
      </g>
      <circle cx="32" cy="32" r="6" fill={c.w} />
    </>
  ),

  /** 小さい火。たき火広場（campfire）と違って薪は無い。 */
  flame: (c) => (
    <>
      <Sh c={c} cy={56} rx={13} ry={3.2} />
      <path d="M32 3c1.6 8 7.2 10.6 11 16.6 4.2 6.6 3.8 15.4-1.8 20.6a16.4 16.4 0 0 1-24.6-21.8c1.6-2.4 2.6-4.4 3-6.8 2.6 2.4 4.1 5.2 4.5 8.4C26.2 14.8 30.4 9.4 32 3z" fill={c.or} />
      <path d="M32 3c1.6 8 7.2 10.6 11 16.6 4.2 6.6 3.8 15.4-1.8 20.6A16.3 16.3 0 0 1 32 44.6z" fill={c.ord} />
      <path d="M32 23c4.2 5 6.8 7.6 6.8 11.6a6.8 6.8 0 1 1-13.6 0c0-4 2.6-6.6 6.8-11.6z" fill={c.yl} />
      <Gl c={c} cx={25} cy={21} rx={2.6} ry={6} r={16} o={0.5} />
    </>
  ),

  /** ランタン。夜のあかり。 */
  light: (c) => (
    <>
      <Sh c={c} cy={57} rx={14} ry={3.2} />
      <path d="M24 12a8 8 0 0 1 16 0" fill="none" stroke={c.gyd} strokeWidth="3.4" strokeLinecap="round" />
      <path d="M20 12h24l-3 6H23z" fill={c.gyd} />
      <path d="M22 20h20l3 22a4 4 0 0 1-4 4.6H23A4 4 0 0 1 19 42z" fill={c.yl} />
      <path d="M32 20h10l3 22a4 4 0 0 1-4 4.6H32z" fill={c.yld} />
      <path d="M32 26c3.2 4 5 6 5 8.6a5 5 0 0 1-10 0c0-2.6 1.8-4.6 5-8.6z" fill={c.ord} />
      <path d="M17 47h30v5.4a2.6 2.6 0 0 1-2.6 2.6H19.6A2.6 2.6 0 0 1 17 52.4z" fill={c.gyd} />
      <Gl c={c} cx={24} cy={28} rx={2} ry={6} r={4} o={0.55} />
    </>
  ),

  tree: (c) => (
    <>
      <Sh c={c} cy={55} rx={17} ry={4} />
      <path d="M28 34h8l1.6 20H26.4z" fill={c.wo} />
      <path d="M32 34h4l1.6 20H32z" fill={c.wod} />
      <circle cx="32" cy="20" r="18" fill={c.gr} />
      <circle cx="19" cy="30" r="11" fill={c.gr} />
      <circle cx="45" cy="30" r="11" fill={c.gr} />
      {/* 右半分だけ暗くして、光が左上から当たっているように見せる */}
      <path d="M32 2a18 18 0 0 1 0 36zM45 19a11 11 0 0 1 0 22 11 11 0 0 1-8.4-3.9A18 18 0 0 0 45.6 30 18 18 0 0 0 41 18a11 11 0 0 1 4-1z" fill={c.grd} />
      <circle cx="24" cy="16" r="7" fill={c.grl} opacity="0.55" />
      <circle cx="40" cy="14" r="3.4" fill={c.rd} />
      <circle cx="22" cy="32" r="3" fill={c.rd} />
    </>
  ),

  /** 風。北欧の海風。線ではなく、流れる面で描く。 */
  wind: (c) => (
    <>
      <g fill={c.sk}>
        <path d="M4 18h30a7 7 0 1 0-6.8-8.6l-6.6-1.6A14 14 0 1 1 34 25H4z" />
      </g>
      <g fill={c.skd}>
        <path d="M4 33h38a6 6 0 1 1-5.8 7.6l-6.6 1.6A13 13 0 1 0 42 40H4z" />
      </g>
      <path d="M8 26h16a3.5 3.5 0 0 1 0 7H8a3.5 3.5 0 0 1 0-7z" fill={c.bl} />
    </>
  ),

  /** 虹。雨のあと。7色は多いので4本にまとめる。 */
  rainbow: (c) => (
    <>
      <g fill="none" strokeLinecap="round" strokeWidth="7">
        <path d="M6 48a26 26 0 0 1 52 0" stroke={c.rd} />
        <path d="M13 48a19 19 0 0 1 38 0" stroke={c.or} />
        <path d="M20 48a12 12 0 0 1 24 0" stroke={c.gr} />
        <path d="M27 48a5 5 0 0 1 10 0" stroke={c.bl} />
      </g>
      <g fill={c.w}>
        <circle cx="10" cy="49" r="7" />
        <circle cx="18" cy="52" r="6" />
        <circle cx="54" cy="49" r="7" />
        <circle cx="46" cy="52" r="6" />
      </g>
      <Gl c={c} cx={30} cy={26} rx={9} ry={2} r={-14} o={0.4} />
    </>
  ),

  /** オーロラ。北欧で見たいもの。帯を3枚重ねる。 */
  aurora: (c) => (
    <>
      <rect x="2" y="4" width="60" height="52" rx="12" fill={c.nv} />
      <g opacity={c.flat ? 1 : 0.9}>
        <path d="M8 40c2-16 8-26 14-26s6 12 12 12 8-10 14-10 6 8 8 14v6c-4-8-6-12-9-12s-6 10-13 10-7-10-12-10-9 8-11 22z" fill={c.gr} />
        <path d="M10 46c3-14 8-22 13-22s6 10 11 10 8-8 13-8 6 6 8 12v4c-4-6-5-9-8-9s-6 8-12 8-7-8-11-8-9 6-12 18z" fill={c.tl} opacity="0.85" />
        <path d="M14 52c3-10 7-16 11-16s5 8 9 8 7-6 11-6 5 4 7 8v4H14z" fill={c.pu} opacity="0.7" />
      </g>
      <g fill={c.w}>
        <circle cx="15" cy="14" r="1.8" />
        <circle cx="46" cy="12" r="2.2" />
        <circle cx="55" cy="22" r="1.6" />
        <circle cx="27" cy="9" r="1.4" />
      </g>
    </>
  ),

  /** 気温。旅先が暑いか寒いか。 */
  thermometer: (c) => (
    <>
      <Sh c={c} cy={57} rx={13} ry={3.2} />
      <path d="M32 4a8 8 0 0 1 8 8v22.5a13 13 0 1 1-16 0V12a8 8 0 0 1 8-8z" fill={c.w} />
      <path d="M32 4a8 8 0 0 1 8 8v22.5a13 13 0 0 1-8 23z" fill={c.wd} />
      <circle cx="32" cy="45" r="8.6" fill={c.rd} />
      <rect x="28.6" y="16" width="6.8" height="26" rx="3.4" fill={c.rd} />
      <path d="M32 16h3.4v26H32z" fill={c.rdd} />
      <g fill={c.gyd}>
        <rect x="41" y="18" width="7" height="2.4" rx="1.2" />
        <rect x="41" y="25" width="5" height="2.4" rx="1.2" />
        <rect x="41" y="32" width="7" height="2.4" rx="1.2" />
      </g>
      <Gl c={c} cx={28} cy={20} rx={1.4} ry={5} r={0} o={0.6} />
    </>
  ),

  /** 星空。夜の配信・北欧の冬。 */
  night: (c) => (
    <>
      <rect x="2" y="4" width="60" height="52" rx="12" fill={c.nv} />
      <path d="M42 10a17 17 0 1 0 12 21A18 18 0 0 1 42 10z" fill={c.cr} />
      <g fill={c.w}>
        <path d="m14 14 1.6 4 4 1.6-4 1.6L14 25.2l-1.6-4-4-1.6 4-1.6z" />
        <path d="m22 34 1.2 3 3 1.2-3 1.2L22 42.6l-1.2-3-3-1.2 3-1.2z" />
        <path d="m48 44 1.2 3 3 1.2-3 1.2L48 52.6l-1.2-3-3-1.2 3-1.2z" />
        <circle cx="34" cy="20" r="1.6" />
        <circle cx="11" cy="44" r="1.8" />
        <circle cx="36" cy="48" r="1.4" />
      </g>
      <Gl c={c} cx={46} cy={18} rx={3} ry={5} r={-26} o={0.35} />
    </>
  ),
};
