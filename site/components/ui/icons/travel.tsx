import type { Draw } from "./bits";
import { Sh, Gl } from "./bits";

/**
 * 旅の道具と乗り物。
 *
 * 「ヒッチハイクの親指」は絵文字の👍の置き換えなので、記号ではなく
 * ちゃんと手として描く（肌・袖・関節）。ここが安っぽいと旅のページ全体が安く見える。
 */

export const travel: Record<string, Draw> = {
  backpack: (c) => (
    <>
      <Sh c={c} cy={55} rx={19} ry={4.2} />
      <path d="M22 22v-7a10 10 0 0 1 20 0v7h-6v-7a4 4 0 0 0-8 0v7z" fill={c.brd} />
      <rect x="11" y="18" width="42" height="37" rx="11" fill={c.gr} />
      <path d="M42 18a11 11 0 0 1 11 11v15a11 11 0 0 1-11 11H32V18z" fill={c.grd} />
      <path d="M22 18h20a11 11 0 0 1 11 11v3H11v-3a11 11 0 0 1 11-11z" fill={c.grd} />
      <rect x="26" y="27" width="12" height="8" rx="2.6" fill={c.gd} />
      <rect x="19" y="38" width="26" height="14" rx="4" fill={c.grl} />
      <rect x="27" y="43" width="10" height="3.4" rx="1.7" fill={c.grd} />
      <Gl c={c} cx={18} cy={25} rx={2.8} ry={6} r={22} o={0.4} />
    </>
  ),

  sleepingbag: (c) => (
    <>
      <Sh c={c} cy={52} rx={22} ry={4} />
      <rect x="10" y="19" width="46" height="28" rx="14" fill={c.bl} />
      <path d="M42 19h0a14 14 0 0 1 14 14 14 14 0 0 1-14 14z" fill={c.bld} />
      <ellipse cx="24" cy="33" rx="9" ry="14" fill={c.bld} />
      <ellipse cx="24" cy="33" rx="5.4" ry="8.6" fill={c.sk} />
      <ellipse cx="24" cy="33" rx="2" ry="3.4" fill={c.bld} />
      <rect x="36" y="17" width="5" height="32" rx="2.5" fill={c.brd} />
      <rect x="48" y="17" width="5" height="32" rx="2.5" fill={c.brd} />
      <Gl c={c} cx={30} cy={23} rx={7} ry={2.2} r={-6} o={0.4} />
    </>
  ),

  compass: (c) => (
    <>
      <Sh c={c} cy={56} rx={19} ry={4} />
      <circle cx="32" cy="32" r="26" fill={c.gyd} />
      <circle cx="32" cy="32" r="21.5" fill={c.cr} />
      <g fill={c.gyd}>
        <rect x="30.8" y="12" width="2.4" height="4.6" rx="1.2" />
        <rect x="30.8" y="47.4" width="2.4" height="4.6" rx="1.2" />
        <rect x="12" y="30.8" width="4.6" height="2.4" rx="1.2" />
        <rect x="47.4" y="30.8" width="4.6" height="2.4" rx="1.2" />
      </g>
      <path d="M32 13 40 32l-8-3.4L24 32z" fill={c.rd} />
      <path d="M32 51 24 32l8 3.4L40 32z" fill={c.w} />
      <circle cx="32" cy="32" r="3.4" fill={c.gd} />
      <Gl c={c} cx={21} cy={20} rx={4.6} ry={8} r={40} o={0.45} />
    </>
  ),

  map: (c) => (
    <>
      <Sh c={c} cy={57} rx={22} ry={3.6} />
      <path d="M6 15 23 8v41L6 56z" fill={c.cr} />
      <path d="M25 8l14 7v41l-14-7z" fill={c.crd} />
      <path d="M41 15 58 8v41l-17 7z" fill={c.cr} />
      <path d="M9 42c6-6 6-14 12-16s10 6 16 3 8-14 14-16" fill="none" stroke={c.rd} strokeWidth="3" strokeLinecap="round" strokeDasharray="1 6" />
      <path d="M12 20c5 2 8 0 11 2" fill="none" stroke={c.sk} strokeWidth="3.4" strokeLinecap="round" />
      <ellipse cx="47" cy="26" rx="7" ry="4.4" fill={c.grl} opacity="0.9" />
      <path d="M50 34a5.6 5.6 0 0 1 5.6 5.6c0 4-5.6 10.4-5.6 10.4s-5.6-6.4-5.6-10.4A5.6 5.6 0 0 1 50 34z" fill={c.rdd} />
      <circle cx="50" cy="39.6" r="2.2" fill={c.w} />
    </>
  ),

  passport: (c) => (
    <>
      <Sh c={c} cy={56} rx={17} ry={3.8} />
      <rect x="18" y="8" width="33" height="46" rx="4" fill={c.cr} />
      <rect x="13" y="6" width="34" height="49" rx="5" fill={c.nv} />
      <circle cx="30" cy="24" r="7.6" fill={c.gd} />
      <path d="M30 17.6c3 3 3 9.8 0 12.8-3-3-3-9.8 0-12.8z" fill={c.nv} opacity="0.55" />
      <rect x="22.4" y="23" width="15.2" height="2" rx="1" fill={c.nv} opacity="0.55" />
      <rect x="20" y="38" width="20" height="3.4" rx="1.7" fill={c.gd} />
      <rect x="23" y="45" width="14" height="3" rx="1.5" fill={c.gd} opacity="0.7" />
      <Gl c={c} cx={19} cy={14} rx={2.6} ry={6} r={24} o={0.28} />
    </>
  ),

  ticket: (c) => (
    <>
      <Sh c={c} cy={54} rx={24} ry={3.8} />
      <path d="M8 14h48a4 4 0 0 1 4 4v6a8 8 0 0 0 0 16v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-6a8 8 0 0 0 0-16v-6a4 4 0 0 1 4-4z" fill={c.yl} />
      <path d="M8 38h48c1.4 0 2.8.6 3.8 1.6V46a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-6.4c1-1 2.4-1.6 4-1.6z" fill={c.yld} />
      <path d="M42 16v32" stroke={c.yld} strokeWidth="2.6" strokeLinecap="round" strokeDasharray="3 5" />
      <path d="m22 20 3.3 6.7 7.4 1-5.4 5.2 1.3 7.3L22 36.8l-6.6 3.4 1.3-7.3-5.4-5.2 7.4-1z" fill={c.w} />
      <Gl c={c} cx={16} cy={19} rx={7} ry={2} r={-4} o={0.45} />
    </>
  ),

  /** ヒッチハイクの親指。👍の代わり。記号ではなく手として描く。 */
  thumb: (c) => (
    <>
      <Sh c={c} cy={57} rx={17} ry={3.6} />
      <rect x="21" y="4" width="13" height="27" rx="6.5" fill={c.sn} transform="rotate(-7 27.5 17.5)" />
      <rect x="18" y="25" width="30" height="25" rx="10" fill={c.sn} />
      <path d="M38 25h0a10 10 0 0 1 10 10v5a10 10 0 0 1-10 10z" fill={c.snd} />
      <g fill={c.snd} opacity="0.85">
        <rect x="31" y="32" width="15" height="2.6" rx="1.3" />
        <rect x="31" y="38" width="15" height="2.6" rx="1.3" />
      </g>
      <rect x="14" y="44" width="36" height="14" rx="6" fill={c.bl} />
      <rect x="14" y="44" width="36" height="5" rx="2.5" fill={c.sk} opacity="0.8" />
      <Gl c={c} cx={24} cy={13} rx={2.4} ry={6} r={12} o={0.45} />
    </>
  ),

  road: (c) => (
    <>
      <ellipse cx="32" cy="52" rx="30" ry="10" fill={c.gr} opacity={c.flat ? 1 : 0.9} />
      <path d="M9 58 24 11a3.4 3.4 0 0 1 3.3-2.4h9.4A3.4 3.4 0 0 1 40 11l15 47z" fill={c.gyd} />
      <g fill={c.cr}>
        <rect x="30.6" y="12" width="2.8" height="7" rx="1.4" />
        <rect x="30.2" y="24" width="3.6" height="8" rx="1.8" />
        <rect x="29.5" y="37" width="5" height="9" rx="2.5" />
        <rect x="28.6" y="51" width="6.8" height="7" rx="3" />
      </g>
    </>
  ),

  signpost: (c) => (
    <>
      <Sh c={c} cy={56} rx={13} ry={3.4} />
      <rect x="29" y="12" width="6.5" height="44" rx="3" fill={c.wod} />
      <path d="M13 14h21a2.4 2.4 0 0 1 2.4 2.4v7.2A2.4 2.4 0 0 1 34 26H13l-6-6z" fill={c.gr} />
      <path d="M30 30h21l6 6-6 6H30a2.4 2.4 0 0 1-2.4-2.4v-7.2A2.4 2.4 0 0 1 30 30z" fill={c.or} />
      <rect x="14" y="19" width="14" height="2.6" rx="1.3" fill={c.w} opacity="0.85" />
      <rect x="34" y="35" width="14" height="2.6" rx="1.3" fill={c.w} opacity="0.85" />
      <Gl c={c} cx={30.5} cy={18} rx={1.4} ry={4} r={0} o={0.35} />
    </>
  ),

  camper: (c) => (
    <>
      <Sh c={c} cy={55} rx={26} ry={3.8} />
      <rect x="4" y="14" width="52" height="30" rx="7" fill={c.cr} />
      <path d="M56 14a0 0 0 0 1 0 0v30H32V14z" fill={c.crd} />
      <rect x="4" y="27" width="52" height="6" fill={c.tl} />
      <rect x="9" y="18" width="14" height="8" rx="2.4" fill={c.sk} />
      <rect x="27" y="18" width="11" height="8" rx="2.4" fill={c.sk} />
      <rect x="42" y="34" width="10" height="10" rx="2.4" fill={c.br} />
      <path d="M4 10h30l-4 5H4z" fill={c.rd} />
      <circle cx="18" cy="45" r="7" fill={c.bk} />
      <circle cx="18" cy="45" r="3" fill={c.gy} />
      <circle cx="45" cy="45" r="7" fill={c.bk} />
      <circle cx="45" cy="45" r="3" fill={c.gy} />
      <Gl c={c} cx={12} cy={19} rx={5} ry={1.8} r={-4} o={0.4} />
    </>
  ),

  train: (c) => (
    <>
      <Sh c={c} cy={57} rx={19} ry={3.4} />
      <rect x="11" y="5" width="42" height="43" rx="9" fill={c.gr} />
      <path d="M44 5a9 9 0 0 1 9 9v25a9 9 0 0 1-9 9H32V5z" fill={c.grd} />
      <rect x="16" y="11" width="32" height="15" rx="4" fill={c.sk} />
      <rect x="14" y="40" width="36" height="8" rx="2.6" fill={c.gyd} />
      <circle cx="21" cy="33" r="3.6" fill={c.yl} />
      <circle cx="43" cy="33" r="3.6" fill={c.yl} />
      <rect x="16" y="49" width="8" height="6" rx="2.4" fill={c.bk} />
      <rect x="40" y="49" width="8" height="6" rx="2.4" fill={c.bk} />
      <Gl c={c} cx={20} cy={13} rx={5} ry={2} r={-6} o={0.5} />
    </>
  ),

  bus: (c) => (
    <>
      <Sh c={c} cy={55} rx={25} ry={3.8} />
      <rect x="4" y="11" width="56" height="34" rx="8" fill={c.yl} />
      <path d="M52 11a8 8 0 0 1 8 8v18a8 8 0 0 1-8 8H32V11z" fill={c.yld} />
      <g fill={c.sk}>
        <rect x="9" y="17" width="13" height="11" rx="3" />
        <rect x="25.5" y="17" width="13" height="11" rx="3" />
        <rect x="42" y="17" width="13" height="11" rx="3" />
      </g>
      <rect x="8" y="33" width="48" height="4" rx="2" fill={c.rd} />
      <circle cx="17" cy="46" r="7" fill={c.bk} />
      <circle cx="17" cy="46" r="3" fill={c.gy} />
      <circle cx="47" cy="46" r="7" fill={c.bk} />
      <circle cx="47" cy="46" r="3" fill={c.gy} />
      <Gl c={c} cx={12} cy={16} rx={6} ry={1.8} r={-3} o={0.45} />
    </>
  ),

  ferry: (c) => (
    <>
      <rect x="1" y="42" width="62" height="17" rx="8" fill={c.sk} />
      <path d="M3 50c6-3.4 10 3.4 16 0s10 3.4 16 0 10 3.4 16 0 6 0 10-1.6v4c-4 2.6-8 0-12 1.6-6 2.6-10-3.4-16 0s-10-3.4-16 0-10 3.4-16 0z" fill={c.w} opacity="0.5" />
      <rect x="30" y="6" width="6" height="12" rx="2.4" fill={c.rdd} />
      <rect x="16" y="17" width="32" height="16" rx="3.4" fill={c.w} />
      <path d="M32 17h12.6a3.4 3.4 0 0 1 3.4 3.4v9.2a3.4 3.4 0 0 1-3.4 3.4H32z" fill={c.wd} />
      <g fill={c.sk}>
        <rect x="20" y="21" width="6" height="6" rx="2" />
        <rect x="29" y="21" width="6" height="6" rx="2" />
        <rect x="38" y="21" width="6" height="6" rx="2" />
      </g>
      <path d="M6 33h52l-6.6 13.2A4 4 0 0 1 47.8 48H16.2a4 4 0 0 1-3.6-1.8z" fill={c.rd} />
      <path d="M32 33h26l-6.6 13.2A4 4 0 0 1 47.8 48H32z" fill={c.rdd} />
      <Gl c={c} cx={16} cy={37} rx={7} ry={1.8} r={-4} o={0.4} />
    </>
  ),

  plane: (c) => (
    <>
      <Sh c={c} cy={58} rx={13} ry={3} />
      <path d="M32 3c3.4 0 5.6 4.4 6 10.4l.5 8.2L60 34.4v6.2l-21.5-5.8-.7 12.4 7.6 5.4v4.4L32 53.4 18.6 57v-4.4l7.6-5.4-.7-12.4L4 40.6v-6.2l21.5-12.8.5-8.2C26.4 7.4 28.6 3 32 3z" fill={c.w} />
      <path d="M32 3c3.4 0 5.6 4.4 6 10.4l.5 8.2L60 34.4v6.2l-21.5-5.8-.7 12.4 7.6 5.4v4.4L32 53.4z" fill={c.wd} />
      <path d="M29 15h6l.4 7h-6.8z" fill={c.bl} />
      <circle cx="32" cy="26" r="2.4" fill={c.sk} />
      <Gl c={c} cx={27} cy={16} rx={1.8} ry={5} r={8} o={0.6} />
    </>
  ),

  bike: (c) => (
    <>
      <Sh c={c} cy={56} rx={26} ry={3.4} />
      <g fill="none" stroke={c.bk} strokeWidth="4.4">
        <circle cx="15" cy="40" r="12" />
        <circle cx="49" cy="40" r="12" />
      </g>
      <g fill="none" stroke={c.rd} strokeWidth="4.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 40 27 22h13l9 18" />
        <path d="M27 22 32 40h17" />
      </g>
      <rect x="21" y="16" width="12" height="4.4" rx="2.2" fill={c.brd} transform="rotate(-12 27 18)" />
      <path d="M39 22h8" stroke={c.brd} strokeWidth="4.4" strokeLinecap="round" />
      <circle cx="15" cy="40" r="3" fill={c.gy} />
      <circle cx="49" cy="40" r="3" fill={c.gy} />
    </>
  ),

  walk: (c) => (
    <>
      <Sh c={c} cy={57} rx={15} ry={3.4} />
      <circle cx="37" cy="11" r="7" fill={c.sn} />
      <path d="M37 4a7 7 0 0 1 0 14z" fill={c.snd} />
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M35 20 28 34" stroke={c.bl} strokeWidth="9" />
        <path d="M28 34 39 41l2 13" stroke={c.bld} strokeWidth="8" />
        <path d="M28 34 17 50" stroke={c.bl} strokeWidth="8" />
        <path d="M33 24 45 30" stroke={c.sn} strokeWidth="6.4" />
      </g>
      <rect x="37" y="50" width="10" height="6" rx="3" fill={c.brd} />
      <rect x="10" y="47" width="11" height="6" rx="3" fill={c.brd} transform="rotate(-24 15.5 50)" />
    </>
  ),

  suitcase: (c) => (
    <>
      <Sh c={c} cy={56} rx={22} ry={3.6} />
      <path d="M25 17v-4a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v4" fill="none" stroke={c.brd} strokeWidth="4.4" strokeLinecap="round" />
      <rect x="6" y="16" width="52" height="36" rx="7" fill={c.rd} />
      <path d="M51 16a7 7 0 0 1 7 7v22a7 7 0 0 1-7 7H32V16z" fill={c.rdd} />
      <rect x="17" y="16" width="6" height="36" fill={c.brd} />
      <rect x="41" y="16" width="6" height="36" fill={c.brd} />
      <rect x="27" y="29" width="10" height="8" rx="2.4" fill={c.gd} />
      <Gl c={c} cx={13} cy={22} rx={5} ry={2} r={-8} o={0.4} />
    </>
  ),

  pin: (c) => (
    <>
      <Sh c={c} cy={57} rx={9} ry={2.8} />
      <path d="M32 3a18 18 0 0 1 18 18c0 12.6-18 33-18 33S14 33.6 14 21A18 18 0 0 1 32 3z" fill={c.rd} />
      <path d="M32 3a18 18 0 0 1 18 18c0 12.6-18 33-18 33z" fill={c.rdd} />
      <circle cx="32" cy="21" r="7" fill={c.w} />
      <Gl c={c} cx={23} cy={13} rx={2.6} ry={5} r={34} o={0.5} />
    </>
  ),
};
