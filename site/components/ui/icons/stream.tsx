import type { Draw } from "./bits";
import { Sh, Gl } from "./bits";

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

  comment: (c) => (
    <>
      <Sh c={c} cy={56} rx={18} ry={3.2} />
      {/* 白い吹き出しは明るい下地で消える。地を青にして、文字を白で抜く */}
      <path d="M12 8h40a9 9 0 0 1 9 9v18a9 9 0 0 1-9 9H29L16 55.4V44h-4a9 9 0 0 1-9-9V17a9 9 0 0 1 9-9z" fill={c.bl} />
      <path d="M32 8h20a9 9 0 0 1 9 9v18a9 9 0 0 1-9 9H32z" fill={c.bld} />
      <g fill={c.w}>
        <rect x="12" y="16.5" width="40" height="5" rx="2.5" />
        <rect x="12" y="25.5" width="30" height="5" rx="2.5" />
        <rect x="12" y="34.5" width="22" height="5" rx="2.5" opacity="0.75" />
      </g>
      <Gl c={c} cx={16} cy={13} rx={6} ry={2} r={-4} o={0.5} />
    </>
  ),

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

  clock: (c) => (
    <>
      <Sh c={c} cy={56} rx={19} ry={3.6} />
      <circle cx="32" cy="31" r="27" fill={c.gdd} />
      <circle cx="32" cy="29.6" r="27" fill={c.gd} />
      <circle cx="32" cy="29.6" r="21.5" fill={c.cr} />
      <g fill={c.gdd}>
        <rect x="30.6" y="11" width="2.8" height="5" rx="1.4" />
        <rect x="30.6" y="43" width="2.8" height="5" rx="1.4" />
        <rect x="12" y="28.2" width="5" height="2.8" rx="1.4" />
        <rect x="47" y="28.2" width="5" height="2.8" rx="1.4" />
      </g>
      <path d="M32 16v14h11" fill="none" stroke={c.ink} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="32" cy="29.6" r="3" fill={c.rd} />
      <Gl c={c} cx={21} cy={19} rx={5} ry={8} r={40} o={0.45} />
    </>
  ),

  calendar: (c) => (
    <>
      <Sh c={c} cy={57} rx={22} ry={3.4} />
      <rect x="17" y="3" width="6" height="13" rx="3" fill={c.gyd} />
      <rect x="41" y="3" width="6" height="13" rx="3" fill={c.gyd} />
      <rect x="5" y="8" width="54" height="48" rx="8" fill={c.w} />
      <path d="M51 8a8 8 0 0 1 8 8v32a8 8 0 0 1-8 8H32V8z" fill={c.wd} />
      <path d="M5 16a8 8 0 0 1 8-8h38a8 8 0 0 1 8 8v6H5z" fill={c.rd} />
      <path d="M32 8h19a8 8 0 0 1 8 8v6H32z" fill={c.rdd} />
      <g fill={c.crd}>
        <rect x="12" y="28" width="9" height="8" rx="2.4" />
        <rect x="38" y="28" width="9" height="8" rx="2.4" />
        <rect x="12" y="41" width="9" height="8" rx="2.4" />
        <rect x="38" y="41" width="9" height="8" rx="2.4" />
      </g>
      <rect x="25" y="28" width="9" height="8" rx="2.4" fill={c.crd} />
      <rect x="25" y="41" width="9" height="8" rx="2.4" fill={c.gr} />
      <Gl c={c} cx={15} cy={12} rx={6} ry={1.8} r={-4} o={0.4} />
    </>
  ),

  /**
   * 生放送のランプ。線の弧だけだと「電波の記号」で、物になっていなかった。
   * 台と笠を付けて、点いている赤い球にする。光は左右の弧で示す。
   */
  live: (c) => (
    <>
      <Sh c={c} cy={57} rx={16} ry={3.4} />
      {/* 光。玉から放射する短い線。玉より外に出しすぎると羽根に見える */}
      <g stroke={c.rdl} strokeWidth="5" strokeLinecap="round" opacity={c.flat ? 1 : 0.8}>
        <path d="M32 3v6" />
        <path d="M9.4 12.4 13.6 16.6" />
        <path d="M54.6 12.4 50.4 16.6" />
        <path d="M2 32h6" />
        <path d="M56 32h6" />
      </g>
      {/* 玉。ここが主役なので大きく取る */}
      <circle cx="32" cy="32" r="17" fill={c.rdd} />
      <circle cx="32" cy="30.8" r="17" fill={c.rd} />
      <path d="M20 19a17 17 0 0 1 24 0 17 17 0 0 0-24 0z" fill={c.rdl} />
      <ellipse cx="25" cy="24" rx="4.6" ry="3" fill={c.w} opacity={c.flat ? 1 : 0.55} transform="rotate(-32 25 24)" />
      {/* 台。玉が浮かないように受ける */}
      <path d="M17 44h30l-2 8H19z" fill={c.gyd} />
      <rect x="14" y="51" width="36" height="6" rx="3" fill={c.gy} />
    </>
  ),

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
};
