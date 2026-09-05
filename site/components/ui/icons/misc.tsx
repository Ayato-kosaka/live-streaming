import type { Draw } from "./bits";
import { Sh, Gl } from "./bits";

/** どこにも入らないもの。旅のしおりで使う「見る・する・買う」もここ。 */
export const misc: Record<string, Draw> = {
  shirt: (c) => (
    <>
      <Sh c={c} cy={55} rx={21} ry={3.6} />
      <path d="M24 8h16c0 4.4-3.6 7.4-8 7.4S24 12.4 24 8z" fill={c.wd} />
      <path d="M24 8 8 15l5 12 7-3v27a3 3 0 0 0 3 3h18a3 3 0 0 0 3-3V24l7 3 5-12L40 8a8 8 0 0 1-16 0z" fill={c.tl} />
      <path d="M40 8l16 7-5 12-7-3v27a3 3 0 0 1-3 3H32V15.4c4.4 0 8-3 8-7.4z" fill={c.tld} />
      <Gl c={c} cx={19} cy={26} rx={2.6} ry={8} r={12} o={0.4} />
    </>
  ),

  /** サウナ。フィンランドの手桶と柄杓。湯気は2本だけ。 */
  sauna: (c) => (
    <>
      <Sh c={c} cy={55} rx={22} ry={4} />
      <g fill="none" stroke={c.w} strokeWidth="3.4" strokeLinecap="round" opacity={c.flat ? 1 : 0.9}>
        <path d="M22 20c-4-4 1.6-6 0-10" />
        <path d="M34 18c-4-4 1.6-6 0-10" />
      </g>
      <rect x="40" y="16" width="6" height="26" rx="3" fill={c.wod} transform="rotate(16 43 29)" />
      <path d="M9 26h40l-3.4 22.6a5 5 0 0 1-5 4.4H17.4a5 5 0 0 1-5-4.4z" fill={c.wo} />
      <path d="M29 26h20l-3.4 22.6a5 5 0 0 1-5 4.4H29z" fill={c.wod} />
      <rect x="7" y="24" width="44" height="6" rx="3" fill={c.wol} />
      <g fill={c.wod} opacity="0.55">
        <rect x="19" y="30" width="2.6" height="22" />
        <rect x="29" y="30" width="2.6" height="22" />
        <rect x="39" y="30" width="2.6" height="21" />
      </g>
      <ellipse cx="49" cy="42" rx="8" ry="5" fill={c.wo} />
      <ellipse cx="49" cy="41" rx="8" ry="5" fill={c.wol} />
      <Gl c={c} cx={15} cy={28} rx={5} ry={1.6} r={-4} o={0.5} />
    </>
  ),

  brick: (c) => (
    <>
      <Sh c={c} cy={57} rx={25} ry={3.2} />
      <g fill={c.wo}>
        <rect x="4" y="10" width="26" height="12" rx="3" />
        <rect x="34" y="10" width="26" height="12" rx="3" />
        <rect x="4" y="26" width="16" height="12" rx="3" />
        <rect x="24" y="26" width="26" height="12" rx="3" />
        <rect x="54" y="26" width="6" height="12" rx="3" />
        <rect x="4" y="42" width="26" height="12" rx="3" />
        <rect x="34" y="42" width="26" height="12" rx="3" />
      </g>
      <g fill={c.wod}>
        <rect x="4" y="17" width="26" height="5" rx="2.5" />
        <rect x="34" y="17" width="26" height="5" rx="2.5" />
        <rect x="4" y="33" width="16" height="5" rx="2.5" />
        <rect x="24" y="33" width="26" height="5" rx="2.5" />
        <rect x="54" y="33" width="6" height="5" rx="2.5" />
        <rect x="4" y="49" width="26" height="5" rx="2.5" />
        <rect x="34" y="49" width="26" height="5" rx="2.5" />
      </g>
      <Gl c={c} cx={12} cy={13} rx={6} ry={1.6} r={-4} o={0.4} />
    </>
  ),

  /** 見る。 */
  see: (c) => (
    <>
      {/* まぶた。白目を白いままにすると明るい下地で目の形が消えるので、
          上まぶたを濃い色にして、そこで輪郭の代わりにする */}
      <path d="M32 10c14.6 0 26 9 31.2 21C58 43 46.6 52 32 52S6 43 .8 31C6 19 17.4 10 32 10z" fill={c.nv} />
      <path d="M32 15.6c11.6 0 20.8 6.8 25.4 15.4C52.8 39.6 43.6 46.4 32 46.4S11.2 39.6 6.6 31C11.2 22.4 20.4 15.6 32 15.6z" fill={c.w} />
      <path d="M32 15.6c11.6 0 20.8 6.8 25.4 15.4C52.8 39.6 43.6 46.4 32 46.4z" fill={c.wd} />
      <circle cx="32" cy="31" r="13" fill={c.tl} />
      <circle cx="32" cy="31" r="7" fill={c.ink} />
      <circle cx="27.6" cy="26.6" r="3.4" fill={c.w} />
      <Gl c={c} cx={17} cy={22} rx={7} ry={2.2} r={-24} o={0.6} />
    </>
  ),

  /** する。両手を上げた人。歩き（walk）と重ならないように正面向き。 */
  do: (c) => (
    <>
      <Sh c={c} cy={57} rx={16} ry={3.4} />
      {/* 小さくすると団子に見えたので、頭を大きく・腕を太く・肩幅を広げた。
          髪の面を1つ足すと、球ではなく人の頭になる */}
      <g stroke={c.sn} strokeWidth="8.4" strokeLinecap="round">
        <path d="M21 34 11 14" />
        <path d="M43 34 53 14" />
      </g>
      <circle cx="32" cy="15" r="10" fill={c.sn} />
      <path d="M32 5a10 10 0 0 1 0 20z" fill={c.snd} />
      <path d="M22.4 11.4C23.6 6.8 27.4 4 32 4s8.4 2.8 9.6 7.4c-2.8-2.2-6-3.4-9.6-3.4s-6.8 1.2-9.6 3.4z" fill={c.brd} />
      <path d="M32 26c8 0 13.6 5.6 13.6 13.6V48H18.4v-8.4C18.4 31.6 24 26 32 26z" fill={c.or} />
      <path d="M32 26c8 0 13.6 5.6 13.6 13.6V48H32z" fill={c.ord} />
      <g stroke={c.bld} strokeWidth="9" strokeLinecap="round">
        <path d="M25.4 50v4.4" />
        <path d="M38.6 50v4.4" />
      </g>
      <g fill={c.yl}>
        <path d="m8 6 1.3 3.2L12.5 10.5 9.3 11.8 8 15l-1.3-3.2L3.5 10.5 6.7 9.2z" />
        <path d="m56 6 1.3 3.2 3.2 1.3-3.2 1.3L56 15l-1.3-3.2-3.2-1.3 3.2-1.3z" />
      </g>
    </>
  ),

  /** 買う。 */
  buy: (c) => (
    <>
      <Sh c={c} cy={57} rx={20} ry={3.4} />
      <path d="M22 22v-5a10 10 0 0 1 20 0v5" fill="none" stroke={c.wod} strokeWidth="4.6" strokeLinecap="round" />
      <path d="M11 19h42a4 4 0 0 1 4 3.7l2.4 30A4 4 0 0 1 55.4 57H8.6a4 4 0 0 1-4-4.3L7 22.7A4 4 0 0 1 11 19z" fill={c.gr} />
      <path d="M32 19h21a4 4 0 0 1 4 3.7l2.4 30A4 4 0 0 1 55.4 57H32z" fill={c.grd} />
      <circle cx="32" cy="36" r="9" fill={c.gd} />
      <circle cx="32" cy="36" r="5.4" fill={c.yl} />
      <Gl c={c} cx={16} cy={26} rx={5} ry={2} r={-6} o={0.45} />
    </>
  ),

  flag: (c) => (
    <>
      <Sh c={c} cy={57} rx={11} ry={3} />
      <rect x="10" y="4" width="6.4" height="53" rx="3.2" fill={c.wod} />
      <path d="M16.4 7h38l-8 10.4 8 10.4h-38z" fill={c.rd} />
      <path d="M35 7h19.4l-8 10.4 8 10.4H35z" fill={c.rdd} />
      <Gl c={c} cx={12} cy={14} rx={1.4} ry={6} r={0} o={0.4} />
    </>
  ),
};
