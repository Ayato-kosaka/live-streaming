import type { Draw } from "./bits";
import { Sh, Gl, Eye, Blush } from "./bits";

/**
 * 島の場所。入口ごとに **別々の絵**を持たせる。
 *
 * 「あやと島について」と「キャラクター紹介」が同じ絵だったのが直接の直し元。
 * 場所は場所の絵、人は人の絵にする。使い回さない。
 */

export const place: Record<string, Draw> = {
  /** たき火広場 = /about。島の入口。 */
  campfire: (c) => (
    <>
      <Sh c={c} cy={53} rx={21} ry={5} />
      {/* 焚き木。2本を交差させて、上の1本だけ明るくする */}
      <rect
        x="7"
        y="41"
        width="50"
        height="9"
        rx="4.5"
        fill={c.wod}
        transform="rotate(10 32 45.5)"
      />
      <rect
        x="7"
        y="41"
        width="50"
        height="9"
        rx="4.5"
        fill={c.wo}
        transform="rotate(-10 32 45.5)"
      />
      <Gl c={c} cx={20} cy={42} rx={7} ry={1.7} r={-10} o={0.35} />
      {/* 炎。外は橙、中は黄。左上が明るい */}
      <path
        d="M32 5c1.4 6.6 6 8.8 9.2 13.6 3.6 5.4 3.4 12.6-1.4 16.9A13.6 13.6 0 0 1 19.6 18.9c1.3-1.9 2.1-3.6 2.5-5.6 2.2 2 3.4 4.3 3.7 7 1.7-4.3 5-9.6 6.2-15.3z"
        fill={c.or}
      />
      <path
        d="M32 21.5c3.5 4 5.6 6.3 5.6 9.6a5.6 5.6 0 1 1-11.2 0c0-3.3 2.1-5.6 5.6-9.6z"
        fill={c.yl}
      />
      <Gl c={c} cx={26} cy={20} rx={2.4} ry={5} r={18} o={0.45} />
    </>
  ),

  /**
   * 愉快な仲間達 = 住人の紹介。
   *
   * 「あやと島について」と同じ絵を使い回していたのが直し元。ここは**人**の絵にする。
   * 3人とも丸い顔にすると団子になるので、**耳の形で種類を分ける**
   * （左＝とがった耳、中＝丸い耳、右＝くちばし）。小さくしても輪郭で数えられる。
   */
  friends: (c) => (
    <>
      <Sh c={c} cy={55} rx={24} ry={4.2} />
      {/* 左。とがった耳 */}
      <path d="M6 30 8.6 20l7.4 5zM24 30l-2.6-10-7.4 5z" fill={c.tld} />
      <circle cx="15" cy="39" r="12" fill={c.tl} />
      <path d="M15 27a12 12 0 0 1 0 24z" fill={c.tld} opacity="0.45" />
      <Eye c={c} x={11} y={38} s={0.9} />
      <Eye c={c} x={19} y={38} s={0.9} />
      <Blush c={c} x={7.6} y={42.5} s={0.85} />

      {/* 右。くちばし */}
      <circle cx="49" cy="39" r="12" fill={c.pk} />
      <path d="M49 27a12 12 0 0 1 0 24z" fill={c.pkd} opacity="0.5" />
      <path d="M49 39.4 60 43l-11 3.6z" fill={c.or} />
      <Eye c={c} x={45} y={37} s={0.9} />
      <Eye c={c} x={52.6} y={37} s={0.9} />
      <path d="M43 22c4-4 9-4 12 0-4-1.6-8-1.6-12 0z" fill={c.pkd} />

      {/* 手前。いちばん大きく、丸い耳 */}
      <circle cx="20.5" cy="17" r="6.4" fill={c.crd} />
      <circle cx="43.5" cy="17" r="6.4" fill={c.crd} />
      <circle cx="20.5" cy="17" r="3.2" fill={c.pk} />
      <circle cx="43.5" cy="17" r="3.2" fill={c.pk} />
      <circle cx="32" cy="30" r="15.5" fill={c.cr} />
      <path d="M32 14.5a15.5 15.5 0 0 1 0 31z" fill={c.crd} opacity="0.4" />
      <ellipse cx="32" cy="35.4" rx="8.6" ry="6" fill={c.w} />
      <ellipse cx="32" cy="32" rx="2.8" ry="2.1" fill={c.ink} />
      <path d="M28.6 37.6c1.8 2.2 5 2.2 6.8 0" fill="none" stroke={c.ink} strokeWidth="1.8" strokeLinecap="round" />
      <Eye c={c} x={26} y={26.6} />
      <Eye c={c} x={38} y={26.6} />
      <Blush c={c} x={21.4} y={32.4} />
      <Blush c={c} x={42.6} y={32.4} />
      <Gl c={c} cx={25} cy={20.5} rx={5} ry={3} o={0.4} />
    </>
  ),

  /**
   * 配信やぐら = /streams。
   *
   * 電波を左右の弧にすると翼に見えたので、**上へ飛ばす**。
   * 脚を太くしてハシゴを入れると、小さくしても「やぐら」の骨組みが残る。
   */
  tower: (c) => (
    <>
      <Sh c={c} cy={55} rx={20} ry={4.2} />
      {/* 電波。天辺から上へ */}
      <g fill="none" stroke={c.sk} strokeLinecap="round" opacity={c.flat ? 1 : 0.95}>
        <path d="M22 15a14 14 0 0 1 20 0" strokeWidth="4.6" />
        <path d="M15.5 8.5a23 23 0 0 1 33 0" strokeWidth="4.2" opacity="0.6" />
      </g>
      {/* 脚 */}
      <path d="M12 55 22 26h6L18 55z" fill={c.wod} />
      <path d="M52 55 42 26h-6l10 29z" fill={c.wo} />
      <g fill={c.wol}>
        <rect x="21" y="32" width="22" height="4.4" rx="2.2" />
        <rect x="19" y="41" width="26" height="4.4" rx="2.2" />
        <rect x="17" y="50" width="30" height="4.4" rx="2.2" />
      </g>
      {/* 見張り台と屋根 */}
      <rect x="13" y="22" width="38" height="6.4" rx="3.2" fill={c.wo} />
      <rect x="17" y="17.6" width="30" height="5.4" rx="2.7" fill={c.wol} />
      <path d="M32 5 52 19a2 2 0 0 1-1.4 3.4H13.4A2 2 0 0 1 12 19z" fill={c.rd} />
      <path d="M32 5 52 19a2 2 0 0 1-1.4 3.4H32z" fill={c.rdd} />
      <rect x="30" y="18" width="4" height="4" rx="2" fill={c.gd} />
      <Gl c={c} cx={22} cy={11} rx={4} ry={1.8} r={-34} o={0.4} />
    </>
  ),

  /** アプリ工房 = /apps。作っているものが画面、作る道具が歯車。 */
  workshop: (c) => (
    <>
      <Sh c={c} cy={55} rx={19} ry={4.2} />
      <rect x="14" y="5" width="30" height="50" rx="7" fill={c.nv} />
      <rect x="17.4" y="10" width="23.2" height="38" rx="3.4" fill={c.tl} />
      <rect x="24" y="50" width="10" height="2.6" rx="1.3" fill={c.gyd} />
      <Gl c={c} cx={23} cy={17} rx={3.6} ry={9} r={26} o={0.4} />
      {/* 歯車。8枚の歯を丸い線で太らせて、角を残さない */}
      <g fill={c.or} stroke={c.or} strokeWidth="4" strokeLinejoin="round">
        <path d="M46 30.5h5.2l1.7 4.2 4.4-.9 2.6 4.6-3.2 3.1 2.4 3.8-3.6 3.8-4-1.9-3 3.1-5.2-1.4-.4-4.4-4.3-1.3-.6-5.3 4.1-1.6.4-4.4z" />
      </g>
      <circle cx="47.5" cy="41" r="5.2" fill={c.ord} />
      <circle cx="47.5" cy="41" r="2.4" fill={c.cr} />
    </>
  ),

  /** これから = /next。次の企画。旗を立てたテント。 */
  tent: (c) => (
    <>
      <Sh c={c} cy={54} rx={22} ry={4.4} />
      <path d="M32 10 56 51H8z" fill={c.gr} />
      <path d="M32 10 56 51H32z" fill={c.grd} />
      <path d="M32 24 43 51H21z" fill={c.cr} />
      <path d="M32 30 39 51H25z" fill={c.brd} />
      <rect x="30.6" y="4" width="2.8" height="9" rx="1.4" fill={c.wod} />
      <path d="M33.4 4.5 45 8.2l-11.6 3.6z" fill={c.rd} />
      <Gl c={c} cx={22} cy={32} rx={2.8} ry={9} r={26} o={0.35} />
    </>
  ),

  /** 企画掲示板 = /board。コルクに紙が刺さっている。 */
  board: (c) => (
    <>
      <Sh c={c} cy={55} rx={20} ry={4.2} />
      <rect x="15" y="38" width="6" height="17" rx="2" fill={c.wod} />
      <rect x="43" y="38" width="6" height="17" rx="2" fill={c.wod} />
      <rect x="4" y="8" width="56" height="34" rx="5" fill={c.grd} />
      <rect x="8.5" y="12.5" width="47" height="25" rx="2.6" fill={c.wol} />
      <g fill={c.w}>
        <rect x="12" y="15.6" width="13" height="14" rx="1.6" transform="rotate(-5 18.5 22.6)" />
        <rect x="27" y="18" width="12" height="13" rx="1.6" transform="rotate(4 33 24.5)" />
        <rect x="41" y="15" width="13" height="14" rx="1.6" transform="rotate(-3 47.5 22)" />
      </g>
      <circle cx="18" cy="16.6" r="2" fill={c.rd} />
      <circle cx="33" cy="19.4" r="2" fill={c.bl} />
      <circle cx="47" cy="16.2" r="2" fill={c.yl} />
      <Gl c={c} cx={13} cy={13} rx={7} ry={1.8} r={-4} o={0.4} />
    </>
  ),

  /**
   * 旅の桟橋 = /map。
   *
   * 係船柱を左端だけに置くと重心が左に寄って倒れて見えたので、
   * **左に柱・右に小舟**で釣り合わせる。桟橋は左から右へ張り出す。
   */
  pier: (c) => (
    <>
      {/* 海。深い青 → 浅瀬 → 泡の順に3本（ac-reference 2） */}
      <rect x="1" y="30" width="62" height="28" rx="10" fill={c.bl} />
      <path d="M1 40h62v8a10 10 0 0 1-10 10H11A10 10 0 0 1 1 48z" fill={c.tl} />
      <path
        d="M2 45c6-3 10 3 16 0s10 3 16 0 10 3 16 0 8-.6 11-2.4v4.6c-3 1.8-7 1.6-11 3.4-6 2.6-10-3-16 0s-10-3-16 0-10 3-16 0z"
        fill={c.w}
        opacity="0.6"
      />
      {/* 桟橋の脚 */}
      <g fill={c.wod}>
        <rect x="12" y="34" width="5.4" height="18" rx="2.2" />
        <rect x="28" y="34" width="5.4" height="18" rx="2.2" />
      </g>
      {/* 板張りの床 */}
      <rect x="3" y="26" width="42" height="9" rx="3.4" fill={c.wo} />
      <rect x="3" y="26" width="42" height="3.6" rx="1.8" fill={c.wol} />
      <g fill={c.wod} opacity="0.6">
        <rect x="14" y="26" width="2" height="9" />
        <rect x="25" y="26" width="2" height="9" />
        <rect x="36" y="26" width="2" height="9" />
      </g>
      {/* 係船柱 */}
      <rect x="5" y="12" width="9" height="15" rx="4.5" fill={c.wod} />
      <rect x="3.6" y="9" width="12" height="5.4" rx="2.7" fill={c.wo} />
      {/* 小舟。ここに向かって出ていく */}
      <path d="M42 41h20l-3.4 6.6a3 3 0 0 1-2.7 1.6H48a3 3 0 0 1-2.7-1.6z" fill={c.rd} />
      <path d="M52 41h10l-3.4 6.6a3 3 0 0 1-2.7 1.6H52z" fill={c.rdd} />
      <rect x="50" y="27" width="3.4" height="14" rx="1.7" fill={c.wod} />
      <path d="M54 28.4 62 34l-8 5z" fill={c.w} />
      <Gl c={c} cx={7.6} cy={17} rx={1.5} ry={4} r={0} o={0.4} />
    </>
  ),

  /** キッチン小屋。煙突から湯気が出ている小屋。 */
  kitchen: (c) => (
    <>
      <Sh c={c} cy={54} rx={22} ry={4.4} />
      {/* 煙。白のままだと明るい下地で消えるので、灰を混ぜた白にする */}
      <g fill={c.gy}>
        <circle cx="44" cy="9" r="4.6" />
        <circle cx="50.4" cy="5.6" r="3.4" />
        <circle cx="39.4" cy="4.8" r="2.8" />
      </g>
      <g fill={c.w} opacity={c.flat ? 1 : 0.8}>
        <circle cx="43" cy="8" r="3" />
        <circle cx="49.6" cy="4.8" r="2.2" />
      </g>
      <rect x="39" y="11" width="9" height="12" rx="2" fill={c.rdd} />
      <path d="M32 8 60 30a2.6 2.6 0 0 1-1.7 4.6H5.7A2.6 2.6 0 0 1 4 30z" fill={c.rd} />
      <path d="M32 8 60 30a2.6 2.6 0 0 1-1.7 4.6H32z" fill={c.rdd} />
      <rect x="11" y="33" width="42" height="20" rx="3" fill={c.cr} />
      <rect x="34" y="33" width="19" height="20" fill={c.crd} />
      <rect x="15" y="37" width="11" height="9" rx="2" fill={c.sk} />
      <rect x="37" y="39" width="12" height="14" rx="2.6" fill={c.br} />
      <circle cx="46" cy="46.5" r="1.4" fill={c.gd} />
      <Gl c={c} cx={16} cy={24} rx={3} ry={9} r={38} o={0.35} />
    </>
  ),

  /** 伝説の丘。丘のてっぺんに星が立っている。 */
  hill: (c) => (
    <>
      <path d="M2 54c5-19 14-30 30-30s25 11 30 30z" fill={c.gr} />
      <path d="M32 24c18 0 25 11 30 30H32z" fill={c.grd} />
      <rect x="25" y="17" width="14" height="8" rx="2.4" fill={c.gy} />
      <rect x="25" y="17" width="14" height="3" rx="1.5" fill={c.w} opacity="0.7" />
      <path
        d="m32 1 3.9 7.9 8.7 1.3-6.3 6.1 1.5 8.7L32 20.9l-7.8 4.1 1.5-8.7-6.3-6.1 8.7-1.3z"
        fill={c.gd}
        stroke={c.gd}
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      <Gl c={c} cx={28} cy={8} rx={2} ry={3.4} r={-20} o={0.5} />
      <g fill={c.grl} opacity="0.75">
        <ellipse cx="14" cy="45" rx="3.4" ry="2" />
        <ellipse cx="22" cy="51" rx="3" ry="1.8" />
      </g>
    </>
  ),

  /** いまのポスト。旗が上がっていると新しい知らせがある、の絵。 */
  mailbox: (c) => (
    <>
      <Sh c={c} cy={55} rx={16} ry={4} />
      <rect x="26" y="33" width="9" height="22" rx="3" fill={c.wod} />
      <path d="M14 22a15 15 0 0 1 30 0v14a3 3 0 0 1-3 3H17a3 3 0 0 1-3-3z" fill={c.rd} />
      <path d="M29 7a15 15 0 0 1 15 15v14a3 3 0 0 1-3 3H29z" fill={c.rdd} />
      <rect x="20" y="21" width="18" height="5" rx="2.5" fill={c.brd} />
      <rect x="46" y="12" width="4" height="20" rx="2" fill={c.gyd} />
      <path d="M50 13h11l-3.4 4.4L61 22H50z" fill={c.yl} />
      <Gl c={c} cx={21} cy={16} rx={3} ry={7} r={34} o={0.45} />
    </>
  ),

  /** 島そのもの。トップへ戻る印。 */
  island: (c) => (
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
  ),

  /** 家。パンくずの「島」以外で使う汎用の家。 */
  home: (c) => (
    <>
      <Sh c={c} cy={54} rx={20} ry={4.2} />
      <path d="M32 6 59 28.4a2.8 2.8 0 0 1-1.8 4.9H6.8A2.8 2.8 0 0 1 5 28.4z" fill={c.rd} />
      <path d="M32 6 59 28.4a2.8 2.8 0 0 1-1.8 4.9H32z" fill={c.rdd} />
      <rect x="12" y="32" width="40" height="21" rx="3" fill={c.cr} />
      <rect x="34" y="32" width="18" height="21" fill={c.crd} />
      <rect x="16" y="36" width="11" height="9" rx="2" fill={c.sk} />
      <rect x="33" y="38" width="13" height="15" rx="3" fill={c.br} />
      <circle cx="42.6" cy="45.6" r="1.5" fill={c.gd} />
      <Gl c={c} cx={17} cy={22} rx={3} ry={9} r={40} o={0.35} />
    </>
  ),
};
