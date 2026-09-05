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

  /** 愉快な仲間達 = 住人の紹介。3人ぶんの顔。 */
  friends: (c) => (
    <>
      <Sh c={c} cy={54} rx={22} ry={4.4} />
      {/* 後ろの2人 */}
      <circle cx="13.5" cy="27" r="5" fill={c.tld} />
      <circle cx="14" cy="38" r="11.5" fill={c.tl} />
      <Eye c={c} x={10} y={37} s={0.85} />
      <Eye c={c} x={17.5} y={37} s={0.85} />

      <circle cx="50.5" cy="27" r="5" fill={c.pkd} />
      <circle cx="50" cy="38" r="11.5" fill={c.pk} />
      <Eye c={c} x={46.5} y={37} s={0.85} />
      <Eye c={c} x={54} y={37} s={0.85} />

      {/* 手前の1人。いちばん大きく、耳をつける */}
      <circle cx="21" cy="18" r="6" fill={c.crd} />
      <circle cx="43" cy="18" r="6" fill={c.crd} />
      <circle cx="32" cy="30" r="15" fill={c.cr} />
      <ellipse cx="32" cy="35" rx="8.4" ry="6" fill={c.w} />
      <ellipse cx="32" cy="31.6" rx="2.6" ry="2" fill={c.ink} />
      <Eye c={c} x={26.5} y={27} />
      <Eye c={c} x={37.5} y={27} />
      <Blush c={c} x={21.5} y={32} />
      <Blush c={c} x={42.5} y={32} />
      <Gl c={c} cx={25} cy={21} rx={5} ry={3} o={0.4} />
    </>
  ),

  /** 配信やぐら = /streams。木のやぐらから電波を飛ばしている。 */
  tower: (c) => (
    <>
      <Sh c={c} cy={54} rx={19} ry={4.4} />
      {/* 脚 */}
      <path d="M15 53 24 23h5l-8 30z" fill={c.wod} />
      <path d="M49 53 40 23h-5l8 30z" fill={c.wo} />
      <rect x="19" y="37" width="26" height="4.6" rx="2.3" fill={c.wol} />
      <rect x="20" y="45" width="24" height="4.6" rx="2.3" fill={c.wol} />
      {/* 見張り台と屋根 */}
      <rect x="15" y="19" width="34" height="6" rx="3" fill={c.wo} />
      <path d="M32 4 51 19H13z" fill={c.rd} />
      <path d="M32 4 51 19H32z" fill={c.rdd} />
      {/* 電波 */}
      <path
        d="M11 20a15 15 0 0 1 4.4-10.6l3.6 3.6A9.9 9.9 0 0 0 16.1 20z"
        fill={c.sk}
      />
      <path
        d="M53 20a15 15 0 0 0-4.4-10.6L45 13a9.9 9.9 0 0 1 2.9 7z"
        fill={c.sk}
      />
      <Gl c={c} cx={22} cy={10} rx={4} ry={1.8} r={-38} o={0.4} />
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

  /** 旅の桟橋 = /map。海に張り出した板。 */
  pier: (c) => (
    <>
      <rect x="2" y="34" width="60" height="24" rx="9" fill={c.sk} />
      <path
        d="M4 44c6-3.4 10 3.4 16 0s10 3.4 16 0 10 3.4 16 0 6 0 8-1.4v6c-4 2.6-8-2.6-14 .8s-10-3.4-16 0-10 3.4-16 0-6-2.6-10-1.4z"
        fill={c.w}
        opacity="0.55"
      />
      <rect x="14" y="36" width="6" height="18" rx="2" fill={c.wod} />
      <rect x="42" y="36" width="6" height="18" rx="2" fill={c.wod} />
      <rect x="4" y="26" width="56" height="9" rx="3" fill={c.wo} />
      <g fill={c.wod} opacity="0.65">
        <rect x="16" y="26" width="2" height="9" />
        <rect x="30" y="26" width="2" height="9" />
        <rect x="44" y="26" width="2" height="9" />
      </g>
      {/* 係船柱。ここに船を留める */}
      <rect x="8" y="12" width="9" height="16" rx="4.5" fill={c.wod} />
      <rect x="6.5" y="9" width="12" height="5.5" rx="2.7" fill={c.wo} />
      <Gl c={c} cx={10.5} cy={16} rx={1.6} ry={4} r={0} o={0.4} />
    </>
  ),

  /** キッチン小屋。煙突から湯気が出ている小屋。 */
  kitchen: (c) => (
    <>
      <Sh c={c} cy={54} rx={22} ry={4.4} />
      <g fill={c.w} opacity="0.85">
        <circle cx="44" cy="9" r="4.4" />
        <circle cx="50" cy="5.6" r="3.2" />
        <circle cx="39.6" cy="5" r="2.6" />
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
