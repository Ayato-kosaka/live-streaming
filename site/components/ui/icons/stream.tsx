import type { Draw } from "./bits";
import { Sh, Gl } from "./bits";
// ブラウザまで運ぶ印はここには置かない（`core.tsx` の頭を読む）。並びだけこの表で決める
import { calendar, clock, comment, live } from "./core";

/** 配信まわりの道具。 */
export const stream: Record<string, Draw> = {
  camera: (c) => (
    <>
      <Sh c={c} cy={55} rx={24} ry={3.8} />
      <rect x="23" y="9" width="18" height="9" rx="3" fill={c.nv} />
      <rect x="4" y="15" width="56" height="36" rx="8" fill={c.bl} />
      <path d="M52 15a8 8 0 0 1 8 8v20a8 8 0 0 1-8 8H32V15z" fill={c.bld} />
      <circle cx="32" cy="33" r="13" fill={c.gy} />
      <circle cx="32" cy="33" r="9.6" fill={c.nv} />
      <circle cx="32" cy="33" r="6" fill={c.tl} />
      <circle cx="28.6" cy="29.6" r="2.4" fill={c.w} />
      <rect x="46" y="21" width="8" height="5" rx="2.5" fill={c.yl} />
      <Gl c={c} cx={13} cy={22} rx={6} ry={2} r={-6} o={0.45} />
    </>
  ),

  mic: (c) => (
    <>
      <Sh c={c} cy={57} rx={14} ry={3.2} />
      <rect x="23" y="4" width="18" height="32" rx="9" fill={c.gy} />
      <path d="M32 4a9 9 0 0 1 9 9v14a9 9 0 0 1-9 9z" fill={c.gyd} />
      <g fill={c.w} opacity={c.flat ? 1 : 0.55}>
        <rect x="26" y="11" width="12" height="2.4" rx="1.2" />
        <rect x="26" y="17" width="12" height="2.4" rx="1.2" />
        <rect x="26" y="23" width="12" height="2.4" rx="1.2" />
      </g>
      <path d="M16 28v3a16 16 0 0 0 32 0v-3" fill="none" stroke={c.rd} strokeWidth="5.4" strokeLinecap="round" />
      <rect x="29" y="45" width="6" height="9" rx="2.4" fill={c.rdd} />
      <rect x="20" y="52" width="24" height="6" rx="3" fill={c.rd} />
      <Gl c={c} cx={27} cy={11} rx={1.8} ry={5} r={0} o={0.55} />
    </>
  ),

  headphone: (c) => (
    <>
      <Sh c={c} cy={57} rx={22} ry={3.2} />
      <path d="M8 40V33a24 24 0 0 1 48 0v7" fill="none" stroke={c.rd} strokeWidth="9" strokeLinecap="round" />
      <path d="M32 9a24 24 0 0 1 24 24v7" fill="none" stroke={c.rdd} strokeWidth="9" strokeLinecap="round" />
      <rect x="3" y="31" width="16" height="24" rx="8" fill={c.rdd} />
      <rect x="45" y="31" width="16" height="24" rx="8" fill={c.rdd} />
      <rect x="6.4" y="34.4" width="9.2" height="17.2" rx="4.6" fill={c.cr} />
      <rect x="48.4" y="34.4" width="9.2" height="17.2" rx="4.6" fill={c.cr} />
      <Gl c={c} cx={19} cy={16} rx={3} ry={9} r={54} o={0.4} />
    </>
  ),

  comment,

  /** 投げ銭。飛んできたコインに気持ちが乗っている。 */
  tip: (c) => (
    <>
      <Sh c={c} cy={56} rx={17} ry={3.4} />
      <g fill={c.yl}>
        <path d="m11 8 1.8 4.2 4.2 1.8-4.2 1.8L11 20l-1.8-4.2L5 14l4.2-1.8z" />
        <path d="m52 6 1.3 3 3 1.3-3 1.3-1.3 3-1.3-3-3-1.3 3-1.3z" />
      </g>
      <circle cx="32" cy="35" r="19" fill={c.gdd} />
      <circle cx="32" cy="33" r="19" fill={c.gd} />
      <circle cx="32" cy="33" r="14" fill={c.yl} />
      <path d="M32 43c-6-4.4-9-7.4-9-11a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 3.6-3 6.6-9 11z" fill={c.rd} />
      <Gl c={c} cx={22} cy={24} rx={6} ry={2.6} r={-32} o={0.6} />
    </>
  ),

  /** チャンネル登録。押すボタンとして描く。 */
  subscribe: (c) => (
    <>
      <Sh c={c} cy={53} rx={25} ry={3.6} />
      <rect x="3" y="15" width="58" height="32" rx="12" fill={c.rdd} />
      <rect x="3" y="13" width="58" height="30" rx="12" fill={c.rd} />
      <path d="M32 17a11 11 0 0 1 11 11v6l2.6 3.6A1.6 1.6 0 0 1 44.3 40H19.7a1.6 1.6 0 0 1-1.3-2.4L21 34v-6a11 11 0 0 1 11-11z" fill={c.w} />
      <path d="M27.4 42h9.2a4.6 4.6 0 0 1-9.2 0z" fill={c.w} />
      <Gl c={c} cx={16} cy={19} rx={9} ry={2.6} r={-4} o={0.4} />
    </>
  ),

  clock,

  calendar,

  live,

  book: (c) => (
    <>
      <Sh c={c} cy={55} rx={25} ry={3.6} />
      <path d="M6 12a2.6 2.6 0 0 1 3-2.6C16 10.6 25 13 30 17v34c-5-4-14-6.4-21-7.4A2.6 2.6 0 0 1 6 41z" fill={c.gr} />
      <path d="M58 12a2.6 2.6 0 0 0-3-2.6C48 10.6 39 13 34 17v34c5-4 14-6.4 21-7.4A2.6 2.6 0 0 0 58 41z" fill={c.grd} />
      <path d="M10 15c6 1.2 12 3.2 17 6.2v25C22 43.2 16 41.2 10 40z" fill={c.cr} />
      <path d="M54 15c-6 1.2-12 3.2-17 6.2v25c5-3 11-5 17-6.2z" fill={c.cr} />
      <g fill={c.crd}>
        <rect x="14" y="22" width="10" height="2.4" rx="1.2" />
        <rect x="14" y="28" width="10" height="2.4" rx="1.2" />
        <rect x="40" y="22" width="10" height="2.4" rx="1.2" />
        <rect x="40" y="28" width="10" height="2.4" rx="1.2" />
      </g>
      <rect x="30" y="14" width="4" height="38" rx="2" fill={c.grd} />
      <Gl c={c} cx={14} cy={19} rx={5} ry={1.8} r={8} o={0.55} />
    </>
  ),

  wifi: (c) => (
    <>
      <path d="M6 24a37 37 0 0 1 52 0" fill="none" stroke={c.sk} strokeWidth="8" strokeLinecap="round" />
      <path d="M16 35a23 23 0 0 1 32 0" fill="none" stroke={c.bl} strokeWidth="8" strokeLinecap="round" />
      <circle cx="32" cy="48" r="7" fill={c.bld} />
      <circle cx="32" cy="47" r="7" fill={c.bl} />
      <Gl c={c} cx={29.6} cy={44.6} rx={2.4} ry={1.5} r={-30} o={0.65} />
    </>
  ),

  /** 画面。配信の見えかた。 */
  screen: (c) => (
    <>
      <Sh c={c} cy={57} rx={19} ry={3.2} />
      <rect x="2" y="8" width="60" height="38" rx="6" fill={c.nv} />
      <rect x="6" y="12" width="52" height="27" rx="3" fill={c.sk} />
      <path d="M6 32c6-8 11-3 16-8s10 3 15-2 10 2 15-1v13a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3z" fill={c.gr} />
      <circle cx="47" cy="19" r="4.6" fill={c.yl} />
      <rect x="24" y="46" width="16" height="6" fill={c.gyd} />
      <rect x="15" y="51" width="34" height="6" rx="3" fill={c.gy} />
      <Gl c={c} cx={13} cy={17} rx={4.6} ry={2} r={-24} o={0.6} />
    </>
  ),

  /** 写真。撮ったもの。 */
  photo: (c) => (
    <>
      <Sh c={c} cy={56} rx={22} ry={3.6} />
      <rect x="5" y="8" width="54" height="48" rx="5" fill={c.w} transform="rotate(-5 32 32)" />
      <g transform="rotate(-5 32 32)">
        <rect x="10" y="13" width="44" height="31" rx="2.6" fill={c.sk} />
        <path d="M10 34c6-7 10-2 15-8s10 4 15-1 10 3 14 0v7.4a2.6 2.6 0 0 1-2.6 2.6H12.6A2.6 2.6 0 0 1 10 41.4z" fill={c.gr} />
        <circle cx="44" cy="21" r="4.4" fill={c.yl} />
        <rect x="18" y="47" width="20" height="4" rx="2" fill={c.gy} />
      </g>
      <Gl c={c} cx={16} cy={16} rx={5} ry={2} r={-24} o={0.7} />
    </>
  ),

  /** リンク。よそへ渡すもの。 */
  link: (c) => (
    <>
      <Sh c={c} cy={55} rx={20} ry={3.4} />
      <g transform="rotate(-38 32 30)">
        <path d="M16 20h13v9h-13a6 6 0 0 0 0 12h13v9H16a15 15 0 0 1 0-30z" fill={c.tl} />
        <path d="M48 20a15 15 0 0 1 0 30H35v-9h13a6 6 0 0 0 0-12H35v-9z" fill={c.tld} />
        <rect x="22" y="30" width="20" height="9" rx="4.5" fill={c.tl} />
      </g>
      <Gl c={c} cx={22} cy={22} rx={4} ry={2} r={-38} o={0.5} />
    </>
  ),

  /** 数字。視聴数や本数。 */
  chart: (c) => (
    <>
      <Sh c={c} cy={57} rx={24} ry={3.2} />
      <rect x="4" y="8" width="56" height="46" rx="6" fill={c.w} />
      <rect x="32" y="8" width="28" height="46" fill={c.wd} />
      <rect x="4" y="8" width="56" height="46" rx="6" fill="none" stroke={c.crd} strokeWidth="3" />
      <g>
        <rect x="12" y="32" width="10" height="16" rx="3" fill={c.tl} />
        <rect x="27" y="22" width="10" height="26" rx="3" fill={c.gr} />
        <rect x="42" y="14" width="10" height="34" rx="3" fill={c.or} />
      </g>
      <g fill={c.w} opacity={c.flat ? 1 : 0.45}>
        <rect x="12" y="32" width="4" height="16" rx="2" />
        <rect x="27" y="22" width="4" height="26" rx="2" />
        <rect x="42" y="14" width="4" height="34" rx="2" />
      </g>
      <Gl c={c} cx={13} cy={14} rx={5} ry={1.6} r={-4} o={0.7} />
    </>
  ),

  /** 見ている人。3人ぶんの頭と肩。 */
  people: (c) => (
    <>
      <Sh c={c} cy={55} rx={25} ry={3.8} />
      <circle cx="13" cy="24" r="8" fill={c.tld} />
      <path d="M1 50c0-7 5.4-12 12-12s12 5 12 12z" fill={c.tld} />
      <circle cx="51" cy="24" r="8" fill={c.pkd} />
      <path d="M39 50c0-7 5.4-12 12-12s12 5 12 12z" fill={c.pkd} />
      <circle cx="32" cy="20" r="11" fill={c.sn} />
      <path d="M32 9a11 11 0 0 1 0 22z" fill={c.snd} />
      <path d="M15 53c0-9.4 7.6-17 17-17s17 7.6 17 17z" fill={c.or} />
      <path d="M32 36c9.4 0 17 7.6 17 17H32z" fill={c.ord} />
      <Gl c={c} cx={27} cy={15} rx={3.4} ry={2.4} r={-30} o={0.5} />
    </>
  ),

  /** ノートパソコン。編集の回。画面に並べた帯で「切って並べている」と言う。 */
  laptop: (c) => (
    <>
      <Sh c={c} cy={55} rx={27} ry={3.4} />
      <path d="M11 7h42a4 4 0 0 1 4 4v27H7V11a4 4 0 0 1 4-4z" fill={c.nv} />
      <rect x="11" y="11" width="42" height="23" rx="2.6" fill={c.tl} />
      <rect x="11" y="11" width="42" height="7" rx="2.6" fill={c.tld} />
      <g fill={c.cr}>
        <rect x="14" y="21" width="17" height="4" rx="2" />
        <rect x="33" y="21" width="10" height="4" rx="2" />
        <rect x="14" y="28" width="9" height="4" rx="2" />
        <rect x="25" y="28" width="20" height="4" rx="2" />
      </g>
      <rect x="46" y="21" width="4.4" height="11" rx="2.2" fill={c.or} />
      <path d="M3 40h58a3 3 0 0 1 2.9 3.8l-1 3.6A4 4 0 0 1 59 50H5a4 4 0 0 1-3.9-2.6l-1-3.6A3 3 0 0 1 3 40z" fill={c.gy} />
      <path d="M32 40h29a3 3 0 0 1 2.9 3.8l-1 3.6A4 4 0 0 1 59 50H32z" fill={c.gyd} />
      <rect x="24" y="41.6" width="16" height="3" rx="1.5" fill={c.gyd} />
      <Gl c={c} cx={16} cy={14} rx={5} ry={1.8} r={-5} o={0.45} />
    </>
  ),

  /** 三脚。脚の開きが「据えて撮っている」の合図。 */
  tripod: (c) => (
    <>
      <Sh c={c} cy={57} rx={24} ry={3.2} />
      <g stroke={c.gyd} strokeWidth="5.4" strokeLinecap="round">
        <path d="M32 28 12 55" />
        <path d="M32 28 52 55" />
      </g>
      <path d="M32 28v27" stroke={c.gy} strokeWidth="5.4" strokeLinecap="round" />
      <rect x="18" y="38" width="28" height="4" rx="2" fill={c.gy} transform="rotate(-3 32 40)" />
      <rect x="24" y="22" width="16" height="7" rx="3" fill={c.gyd} />
      <rect x="14" y="8" width="34" height="16" rx="5" fill={c.nv} />
      <path d="M42 8a6 6 0 0 1 6 6v4a6 6 0 0 1-6 6H32V8z" fill={c.bld} opacity="0.5" />
      <circle cx="26" cy="16" r="6" fill={c.sk} />
      <circle cx="26" cy="16" r="2.8" fill={c.nv} />
      <rect x="40" y="4" width="9" height="5" rx="2.5" fill={c.gyd} />
      <Gl c={c} cx={19} cy={11} rx={3.4} ry={1.4} r={-6} o={0.5} />
    </>
  ),

  /** リングライト。輪の真ん中にレンズを置くと、輪の穴が抜けて見える。 */
  ringlight: (c) => (
    <>
      <Sh c={c} cy={57} rx={16} ry={3.2} />
      <circle cx="32" cy="24" r="21" fill={c.yl} />
      <circle cx="32" cy="24" r="12.5" fill={c.gy} />
      <circle cx="32" cy="24" r="9" fill={c.nv} />
      <circle cx="32" cy="24" r="5" fill={c.tld} />
      <circle cx="29.6" cy="21.6" r="2" fill={c.w} opacity="0.8" />
      <path d="M30 45h4v9h-4z" fill={c.gyd} />
      <path d="M18 56h28a2.6 2.6 0 0 0 0-5.2H18a2.6 2.6 0 0 0 0 5.2z" fill={c.gy} />
      <g fill={c.w} opacity="0.6">
        <path d="M20 12a17 17 0 0 1 8-6l1.6 3.4A13.6 13.6 0 0 0 22.8 14z" />
      </g>
      <Gl c={c} cx={19} cy={16} rx={2.4} ry={5} r={30} o={0.55} />
    </>
  ),

  /** SDカード。欠けた角と金色の端子。撮った素材の置き場。 */
  sdcard: (c) => (
    <>
      <Sh c={c} cy={56} rx={17} ry={3.4} />
      <path d="M17 6h20l10 10v34a5 5 0 0 1-5 5H17a5 5 0 0 1-5-5V11a5 5 0 0 1 5-5z" fill={c.bl} />
      <path d="M32 6h5l10 10v34a5 5 0 0 1-5 5H32z" fill={c.bld} />
      <g fill={c.gd}>
        <rect x="17" y="12" width="4.4" height="12" rx="2.2" />
        <rect x="24" y="12" width="4.4" height="12" rx="2.2" />
        <rect x="31" y="16" width="4.4" height="8" rx="2.2" />
        <rect x="38" y="19" width="4.4" height="5" rx="2.2" />
      </g>
      <rect x="17" y="31" width="30" height="18" rx="3" fill={c.w} />
      <path d="M32 31h15v18H32z" fill={c.wd} />
      <rect x="21" y="36" width="16" height="3" rx="1.5" fill={c.bld} opacity="0.5" />
      <rect x="21" y="42" width="11" height="3" rx="1.5" fill={c.bld} opacity="0.5" />
      <Gl c={c} cx={21} cy={14} rx={2} ry={5} r={4} o={0.5} />
    </>
  ),

  /** 電池。残りが減っていく回で使う。目盛りを3つに割る。 */
  battery: (c) => (
    <>
      <Sh c={c} cy={52} rx={26} ry={3.4} />
      <rect x="56" y="24" width="7" height="14" rx="3" fill={c.gyd} />
      <rect x="2" y="14" width="55" height="34" rx="8" fill={c.gy} />
      <path d="M49 14a8 8 0 0 1 8 8v18a8 8 0 0 1-8 8H32V14z" fill={c.gyd} />
      <rect x="7" y="19" width="45" height="24" rx="4" fill={c.w} />
      <g fill={c.gr}>
        <rect x="10" y="22" width="12" height="18" rx="2.6" />
        <rect x="25" y="22" width="12" height="18" rx="2.6" />
      </g>
      <rect x="25" y="22" width="12" height="18" rx="2.6" fill={c.grd} />
      <rect x="40" y="22" width="9" height="18" rx="2.6" fill={c.wd} />
      <Gl c={c} cx={12} cy={20} rx={6} ry={1.6} r={-4} o={0.5} />
    </>
  ),

  /** アップロード。雲へ上げる。矢は白のままだと消えるので緑を敷く。 */
  upload: (c) => (
    <>
      <path d="M18 46a13 13 0 0 1-1.6-25.9A16 16 0 0 1 46.3 17 12.5 12.5 0 0 1 48 46z" fill={c.sk} />
      <path d="M32 46h16a12.5 12.5 0 0 0 1.7-24.9 16 16 0 0 0-17.4-9z" fill={c.skd} />
      <path d="M32 24.6c1 0 2 .4 2.8 1.2l10.4 10.4c1.8 1.8.5 4.8-2 4.8H38v9a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4v-9h-5.2c-2.5 0-3.8-3-2-4.8l10.4-10.4c.8-.8 1.8-1.2 2.8-1.2z" fill={c.grd} />
      <path d="M32 27c.5 0 1 .2 1.4.6l10.4 10.4c.9.9.3 2.4-1 2.4h-7.2v11a2 2 0 0 1-2 2h-3.2a2 2 0 0 1-2-2V40.4h-7.2c-1.3 0-1.9-1.5-1-2.4L30.6 27.6c.4-.4.9-.6 1.4-.6z" fill={c.gr} />
      <Gl c={c} cx={22} cy={26} rx={5.4} ry={3} r={-24} o={0.7} />
    </>
  ),

  /** フィルム。編集して切り貼りする素材。穴の列で「映像」だと分かる。 */
  film: (c) => (
    <>
      <Sh c={c} cy={56} rx={26} ry={3.4} />
      <rect x="2" y="12" width="60" height="38" rx="6" fill={c.nv} />
      <g fill={c.cr}>
        <rect x="6" y="16" width="6" height="5" rx="1.8" />
        <rect x="17" y="16" width="6" height="5" rx="1.8" />
        <rect x="28" y="16" width="6" height="5" rx="1.8" />
        <rect x="39" y="16" width="6" height="5" rx="1.8" />
        <rect x="50" y="16" width="6" height="5" rx="1.8" />
        <rect x="6" y="41" width="6" height="5" rx="1.8" />
        <rect x="17" y="41" width="6" height="5" rx="1.8" />
        <rect x="28" y="41" width="6" height="5" rx="1.8" />
        <rect x="39" y="41" width="6" height="5" rx="1.8" />
        <rect x="50" y="41" width="6" height="5" rx="1.8" />
      </g>
      <rect x="6" y="24" width="16" height="14" rx="2.6" fill={c.sk} />
      <rect x="24" y="24" width="16" height="14" rx="2.6" fill={c.gr} />
      <rect x="42" y="24" width="16" height="14" rx="2.6" fill={c.or} />
      <path d="M6 31h16v7H6z" fill={c.skd} opacity="0.6" />
      <path d="M24 31h16v7H24z" fill={c.grd} opacity="0.6" />
      <path d="M42 31h16v7H42z" fill={c.ord} opacity="0.6" />
      <Gl c={c} cx={12} cy={16} rx={6} ry={1.4} r={-4} o={0.4} />
    </>
  ),

  /** はさみ。切るところ。刃と持ち手を別の色にして、開きを見せる。 */
  scissors: (c) => (
    <>
      <Sh c={c} cy={57} rx={17} ry={3.2} />
      <path d="M20.6 4.6 41 40.6l-6 3.4L14.6 8z" fill={c.gy} />
      <path d="M20.6 4.6 41 40.6l-3 1.7L17.6 6.3z" fill={c.w} opacity={c.flat ? 1 : 0.7} />
      <path d="M43.4 4.6 23 40.6l6 3.4L49.4 8z" fill={c.gyd} />
      <circle cx="20" cy="49" r="8.4" fill="none" stroke={c.or} strokeWidth="5" />
      <circle cx="44" cy="49" r="8.4" fill="none" stroke={c.ord} strokeWidth="5" />
      <circle cx="32" cy="36" r="4.4" fill={c.gd} />
      <circle cx="32" cy="36" r="1.8" fill={c.gdd} />
      <Gl c={c} cx={20} cy={14} rx={1.6} ry={6} r={-27} o={0.6} />
    </>
  ),

  /** アンケート。棒を横に寝かせて、選ばれた行に印を付ける。 */
  poll: (c) => (
    <>
      <Sh c={c} cy={56} rx={25} ry={3.4} />
      <rect x="4" y="6" width="56" height="46" rx="6" fill={c.cr} />
      <path d="M32 6h22a6 6 0 0 1 6 6v34a6 6 0 0 1-6 6H32z" fill={c.crd} />
      <rect x="10" y="13" width="34" height="7" rx="3.5" fill={c.tl} />
      <rect x="10" y="25" width="44" height="7" rx="3.5" fill={c.gr} />
      <rect x="10" y="37" width="22" height="7" rx="3.5" fill={c.or} />
      <circle cx="52" cy="28.5" r="8" fill={c.grd} />
      <path d="m48.4 28.6 2.8 2.8 5-5.4" fill="none" stroke={c.w} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <Gl c={c} cx={12} cy={11} rx={6} ry={1.6} r={-4} o={0.5} />
    </>
  ),

  /** メンバー。名札に星。続けて見に来てくれる人の印。 */
  member: (c) => (
    <>
      <Sh c={c} cy={57} rx={19} ry={3.4} />
      <path d="M15 7h34a4 4 0 0 1 4 4v34a8 8 0 0 1-8 8H19a8 8 0 0 1-8-8V11a4 4 0 0 1 4-4z" fill={c.tl} />
      <path d="M32 7h17a4 4 0 0 1 4 4v34a8 8 0 0 1-8 8H32z" fill={c.tld} />
      <rect x="22" y="3" width="20" height="8" rx="4" fill={c.cr} />
      <circle cx="32" cy="24" r="8" fill={c.cr} />
      <path d="M32 34c7.4 0 13 4.6 13 10.4V47H19v-2.6C19 38.6 24.6 34 32 34z" fill={c.cr} />
      <path d="M32 16a8 8 0 0 1 0 16zM32 34c7.4 0 13 4.6 13 10.4V47H32z" fill={c.crd} />
      <path d="m48 30 2.2 4.4 4.8.7-3.5 3.4.8 4.8-4.3-2.3-4.3 2.3.8-4.8-3.5-3.4 4.8-.7z" fill={c.gd} />
      <Gl c={c} cx={19} cy={14} rx={2.6} ry={6} r={16} o={0.45} />
    </>
  ),

  /**
   * 作ってきた記録。
   *
   * `book`（旅のしおり＝これから読むもの）と使い回していたのが直し元。
   * こちらは**積み上がった過去**なので、束ねた本ではなく**重ねた札**にする。
   * 上の1枚だけ日付の帯とチェックを入れて、「済んだことが並んでいる」と分かるように。
   */
  log: (c) => (
    <>
      <Sh c={c} cy={57} rx={24} ry={3.6} />
      <rect x="11" y="20" width="44" height="33" rx="5" fill={c.crd} transform="rotate(7 32 36)" />
      <rect x="9" y="16" width="44" height="33" rx="5" fill={c.cr} transform="rotate(-3 32 32)" />
      <rect x="10" y="11" width="44" height="33" rx="5" fill={c.w} />
      <path d="M10 16a5 5 0 0 1 5-5h34a5 5 0 0 1 5 5v5H10z" fill={c.tl} />
      <g fill={c.crd}>
        <rect x="27" y="27" width="22" height="4" rx="2" />
        <rect x="27" y="35" width="16" height="4" rx="2" />
      </g>
      <path d="m15 29 4 4 5-7" fill="none" stroke={c.gr} strokeWidth="4.4" strokeLinecap="round" strokeLinejoin="round" />
      <Gl c={c} cx={16} cy={14} rx={5} ry={1.6} r={-4} o={0.5} />
    </>
  ),
};
