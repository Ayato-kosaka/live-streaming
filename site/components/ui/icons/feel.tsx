import type { Draw } from "./bits";
import { Sh, Gl } from "./bits";
// ブラウザまで運ぶ印はここには置かない（`core.tsx` の頭を読む）。並びだけこの表で決める
import { alert } from "./core";

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

  alert,

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

  /** うれしい。顔の印。 */
  smile: (c) => (
    <>
      <Sh c={c} cy={57} rx={20} ry={3.2} />
      <circle cx="32" cy="31" r="27" fill={c.gdd} />
      <circle cx="32" cy="29.5" r="27" fill={c.gd} />
      <circle cx="32" cy="29.5" r="21" fill={c.yl} />
      <g fill={c.ink}>
        <ellipse cx="23" cy="25" rx="2.6" ry="3.6" />
        <ellipse cx="41" cy="25" rx="2.6" ry="3.6" />
      </g>
      <path d="M21 34c3.4 7 18.6 7 22 0-.6 8-6 12.6-11 12.6S21.6 42 21 34z" fill={c.ink} />
      <path d="M25.4 41.6c4 2 9.2 2 13.2 0-1.6 3.4-4 5-6.6 5s-5-1.6-6.6-5z" fill={c.rdl} />
      <g fill={c.pk} opacity={c.flat ? 1 : 0.7}>
        <ellipse cx="16.5" cy="33" rx="4" ry="2.6" />
        <ellipse cx="47.5" cy="33" rx="4" ry="2.6" />
      </g>
      <Gl c={c} cx={21} cy={18} rx={6} ry={3} r={-30} o={0.55} />
    </>
  ),

  /** うまくいかなかった。失敗の回も残す。 */
  sad: (c) => (
    <>
      <Sh c={c} cy={57} rx={20} ry={3.2} />
      <circle cx="32" cy="31" r="27" fill={c.skd} />
      <circle cx="32" cy="29.5" r="27" fill={c.sk} />
      <circle cx="32" cy="29.5" r="21" fill={c.w} opacity={c.flat ? 1 : 0.5} />
      <g fill={c.ink}>
        <ellipse cx="23" cy="27" rx="2.6" ry="3.6" />
        <ellipse cx="41" cy="27" rx="2.6" ry="3.6" />
      </g>
      <path d="M24 44c2.4-4.6 13.6-4.6 16 0-4-2.4-12-2.4-16 0z" fill={c.ink} />
      <path d="M45 30c2.6 4 4 6 4 8.2a4 4 0 0 1-8 0c0-2.2 1.4-4.2 4-8.2z" fill={c.bl} />
      <g fill={c.gyd} opacity="0.55">
        <rect x="15" y="19" width="10" height="2.6" rx="1.3" transform="rotate(-12 20 20)" />
        <rect x="39" y="19" width="10" height="2.6" rx="1.3" transform="rotate(12 44 20)" />
      </g>
      <Gl c={c} cx={21} cy={18} rx={6} ry={3} r={-30} o={0.6} />
    </>
  ),

  /** きらめき。新しい・できたて。 */
  sparkle: (c) => (
    <>
      <path d="M32 2c2 15 6 19 21 21-15 2-19 6-21 21-2-15-6-19-21-21 15-2 19-6 21-21z" fill={c.gd} />
      <path d="M32 2c2 15 6 19 21 21-15 2-19 6-21 21z" fill={c.gdd} />
      <path d="M50 38c1.2 8 3 10 11 11-8 1-9.8 3-11 11-1.2-8-3-10-11-11 8-1 9.8-3 11-11z" fill={c.yl} />
      <path d="M13 40c.9 6 2.2 7.4 8 8.2-5.8.8-7.1 2.2-8 8.2-.9-6-2.2-7.4-8-8.2 5.8-.8 7.1-2.2 8-8.2z" fill={c.yl} opacity={c.flat ? 1 : 0.85} />
      <Gl c={c} cx={26} cy={16} rx={2.4} ry={5} r={22} o={0.6} />
    </>
  ),

  /** 音。BGM や歌の回。 */
  music: (c) => (
    <>
      <Sh c={c} cy={57} rx={22} ry={3.4} />
      {/* 旗を面で塗ると帆に見える。連桁（横棒）でつないだ八分音符2つにする */}
      <rect x="20" y="16" width="5.4" height="32" rx="2.4" fill={c.pu} />
      <rect x="46" y="12" width="5.4" height="28" rx="2.4" fill={c.pud} />
      <path d="M20 16 51.4 10v7.4L20 23.4z" fill={c.pu} />
      <path d="M36 13 51.4 10v7.4L36 20.4z" fill={c.pud} />
      <ellipse cx="14" cy="47" rx="9.4" ry="7.4" fill={c.pu} transform="rotate(-16 14 47)" />
      <ellipse cx="40" cy="39" rx="9.4" ry="7.4" fill={c.pud} transform="rotate(-16 40 39)" />
      <Gl c={c} cx={10} cy={44} rx={3.4} ry={2} r={-24} o={0.5} />
      <Gl c={c} cx={22} cy={24} rx={1.4} ry={5} r={0} o={0.45} />
    </>
  ),

  /** 待ち時間。出発まで。 */
  hourglass: (c) => (
    <>
      <Sh c={c} cy={57} rx={16} ry={3.2} />
      <rect x="12" y="4" width="40" height="7" rx="3.5" fill={c.wo} />
      <rect x="12" y="53" width="40" height="7" rx="3.5" fill={c.wod} />
      <path d="M17 11h30c0 10-11 16-11 21s11 11 11 21H17c0-10 11-16 11-21s-11-11-11-21z" fill={c.w} opacity={c.flat ? 1 : 0.6} />
      <path d="M21 14h22c0 7.4-8.4 13-8.4 18h-5.2C29.4 27 21 21.4 21 14z" fill={c.yl} />
      <path d="M32 14h11c0 7.4-8.4 13-8.4 18H32z" fill={c.yld} />
      <path d="M27 45c0-3.4 2.2-6 5-6s5 2.6 5 6z" fill={c.yl} />
      <path d="M22 53h20c0-3-1.4-5.6-3.4-7.4H25.4C23.4 47.4 22 50 22 53z" fill={c.yld} />
      <rect x="31" y="30" width="2" height="10" fill={c.yld} />
      <Gl c={c} cx={22} cy={20} rx={1.6} ry={5} r={20} o={0.6} />
    </>
  ),

  /** しるし。企画のリボン。 */
  ribbon: (c) => (
    <>
      <Sh c={c} cy={57} rx={16} ry={3.2} />
      <path d="M20 34 8 58l11-2 6 8 9-18z" fill={c.bld} />
      <path d="M44 34 56 58l-11-2-6 8-9-18z" fill={c.bl} />
      <circle cx="32" cy="26" r="22" fill={c.rdd} />
      <circle cx="32" cy="24.5" r="22" fill={c.rd} />
      <circle cx="32" cy="24.5" r="15" fill={c.gd} />
      <path d="m32 13 3.4 6.9 7.6 1.1-5.5 5.4 1.3 7.6L32 30.4l-6.8 3.6 1.3-7.6-5.5-5.4 7.6-1.1z" fill={c.yl} />
      <Gl c={c} cx={21} cy={16} rx={5.4} ry={2.6} r={-32} o={0.5} />
    </>
  ),

  /** 大笑い。目を弧にして口を大きく開ける。smile と表情で分ける。 */
  laugh: (c) => (
    <>
      <Sh c={c} cy={57} rx={20} ry={3.2} />
      <circle cx="32" cy="31" r="27" fill={c.gdd} />
      <circle cx="32" cy="29.5" r="27" fill={c.gd} />
      <circle cx="32" cy="29.5" r="21" fill={c.yl} />
      <g fill="none" stroke={c.ink} strokeWidth="3.4" strokeLinecap="round">
        <path d="M17 24c2.6-4 7.4-4 10 0" />
        <path d="M37 24c2.6-4 7.4-4 10 0" />
      </g>
      <path d="M16 32h32c0 10-7.2 17-16 17s-16-7-16-17z" fill={c.ink} />
      <path d="M22 42c6 2.6 14 2.6 20 0-2 4.4-6 7-10 7s-8-2.6-10-7z" fill={c.rdl} />
      <g fill={c.pk} opacity={c.flat ? 1 : 0.7}>
        <ellipse cx="14.5" cy="33" rx="4" ry="2.6" />
        <ellipse cx="49.5" cy="33" rx="4" ry="2.6" />
      </g>
      <Gl c={c} cx={21} cy={18} rx={6} ry={3} r={-30} o={0.55} />
    </>
  ),

  /** びっくり。口を縦に開けて、上に汗を1つ飛ばす。 */
  surprise: (c) => (
    <>
      <Sh c={c} cy={57} rx={20} ry={3.2} />
      <circle cx="32" cy="31" r="26" fill={c.ord} />
      <circle cx="32" cy="29.5" r="26" fill={c.or} />
      <circle cx="32" cy="29.5" r="20" fill={c.gd} />
      <g fill={c.ink}>
        <circle cx="24" cy="25" r="3.6" />
        <circle cx="40" cy="25" r="3.6" />
      </g>
      <g fill="none" stroke={c.ink} strokeWidth="2.6" strokeLinecap="round">
        <path d="M18.6 17c2.6-2.6 6-3.2 9-1.6" />
        <path d="M45.4 17c-2.6-2.6-6-3.2-9-1.6" />
      </g>
      <ellipse cx="32" cy="40" rx="6" ry="7.6" fill={c.ink} />
      <ellipse cx="32" cy="43" rx="3.6" ry="4" fill={c.rdl} />
      <path d="M54 6c3 4.6 4.6 7 4.6 9.2a4.6 4.6 0 0 1-9.2 0c0-2.2 1.6-4.6 4.6-9.2z" fill={c.sk} />
      <Gl c={c} cx={21} cy={18} rx={6} ry={3} r={-30} o={0.55} />
    </>
  ),

  /** 考え中。角の丸い雲の吹き出しに、粒を3つ。talk（四角）と形で分ける。 */
  think: (c) => (
    <>
      <Sh c={c} cy={58} rx={12} ry={2.8} />
      {/* 白い吹き出しを生成りの紙に置くと 1.1 倍しか差が出ず、点3つしか見えなかった。
          陰を灰白（`wd`）から冷たい灰（`gy` / `gyd`）へ落として、輪郭を地から離す */}
      <path d="M20 12a11 11 0 0 1 20-4 10 10 0 0 1 12 12 9 9 0 0 1-6 14 11 11 0 0 1-18 2 10 10 0 0 1-14-10 9 9 0 0 1 6-14z" fill={c.wd} />
      <path d="M20 12a11 11 0 0 1 20-4 10 10 0 0 1 4.6 4.6c-8-4.6-20-4-27 3.6A9.6 9.6 0 0 1 20 12z" fill={c.w} />
      <path d="M40 8a10 10 0 0 1 12 12 9 9 0 0 1-6 14 11 11 0 0 1-14 3.4V9.6A11 11 0 0 1 40 8z" fill={c.gy} />
      <path d="M46 34a11 11 0 0 1-14 3.4 11 11 0 0 1-13.6-1.6c8 3.4 20 2.6 27.6-1.8z" fill={c.gyd} opacity={c.flat ? 1 : 0.6} />
      <g fill={c.pu}>
        <circle cx="22" cy="20" r="3.6" />
        <circle cx="32" cy="20" r="3.6" />
        <circle cx="42" cy="20" r="3.6" />
      </g>
      <circle cx="20" cy="43" r="6" fill={c.wd} />
      <path d="M20 37a6 6 0 0 1 0 12z" fill={c.gy} />
      <circle cx="13" cy="53" r="4" fill={c.wd} />
      <path d="M13 49a4 4 0 0 1 0 8z" fill={c.gy} />
      <Gl c={c} cx={22} cy={12} rx={5} ry={2.4} r={-24} o={0.7} />
    </>
  ),

  /** 寝る。移動の夜行。目を閉じた顔と、上がっていく泡。 */
  sleep: (c) => (
    <>
      <Sh c={c} cy={57} rx={19} ry={3.2} />
      <circle cx="30" cy="35" r="23" fill={c.pud} />
      <circle cx="30" cy="33.6" r="23" fill={c.pu} />
      <circle cx="30" cy="33.6" r="17.5" fill={c.w} opacity={c.flat ? 1 : 0.55} />
      <g fill="none" stroke={c.ink} strokeWidth="3" strokeLinecap="round">
        <path d="M19 32c2.4 3 5.6 3 8 0" />
        <path d="M33 32c2.4 3 5.6 3 8 0" />
      </g>
      <path d="M25 42c2.6 2.4 7.4 2.4 10 0" fill="none" stroke={c.ink} strokeWidth="2.6" strokeLinecap="round" />
      <g fill={c.sk}>
        <circle cx="49" cy="20" r="4.4" />
        <circle cx="56" cy="12" r="3.2" />
        <circle cx="60" cy="5" r="2.2" />
      </g>
      <Gl c={c} cx={20} cy={22} rx={5} ry={2.6} r={-30} o={0.55} />
    </>
  ),

  /**
   * 手を振る。あいさつ。
   * `thumb`（ヒッチハイク）と同じ手だが、こちらは**開いた手のひら**。
   * 指を4本ちゃんと離して、右上へ動きの弧を2本足す。
   */
  hello: (c) => (
    <>
      <Sh c={c} cy={58} rx={15} ry={3.2} />
      <g transform="rotate(14 30 36)">
        <g fill={c.sn}>
          <rect x="13.6" y="14" width="7.4" height="24" rx="3.7" />
          <rect x="21.8" y="9" width="7.4" height="29" rx="3.7" />
          <rect x="30" y="8" width="7.4" height="30" rx="3.7" />
          <rect x="38.2" y="12" width="7.4" height="26" rx="3.7" />
          <rect x="13" y="26" width="33" height="22" rx="10" />
        </g>
        {/* 親指。手のひらの左から外へ張り出す */}
        <rect x="4" y="26" width="15" height="8.4" rx="4.2" fill={c.sn} transform="rotate(-32 11.5 30)" />
        <g fill={c.snd} opacity="0.55">
          <rect x="17" y="32" width="26" height="2.6" rx="1.3" />
        </g>
        <path d="M32 26h4c5.6 0 10 4.4 10 10v2c0 5.6-4.4 10-10 10h-4z" fill={c.snd} opacity="0.4" />
        <rect x="12" y="46" width="35" height="12" rx="6" fill={c.tld} />
        <rect x="12" y="46" width="35" height="6" rx="3" fill={c.tl} />
      </g>
      <g fill="none" stroke={c.or} strokeWidth="4" strokeLinecap="round">
        <path d="M52 8a10 10 0 0 1 3 8" />
        <path d="M58 2a17 17 0 0 1 4 13" opacity="0.55" />
      </g>
      <Gl c={c} cx={22} cy={18} rx={2.2} ry={6} r={12} o={0.45} />
    </>
  ),

  /** 付箋。ちょっとした覚え書き。角を1つめくる。 */
  note: (c) => (
    <>
      <Sh c={c} cy={56} rx={22} ry={3.4} />
      <g transform="rotate(-5 32 32)">
        <path d="M8 8h48v34L42 56H8z" fill={c.yl} />
        <path d="M32 8h24v34L42 56H32z" fill={c.yld} />
        <path d="M42 56V46a4 4 0 0 1 4-4h10z" fill={c.gd} />
        <g fill={c.wod} opacity="0.55">
          <rect x="15" y="18" width="34" height="3.4" rx="1.7" />
          <rect x="15" y="27" width="26" height="3.4" rx="1.7" />
          <rect x="15" y="36" width="18" height="3.4" rx="1.7" />
        </g>
      </g>
      <Gl c={c} cx={17} cy={13} rx={6} ry={1.8} r={-8} o={0.5} />
    </>
  ),

  /** 値札。買い物の回。穴とひもで「下げる札」だと分かる。 */
  tag: (c) => (
    <>
      <Sh c={c} cy={56} rx={20} ry={3.4} />
      <g transform="rotate(-38 32 32)">
        <path d="M14 12h28a8 8 0 0 1 8 8v24a8 8 0 0 1-8 8H14a5 5 0 0 1-5-5V17a5 5 0 0 1 5-5z" fill={c.or} />
        <path d="M32 12h10a8 8 0 0 1 8 8v24a8 8 0 0 1-8 8H32z" fill={c.ord} />
        <circle cx="20" cy="32" r="5.4" fill={c.cr} />
        <circle cx="20" cy="32" r="2.4" fill={c.wod} />
        <g fill={c.w} opacity="0.85">
          <rect x="30" y="24" width="16" height="3.4" rx="1.7" />
          <rect x="30" y="33" width="12" height="3.4" rx="1.7" />
        </g>
      </g>
      <path d="M6 20c-4-4-4-9 0-12" fill="none" stroke={c.brd} strokeWidth="3.4" strokeLinecap="round" />
      <Gl c={c} cx={24} cy={17} rx={4.4} ry={2} r={-38} o={0.5} />
    </>
  ),

  /** しおり。あとで読む・とっておく。切り込みのある帯。 */
  bookmark: (c) => (
    <>
      <Sh c={c} cy={58} rx={12} ry={2.8} />
      <path d="M14 6h36a4 4 0 0 1 4 4v45l-22-13-22 13V10a4 4 0 0 1 4-4z" fill={c.tl} />
      <path d="M32 6h18a4 4 0 0 1 4 4v45l-22-13z" fill={c.tld} />
      <path d="m32 16 3.4 6.9 7.6 1.1-5.5 5.4 1.3 7.6L32 33.4l-6.8 3.6 1.3-7.6-5.5-5.4 7.6-1.1z" fill={c.gd} />
      <Gl c={c} cx={19} cy={14} rx={2.2} ry={6} r={8} o={0.45} />
    </>
  ),

  /**
   * 会いたい人。
   *
   * 「人」の絵はすでに `friends`（島の住人3人）と `people`（人数）にあるが、
   * どちらも**集まり**の絵で、旅の芯にある「ひとりに会いに行く」を言えない。
   * ここは**二人が向き合っている**ことだけを描く。顔を近づけて、間にひとつ。
   */
  meet: (c) => (
    <>
      <Sh c={c} cy={57} rx={24} ry={3.6} />
      {/* 左。こちらから会いに行くほう。少し小さくして奥に置く */}
      <circle cx="18" cy="27" r="9" fill={c.sn} />
      <path d="M18 18a9 9 0 0 1 0 18z" fill={c.snd} />
      <path d="M18 37c8 0 13 5.4 13 13.6V56H5v-5.4C5 42.4 10 37 18 37z" fill={c.tl} />
      <path d="M18 37c8 0 13 5.4 13 13.6V56H18z" fill={c.tld} />
      {/* 右。会いに行く相手。手前に置いて大きく */}
      <circle cx="45" cy="24" r="10" fill={c.sn} />
      <path d="M45 14a10 10 0 0 1 0 20z" fill={c.snd} />
      <path d="M36.6 18.6C38 13.6 41.2 11 45 11s7 2.6 8.4 7.6c-2.4-2.2-5.2-3.4-8.4-3.4s-6 1.2-8.4 3.4z" fill={c.brd} />
      <path d="M45 35c8.8 0 14.4 6 14.4 15V56H30.6v-6c0-9 5.6-15 14.4-15z" fill={c.rd} />
      <path d="M45 35c8.8 0 14.4 6 14.4 15V56H45z" fill={c.rdd} />
      {/* あいだのひとつ。顔の高さより上に出して、二人のものだと分かるように */}
      <path d="M32 6c2-3 7-2.6 7 2 0 4-5 7-7 8.6-2-1.6-7-4.6-7-8.6 0-4.6 5-5 7-2z" fill={c.pk} />
      <Gl c={c} cx={41} cy={18} rx={2.6} ry={4} r={30} o={0.45} />
    </>
  ),

  /**
   * 現地のことば。
   *
   * `comment`（1つの吹き出しに行）と `talk`（会話）とは別で、
   * **通じない2つのことばが並んでいる**ことを言う。中の字は 16px では読めないので、
   * 「ローマ字らしい形」と「そうでない形」の差だけ残す。
   */
  phrase: (c) => (
    <>
      <Sh c={c} cy={56} rx={22} ry={3.4} />
      {/* 右。相手のことば。奥に置く */}
      <path d="M34 6h20a8 8 0 0 1 8 8v13a8 8 0 0 1-8 8H34a8 8 0 0 1-8-8V14a8 8 0 0 1 8-8z" fill={c.or} />
      <path d="M44 6h10a8 8 0 0 1 8 8v13a8 8 0 0 1-8 8H44z" fill={c.ord} />
      <g fill={c.w}>
        <rect x="38" y="13" width="16" height="4" rx="2" />
        <path d="M47.6 17h4.4l-8 12-3.6-2.4z" />
      </g>
      {/* 左。こちらのことば。手前で大きく、尻尾を左下へ */}
      <path d="M11 20h22a9 9 0 0 1 9 9v11a9 9 0 0 1-9 9h-9l-11 8v-8h-2a9 9 0 0 1-9-9V29a9 9 0 0 1 9-9z" fill={c.bl} />
      <path d="M27 20h6a9 9 0 0 1 9 9v11a9 9 0 0 1-9 9h-6z" fill={c.bld} />
      <path d="M22 27 30.6 44h-5.2l-1.4-3h-4l-1.4 3H13.4z" fill={c.w} />
      <path d="M22 34.4 20.6 37.6h2.8z" fill={c.bl} />
      <Gl c={c} cx={15} cy={25} rx={4.6} ry={2} r={-6} o={0.5} />
    </>
  ),

  /**
   * はりだす。企画掲示板の動詞そのもの。
   *
   * `board`（掲示板そのもの）や `pin`（地図の場所）と混ぜない。
   * ここは**紙1枚と画鋲1本**。傾けて留めると「いま貼った」感じになる。
   */
  pinup: (c) => (
    <>
      <Sh c={c} cy={57} rx={19} ry={3.4} />
      <g transform="rotate(-6 32 36)">
        <rect x="12" y="16" width="40" height="42" rx="4" fill={c.w} />
        <path d="M32 16h16a4 4 0 0 1 4 4v34a4 4 0 0 1-4 4H32z" fill={c.wd} />
        <g fill={c.crd}>
          <rect x="18" y="30" width="28" height="4" rx="2" />
          <rect x="18" y="39" width="20" height="4" rx="2" />
          <rect x="18" y="48" width="24" height="4" rx="2" />
        </g>
      </g>
      <circle cx="31" cy="17" r="7.4" fill={c.rdd} />
      <circle cx="31" cy="15.4" r="7.4" fill={c.rd} />
      <Gl c={c} cx={28} cy={12.4} rx={2.6} ry={1.7} r={-24} o={0.6} />
    </>
  ),
};
