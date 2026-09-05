import type { Draw } from "./bits";
import { Sh, Gl } from "./bits";

/**
 * 旅先の景色。
 *
 * 国のページや旅のしおりで「何がある場所か」を1つの絵で言うためのもの。
 * 島の入口（`place.tsx`）とは役目が違うので分けてある。
 *
 * 建物はどれも **屋根に色・壁にクリーム** で揃えて、屋根の形だけで種類を分ける。
 * こうすると並べたときに一族に見えて、かつ見分けがつく。
 */

export const scene: Record<string, Draw> = {
  /** 山。北欧のフィヨルドや峠。 */
  mountain: (c) => (
    <>
      <path d="M2 54 22 20l11 18 6-9 23 25z" fill={c.grd} />
      <path d="M22 20 41 54H2z" fill={c.gr} />
      <path d="M22 20l7.4 13.2-7.4 4.4-7-4z" fill={c.w} />
      <path d="M39 29l6.2 6.8-6.2 2.6-4.6-2.4z" fill={c.w} />
      <g fill={c.grl} opacity="0.6">
        <ellipse cx="12" cy="49" rx="5" ry="2.4" />
        <ellipse cx="50" cy="50" rx="4.4" ry="2.2" />
      </g>
    </>
  ),

  /** 海。水平線と波。 */
  sea: (c) => (
    <>
      <rect x="2" y="14" width="60" height="36" rx="10" fill={c.sk} />
      <path d="M2 28h60v12a10 10 0 0 1-10 10H12A10 10 0 0 1 2 40z" fill={c.bl} />
      <path d="M2 30h60v6H2z" fill={c.tl} />
      <g fill="none" stroke={c.w} strokeWidth="3" strokeLinecap="round" opacity={c.flat ? 1 : 0.85}>
        <path d="M8 40c3-3 6 3 9 0s6 3 9 0" />
        <path d="M32 46c3-3 6 3 9 0s6 3 9 0" />
      </g>
      <circle cx="47" cy="22" r="6.4" fill={c.yl} />
      <Gl c={c} cx={16} cy={20} rx={7} ry={2} r={-6} o={0.5} />
    </>
  ),

  /** 森。木を3本重ねる。 */
  forest: (c) => (
    <>
      <Sh c={c} cy={55} rx={24} ry={4} />
      <rect x="12" y="36" width="5" height="18" rx="2.5" fill={c.wod} />
      <path d="M14.5 8 27 30H2z" fill={c.grd} />
      <path d="M14.5 18 25 36H4z" fill={c.grd} />
      <rect x="47" y="36" width="5" height="18" rx="2.5" fill={c.wod} />
      <path d="M49.5 12 61 32H38z" fill={c.grd} />
      <path d="M49.5 22 60 39H39z" fill={c.grd} />
      <rect x="29" y="38" width="6" height="17" rx="3" fill={c.wo} />
      <path d="M32 4 47 30H17z" fill={c.gr} />
      <path d="M32 16 46 41H18z" fill={c.gr} />
      <path d="M32 4 47 30H32z" fill={c.grd} opacity="0.45" />
      <Gl c={c} cx={26} cy={22} rx={4} ry={2} r={-30} o={0.4} />
    </>
  ),

  /** 橋。川をまたぐ石橋。 */
  bridge: (c) => (
    <>
      <rect x="2" y="38" width="60" height="20" rx="8" fill={c.sk} />
      <path d="M2 46h60v4a8 8 0 0 1-8 8H10a8 8 0 0 1-8-8z" fill={c.bl} />
      {/* 石。クリームで塗ると下地に溶けて「水の上の机」になったので、灰色の石にする */}
      <path d="M8 29h14v18H8zM42 29h14v18H42z" fill={c.gyd} />
      <path d="M22 47c0-9.4 4.4-16.6 10-16.6s10 7.2 10 16.6z" fill={c.gyd} />
      <path d="M4 20h56v9.6H4z" fill={c.gyd} />
      <path d="M4 15h56a3 3 0 0 1 3 3v3H1v-3a3 3 0 0 1 3-3z" fill={c.gy} />
      <g fill={c.w} opacity={c.flat ? 1 : 0.45}>
        <rect x="9" y="30.4" width="12" height="2.4" rx="1.2" />
        <rect x="43" y="30.4" width="12" height="2.4" rx="1.2" />
      </g>
      {/* 欄干 */}
      <g fill={c.wo}>
        <rect x="6" y="7" width="4.4" height="10" rx="2.2" />
        <rect x="29.8" y="5" width="4.4" height="12" rx="2.2" />
        <rect x="53.6" y="7" width="4.4" height="10" rx="2.2" />
      </g>
      <rect x="4" y="11" width="56" height="3.4" rx="1.7" fill={c.wod} />
      <Gl c={c} cx={14} cy={17.4} rx={7} ry={1.2} r={-3} o={0.5} />
    </>
  ),

  /** 城。とんがり屋根の塔が2本。 */
  castle: (c) => (
    <>
      <Sh c={c} cy={56} rx={24} ry={4} />
      <path d="M9 14 15 4l6 10z" fill={c.bl} />
      <path d="M43 14 49 4l6 10z" fill={c.bl} />
      <path d="M15 4 21 14h-6z" fill={c.bld} />
      <path d="M49 4 55 14h-6z" fill={c.bld} />
      <rect x="8" y="14" width="14" height="42" rx="2" fill={c.cr} />
      <rect x="42" y="14" width="14" height="42" rx="2" fill={c.cr} />
      <path d="M15 14h7v42h-7z" fill={c.crd} />
      <path d="M49 14h7v42h-7z" fill={c.crd} />
      <path d="M22 22h20v34H22z" fill={c.cr} />
      <path d="M32 22h10v34H32z" fill={c.crd} />
      <path d="M22 22h20v-6h-4v3h-4v-3h-4v3h-4v-3h-4z" fill={c.crd} />
      <g fill={c.bld}>
        <rect x="12" y="24" width="6" height="9" rx="3" />
        <rect x="46" y="24" width="6" height="9" rx="3" />
      </g>
      <path d="M28 38h8v18h-8z" fill={c.br} />
      <path d="M28 42a4 4 0 0 1 8 0z" fill={c.brd} />
      <Gl c={c} cx={11} cy={22} rx={2} ry={5} r={0} o={0.4} />
    </>
  ),

  /** 教会。北欧の白い木の教会。 */
  church: (c) => (
    <>
      <Sh c={c} cy={56} rx={22} ry={4} />
      <rect x="29.4" y="2" width="3.4" height="10" rx="1.7" fill={c.gd} />
      <rect x="26.5" y="4.6" width="9.2" height="3.2" rx="1.6" fill={c.gd} />
      <path d="M31 12 42 30H20z" fill={c.rd} />
      <path d="M31 12 42 30H31z" fill={c.rdd} />
      <rect x="22" y="30" width="18" height="26" rx="2" fill={c.cr} />
      <rect x="31" y="30" width="9" height="26" fill={c.crd} />
      <path d="M40 34h16a3 3 0 0 1 3 3v19H40z" fill={c.cr} />
      <path d="M38 30h20l-3-4H41z" fill={c.rdd} />
      <path d="M26.4 40a4.6 4.6 0 0 1 9.2 0v9h-9.2z" fill={c.br} />
      <rect x="30" y="41" width="2" height="8" fill={c.crd} />
      <g fill={c.skd}>
        <rect x="44" y="40" width="5" height="8" rx="2.5" />
        <rect x="52" y="40" width="5" height="8" rx="2.5" />
      </g>
      <Gl c={c} cx={24.5} cy={38} rx={2} ry={5} r={0} o={0.4} />
    </>
  ),

  /** 博物館。柱が並んだ石の建物。 */
  museum: (c) => (
    <>
      <Sh c={c} cy={56} rx={26} ry={4} />
      <path d="M32 6 60 22H4z" fill={c.tl} />
      <path d="M32 6 60 22H32z" fill={c.tld} />
      <rect x="6" y="22" width="52" height="5" rx="2" fill={c.cr} />
      <g fill={c.cr}>
        <rect x="10" y="27" width="7" height="21" rx="1.5" />
        <rect x="21.5" y="27" width="7" height="21" rx="1.5" />
        <rect x="35.5" y="27" width="7" height="21" rx="1.5" />
        <rect x="47" y="27" width="7" height="21" rx="1.5" />
      </g>
      <g fill={c.crd}>
        <rect x="14.5" y="27" width="2.5" height="21" />
        <rect x="26" y="27" width="2.5" height="21" />
        <rect x="40" y="27" width="2.5" height="21" />
        <rect x="51.5" y="27" width="2.5" height="21" />
      </g>
      <rect x="4" y="48" width="56" height="8" rx="2.6" fill={c.crd} />
      <rect x="4" y="48" width="56" height="3.4" rx="1.7" fill={c.cr} />
      <Gl c={c} cx={20} cy={15} rx={6} ry={1.8} r={-28} o={0.45} />
    </>
  ),

  /** 駅。時計のある駅舎。 */
  station: (c) => (
    <>
      <Sh c={c} cy={56} rx={25} ry={4} />
      <path d="M4 22 32 8l28 14v3H4z" fill={c.rd} />
      <path d="M32 8l28 14v3H32z" fill={c.rdd} />
      <rect x="8" y="25" width="48" height="31" rx="3" fill={c.cr} />
      <rect x="32" y="25" width="24" height="31" fill={c.crd} />
      <circle cx="32" cy="35" r="7.4" fill={c.w} />
      <circle cx="32" cy="35" r="5.6" fill={c.cr} />
      <path d="M32 31v4.4l3 2" fill="none" stroke={c.ink} strokeWidth="2" strokeLinecap="round" />
      <path d="M24 56V49a8 8 0 0 1 16 0v7z" fill={c.br} />
      <g fill={c.skd}>
        <rect x="12" y="33" width="7" height="9" rx="2.4" />
        <rect x="45" y="33" width="7" height="9" rx="2.4" />
      </g>
      <Gl c={c} cx={14} cy={30} rx={4} ry={1.6} r={-4} o={0.45} />
    </>
  ),

  /** 宿。ベッドが見える窓。 */
  hotel: (c) => (
    <>
      <Sh c={c} cy={56} rx={22} ry={4} />
      <rect x="10" y="10" width="44" height="46" rx="4" fill={c.cr} />
      <rect x="32" y="10" width="22" height="46" fill={c.crd} />
      <path d="M8 10a3 3 0 0 1 3-3h42a3 3 0 0 1 3 3v3H8z" fill={c.pu} />
      <g fill={c.skd}>
        <rect x="15" y="19" width="9" height="8" rx="2.4" />
        <rect x="27.5" y="19" width="9" height="8" rx="2.4" />
        <rect x="40" y="19" width="9" height="8" rx="2.4" />
        <rect x="15" y="32" width="9" height="8" rx="2.4" />
        <rect x="40" y="32" width="9" height="8" rx="2.4" />
      </g>
      {/* ベッドの見えている窓を1つだけ明るくする */}
      <rect x="27.5" y="32" width="9" height="8" rx="2.4" fill={c.yl} />
      <rect x="28.6" y="35.6" width="6.8" height="3.6" rx="1.4" fill={c.w} />
      <rect x="24" y="44" width="16" height="12" rx="2.6" fill={c.br} />
      <circle cx="36" cy="50" r="1.5" fill={c.gd} />
      <Gl c={c} cx={13} cy={20} rx={2} ry={6} r={0} o={0.4} />
    </>
  ),

  /** 市場。屋根つきの露店。 */
  market: (c) => (
    <>
      <Sh c={c} cy={55} rx={26} ry={4} />
      <rect x="10" y="30" width="6" height="24" rx="2.6" fill={c.wod} />
      <rect x="48" y="30" width="6" height="24" rx="2.6" fill={c.wod} />
      <rect x="8" y="34" width="48" height="7" rx="2.6" fill={c.wo} />
      <path d="M4 16h56v9H4z" fill={c.rd} />
      <path d="M4 25h8l4 6H8zM20 25h8l4 6h-8zM36 25h8l4 6h-8zM52 25h8v6h-4z" fill={c.rd} />
      <path d="M12 25h8l-4 6h-8zM28 25h8l-4 6h-8zM44 25h8l-4 6h-8zM4 25v6h4z" fill={c.w} />
      <path d="M2 13h60a2.4 2.4 0 0 1 0 5H2a2.4 2.4 0 0 1 0-5z" fill={c.rdd} />
      <g fill={c.gr}>
        <circle cx="20" cy="45" r="5" />
        <circle cx="32" cy="46" r="4.4" />
      </g>
      <circle cx="43" cy="45" r="5" fill={c.or} />
      <g fill={c.grl} opacity="0.6">
        <circle cx="18.4" cy="43.4" r="1.8" />
        <circle cx="41.4" cy="43.4" r="1.8" />
      </g>
      <Gl c={c} cx={14} cy={15} rx={7} ry={1.4} r={-2} o={0.45} />
    </>
  ),

  /** 温泉・サウナのあとの水風呂。湯船と湯気。 */
  hotspring: (c) => (
    <>
      <Sh c={c} cy={56} rx={24} ry={3.8} />
      <g fill="none" stroke={c.gy} strokeWidth="3.6" strokeLinecap="round">
        <path d="M20 24c-5-5 2-8 0-13" />
        <path d="M32 21c-5-5 2-8 0-13" />
        <path d="M44 24c-5-5 2-8 0-13" />
      </g>
      <path d="M6 30h52a4 4 0 0 1 4 4v6a16 16 0 0 1-16 16H18A16 16 0 0 1 2 40v-6a4 4 0 0 1 4-4z" fill={c.crd} />
      <path d="M32 30h26a4 4 0 0 1 4 4v6a16 16 0 0 1-16 16H32z" fill={c.br} opacity="0.25" />
      <path d="M8 34h48v6a13 13 0 0 1-13 13H21A13 13 0 0 1 8 40z" fill={c.tl} />
      <path d="M32 34h24v6a13 13 0 0 1-13 13H32z" fill={c.tld} />
      <g fill="none" stroke={c.w} strokeWidth="2.6" strokeLinecap="round" opacity={c.flat ? 1 : 0.8}>
        <path d="M13 42c3-3 6 3 9 0s6 3 9 0" />
        <path d="M33 48c3-3 6 3 9 0s6 3 9 0" />
      </g>
      <Gl c={c} cx={16} cy={37} rx={6} ry={1.6} r={-4} o={0.5} />
    </>
  ),

  /** 休むところ。公園のベンチ。 */
  bench: (c) => (
    <>
      <Sh c={c} cy={55} rx={24} ry={3.8} />
      <rect x="8" y="24" width="6" height="32" rx="2.6" fill={c.gyd} />
      <rect x="50" y="24" width="6" height="32" rx="2.6" fill={c.gyd} />
      <g fill={c.wo}>
        <rect x="4" y="14" width="56" height="6.4" rx="3.2" />
        <rect x="4" y="23" width="56" height="6.4" rx="3.2" />
      </g>
      <g fill={c.wol}>
        <rect x="4" y="14" width="56" height="2.6" rx="1.3" />
        <rect x="4" y="23" width="56" height="2.6" rx="1.3" />
      </g>
      <rect x="2" y="33" width="60" height="8" rx="4" fill={c.wo} />
      <rect x="2" y="33" width="60" height="3.4" rx="1.7" fill={c.wol} />
      <g fill={c.gyd}>
        <rect x="12" y="41" width="5" height="15" rx="2.5" />
        <rect x="47" y="41" width="5" height="15" rx="2.5" />
      </g>
      <Gl c={c} cx={14} cy={15} rx={7} ry={1.2} r={-2} o={0.5} />
    </>
  ),

  /** 風車。オランダとバルトで見たやつ。 */
  windmill: (c) => (
    <>
      <Sh c={c} cy={56} rx={20} ry={4} />
      {/* 塔。クリームだと下地に溶けたので煉瓦色にして、腰に白い帯を1本まわす */}
      <path d="M22 56 27 22h10l5 34z" fill={c.rd} />
      <path d="M32 22h5l5 34H32z" fill={c.rdd} />
      <path d="M23.7 46h16.6l.6 4H23.1z" fill={c.cr} />
      <path d="M30 13h4l4 9H26z" fill={c.crd} />
      <path d="M32 13h2l4 9h-6z" fill={c.br} opacity="0.3" />
      <g fill={c.wo}>
        <rect x="30" y="4" width="4" height="20" rx="1.6" transform="rotate(30 32 22)" />
        <rect x="30" y="4" width="4" height="20" rx="1.6" transform="rotate(120 32 22)" />
        <rect x="30" y="4" width="4" height="20" rx="1.6" transform="rotate(210 32 22)" />
        <rect x="30" y="4" width="4" height="20" rx="1.6" transform="rotate(300 32 22)" />
      </g>
      <g fill={c.wol} opacity="0.85">
        <rect x="30.8" y="5" width="2.4" height="8" rx="1.2" transform="rotate(30 32 22)" />
        <rect x="30.8" y="5" width="2.4" height="8" rx="1.2" transform="rotate(120 32 22)" />
        <rect x="30.8" y="5" width="2.4" height="8" rx="1.2" transform="rotate(210 32 22)" />
        <rect x="30.8" y="5" width="2.4" height="8" rx="1.2" transform="rotate(300 32 22)" />
      </g>
      <circle cx="32" cy="22" r="3.4" fill={c.brd} />
      <rect x="28" y="44" width="8" height="12" rx="2" fill={c.br} />
      <Gl c={c} cx={26} cy={40} rx={1.8} ry={6} r={0} o={0.35} />
    </>
  ),

  /** 灯台。岬の目印。 */
  lighthouse: (c) => (
    <>
      <Sh c={c} cy={56} rx={18} ry={4} />
      <g fill={c.yl} opacity={c.flat ? 1 : 0.55}>
        <path d="M26 14 2 8v13z" />
        <path d="M38 14l24-6v13z" />
      </g>
      <path d="M23 56 26 24h12l3 32z" fill={c.w} />
      <path d="M32 24h6l3 32h-9z" fill={c.wd} />
      <g fill={c.rd}>
        <path d="M25.6 32h12.8l.3 3.4H25.3z" />
        <path d="M24.6 43h14.8l.3 3.4H24.3z" />
      </g>
      <rect x="24" y="20" width="16" height="6" rx="2" fill={c.gyd} />
      <rect x="26.5" y="10" width="11" height="11" rx="2.6" fill={c.yl} />
      <path d="M32 10h5.5v11H32z" fill={c.yld} />
      <path d="M26 10a6 6 0 0 1 12 0z" fill={c.rdd} />
      <rect x="20" y="52" width="24" height="6" rx="2.6" fill={c.gyd} />
      <Gl c={c} cx={28} cy={34} rx={1.8} ry={8} r={0} o={0.45} />
    </>
  ),

  /** 港町。ベルゲンのような、細くて色の違う切妻の家が並ぶ岸。 */
  harbor: (c) => (
    <>
      <path d="M7 20 15 9l8 11v22H7z" fill={c.rd} />
      <path d="M15 9l8 11v22h-8z" fill={c.rdd} />
      <path d="M23 16 31 5l8 11v26H23z" fill={c.gd} />
      <path d="M31 5l8 11v26h-8z" fill={c.gdd} />
      <path d="M39 20 47 9l8 11v22H39z" fill={c.tl} />
      <path d="M47 9l8 11v22h-8z" fill={c.tld} />
      <g fill={c.cr}>
        <rect x="11" y="24" width="7" height="7" rx="1.6" />
        <rect x="27" y="21" width="7" height="7" rx="1.6" />
        <rect x="43" y="24" width="7" height="7" rx="1.6" />
        <rect x="12" y="35" width="6" height="7" rx="1.6" />
        <rect x="28" y="33" width="6" height="9" rx="1.6" />
        <rect x="44" y="35" width="6" height="7" rx="1.6" />
      </g>
      <rect x="2" y="41" width="60" height="5" rx="2.5" fill={c.wo} />
      <rect x="1" y="45" width="62" height="14" rx="6" fill={c.bl} />
      <path d="M3 50c6-3 10 3 16 0s10 3 16 0 10 3 16 0 6-.6 10-2v5c-4 1.4-6 1.6-10 3-6 2-10-3-16 0s-10-3-16 0-10 3-16 0z" fill={c.tl} opacity={c.flat ? 1 : 0.85} />
      <Gl c={c} cx={12} cy={16} rx={2} ry={5} r={30} o={0.4} />
    </>
  ),

  /** 旧市街。屋根の高さをずらして4棟。奥に時計塔を1本立てる。 */
  oldtown: (c) => (
    <>
      <Sh c={c} cy={57} rx={27} ry={3.4} />
      <rect x="40" y="6" width="15" height="48" rx="3" fill={c.crd} />
      <path d="M47.5 1 58 9.4a1.8 1.8 0 0 1-1.1 3.2H38.1A1.8 1.8 0 0 1 37 9.4z" fill={c.tld} />
      <circle cx="47.5" cy="20" r="5.4" fill={c.w} />
      <path d="M47.5 16.6v3.4h2.6" fill="none" stroke={c.ink} strokeWidth="1.6" strokeLinecap="round" />
      <path d="M4 22 15 13l11 9v32H4z" fill={c.wo} />
      <path d="M15 13l11 9v32H15z" fill={c.wod} />
      <path d="M24 27 34 19l10 8v27H24z" fill={c.cr} />
      <path d="M34 19l10 8v27H34z" fill={c.crd} />
      <path d="M2 22h27l-3-4H5z" fill={c.rd} />
      <path d="M22 27h24l-3-4H25z" fill={c.rdd} />
      <g fill={c.sk}>
        <rect x="9" y="28" width="6" height="8" rx="1.8" />
        <rect x="17" y="28" width="6" height="8" rx="1.8" />
        <rect x="29" y="33" width="6" height="8" rx="1.8" />
        <rect x="37" y="33" width="5" height="8" rx="1.8" />
        <rect x="44" y="33" width="7" height="8" rx="1.8" />
      </g>
      <rect x="12" y="43" width="9" height="11" rx="2.6" fill={c.br} />
      <rect x="32" y="45" width="9" height="9" rx="2.4" fill={c.brd} />
      <Gl c={c} cx={8} cy={27} rx={2} ry={5} r={12} o={0.4} />
    </>
  ),

  /** モスク。中東の回。丸屋根と細い塔2本、上に月。 */
  mosque: (c) => (
    <>
      <Sh c={c} cy={57} rx={26} ry={3.4} />
      <g fill={c.cr}>
        <rect x="4" y="24" width="9" height="32" rx="4.5" />
        <rect x="51" y="24" width="9" height="32" rx="4.5" />
      </g>
      <g fill={c.crd}>
        <rect x="8.5" y="24" width="4.5" height="32" rx="2.2" />
        <rect x="55.5" y="24" width="4.5" height="32" rx="2.2" />
      </g>
      <path d="M8.5 12c3 4 4.5 7 4.5 10H4c0-3 1.5-6 4.5-10z" fill={c.tl} />
      <path d="M55.5 12c3 4 4.5 7 4.5 10h-9c0-3 1.5-6 4.5-10z" fill={c.tl} />
      <rect x="15" y="34" width="34" height="22" rx="3" fill={c.cr} />
      <path d="M32 34h17v22H32z" fill={c.crd} />
      <path d="M32 10c9.4 0 16 7.6 16 16.6 0 3-1.4 4.4-4.4 4.4H20.4c-3 0-4.4-1.4-4.4-4.4C16 17.6 22.6 10 32 10z" fill={c.tl} />
      <path d="M32 10c9.4 0 16 7.6 16 16.6 0 3-1.4 4.4-4.4 4.4H32z" fill={c.tld} />
      <path d="M32 1.6c1.4 2.6 2.2 4.2 2.2 5.6a2.2 2.2 0 0 1-4.4 0c0-1.4.8-3 2.2-5.6z" fill={c.gd} />
      <path d="M25 56V45a7 7 0 0 1 14 0v11z" fill={c.br} />
      <g fill={c.sk}>
        <rect x="18" y="38" width="6" height="8" rx="3" />
        <rect x="40" y="38" width="6" height="8" rx="3" />
      </g>
      <Gl c={c} cx={24} cy={19} rx={4} ry={6} r={38} o={0.4} />
    </>
  ),

  /** ピラミッド。エジプトの回。日の当たる面と影の面を斜めで割る。 */
  pyramid: (c) => (
    <>
      <path d="M1 46h62v6a6 6 0 0 1-6 6H7a6 6 0 0 1-6-6z" fill={c.crd} />
      <circle cx="52" cy="15" r="9" fill={c.or} />
      <path d="M42 22 52 46H32z" fill={c.wol} />
      <path d="M42 22 52 46h-10z" fill={c.wo} />
      <path d="M22 8 42 46H2z" fill={c.cr} />
      <path d="M22 8 42 46H22z" fill={c.crd} />
      <g stroke={c.wod} strokeWidth="1.6" opacity="0.45">
        <path d="M12 27h20M8 36h28" />
      </g>
      <ellipse cx="18" cy="49" rx="14" ry="3" fill={c.wod} opacity="0.4" />
      <Gl c={c} cx={17} cy={26} rx={2} ry={9} r={22} o={0.4} />
    </>
  ),

  /** 砂漠。稜線を3本重ねて、奥ほど淡くする。らくだで「渡った」と言う。 */
  desert: (c) => (
    <>
      <circle cx="15" cy="14" r="9" fill={c.gd} />
      <path d="M1 30c12-8 22 2 34-2s20-6 28-2v16H1z" fill={c.crd} />
      <path d="M1 38c10-6 18 2 30-1s24-5 32-1v14a6 6 0 0 1-6 6H7a6 6 0 0 1-6-6z" fill={c.cr} />
      {/* らくだ。ふたこぶと、上げた首。細かく描かず、影の面だけで丸みを出す */}
      <g fill={c.wod}>
        <rect x="18" y="38" width="3.6" height="12" rx="1.8" />
        <rect x="25" y="38" width="3.6" height="12" rx="1.8" />
        <rect x="34" y="38" width="3.6" height="12" rx="1.8" />
        <rect x="41" y="38" width="3.6" height="12" rx="1.8" />
      </g>
      <path d="M14 36c-3-1-5-3-6-6l3-1c1 2 2 3 4 4z" fill={c.wod} />
      <path d="M22 26c1.6-5 3.2-7.4 5-7.4s3.4 2.4 5 7.4zM34 26c1.6-5 3.2-7.4 5-7.4s3.4 2.4 5 7.4z" fill={c.wo} />
      <path d="M14 34c0-5 4-8 11-8h14c6 0 9 3 9 8s-3 7-9 7H25c-7 0-11-2-11-7z" fill={c.wo} />
      <path d="M32 26h7c6 0 9 3 9 8s-3 7-9 7h-7z" fill={c.wod} opacity="0.5" />
      <path d="M44 31c0-5 1.4-9.6 3.6-14l4.4 1.6c-2 3.8-3.2 7.6-3.2 12z" fill={c.wo} />
      <path d="M47 15.6c1.4-2.6 4.4-3.2 6.4-1.2l4 3.8-6.6 3z" fill={c.wod} />
      <g fill={c.crd} opacity="0.5">
        <ellipse cx="12" cy="50" rx="7" ry="2" />
        <ellipse cx="50" cy="53" rx="6" ry="1.8" />
      </g>
      <Gl c={c} cx={10} cy={9} rx={3} ry={2} r={-30} o={0.5} />
    </>
  ),

  /** 氷河。海に浮かぶ氷。水面の下が青く続いているのを見せる。 */
  glacier: (c) => (
    <>
      <rect x="1" y="34" width="62" height="25" rx="9" fill={c.bl} />
      <path d="M20 8 34 34H4z" fill={c.w} />
      <path d="M20 8l14 26H20z" fill={c.wd} />
      <path d="M44 16 56 34H32z" fill={c.w} />
      <path d="M44 16l12 18H44z" fill={c.wd} />
      <path d="M2 34h60v6H2z" fill={c.sk} opacity={c.flat ? 1 : 0.85} />
      <path d="M8 40h22l-4 8H10z" fill={c.skd} opacity="0.7" />
      <path d="M36 40h18l-3 6H38z" fill={c.skd} opacity="0.7" />
      <path d="M4 47c6-3 10 3 16 0s10 3 16 0 10 3 16 0 6-.6 10-2v5.6a6 6 0 0 1-6 5.4H7a6 6 0 0 1-6-6z" fill={c.tl} opacity={c.flat ? 1 : 0.75} />
      <Gl c={c} cx={17} cy={20} rx={2.2} ry={7} r={20} o={0.7} />
    </>
  ),

  /** フィヨルド。両岸を高く立てて、あいだの水を細く残す。 */
  fjord: (c) => (
    <>
      <rect x="1" y="6" width="62" height="52" rx="10" fill={c.sk} />
      <path d="M1 40h62v8a10 10 0 0 1-10 10H11A10 10 0 0 1 1 48z" fill={c.bl} />
      <path d="M1 38h62v6H1z" fill={c.bld} opacity="0.4" />
      <path d="M1 16c0-5.5 4.5-10 10-10h5l14 34H1z" fill={c.gr} />
      <path d="M16 6l14 34H14z" fill={c.grd} />
      <path d="M63 20v28a10 10 0 0 1-10 10h-3L36 40 50 12z" fill={c.grd} />
      <path d="M50 12 36 40h14z" fill={c.gr} />
      <path d="M11 6h5l4 9.6c-4 1-7 .6-10-1.6z" fill={c.w} />
      <path d="M50 12l4 8c-3 1.6-6 1.6-9 0z" fill={c.w} />
      <path d="M4 47c5-2.4 8 2.4 13 0s8 2.4 13 0 8 2.4 13 0 6-.4 9-1.6v4.4c-3 1.4-5 1.4-9 2.8-5 1.8-8-2.4-13 0s-8-2.4-13 0-8 2.4-13 0z" fill={c.w} opacity="0.45" />
      <path d="M30 43h9l-1.6 3.4a2 2 0 0 1-1.8 1.1h-2.2a2 2 0 0 1-1.8-1.1z" fill={c.rd} />
      <path d="M34 33h1.8v10H34z" fill={c.wod} />
      <path d="M36.4 34 43 39l-6.6 3z" fill={c.w} />
      <Gl c={c} cx={10} cy={22} rx={2} ry={6} r={18} o={0.35} />
    </>
  ),

  /** カフェ。日よけと、外に出した丸テーブル。 */
  cafe: (c) => (
    <>
      <Sh c={c} cy={57} rx={26} ry={3.4} />
      <rect x="6" y="18" width="52" height="34" rx="4" fill={c.cr} />
      <path d="M32 18h22a4 4 0 0 1 4 4v26a4 4 0 0 1-4 4H32z" fill={c.crd} />
      <rect x="11" y="26" width="20" height="16" rx="3" fill={c.sk} />
      <rect x="38" y="26" width="15" height="26" rx="3" fill={c.br} />
      <circle cx="41.6" cy="39" r="1.6" fill={c.gd} />
      <path d="M2 12h60v6H2z" fill={c.grd} />
      <path d="M4 18h56l-1 3.6c-3.6 0-4.6 3.4-8 3.4s-4.4-3.4-8-3.4-4.4 3.4-8 3.4-4.4-3.4-8-3.4-4.4 3.4-8 3.4-4.4-3.4-8-3.4z" fill={c.gr} />
      <g fill={c.w} opacity="0.85">
        <path d="M13 18h7l-1.6 6.8c-1.8-.6-2.8-2.4-4.6-3z" />
        <path d="M29 18h7l-1.4 7c-2 0-3.2-3-5.6-3.4z" />
        <path d="M45 18h7l-1.4 7c-2 0-3.2-3-5.6-3.4z" />
      </g>
      <rect x="14" y="46" width="4" height="10" rx="2" fill={c.wod} />
      <ellipse cx="16" cy="46" rx="11" ry="3.4" fill={c.wo} />
      <ellipse cx="16" cy="45" rx="11" ry="3.4" fill={c.wol} />
      <path d="M12 40h7l-.8 4a1.8 1.8 0 0 1-1.8 1.4h-1.8A1.8 1.8 0 0 1 12.8 44z" fill={c.w} />
      <Gl c={c} cx={12} cy={22} rx={5} ry={1.6} r={-4} o={0.5} />
    </>
  ),
};
