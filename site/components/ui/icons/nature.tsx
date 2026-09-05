import type { Draw } from "./bits";
import { Sh, Gl } from "./bits";
// ブラウザまで運ぶ印はここには置かない（`core.tsx` の頭を読む）。並びだけこの表で決める
import { light } from "./core";

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
      {/* 明るい下地でも見えるように、地をクリームではなく山吹にする */}
      <path d="M38 5a27 27 0 1 0 20 36 21 21 0 0 1-20-36z" fill={c.gdd} />
      <path d="M34 8a27 27 0 0 0-2 54 27 27 0 0 1 2-54z" fill={c.yl} />
      <g fill={c.gdd} opacity="0.7">
        <circle cx="24" cy="24" r="4" />
        <circle cx="19" cy="38" r="3" />
        <circle cx="31" cy="44" r="2.4" />
      </g>
      <path d="m54 8 1.6 4 4 1.6-4 1.6-1.6 4-1.6-4-4-1.6 4-1.6z" fill={c.yl} />
      <Gl c={c} cx={22} cy={16} rx={3.4} ry={5} r={-30} o={0.5} />
    </>
  ),

  /**
   * くもり。
   *
   * 白い雲を生成りの紙に置くと、明るさの差が 1.2 倍ほどしか無くて輪郭が消える。
   * 白を暗くすると雲でなくなるので、**足すほうで解いた。**
   * 奥に空色の雲をもう1つ重ねて塊を作り、手前の雲の腹に空色の帯を広く敷く。
   * 遠目には「白い雲」のまま、近くで見ると2枚。霧（`fog`）とも輪郭で分かれる。
   */
  cloud: (c) => (
    <>
      <g transform="translate(28 2) scale(0.5)">
        <path d="M17 47a13 13 0 0 1-1.6-25.9A16 16 0 0 1 45.3 18 12.5 12.5 0 0 1 47 47z" fill={c.sk} />
      </g>
      <path d="M17 50a13 13 0 0 1-1.6-25.9A16 16 0 0 1 45.3 21 12.5 12.5 0 0 1 47 50z" fill={c.w} />
      <path d="M32 50h15a12.5 12.5 0 0 0 1.7-24.9 16 16 0 0 0-16.7-9z" fill={c.wd} />
      <path
        d="M6.6 43.4c10 5 40 5 51-1.4a12.5 12.5 0 0 1-10.6 8H17a13 13 0 0 1-10.4-6.6z"
        fill={c.skd}
        opacity={c.flat ? 1 : 0.6}
      />
      <Gl c={c} cx={22} cy={31} rx={6} ry={3.4} r={-24} o={0.8} />
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
      {/* 腹の空色は `cloud` と同じ作り。天気の雲は3つとも同じ質感にする */}
      <path
        d="M7 33.6c10 5 39 5 49.6-1.2a12.2 12.2 0 0 1-10.4 7.6H17a12.6 12.6 0 0 1-9.9-6.4z"
        fill={c.skd}
        opacity={c.flat ? 1 : 0.45}
      />
      <Gl c={c} cx={22} cy={22} rx={6} ry={3.2} r={-24} o={0.8} />
    </>
  ),

  snow: (c) => (
    <>
      {/* 白い枝だけだと、明るい紙の上で形が消えていた。
          幹を濃い水色にして、枝を薄い水色にする。白は真ん中の芯だけに残す */}
      <g stroke={c.skd} strokeWidth="5.4" strokeLinecap="round">
        <path d="M32 5v54" />
        <path d="M8.6 18.5 55.4 45.5" />
        <path d="M55.4 18.5 8.6 45.5" />
      </g>
      <g stroke={c.sk} strokeWidth="4.4" strokeLinecap="round">
        <path d="M32 15 25 9M32 15l7-6M32 49l-7 6M32 49l7 6" />
        <path d="m17.5 23.4-8.8-1.6M17.5 23.4l-2-8.8M46.5 40.6l8.8 1.6M46.5 40.6l2 8.8" />
        <path d="m46.5 23.4 8.8-1.6M46.5 23.4l2-8.8M17.5 40.6l-8.8 1.6M17.5 40.6l-2 8.8" />
      </g>
      <circle cx="32" cy="32" r="7" fill={c.skd} />
      <circle cx="32" cy="32" r="4.6" fill={c.w} />
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

  light,

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
      {/* 筋を3本、長さを変えて流す。端だけ巻くと「吹いている」に見える */}
      {/* 筋が細いと紙の上で消える。太さを上げて、3本とも濃さを変える */}
      <g fill="none" strokeLinecap="round" strokeWidth="7.4">
        <path d="M4 17h32a7 7 0 1 0-7-7" stroke={c.skd} />
        <path d="M4 32h40a6.4 6.4 0 1 1-6.4 6.4" stroke={c.bl} />
        <path d="M4 47h22a6 6 0 1 0-6-6" stroke={c.tld} />
      </g>
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

  /** 葉。秋の回。葉脈を1本だけ入れて、面で割る。 */
  leaf: (c) => (
    <>
      <Sh c={c} cy={57} rx={14} ry={3} />
      <path d="M52 6c4 20-2 33-12 39s-22 4-28-2C6 29 24 8 52 6z" fill={c.gr} />
      <path d="M52 6c4 20-2 33-12 39-5 3-11 4-16 3.6C36 42 46 26 52 6z" fill={c.grd} />
      <path d="M52 6C40 20 26 34 12 43" fill="none" stroke={c.grd} strokeWidth="3" strokeLinecap="round" />
      <g fill="none" stroke={c.grd} strokeWidth="2" strokeLinecap="round" opacity="0.7">
        <path d="M38 20c-1 6-1 9 0 13M28 30c-2 5-2 8-1 11M46 12c0 5 0 8 1 11" />
      </g>
      <path d="M12 43 4 52" fill="none" stroke={c.wod} strokeWidth="4.4" strokeLinecap="round" />
      <Gl c={c} cx={26} cy={20} rx={7} ry={2.6} r={-38} o={0.4} />
    </>
  ),

  /** 花。花びら5枚と芯。地面の情報量を足す絵。 */
  flower: (c) => (
    <>
      <Sh c={c} cy={57} rx={13} ry={3} />
      <path d="M31 32h4l1 24h-6z" fill={c.grd} />
      <path d="M32 44c-6 0-11-3-13-8 6-2 11 0 13 4z" fill={c.gr} />
      <path d="M32 38c5-1 9-4 10-9-6-1-10 2-11 6z" fill={c.grl} />
      <g fill={c.pk}>
        <ellipse cx="32" cy="9" rx="8" ry="10" />
        <ellipse cx="49" cy="21" rx="8" ry="10" transform="rotate(72 49 21)" />
        <ellipse cx="42" cy="41" rx="8" ry="10" transform="rotate(144 42 41)" />
        <ellipse cx="22" cy="41" rx="8" ry="10" transform="rotate(216 22 41)" />
        <ellipse cx="15" cy="21" rx="8" ry="10" transform="rotate(288 15 21)" />
      </g>
      <g fill={c.pkd} opacity="0.55">
        <ellipse cx="49" cy="21" rx="8" ry="10" transform="rotate(72 49 21)" />
        <ellipse cx="42" cy="41" rx="8" ry="10" transform="rotate(144 42 41)" />
      </g>
      <circle cx="32" cy="25" r="9" fill={c.gd} />
      <circle cx="32" cy="25" r="5" fill={c.yl} />
      <Gl c={c} cx={26} cy={7} rx={3} ry={1.8} r={-30} o={0.6} />
    </>
  ),

  /** 波。海の回。うねりを3枚重ねて、上に白い泡を置く。 */
  wave: (c) => (
    <>
      <path d="M2 22c8-8 16-9 24-3s16 5 24-2c5-4.4 10-5 14-2v33a8 8 0 0 1-8 8H10a8 8 0 0 1-8-8z" fill={c.sk} />
      <path d="M2 34c8-7 16-8 24-2s16 4 24-3c5-4 10-4.4 14-1.6V47a8 8 0 0 1-8 8H10a8 8 0 0 1-8-8z" fill={c.bl} />
      <path d="M2 44c8-6 16-6 24-1s16 3 24-3c5-3.6 10-4 14-1.4V48a8 8 0 0 1-8 8H10a8 8 0 0 1-8-8z" fill={c.bld} />
      <path d="M4 20c7-6.6 14-7.4 21-2.4 2 1.4 3.8 2.4 5.6 3-4-.4-7.4-2-10.6-4.4-5-3.6-10-3-16 3.8z" fill={c.w} />
      <path d="M34 22c6 3 12 1.6 18-4 3.6-3.4 7.2-4.4 10-3.4-3-.2-5.8 1-8.6 3.6-6.6 6.2-13 7.6-19.4 3.8z" fill={c.w} />
      <Gl c={c} cx={16} cy={26} rx={7} ry={2} r={-16} o={0.55} />
    </>
  ),

  /** 朝。地平から半分だけ出た日。sun（真上）と時間帯で分ける。 */
  sunrise: (c) => (
    <>
      <g stroke={c.gd} strokeWidth="4.4" strokeLinecap="round">
        <path d="M32 3v7" />
        <path d="M11 12.6 16 18" />
        <path d="M53 12.6 48 18" />
        <path d="M3 32h7" />
        <path d="M61 32h-7" />
      </g>
      <path d="M12 40a20 20 0 0 1 40 0z" fill={c.gd} />
      <path d="M32 20a20 20 0 0 1 20 20H32z" fill={c.or} />
      <path d="M2 40h60a3 3 0 0 1 0 6H2a3 3 0 0 1 0-6z" fill={c.crd} />
      <path d="M6 50h22a3 3 0 0 1 0 6H6a3 3 0 0 1 0-6z" fill={c.cr} />
      <path d="M36 50h22a3 3 0 0 1 0 6H36a3 3 0 0 1 0-6z" fill={c.cr} />
      <Gl c={c} cx={22} cy={30} rx={5} ry={2.6} r={-30} o={0.55} />
    </>
  ),

  /** 霧。帯を4本、太さと長さを変えて重ねる。cloud と違って輪郭を作らない。 */
  fog: (c) => (
    <>
      <path d="M20 30a11 11 0 0 1-1.4-21.9A13.6 13.6 0 0 1 44 5.6 10.6 10.6 0 0 1 45.4 30z" fill={c.gy} />
      <path d="M32 30h13.4a10.6 10.6 0 0 0 1.4-21.2A13.6 13.6 0 0 0 32.8 5z" fill={c.gyd} />
      <g fill={c.w}>
        <rect x="6" y="34" width="52" height="6" rx="3" />
        <rect x="14" y="43" width="42" height="6" rx="3" />
        <rect x="8" y="52" width="34" height="6" rx="3" />
      </g>
      <g fill={c.gyd} opacity="0.45">
        <rect x="36" y="34" width="22" height="6" rx="3" />
        <rect x="40" y="43" width="16" height="6" rx="3" />
        <rect x="28" y="52" width="14" height="6" rx="3" />
      </g>
      <Gl c={c} cx={22} cy={13} rx={6} ry={3} r={-24} o={0.7} />
    </>
  ),

  /** 雷。雲の下に稲妻。角を丸めても「折れた線」は残す。 */
  thunder: (c) => (
    <>
      <path d="M19 32a11.6 11.6 0 0 1-1.4-23.1A14.4 14.4 0 0 1 44.6 5.6 11.2 11.2 0 0 1 46 32z" fill={c.gyd} />
      <path d="M32 32h14a11.2 11.2 0 0 0 1.4-22.4A14.4 14.4 0 0 0 32.8 5z" fill={c.nv} opacity="0.35" />
      <path d="M35 33h11a2.4 2.4 0 0 1 2 3.8L30 60l4-16h-9a2.4 2.4 0 0 1-2.2-3.4L30 26z" fill={c.gd} />
      <path d="M35 33h11a2.4 2.4 0 0 1 2 3.8L30 60l4-16z" fill={c.yl} />
      <Gl c={c} cx={22} cy={13} rx={6} ry={3} r={-24} o={0.6} />
    </>
  ),

  /** 鳥。あやと島のマークと同じ向き。空の回と、島の道しるべに使う。 */
  bird: (c) => (
    <>
      <Sh c={c} cy={56} rx={16} ry={3.2} />
      <path d="M14 52 20 40h5l-2 12z" fill={c.ord} />
      <path d="M36 52 40 40h5l-4 12z" fill={c.or} />
      <path d="M13 30c0-11 8.6-19 20-19 10 0 18 6 20 15 1.6 6.6-1 12-6 16-4 3.2-9 4.4-14 4.4-11 0-20-6.4-20-16.4z" fill={c.sk} />
      <path d="M33 11c10 0 18 6 20 15 1.6 6.6-1 12-6 16-4 3.2-9 4.4-14 4.4z" fill={c.skd} />
      <path d="M24 26c8-3 15-1 20 5-4 7-11 10-18 8-5-1.4-7-9-2-13z" fill={c.w} opacity={c.flat ? 1 : 0.5} />
      <path d="M13 24 2 29l11 6z" fill={c.or} />
      <circle cx="20" cy="23" r="3" fill={c.ink} />
      <circle cx="19" cy="22" r="1" fill={c.w} />
      <path d="M52 16c4-3 8-3 11 0-3 4-7 5-11 3z" fill={c.w} />
      <Gl c={c} cx={22} cy={16} rx={5} ry={2.4} r={-28} o={0.5} />
    </>
  ),

  /** トナカイ。北欧の回。角の枝分かれで一目で分かる。 */
  reindeer: (c) => (
    <>
      <Sh c={c} cy={57} rx={18} ry={3.2} />
      <g fill={c.wod}>
        <path d="M20 20c-4-3-6-8-5-14 3 1 5 3 6 6 1-3 1-6 0-9 3 2 5 6 5 11z" />
        <path d="M44 20c4-3 6-8 5-14-3 1-5 3-6 6-1-3-1-6 0-9-3 2-5 6-5 11z" />
      </g>
      <ellipse cx="14" cy="26" rx="6" ry="8" fill={c.br} transform="rotate(-20 14 26)" />
      <ellipse cx="50" cy="26" rx="6" ry="8" fill={c.brd} transform="rotate(20 50 26)" />
      <path d="M32 17c11 0 18 7 18 16 0 11-8 20-18 20s-18-9-18-20c0-9 7-16 18-16z" fill={c.wo} />
      <path d="M32 17c11 0 18 7 18 16 0 11-8 20-18 20z" fill={c.wod} />
      <path d="M32 34c6 0 10 4 10 9s-4 8-10 8-10-3-10-8 4-9 10-9z" fill={c.cr} />
      <circle cx="32" cy="43" r="5.4" fill={c.rd} />
      <circle cx="30" cy="41" r="1.8" fill={c.rdl} />
      <g fill={c.ink}>
        <ellipse cx="24" cy="30" rx="2.4" ry="3" />
        <ellipse cx="40" cy="30" rx="2.4" ry="3" />
      </g>
      <Gl c={c} cx={23} cy={23} rx={4} ry={2.4} r={-30} o={0.45} />
    </>
  ),

  /**
   * 松。
   *
   * `tree`（丸い広葉樹）とは別。バルトから北はこの三角の常緑樹しか生えていなくて、
   * 国境も湖のふちも、まわりは全部これ。3段に割って、左半分だけ明るくする。
   */
  pine: (c) => (
    <>
      <Sh c={c} cy={56} rx={16} ry={4} />
      <rect x="28.6" y="40" width="6.8" height="16" rx="3" fill={c.brd} />
      <path d="M32 4 46 26H18z" fill={c.grd} />
      <path d="M32 16 50 38H14z" fill={c.grd} />
      <path d="M32 28 54 50H10z" fill={c.grd} />
      <path d="M32 4 46 26H32z" fill={c.gr} />
      <path d="M32 16 50 38H32z" fill={c.gr} />
      <path d="M32 28 54 50H32z" fill={c.gr} />
      <Gl c={c} cx={26} cy={22} rx={2.2} ry={6} r={18} o={0.3} />
    </>
  ),

  /**
   * 湖。北欧は湖と松のくり返しでできている。
   * `sea`（水平線と波）とは、**対岸が見えるかどうか**で分ける。
   */
  lake: (c) => (
    <>
      {/* 対岸の松。奥にあるので暗いほうの緑1色でよい */}
      <g fill={c.grd}>
        <path d="M9 30 17 8l8 22z" />
        <path d="M26 32 32 15l6 17z" />
        <path d="M40 30 48 9l8 21z" />
      </g>
      <path d="M2 29c8-3 14-3 20-1s12 2 18 0 16-2 22 1v5H2z" fill={c.gr} />
      <ellipse cx="32" cy="45" rx="30" ry="14" fill={c.bl} />
      <path d="M4 41c8-3 14 2 22 0s18-3 30 0a30 14 0 0 1-52 0z" fill={c.tl} />
      {/* 松が水に落ちた影。木の影なので白ではなく、水より暗い緑で置く。
          白い横線にすると道路の白線に見えた */}
      <g fill={c.grd} opacity={c.flat ? 1 : 0.4}>
        <path d="M15 36l3.4 14L15 52l-3.4-2z" />
        <path d="M32 38l3 15-3 2-3-2z" />
        <path d="M48 36l3.4 13-3.4 2-3.4-2z" />
      </g>
      <rect x="9" y="46" width="11" height="2.6" rx="1.3" fill={c.w} opacity={c.flat ? 1 : 0.6} />
    </>
  ),

  /**
   * 白夜。
   *
   * `sun`（真上の太陽）とも `sunrise`（昇る途中）とも違って、
   * **沈まないまま水平線をなぞる**。だから太陽を水に半分だけ埋めて、
   * 光の道を1本まっすぐ手前に伸ばす。夜なのに明るい、があの絵。
   */
  midnightsun: (c) => (
    <>
      <g stroke={c.yl} strokeWidth="4.6" strokeLinecap="round" opacity={c.flat ? 1 : 0.7}>
        <path d="M9 20 14.5 25.5" />
        <path d="M55 20 49.5 25.5" />
        <path d="M32 4v6" />
      </g>
      <circle cx="32" cy="32" r="16" fill={c.or} />
      <circle cx="32" cy="30.6" r="16" fill={c.yl} />
      <Gl c={c} cx={25} cy={24} rx={4} ry={2.6} r={-28} o={0.55} />
      {/* 海。水平線が主役なので上辺はまっすぐ。下だけ角を落とす */}
      <path d="M1 38h62v20a5 5 0 0 1-5 5H6a5 5 0 0 1-5-5z" fill={c.bl} />
      <path d="M1 38h62v4.6H1z" fill={c.tl} />
      {/* 水に映る光。手前ほど広がる横の粒。
          つないで1本の帯にすると塔か戸口に見えたので、離したまま置く */}
      <g fill={c.yl}>
        <rect x="27.5" y="45" width="9" height="3.4" rx="1.7" />
        <rect x="24.5" y="51" width="15" height="3.6" rx="1.8" />
        <rect x="21" y="57" width="22" height="3.8" rx="1.9" />
      </g>
    </>
  ),
};
