import type { Draw } from "./bits";
import { Sh, Gl } from "./bits";
// ブラウザまで運ぶ印はここには置かない（`core.tsx` の頭を読む）。並びだけこの表で決める
import { map, pin, signpost, walk } from "./core";

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

  /**
   * 寝袋。
   *
   * 丸めた姿は、断面をどう描いても的か渦にしか見えなかった（2回描き直した）。
   * **広げた姿**にする。頭のほうが広く足へすぼまるマミー型に、ファスナーを1本。
   * 中の裏地を覗かせると、袋（入れるもの）だと分かる。
   */
  /**
   * 寝袋。**丸めて紐で縛った状態**を描く。
   *
   * 広げた寝袋（縦長のカプセルに縦のファスナー）は、16px にすると
   * 「縦の棒＋下のふくらみ」だけが残って**体温計に見えていた**。
   * 丸めた形なら横長になるので、縦長の印（体温計・瓶・電池）と輪郭で分かれる。
   * 左の口を渦にして、締めベルトを2本。この3つだけで小さくても「巻いた物」と読める。
   */
  sleepingbag: (c) => (
    <>
      <Sh c={c} cy={53} rx={26} ry={4} />
      {/* 巻いた胴。横長のカプセル */}
      <rect x="5" y="19" width="54" height="29" rx="14.5" fill={c.tl} />
      {/* 下半分を沈める。丸い筒に見せるのはこの帯 */}
      <path d="M19.5 48A14.5 14.5 0 0 1 5 33.5h54A14.5 14.5 0 0 1 44.5 48z" fill={c.tld} />
      {/* 左の口。渦を2重にして「巻いてある」を言う */}
      <ellipse cx="14" cy="33.5" rx="9" ry="14.5" fill={c.tld} />
      <ellipse cx="14" cy="33.5" rx="6.4" ry="10.4" fill={c.cr} />
      <ellipse cx="14.8" cy="33.5" rx="3" ry="5" fill={c.crd} />
      {/* 締めベルト。留め具を右のベルトにだけ付けて、左右を同じ絵にしない */}
      <g fill={c.brd}>
        <rect x="27" y="17.6" width="6.4" height="32" rx="2.4" />
        <rect x="45" y="17.6" width="6.4" height="32" rx="2.4" />
      </g>
      <rect x="45.4" y="30.4" width="5.6" height="6.2" rx="1.8" fill={c.gd} />
      <Gl c={c} cx={34} cy={24} rx={9} ry={2.4} r={0} o={0.4} />
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

  map,

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

  /**
   * ヒッチハイクの親指。👍の代わり。
   *
   * 記号にすると👍と同じ「不細工なもの」に戻るので、手として描く。
   * 親指と拳を同じ肌色でつなぐと団子になるので、**折った指を段にして影で割る**。
   * 袖を入れると手首の位置が決まって、腕が生えている向きが分かる。
   */
  thumb: (c) => (
    <>
      <Sh c={c} cy={58} rx={16} ry={3.4} />
      {/* 袖。ここが手の付け根になる */}
      <rect x="13" y="43" width="38" height="16" rx="7" fill={c.bld} />
      <rect x="13" y="43" width="38" height="9" rx="4.5" fill={c.bl} />
      {/* 拳。手の甲側なので親指の付け根が左に張り出す */}
      <path
        d="M20 30c0-6 4-9 10-9h11c5.6 0 9.6 3.6 9.6 8.6v11.8c0 4.4-3.4 7.6-8 7.6H27c-4.2 0-7-2.8-7-7z"
        fill={c.sn}
      />
      {/* 折った指。3本ぶんの段。影の帯で割ると「握っている」に見える */}
      <g fill={c.snd}>
        <rect x="29" y="28.4" width="22" height="2.6" rx="1.3" opacity="0.75" />
        <rect x="29" y="35" width="22" height="2.6" rx="1.3" opacity="0.75" />
        <rect x="29" y="41.6" width="22" height="2.6" rx="1.3" opacity="0.75" />
      </g>
      <path d="M43 21c4.6.6 7.6 4 7.6 8.6v11.8c0 4.4-3.4 7.6-8 7.6h-3z" fill={c.snd} opacity="0.5" />
      {/* 親指。拳から浮かせるため、根元に影を1本入れてから立てる */}
      <path d="M19.5 27.5c1.6-3 5-4.4 8-3.6l3 5.6-9.6 3.6z" fill={c.snd} opacity="0.6" />
      <rect
        x="17.5"
        y="5"
        width="13.4"
        height="25"
        rx="6.7"
        fill={c.sn}
        transform="rotate(-9 24.2 17.5)"
      />
      {/* 爪。ここが1つ入るだけで「指」に見える */}
      <rect
        x="19.6"
        y="7.6"
        width="8.4"
        height="7"
        rx="3.5"
        fill={c.cr}
        opacity="0.9"
        transform="rotate(-9 23.8 11.1)"
      />
      <Gl c={c} cx={21.5} cy={19} rx={2} ry={6} r={9} o={0.4} />
    </>
  ),

  /**
   * 道。まっすぐ奥へ伸ばすと三角形になって、円錐にしか見えなかった。
   * S字に曲げて、両脇に草を置くと「向こうへ続いている」が出る。
   */
  road: (c) => (
    <>
      <rect x="2" y="6" width="60" height="52" rx="12" fill={c.grl} />
      <path d="M2 34c10-4 18 2 30 2s22-6 30-2v12a12 12 0 0 1-12 12H14A12 12 0 0 1 2 46z" fill={c.gr} />
      {/* 路面。上ほど細く、途中で左へ振る */}
      <path
        d="M26 6h12l-2.4 11c-.6 3 .6 4.6 3.4 6.4 5 3.2 6.6 8 4 13.6-2.8 6-2.6 10.6 1.6 15.6l4.6 5.4H35l-2.6-4c-4.6-7-4.4-13.6.6-20.6 1.6-2.2 1.2-4-1.6-5.6-5.4-3-7.4-7.6-6-13.4z"
        fill={c.gyd}
      />
      {/* 中央線。奥ほど短く細くする */}
      <g fill={c.cr}>
        <rect x="31.2" y="8.4" width="2" height="4.6" rx="1" />
        <rect x="30.6" y="17.5" width="2.4" height="5" rx="1.2" />
        <rect x="34.4" y="28" width="3" height="6" rx="1.5" />
        <rect x="32.6" y="39.5" width="3.6" height="7" rx="1.8" />
        <rect x="36.4" y="51" width="4.4" height="7" rx="2.2" />
      </g>
      <g fill={c.grd} opacity="0.55">
        <ellipse cx="13" cy="44" rx="5" ry="2.6" />
        <ellipse cx="52" cy="40" rx="4.4" ry="2.4" />
        <ellipse cx="20" cy="53" rx="4" ry="2.2" />
      </g>
    </>
  ),

  signpost,

  /**
   * キャンピングカー。全体をクリームで塗ると明るい下地に溶けるので、
   * 下半分を色にした2トーンにする。屋根の日よけで「住む車」だと分かる。
   */
  camper: (c) => (
    <>
      <Sh c={c} cy={55} rx={26} ry={3.8} />
      {/* 日よけ。屋根の上に出すと旗に見えたので、**車体の横へ張り出させる**。
          これが有るかどうかで、バスとキャンピングカーが分かれる */}
      <path d="M43 22h20l-1.6 4.4H43z" fill={c.rdd} />
      <path d="M46 22h4.4l-1.2 4.4h-4.4zM55 22h4.4l-1.2 4.4h-4.4z" fill={c.w} opacity="0.8" />
      <rect x="60.6" y="25" width="2.4" height="20" rx="1.2" fill={c.gyd} />
      <rect x="2" y="13" width="46" height="32" rx="8" fill={c.cr} />
      <path d="M2 30h46v7a8 8 0 0 1-8 8H10a8 8 0 0 1-8-8z" fill={c.or} />
      <path d="M28 30h20v7a8 8 0 0 1-8 8H28z" fill={c.ord} />
      <path d="M40 13a8 8 0 0 1 8 8v9H28V13z" fill={c.crd} />
      <rect x="2" y="27.6" width="46" height="3.6" fill={c.tl} />
      <rect x="7" y="17" width="13" height="9" rx="3" fill={c.sk} />
      <rect x="24" y="17" width="11" height="9" rx="3" fill={c.sk} />
      <rect x="38" y="17" width="8" height="9" rx="3" fill={c.skd} />
      {/* ルーフボックス。上に荷物を積んでいる */}
      <rect x="14" y="7" width="22" height="7" rx="3.4" fill={c.grd} />
      <rect x="14" y="7" width="22" height="3" rx="1.5" fill={c.gr} />
      <rect x="26" y="34" width="9" height="11" rx="2.4" fill={c.br} />
      <circle cx="15" cy="46" r="7" fill={c.bk} />
      <circle cx="15" cy="46" r="3" fill={c.gy} />
      <circle cx="39" cy="46" r="7" fill={c.bk} />
      <circle cx="39" cy="46" r="3" fill={c.gy} />
      <Gl c={c} cx={10} cy={18} rx={5} ry={1.8} r={-4} o={0.4} />
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

  /**
   * 飛行機。真っ白だと明るい下地に溶けて消えていた。
   * 翼を色にして、胴だけ白く残す。こうすると小さくしても形が残る。
   */
  plane: (c) => (
    <>
      <Sh c={c} cy={58} rx={13} ry={3} />
      {/* 主翼と尾翼。ここで色を持つ */}
      <path d="M31 22h2l27 12.4v6.2l-27-5.6-2 .1z" fill={c.bld} />
      <path d="M33 22h-2L4 34.4v6.2l27-5.6 2 .1z" fill={c.bl} />
      <path d="M32 44.6 45.4 52v4.4L32 53.2 18.6 56.4V52z" fill={c.bl} />
      {/* 胴。上に白、右下に影 */}
      <path d="M32 3c3.6 0 6 4.6 6.2 10.6l1 30.6c.1 3.4-3 6.4-7.2 6.4s-7.3-3-7.2-6.4l1-30.6C26 7.6 28.4 3 32 3z" fill={c.w} />
      <path d="M32 3c3.6 0 6 4.6 6.2 10.6l1 30.6c.1 3.4-3 6.4-7.2 6.4z" fill={c.wd} />
      <rect x="28.6" y="16" width="6.8" height="6" rx="3" fill={c.sk} />
      <circle cx="32" cy="10" r="2.6" fill={c.rd} />
      <Gl c={c} cx={28.6} cy={26} rx={1.8} ry={7} r={2} o={0.55} />
    </>
  ),

  bike: (c) => (
    <>
      <Sh c={c} cy={56} rx={26} ry={3.4} />
      {/* タイヤは黒。暗い下地だと消えるので、内側に明るいリムを1本入れて輪を残す */}
      <g fill="none" stroke={c.bk} strokeWidth="4.4">
        <circle cx="15" cy="40" r="12" />
        <circle cx="49" cy="40" r="12" />
      </g>
      <g fill="none" stroke={c.gy} strokeWidth="2.4">
        <circle cx="15" cy="40" r="8.6" />
        <circle cx="49" cy="40" r="8.6" />
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

  walk,

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

  pin,

  /** 路面電車。ヨーロッパの街なか。 */
  tram: (c) => (
    <>
      <Sh c={c} cy={57} rx={20} ry={3.4} />
      <path d="M32 3v9" stroke={c.gyd} strokeWidth="2.6" strokeLinecap="round" />
      <path d="M24 12h16l-8-6z" fill={c.gyd} />
      <rect x="12" y="12" width="40" height="42" rx="8" fill={c.rd} />
      <path d="M44 12a8 8 0 0 1 8 8v26a8 8 0 0 1-8 8H32V12z" fill={c.rdd} />
      <rect x="17" y="18" width="30" height="14" rx="3.4" fill={c.sk} />
      <rect x="17" y="18" width="15" height="14" rx="3.4" fill={c.skd} opacity="0.5" />
      <rect x="16" y="37" width="32" height="4.4" rx="2.2" fill={c.cr} />
      <g fill={c.yl}>
        <circle cx="20" cy="47" r="3.2" />
        <circle cx="44" cy="47" r="3.2" />
      </g>
      <rect x="8" y="54" width="48" height="5" rx="2.5" fill={c.gyd} />
      <Gl c={c} cx={20} cy={20} rx={5} ry={2} r={-6} o={0.5} />
    </>
  ),

  /** タクシー。屋根の行灯で分かる。 */
  taxi: (c) => (
    <>
      <Sh c={c} cy={55} rx={26} ry={3.8} />
      <rect x="24" y="8" width="16" height="7" rx="3" fill={c.w} />
      <rect x="24" y="8" width="16" height="3.4" rx="1.7" fill={c.wd} />
      <path d="M17 21c2.6-4.4 5-6 9-6h12c4 0 6.4 1.6 9 6z" fill={c.crd} />
      <path d="M4 24h56a4 4 0 0 1 4 4v9a5 5 0 0 1-5 5H5a5 5 0 0 1-5-5v-9a4 4 0 0 1 4-4z" fill={c.gd} />
      <path d="M32 24h28a4 4 0 0 1 4 4v9a5 5 0 0 1-5 5H32z" fill={c.gdd} />
      <path d="M14 24c1.6-5 4-8 8-8h20c4 0 6.4 3 8 8z" fill={c.gd} />
      <path d="M19 22c1.2-2.8 2.8-4 5-4h16c2.2 0 3.8 1.2 5 4z" fill={c.sk} />
      <g fill={c.bk}>
        <rect x="12" y="30" width="6" height="4" rx="2" />
        <rect x="46" y="30" width="6" height="4" rx="2" />
      </g>
      <circle cx="17" cy="44" r="7" fill={c.bk} />
      <circle cx="17" cy="44" r="3" fill={c.gy} />
      <circle cx="47" cy="44" r="7" fill={c.bk} />
      <circle cx="47" cy="44" r="3" fill={c.gy} />
      <Gl c={c} cx={14} cy={28} rx={5} ry={1.6} r={-4} o={0.5} />
    </>
  ),

  /** 小舟。川と湖を渡る。 */
  boat: (c) => (
    <>
      <rect x="1" y="34" width="62" height="24" rx="10" fill={c.bl} />
      <path d="M1 42h62v6a10 10 0 0 1-10 10H11A10 10 0 0 1 1 48z" fill={c.tl} />
      <path d="M2 47c6-3 10 3 16 0s10 3 16 0 10 3 16 0 8-.6 11-2.4v4.6c-3 1.8-7 1.6-11 3.4-6 2.6-10-3-16 0s-10-3-16 0-10 3-16 0z" fill={c.w} opacity="0.6" />
      <path d="M6 32h52l-6 12a5 5 0 0 1-4.4 2.6H16.4A5 5 0 0 1 12 44z" fill={c.wo} />
      <path d="M32 32h26l-6 12a5 5 0 0 1-4.4 2.6H32z" fill={c.wod} />
      <rect x="6" y="28" width="52" height="5" rx="2.5" fill={c.wol} />
      <path d="M36 6h3v24h-3z" fill={c.wod} />
      <path d="M36 8 20 27h16z" fill={c.w} />
      <path d="M40 10l12 17H40z" fill={c.rd} />
      <Gl c={c} cx={16} cy={30} rx={6} ry={1.4} r={-3} o={0.5} />
    </>
  ),

  /** 給油。長距離を走る日。 */
  fuel: (c) => (
    <>
      <Sh c={c} cy={57} rx={17} ry={3.2} />
      <path d="M50 20h4a5 5 0 0 1 5 5v16a4 4 0 0 1-8 0v-9h-4z" fill="none" stroke={c.gyd} strokeWidth="4.4" strokeLinejoin="round" />
      <path d="M12 14a8 8 0 0 1 8-8h20a8 8 0 0 1 8 8v43H12z" fill={c.rd} />
      <path d="M30 6h10a8 8 0 0 1 8 8v43H30z" fill={c.rdd} />
      <rect x="18" y="14" width="24" height="14" rx="3" fill={c.cr} />
      <rect x="30" y="14" width="12" height="14" fill={c.crd} />
      <rect x="18" y="34" width="16" height="4.4" rx="2.2" fill={c.w} opacity={c.flat ? 1 : 0.7} />
      <rect x="8" y="55" width="44" height="6" rx="3" fill={c.gyd} />
      <path d="M24 42c3 4 5 6 5 8.6a5 5 0 0 1-10 0c0-2.6 2-4.6 5-8.6z" fill={c.or} />
      <Gl c={c} cx={16} cy={20} rx={2} ry={6} r={0} o={0.4} />
    </>
  ),

  /** かさ。骨の割りを白い筋で入れると、丸い塊ではなく「張った布」になる。 */
  umbrella: (c) => (
    <>
      <Sh c={c} cy={58} rx={13} ry={3} />
      <rect x="30.2" y="2" width="3.6" height="7" rx="1.8" fill={c.gyd} />
      <path d="M30 27h4v22h-4z" fill={c.wod} />
      <path d="M34 49v1.6a5.4 5.4 0 0 1-10.8 0" fill="none" stroke={c.wod} strokeWidth="4.4" strokeLinecap="round" />
      <path d="M5 29C5 16.3 17 6 32 6s27 10.3 27 23c-3.6 0-5.6-4.2-9-4.2s-5.4 4.2-9 4.2-5.6-4.2-9-4.2-5.4 4.2-9 4.2-5.6-4.2-9-4.2S8.6 29 5 29z" fill={c.rd} />
      <path d="M32 6c15 0 27 10.3 27 23-3.6 0-5.6-4.2-9-4.2s-5.4 4.2-9 4.2-5.6-4.2-9-4.2z" fill={c.rdd} />
      <g fill={c.w} opacity="0.9">
        <path d="M32 6c1.6 0 2.6 8.2 3 18.8h-2c-.4-10.6-1.4-18.8-1-18.8z" />
        <path d="M14.4 10.6c1.4-.8 4.4 6.4 7.6 15.2l-1.8.8C17 18 13 11.4 14.4 10.6z" />
        <path d="M49.6 10.6c-1.4-.8-4.4 6.4-7.6 15.2l1.8.8c3.2-8.6 7.2-15.2 5.8-16z" />
      </g>
      <Gl c={c} cx={19} cy={17} rx={5.4} ry={2} r={-30} o={0.5} />
    </>
  ),

  /** サングラス。レンズの反射を1本入れると、黒い塊ではなくガラスに見える。 */
  sunglasses: (c) => (
    <>
      <Sh c={c} cy={52} rx={26} ry={3.4} />
      <path d="M2 20h60v5c-3 0-4 1.4-4.6 4l-1.4 6c-1 4.4-4.6 7-9.6 7h-5c-4.6 0-7.6-2.4-9-7l-.4-1.4-.4 1.4c-1.4 4.6-4.4 7-9 7h-5c-5 0-8.6-2.6-9.6-7l-1.4-6C6 26.4 5 25 2 25z" fill={c.rd} />
      <path d="M32 20h30v5c-3 0-4 1.4-4.6 4l-1.4 6c-1 4.4-4.6 7-9.6 7h-5c-4.6 0-7.6-2.4-9-7l-.4-1.4z" fill={c.rdd} />
      <path d="M8 25h19l-1.6 8.6c-.8 4-3 6-6.6 6h-3.2c-3.6 0-5.8-2-6.6-6z" fill={c.nv} />
      <path d="M37 25h19l-1.6 8.6c-.8 4-3 6-6.6 6h-3.2c-3.6 0-5.8-2-6.6-6z" fill={c.nv} />
      <g fill={c.sk} opacity="0.7">
        <path d="M11 26h4.4l-3.4 12h-1.4c-1.4-.8-2.2-2.2-2.6-4.4z" />
        <path d="M40 26h4.4L41 38h-1.4c-1.4-.8-2.2-2.2-2.6-4.4z" />
      </g>
      <Gl c={c} cx={16} cy={22} rx={7} ry={1.6} r={-4} o={0.5} />
    </>
  ),

  /** 水筒。帯を1本入れて、油の瓶と分ける。 */
  bottle: (c) => (
    <>
      <Sh c={c} cy={57} rx={15} ry={3.2} />
      <path d="M42 8h5a3.4 3.4 0 0 1 0 6.8h-3" fill="none" stroke={c.gyd} strokeWidth="3.4" strokeLinecap="round" />
      <rect x="23" y="3" width="18" height="10" rx="4.4" fill={c.gyd} />
      <rect x="23" y="3" width="18" height="4" rx="2" fill={c.gy} />
      <rect x="25.6" y="12" width="12.8" height="5" fill={c.tld} />
      <rect x="16" y="16" width="32" height="42" rx="9" fill={c.tl} />
      <path d="M39 16a9 9 0 0 1 9 9v24a9 9 0 0 1-9 9h-7V16z" fill={c.tld} />
      <rect x="16" y="31" width="32" height="9" fill={c.cr} />
      <rect x="32" y="31" width="16" height="9" fill={c.crd} />
      <Gl c={c} cx={22} cy={26} rx={2.4} ry={7} r={4} o={0.55} />
    </>
  ),

  /** 登山靴。靴ひもと厚い底。旅を「歩いた回数」で数えるページで使う。 */
  shoes: (c) => (
    <>
      <Sh c={c} cy={57} rx={26} ry={3.4} />
      <path d="M15 9h13a5 5 0 0 1 5 5v13c0 4 2.4 6.6 7 8.4l11.6 4.6c4.4 1.8 6.4 4.4 6.4 8V49H15a5 5 0 0 1-5-5V14a5 5 0 0 1 5-5z" fill={c.wo} />
      <path d="M33 27c0 4 2.4 6.6 7 8.4l11.6 4.6c4.4 1.8 6.4 4.4 6.4 8V49H33z" fill={c.wod} />
      <rect x="11" y="8" width="24" height="7" rx="3.5" fill={c.wol} />
      <g fill={c.cr}>
        <rect x="12" y="20" width="22" height="3.4" rx="1.7" transform="rotate(9 23 21.7)" />
        <rect x="12" y="29" width="22" height="3.4" rx="1.7" transform="rotate(9 23 30.7)" />
        <rect x="12" y="38" width="22" height="3.4" rx="1.7" transform="rotate(9 23 39.7)" />
      </g>
      <path d="M8 47h48a5 5 0 0 1 5 5v2H10a4 4 0 0 1-4-4z" fill={c.brd} />
      <g fill={c.bk} opacity="0.35">
        <rect x="16" y="50" width="4" height="4" />
        <rect x="26" y="50" width="4" height="4" />
        <rect x="36" y="50" width="4" height="4" />
        <rect x="46" y="50" width="4" height="4" />
      </g>
      <Gl c={c} cx={17} cy={14} rx={6} ry={1.8} r={-4} o={0.5} />
    </>
  ),

  /** 鍵。宿の鍵。持ち手の穴を濃い金にして、抜けているように見せる。 */
  key: (c) => (
    <>
      <Sh c={c} cy={56} rx={19} ry={3.4} />
      <g transform="rotate(-32 32 32)">
        <rect x="26" y="27.6" width="34" height="9" rx="4.5" fill={c.gd} />
        <rect x="26" y="27.6" width="34" height="4" rx="2" fill={c.yl} />
        <rect x="45" y="34" width="5.4" height="10" rx="2.7" fill={c.gd} />
        <rect x="54" y="34" width="5.4" height="7" rx="2.7" fill={c.gd} />
        <circle cx="19" cy="32" r="15" fill={c.gd} />
        <circle cx="19" cy="32" r="6.4" fill={c.gdd} />
        <path d="M19 17a15 15 0 0 1 0 30 15 15 0 0 1-9-3.2 15 15 0 0 0 0-23.6A15 15 0 0 1 19 17z" fill={c.gdd} opacity="0.6" />
      </g>
      <Gl c={c} cx={17} cy={22} rx={5} ry={2.4} r={-30} o={0.6} />
    </>
  ),

  /** 財布。札とカードを覗かせて「入れるもの」だと言う。 */
  wallet: (c) => (
    <>
      <Sh c={c} cy={55} rx={24} ry={3.6} />
      <rect x="13" y="10" width="26" height="16" rx="2.6" fill={c.grl} />
      <rect x="17" y="7" width="26" height="16" rx="2.6" fill={c.gr} />
      <rect x="34" y="9" width="22" height="14" rx="3" fill={c.sk} />
      <rect x="37" y="13" width="6" height="4.4" rx="1.4" fill={c.gd} />
      <rect x="5" y="20" width="54" height="31" rx="7" fill={c.br} />
      <path d="M32 20h20a7 7 0 0 1 7 7v17a7 7 0 0 1-7 7H32z" fill={c.brd} />
      <rect x="5" y="31" width="54" height="8" fill={c.brd} />
      <rect x="39" y="28" width="12" height="14" rx="4" fill={c.gd} />
      <rect x="42.6" y="32" width="4.8" height="6" rx="2.4" fill={c.gdd} />
      <Gl c={c} cx={14} cy={25} rx={6} ry={1.8} r={-5} o={0.4} />
    </>
  ),

  /** 入国スタンプ。押した跡まで描くと、道具ではなく「入った証」になる。 */
  stamp: (c) => (
    <>
      <Sh c={c} cy={57} rx={24} ry={3.4} />
      <rect x="6" y="33" width="52" height="24" rx="4" fill={c.cr} />
      <path d="M32 33h22a4 4 0 0 1 4 4v16a4 4 0 0 1-4 4H32z" fill={c.crd} />
      <g fill="none" stroke={c.rd} strokeWidth="3.2">
        <circle cx="32" cy="45" r="9.4" />
      </g>
      <rect x="22" y="43.4" width="20" height="3.2" rx="1.6" fill={c.rd} />
      <rect x="24" y="4" width="16" height="11" rx="5" fill={c.nv} />
      <rect x="24" y="4" width="16" height="4.4" rx="2.2" fill={c.bl} />
      <rect x="28.4" y="14" width="7.2" height="6" fill={c.nv} />
      <rect x="12" y="19" width="40" height="9" rx="4" fill={c.bld} />
      <rect x="14" y="26" width="36" height="6" rx="2.6" fill={c.rdd} />
      <Gl c={c} cx={28} cy={7} rx={4} ry={1.4} r={-4} o={0.5} />
    </>
  ),

  /** ロープウェイ。線から吊るすと、バスや電車と混ざらない。 */
  cablecar: (c) => (
    <>
      <path d="M1 9 63 3" fill="none" stroke={c.gyd} strokeWidth="3.4" strokeLinecap="round" />
      <path d="M28 8h8l-1 6h-6z" fill={c.gyd} />
      <path d="M30.4 13h3.2v7h-3.2z" fill={c.gy} />
      <rect x="13" y="18" width="38" height="32" rx="9" fill={c.rd} />
      <path d="M42 18a9 9 0 0 1 9 9v14a9 9 0 0 1-9 9H32V18z" fill={c.rdd} />
      <rect x="18" y="24" width="28" height="15" rx="5" fill={c.sk} />
      <rect x="18" y="24" width="14" height="15" rx="5" fill={c.skd} opacity="0.55" />
      <rect x="16" y="43" width="32" height="4.4" rx="2.2" fill={c.cr} />
      <Sh c={c} cy={57} rx={17} ry={3.2} o={0.2} />
      <Gl c={c} cx={21} cy={26} rx={4.4} ry={2} r={-8} o={0.5} />
    </>
  ),

  /** 気球。トルコの回。ゴア（縦の割り）を色で分ける。 */
  balloon: (c) => (
    <>
      <Sh c={c} cy={59} rx={11} ry={2.8} />
      <path d="M32 3c12.4 0 21 9.4 21 21 0 9-7.4 17-12 22H23C18.4 41 11 33 11 24 11 12.4 19.6 3 32 3z" fill={c.rd} />
      <path d="M32 3c4.6 0 7.6 9.4 7.6 21 0 9-2.6 17-4.4 22h-6.4c-1.8-5-4.4-13-4.4-22C24.4 12.4 27.4 3 32 3z" fill={c.yl} />
      <path d="M32 3c12.4 0 21 9.4 21 21 0 9-7.4 17-12 22h-6c1.8-5 4.4-13 4.4-22C39.4 12.4 36.6 3 32 3z" fill={c.rdd} />
      <path d="M35.6 3c2.4 4.4 4 12 4 21 0 9-2.6 17-4.4 22h-3.2V3z" fill={c.yld} />
      <g stroke={c.wod} strokeWidth="1.8" strokeLinecap="round">
        <path d="M25 46l2 6M39 46l-2 6" />
      </g>
      <path d="M25 50h14l-1.4 9a3 3 0 0 1-3 2.4h-5.2a3 3 0 0 1-3-2.4z" fill={c.wo} />
      <path d="M32 50h7l-1.4 9a3 3 0 0 1-3 2.4H32z" fill={c.wod} />
      <Gl c={c} cx={22} cy={16} rx={3.4} ry={7} r={22} o={0.45} />
    </>
  ),

  /** そり。雪の回。前が反っているかどうかだけで「そり」だと分かる。 */
  sled: (c) => (
    <>
      <Sh c={c} cy={57} rx={26} ry={3.2} />
      <g fill={c.wo}>
        <rect x="12" y="26" width="42" height="6" rx="3" transform="rotate(-5 33 29)" />
        <rect x="12" y="34" width="42" height="6" rx="3" transform="rotate(-5 33 37)" />
      </g>
      <g fill={c.wod}>
        <rect x="18" y="24" width="5.4" height="20" rx="2.7" transform="rotate(-5 20.7 34)" />
        <rect x="42" y="22" width="5.4" height="20" rx="2.7" transform="rotate(-5 44.7 32)" />
      </g>
      {/* 滑走部。前の反りをもっと巻くと、柵ではなく「そり」に見える */}
      <path d="M13 42h41a5 5 0 0 1 5 5v3.4H17a4 4 0 0 1-4-4z" fill={c.rdd} />
      <path d="M13 50.4c-8 0-12-5-12-11.4 0-4 1.4-7.4 4-10l5 4c-1.8 1.8-2.6 3.8-2.6 6 0 3.6 2 5.4 5.6 5.4z" fill={c.rd} />
      <path d="M9 39c0 3.6 2 5.4 5.6 5.4H17v6h-4c-8 0-12-5-12-11.4z" fill={c.rdd} />
      {/* 引きひも */}
      <path d="M4 30c6-4 11-4 16-1" fill="none" stroke={c.wod} strokeWidth="3" strokeLinecap="round" />
      <Gl c={c} cx={26} cy={28} rx={8} ry={1.6} r={-5} o={0.5} />
    </>
  ),

  /** 国境。遮断機と検問所。陸路で越えた回に使う。 */
  border: (c) => (
    <>
      <Sh c={c} cy={57} rx={26} ry={3.2} />
      <rect x="40" y="18" width="21" height="34" rx="4" fill={c.cr} />
      <path d="M50 18h7a4 4 0 0 1 4 4v26a4 4 0 0 1-4 4h-7z" fill={c.crd} />
      <path d="M50.5 8 64 19.6a2 2 0 0 1-1.3 3.4H38.3a2 2 0 0 1-1.3-3.4z" fill={c.rd} />
      <path d="M50.5 8 64 19.6a2 2 0 0 1-1.3 3.4H50.5z" fill={c.rdd} />
      <rect x="44" y="27" width="13" height="10" rx="2.6" fill={c.sk} />
      <rect x="6" y="24" width="12" height="30" rx="4" fill={c.gyd} />
      <rect x="6" y="24" width="12" height="5" rx="2.5" fill={c.gy} />
      <g transform="rotate(-16 12 30)">
        <rect x="10" y="26" width="40" height="9" rx="4.5" fill={c.w} />
        <g fill={c.rd}>
          <path d="M16 26h7l-7 9h-6z" />
          <path d="M30 26h7l-7 9h-6z" />
          <path d="M44 26h6v9h-6l7-9z" />
        </g>
      </g>
      <Gl c={c} cx={9} cy={29} rx={2} ry={4} r={0} o={0.5} />
    </>
  ),

  /** 2段ベッド。安宿に泊まった回。はしごが有ると一目で分かる。 */
  bunk: (c) => (
    <>
      <Sh c={c} cy={57} rx={25} ry={3.2} />
      <g fill={c.wod}>
        <rect x="5" y="6" width="7" height="50" rx="3.5" />
        <rect x="52" y="6" width="7" height="50" rx="3.5" />
      </g>
      <rect x="9" y="24" width="46" height="6" rx="3" fill={c.wo} />
      <rect x="9" y="48" width="46" height="6" rx="3" fill={c.wo} />
      <rect x="11" y="17" width="42" height="8" rx="3" fill={c.w} />
      <rect x="11" y="41" width="42" height="8" rx="3" fill={c.w} />
      <path d="M22 17h31v8H22z" fill={c.bl} />
      <path d="M22 41h31v8H22z" fill={c.tl} />
      <rect x="12" y="13" width="12" height="8" rx="3.4" fill={c.cr} />
      <rect x="12" y="37" width="12" height="8" rx="3.4" fill={c.cr} />
      <g fill={c.wol}>
        <rect x="30" y="26" width="5" height="24" rx="2.5" />
        <rect x="44" y="26" width="5" height="24" rx="2.5" />
        <rect x="30" y="30" width="19" height="4" rx="2" />
        <rect x="30" y="40" width="19" height="4" rx="2" />
      </g>
      <Gl c={c} cx={8} cy={13} rx={1.6} ry={5} r={0} o={0.4} />
    </>
  ),

  /**
   * 距離。ヒッチハイクは「あと何km」で語られるので、道端の距離標にする。
   * 数字は 16px で読めないから彫らない。**帯2本の長さの差**だけで
   * 「何か書いてある柱」に見せる。柱だけだと宙に立つので、草の土手を足す。
   */
  distance: (c) => (
    <>
      <Sh c={c} cy={56} rx={17} ry={4} />
      <path d="M4 53c8-6 14-7 28-7s20 1 28 7z" fill={c.gr} />
      <rect x="20" y="14" width="24" height="40" rx="6" fill={c.w} />
      <path d="M32 14h6a6 6 0 0 1 6 6v34h-12z" fill={c.wd} />
      <rect x="20" y="7" width="24" height="13" rx="6" fill={c.rd} />
      <path d="M32 7h6a6 6 0 0 1 6 6v7H32z" fill={c.rdd} />
      <g fill={c.nv}>
        <rect x="24" y="27" width="16" height="4.6" rx="2.3" />
        <rect x="24" y="36" width="11" height="4.6" rx="2.3" />
      </g>
      <Gl c={c} cx={24} cy={24} rx={1.8} ry={6} r={0} o={0.5} />
    </>
  ),

  /**
   * 洗濯。長旅でいちばん困るのはこれ。丸窓の中に水を入れておくと、
   * 16px でも「白い箱」ではなく洗濯機に見える。
   */
  laundry: (c) => (
    <>
      <Sh c={c} cy={57} rx={20} ry={3.6} />
      <rect x="9" y="6" width="46" height="50" rx="8" fill={c.w} />
      <path d="M32 6h14a8 8 0 0 1 8 8v34a8 8 0 0 1-8 8H32z" fill={c.wd} />
      <rect x="14" y="11" width="36" height="7" rx="3.5" fill={c.gy} />
      <circle cx="19.5" cy="14.5" r="2.2" fill={c.rd} />
      <circle cx="27" cy="14.5" r="2.2" fill={c.gr} />
      <circle cx="32" cy="36" r="15" fill={c.gyd} />
      <circle cx="32" cy="36" r="12" fill={c.sk} />
      <path d="M20 38c4-3 8 3 12 0s8 3 12 0v6a12 12 0 0 1-24 0z" fill={c.bl} />
      <g fill={c.w} opacity={c.flat ? 1 : 0.85}>
        <circle cx="26" cy="31" r="2.6" />
        <circle cx="36.5" cy="28.5" r="1.8" />
      </g>
      <Gl c={c} cx={16} cy={14} rx={4} ry={1.6} r={-4} o={0.5} />
    </>
  ),

  /**
   * 電源。北欧はCタイプの丸2本。四角い顔に丸い目が2つ、という形になるので、
   * 小さくしても「プラグ」だと分かる。コードは右下へ垂らして接地影に着ける。
   */
  plug: (c) => (
    <>
      <Sh c={c} cy={57} rx={13} ry={3.2} />
      {/* 差し込む2本。細く長くしないと「鼻」に見える */}
      <g fill={c.nv}>
        <rect x="20" y="3" width="6.4" height="18" rx="3.2" />
        <rect x="37.6" y="3" width="6.4" height="18" rx="3.2" />
      </g>
      {/* 本体。生成りの紙の上でも消えないよう、白ではなく灰でとる */}
      <rect x="14" y="17" width="36" height="24" rx="9" fill={c.gy} />
      <path d="M32 17h9a9 9 0 0 1 9 9v6a9 9 0 0 1-9 9h-9z" fill={c.gyd} />
      {/* コード。右下へ長く垂らして、接地影に着ける */}
      <path d="M32 41v5c0 6 7 5 7 11" fill="none" stroke={c.nv} strokeWidth="6.4" strokeLinecap="round" />
      <Gl c={c} cx={21} cy={24} rx={2.6} ry={5} r={22} o={0.5} />
    </>
  ),

  /**
   * カード。北欧はほとんど現金を使わない。
   * ICチップと磁気帯の2つだけで、他のどの札とも見分けがつく。
   */
  card: (c) => (
    <>
      <Sh c={c} cy={53} rx={24} ry={4} />
      <rect x="4" y="14" width="56" height="36" rx="7" fill={c.bl} />
      <path d="M32 14h21a7 7 0 0 1 7 7v22a7 7 0 0 1-7 7H32z" fill={c.bld} />
      <rect x="4" y="21" width="56" height="8" fill={c.nv} />
      <rect x="11" y="34" width="13" height="10" rx="2.6" fill={c.gd} />
      <rect x="11" y="38" width="13" height="2" fill={c.gdd} />
      <g fill={c.w} opacity={c.flat ? 1 : 0.75}>
        <rect x="30" y="38.4" width="13" height="3.4" rx="1.7" />
        <rect x="46" y="38.4" width="8" height="3.4" rx="1.7" />
      </g>
      <Gl c={c} cx={13} cy={18} rx={6} ry={1.6} r={-4} o={0.45} />
    </>
  ),

  /**
   * 困ったとき。救急箱。
   * 赤い十字を面で置くだけだと医療の記号になるので、**箱の厚みと取っ手**を付けて物にする。
   */
  firstaid: (c) => (
    <>
      <Sh c={c} cy={56} rx={22} ry={4} />
      <path d="M26 14v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3" fill="none" stroke={c.gyd} strokeWidth="4.4" strokeLinecap="round" />
      <rect x="5" y="14" width="54" height="38" rx="8" fill={c.w} />
      <path d="M40 14h11a8 8 0 0 1 8 8v22a8 8 0 0 1-8 8H40z" fill={c.wd} />
      <g fill={c.rd}>
        <rect x="26" y="20" width="11" height="26" rx="3.4" />
        <rect x="18.5" y="27.5" width="26" height="11" rx="3.4" />
      </g>
      <rect x="8" y="30" width="6" height="7" rx="2.4" fill={c.gyd} />
      <Gl c={c} cx={13} cy={19} rx={5} ry={1.8} r={-4} o={0.5} />
    </>
  ),

  /**
   * 行き先を書いた段ボール。
   *
   * ヒッチハイクの絵を親指（`thumb`）1つで済ませると、10回並べたときに
   * 「どの区間も同じこと」に見える。実際に手に持っているのはこの板で、
   * **書いてある地名が変わる**のが区間の違いそのもの。字は 16px で読めないから、
   * 太い1本の帯に置き換えて「大きく書いてある」ことだけを残す。
   */
  hitchsign: (c) => (
    <>
      <Sh c={c} cy={57} rx={20} ry={3.4} />
      <g transform="rotate(-8 32 28)">
        <rect x="8" y="8" width="48" height="34" rx="4" fill={c.wol} />
        <path d="M32 8h20a4 4 0 0 1 4 4v26a4 4 0 0 1-4 4H32z" fill={c.wo} />
        <rect x="14" y="16" width="36" height="8" rx="4" fill={c.bk} />
        <rect x="14" y="29" width="22" height="5" rx="2.5" fill={c.wod} />
      </g>
      {/* 板を下から支える手。指を板の手前に重ねると、持っていることになる */}
      <path d="M16 44h26a5 5 0 0 1 5 5v9H21a5 5 0 0 1-5-5z" fill={c.snd} />
      <g fill={c.sn}>
        <rect x="18" y="41" width="7.6" height="12" rx="3.8" />
        <rect x="27" y="40" width="7.6" height="13" rx="3.8" />
        <rect x="36" y="41.5" width="7.6" height="11" rx="3.8" />
      </g>
      <Gl c={c} cx={16} cy={14} rx={5} ry={2} r={-8} o={0.4} />
    </>
  ),

  /**
   * お金。北欧とバルトは通貨が4種類あって、**紙と硬貨を持ち歩く量が国境ごとに変わる**。
   * `wallet`（入れ物）でも `coin`（1枚）でもなく、**束と枚数**を出したいときはこれ。
   */
  currency: (c) => (
    <>
      <Sh c={c} cy={56} rx={22} ry={3.4} />
      {/* 紙幣は2枚ずらして重ねる。1枚だと札に見えず、ただの四角になる */}
      <g transform="rotate(-7 30 30)">
        <rect x="6" y="18" width="44" height="24" rx="4" fill={c.grd} />
        <rect x="6" y="15" width="44" height="24" rx="4" fill={c.gr} />
        <rect x="28" y="15" width="22" height="24" rx="4" fill={c.grd} opacity={c.flat ? 1 : 0.5} />
        <circle cx="28" cy="27" r="7" fill={c.grl} />
        <circle cx="28" cy="27" r="4" fill={c.gr} />
        <g fill={c.grl} opacity={c.flat ? 1 : 0.9}>
          <rect x="10" y="19" width="7" height="4" rx="2" />
          <rect x="39" y="31" width="7" height="4" rx="2" />
        </g>
      </g>
      {/* 硬貨。厚みを2枚ぶん出すと、絵が金属になる */}
      <ellipse cx="46" cy="48" rx="13" ry="7" fill={c.gdd} />
      <ellipse cx="46" cy="45.6" rx="13" ry="7" fill={c.gd} />
      <ellipse cx="46" cy="45.6" rx="8" ry="4.2" fill={c.yl} />
      <Gl c={c} cx={38} cy={43} rx={3.6} ry={1.6} r={-14} o={0.55} />
    </>
  ),

  /**
   * SIM。北欧は eSIM で入れる国と、物のSIMを買う国が混ざる。
   * `wifi`（電波）は「つながっているか」で、こちらは**入れるもの**。
   */
  sim: (c) => (
    <>
      <Sh c={c} cy={56} rx={17} ry={3.4} />
      <path d="M16 6h22l12 12v36a5 5 0 0 1-5 5H16a5 5 0 0 1-5-5V11a5 5 0 0 1 5-5z" fill={c.gd} />
      <path d="M32 6h6l12 12v36a5 5 0 0 1-5 5H32z" fill={c.gdd} />
      {/* 欠けた角。SIM をSIMたらしめているのはここ1つ */}
      <path d="M38 6l12 12H38z" fill={c.yl} />
      <rect x="18" y="24" width="26" height="24" rx="4" fill={c.gyd} />
      <rect x="18" y="24" width="26" height="24" rx="4" fill={c.gy} />
      <g fill={c.gyd}>
        <rect x="18" y="31" width="26" height="2.6" />
        <rect x="18" y="39" width="26" height="2.6" />
        <rect x="29.7" y="24" width="2.6" height="24" />
      </g>
      <Gl c={c} cx={19} cy={13} rx={2} ry={5} r={0} o={0.4} />
    </>
  ),

  /**
   * 防寒の上着。9月のバルトは、昼と朝で1枚ぶん違う。
   * `shirt`（Tシャツ）と分けてあるのは、しおりの服装の章が
   * 「何を着るか」ではなく**「何枚重ねるか」**の話だから。前を開けて中を見せる。
   */
  jacket: (c) => (
    <>
      <Sh c={c} cy={56} rx={22} ry={3.6} />
      <path d="M24 9 10 15l-4 20 8 3v18a3 3 0 0 0 3 3h6V9z" fill={c.nv} />
      <path d="M40 9l14 6 4 20-8 3v18a3 3 0 0 1-3 3h-6V9z" fill={c.bld} />
      {/* 中に着ているもの。ここが無いと、ただの紺の板になる */}
      <path d="M24 9h16v47H24z" fill={c.cr} />
      <path d="M32 9h8v47h-8z" fill={c.crd} />
      <path d="M24 9c0 5 3.6 8 8 8s8-3 8-8l-3-2c-1.6 2.6-3 3.6-5 3.6s-3.4-1-5-3.6z" fill={c.wo} />
      {/* ファスナー。細い1本だと消えるので、玉を1つ付ける */}
      <rect x="30.6" y="14" width="2.8" height="42" fill={c.gyd} />
      <circle cx="32" cy="32" r="3" fill={c.gy} />
      <path d="M6 35l8 3v6l-9-3z" fill={c.bld} />
      <path d="M58 35l-8 3v6l9-3z" fill={c.bld} />
      <Gl c={c} cx={17} cy={22} rx={2.4} ry={7} r={12} o={0.35} />
    </>
  ),

  /** ニット帽。持ち物リストで「これだけは要る」と言うためのもの。 */
  beanie: (c) => (
    <>
      <Sh c={c} cy={55} rx={20} ry={3.4} />
      <path d="M32 8c12 0 20 9 20 21v9H12v-9C12 17 20 8 32 8z" fill={c.rd} />
      <path d="M32 8c12 0 20 9 20 21v9H32z" fill={c.rdd} />
      <g fill={c.rdd} opacity={c.flat ? 1 : 0.6}>
        <path d="M24 12v26h2.6V11z" />
        <path d="M38 11v27h2.6V12z" />
      </g>
      <rect x="7" y="36" width="50" height="14" rx="7" fill={c.cr} />
      <path d="M32 36h18a7 7 0 0 1 0 14H32z" fill={c.crd} />
      <circle cx="32" cy="6" r="6" fill={c.cr} />
      <Gl c={c} cx={22} cy={16} rx={4} ry={6} r={-34} o={0.4} />
    </>
  ),

  /** 手袋。北へ上がるほど早く要る。片方だけだと落とし物に見えるので2つ描く。 */
  gloves: (c) => (
    <>
      <Sh c={c} cy={56} rx={22} ry={3.4} />
      <g transform="rotate(-12 20 34)">
        <path d="M10 22h14a6 6 0 0 1 6 6v18a6 6 0 0 1-6 6H12a6 6 0 0 1-6-6V28a6 6 0 0 1 4-6z" fill={c.tl} />
        <path d="M6 30c-3.4-1-5.6.6-5.6 3.4S2.6 38 6 38.4z" fill={c.tl} />
        <path d="M8 16h16a3 3 0 0 1 3 3v5H7v-5a3 3 0 0 1 1-3z" fill={c.cr} />
        <rect x="6" y="44" width="24" height="4" rx="2" fill={c.tld} />
      </g>
      <g transform="rotate(12 46 34)">
        <path d="M40 22h14a6 6 0 0 1 6 6v18a6 6 0 0 1-6 6H42a6 6 0 0 1-6-6V28a6 6 0 0 1 4-6z" fill={c.tld} />
        <path d="M60 30c3.4-1 5.6.6 5.6 3.4S63.4 38 60 38.4z" fill={c.tld} />
        <path d="M38 16h16a3 3 0 0 1 3 3v5H37v-5a3 3 0 0 1 1-3z" fill={c.crd} />
      </g>
      <Gl c={c} cx={14} cy={26} rx={3} ry={5} r={-20} o={0.4} />
    </>
  ),

  /**
   * タオル。サウナの章に要る。
   * フィンランドのサウナは、座るのに敷くものが1枚要る（`misc.sauna` は桶と柄杓）。
   */
  towel: (c) => (
    <>
      <Sh c={c} cy={56} rx={21} ry={3.4} />
      <path d="M12 10h40a4 4 0 0 1 4 4v34a4 4 0 0 1-4 4H12z" fill={c.sk} />
      <path d="M34 10h18a4 4 0 0 1 4 4v34a4 4 0 0 1-4 4H34z" fill={c.skd} />
      {/* 巻いた端。渦を1つ入れると、畳んだ布ではなく巻いたタオルになる */}
      <path d="M12 10a11 11 0 0 1 0 42z" fill={c.w} />
      <path d="M12 18a3.4 3.4 0 0 1 0 6.8 6.8 6.8 0 0 0 0 13.6 3.4 3.4 0 0 1 0 6.8" fill="none" stroke={c.skd} strokeWidth="2.6" strokeLinecap="round" />
      <g fill={c.w} opacity={c.flat ? 1 : 0.8}>
        <rect x="26" y="16" width="30" height="4" rx="2" />
        <rect x="26" y="42" width="30" height="4" rx="2" />
      </g>
      <Gl c={c} cx={18} cy={18} rx={2.4} ry={5} r={-16} o={0.5} />
    </>
  ),

  /**
   * ATM。バルトは現金がまだ要る国があって、**下ろす場所**が日程に効く。
   * `card`（持っているもの）と `currency`（お金そのもの）から、行為だけを分けた。
   */
  atm: (c) => (
    <>
      <Sh c={c} cy={57} rx={20} ry={3.4} />
      <rect x="10" y="4" width="44" height="52" rx="6" fill={c.gyd} />
      <path d="M32 4h16a6 6 0 0 1 6 6v40a6 6 0 0 1-6 6H32z" fill={c.gy} opacity={c.flat ? 1 : 0.35} />
      <rect x="16" y="10" width="32" height="18" rx="3.4" fill={c.tld} />
      <rect x="16" y="10" width="32" height="18" rx="3.4" fill={c.sk} />
      <g fill={c.w} opacity={c.flat ? 1 : 0.85}>
        <rect x="20" y="15" width="18" height="3.4" rx="1.7" />
        <rect x="20" y="21" width="11" height="3.4" rx="1.7" />
      </g>
      {/* 出てくる紙幣。斜めに突き出すと、口から出てきたことになる */}
      <rect x="17" y="33" width="30" height="4.6" rx="2.3" fill={c.bk} />
      <g transform="rotate(-6 32 40)">
        <rect x="19" y="36" width="26" height="13" rx="2.6" fill={c.gr} />
        <rect x="19" y="36" width="26" height="4" rx="2" fill={c.grl} />
      </g>
      <g fill={c.gy}>
        <rect x="18" y="50" width="7" height="4" rx="2" />
        <rect x="28" y="50" width="7" height="4" rx="2" />
        <rect x="38" y="50" width="7" height="4" rx="2" />
      </g>
      <Gl c={c} cx={19} cy={9} rx={5} ry={1.6} r={-4} o={0.4} />
    </>
  ),

  /**
   * モバイルバッテリー。車を待つあいだ地図を出しっぱなしにするので、いちばん減るもの。
   * `plug`（挿すところ）とは別で、こちらは**持って歩く電気**。
   */
  powerbank: (c) => (
    <>
      <Sh c={c} cy={57} rx={16} ry={3.4} />
      <rect x="17" y="6" width="30" height="50" rx="7" fill={c.nv} />
      <path d="M32 6h8a7 7 0 0 1 7 7v36a7 7 0 0 1-7 7h-8z" fill={c.bld} opacity={c.flat ? 1 : 0.5} />
      <rect x="22" y="14" width="20" height="26" rx="4" fill={c.bk} />
      <g fill={c.gr}>
        <rect x="25" y="30" width="14" height="6" rx="2.4" />
        <rect x="25" y="22" width="14" height="6" rx="2.4" />
      </g>
      <rect x="25" y="14.5" width="14" height="6" rx="2.4" fill={c.gr} opacity={c.flat ? 1 : 0.3} />
      {/* 差し口。ここが無いと、ただの黒い板になる */}
      <rect x="24" y="45" width="7" height="5" rx="2" fill={c.gy} />
      <rect x="34" y="45" width="7" height="5" rx="2" fill={c.gy} />
      <Gl c={c} cx={23} cy={13} rx={2.4} ry={5} r={10} o={0.4} />
    </>
  ),
};
