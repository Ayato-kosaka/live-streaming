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

  /**
   * 寝袋。
   *
   * 丸めた姿は、断面をどう描いても的か渦にしか見えなかった（2回描き直した）。
   * **広げた姿**にする。頭のほうが広く足へすぼまるマミー型に、ファスナーを1本。
   * 中の裏地を覗かせると、袋（入れるもの）だと分かる。
   */
  sleepingbag: (c) => (
    <>
      <Sh c={c} cy={57} rx={15} ry={3.2} />
      {/* 外側。頭 22 → 足 14 へすぼめる */}
      <path
        d="M32 4c8 0 13 5.4 13 13.2v27c0 6.6-4.4 11.4-9 11.4h-8c-4.6 0-9-4.8-9-11.4v-27C19 9.4 24 4 32 4z"
        fill={c.tl}
      />
      <path d="M32 4c8 0 13 5.4 13 13.2v27c0 6.6-4.4 11.4-9 11.4h-4z" fill={c.tld} />
      {/* 開いた口から見える裏地 */}
      <path d="M32 8.4c5.4 0 8.8 3.6 8.8 8.8v3.6H23.2v-3.6c0-5.2 3.4-8.8 8.8-8.8z" fill={c.cr} />
      <path d="M32 8.4c5.4 0 8.8 3.6 8.8 8.8v3.6H32z" fill={c.crd} />
      {/* ファスナー。歯を並べる */}
      <rect x="30.4" y="20" width="3.2" height="32" rx="1.6" fill={c.gyd} />
      <g fill={c.gy}>
        <rect x="29" y="23" width="6" height="1.8" rx="0.9" />
        <rect x="29" y="28" width="6" height="1.8" rx="0.9" />
        <rect x="29" y="33" width="6" height="1.8" rx="0.9" />
        <rect x="29" y="38" width="6" height="1.8" rx="0.9" />
        <rect x="29" y="43" width="6" height="1.8" rx="0.9" />
      </g>
      <path d="M28.6 50h6.8l-1.4 5.4a1.8 1.8 0 0 1-1.7 1.4h-.6a1.8 1.8 0 0 1-1.7-1.4z" fill={c.gyd} />
      <Gl c={c} cx={24} cy={28} rx={2} ry={8} r={0} o={0.45} />
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
};
