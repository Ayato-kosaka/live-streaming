import type { Draw } from "./bits";
import { Sh, Gl } from "./bits";

/**
 * どの面にも要る印。**ここだけがブラウザまで運ばれる。**
 *
 * 島の印は 257 種あるが、`components/ui/icons/index.ts` は 10 群を1つの表にまとめる。
 * 表は名前で引くので、まとめた時点でどれが要るか静的には分からない。
 * だから面が10種しか出さなくても、**257 種ぜんぶが束に入る**。
 * 面が紙（サーバで描き切るもの）なら書き出したHTMLに絵が焼かれて束は要らないが、
 * 島のステージや掲示板のように**ブラウザで描き直す部品**は束を持っていく。
 * 測ったら 174KB あって、そのうち走っていたのは 6% だった。
 *
 * ここに置いてあるのは、その**ブラウザで描き直す部品が実際に呼ぶ印だけ**。
 * 群のファイル（`place.tsx` など）はここから読み込んで自分の表に並べ直すので、
 * 絵は1つしかない。`/design` の並びも変わらない。
 *
 * 足すときは `IconCore.tsx` の表にも1行足す。逆に、ブラウザで描き直す部品から
 * 呼ばれなくなった印は群のファイルへ戻す。**ここは小さいことに意味がある。**
 */

export const comment: Draw = (c) => (
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
);

export const clock: Draw = (c) => (
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
);

export const calendar: Draw = (c) => (
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
);

/**
 * 生放送のランプ。線の弧だけだと「電波の記号」で、物になっていなかった。
 * 台と笠を付けて、点いている赤い球にする。光は左右の弧で示す。
 */
export const live: Draw = (c) => (
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
);

export const map: Draw = (c) => (
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
);

export const signpost: Draw = (c) => (
  <>
    <Sh c={c} cy={56} rx={13} ry={3.4} />
    <rect x="29" y="12" width="6.5" height="44" rx="3" fill={c.wod} />
    <path d="M13 14h21a2.4 2.4 0 0 1 2.4 2.4v7.2A2.4 2.4 0 0 1 34 26H13l-6-6z" fill={c.gr} />
    <path d="M30 30h21l6 6-6 6H30a2.4 2.4 0 0 1-2.4-2.4v-7.2A2.4 2.4 0 0 1 30 30z" fill={c.or} />
    <rect x="14" y="19" width="14" height="2.6" rx="1.3" fill={c.w} opacity="0.85" />
    <rect x="34" y="35" width="14" height="2.6" rx="1.3" fill={c.w} opacity="0.85" />
    <Gl c={c} cx={30.5} cy={18} rx={1.4} ry={4} r={0} o={0.35} />
  </>
);

export const walk: Draw = (c) => (
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
);

export const pin: Draw = (c) => (
  <>
    <Sh c={c} cy={57} rx={9} ry={2.8} />
    <path d="M32 3a18 18 0 0 1 18 18c0 12.6-18 33-18 33S14 33.6 14 21A18 18 0 0 1 32 3z" fill={c.rd} />
    <path d="M32 3a18 18 0 0 1 18 18c0 12.6-18 33-18 33z" fill={c.rdd} />
    <circle cx="32" cy="21" r="7" fill={c.w} />
    <Gl c={c} cx={23} cy={13} rx={2.6} ry={5} r={34} o={0.5} />
  </>
);

export const alert: Draw = (c) => (
  <>
    <Sh c={c} cy={56} rx={22} ry={3.4} />
    <path d="M27.2 7.4a5.6 5.6 0 0 1 9.6 0l24 40A5.6 5.6 0 0 1 56 56H8a5.6 5.6 0 0 1-4.8-8.6z" fill={c.yld} />
    <path d="M27.2 7.4a5.6 5.6 0 0 1 9.6 0l24 40A5.6 5.6 0 0 1 56 56H32z" fill={c.yl} />
    <path d="M32 7.4a5.6 5.6 0 0 0-4.8 2.6l-24 40A5.6 5.6 0 0 0 8 56h24z" fill={c.yl} />
    <rect x="28" y="20" width="8" height="19" rx="4" fill={c.bk} />
    <circle cx="32" cy="46" r="4.4" fill={c.bk} />
    <Gl c={c} cx={22} cy={30} rx={2.4} ry={8} r={16} o={0.35} />
  </>
);

/** ランタン。夜のあかり。 */
export const light: Draw = (c) => (
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
);

/** 島そのもの。トップへ戻る印。 */
export const island: Draw = (c) => (
  <>
    <ellipse cx="32" cy="42" rx="29" ry="15" fill={c.sk} />
    <path
      d="M5 44c6-3 10 3 16 0s10 3 16 0 10 3 16 0 5-.6 6-1.4A29 29 0 0 1 32 57 29 29 0 0 1 4 42.6c.2.4.4.8 1 1.4z"
      fill={c.w}
      opacity="0.5"
    />
    <ellipse cx="32" cy="40" rx="20" ry="9" fill={c.cr} />
    <ellipse cx="32" cy="36.5" rx="14" ry="7" fill={c.gr} />
    <ellipse cx="27" cy="34" rx="6" ry="2.6" fill={c.grl} opacity="0.7" />
    <path d="M31 36V16h4l-1 20z" fill={c.wod} />
    <g fill={c.grd}>
      <path d="M33 15c7-4 13-1 14 3-4-3-9-2.6-13 1z" />
      <path d="M33 15c-7-4-13-1-14 3 4-3 9-2.6 13 1z" />
      <path d="M33 14c2-7 8-9 12-7-4 1-7 4-9 8z" />
    </g>
    <circle cx="33" cy="13.5" r="3" fill={c.gd} />
  </>
);
