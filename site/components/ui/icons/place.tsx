import type { Draw } from "./bits";
import { Sh, Gl, Eye, Blush } from "./bits";
// ブラウザまで運ぶ印はここには置かない（`core.tsx` の頭を読む）。並びだけこの表で決める
import { island } from "./core";

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
      <Sh c={c} cy={56} rx={25} ry={4} />
      {/* 左。とがった耳。手前の顔に隠れないよう外へ寄せて、少し下げる */}
      <path d="M3.5 33 6 23.5l7 4.6zM21 33l-2.5-9.5-7 4.6z" fill={c.tld} />
      <circle cx="13" cy="41" r="11" fill={c.tl} />
      <path d="M13 30a11 11 0 0 1 0 22z" fill={c.tld} opacity="0.45" />
      <Eye c={c} x={9.4} y={40} s={0.85} />
      <Eye c={c} x={16.6} y={40} s={0.85} />
      <Blush c={c} x={6.2} y={44.4} s={0.8} />

      {/* 右。くちばし */}
      <circle cx="53" cy="41" r="11" fill={c.pk} />
      <path d="M53 30a11 11 0 0 1 0 22z" fill={c.pkd} opacity="0.5" />
      <path d="M53 41.4 63 44.6l-10 3.2z" fill={c.or} />
      <Eye c={c} x={49.4} y={39} s={0.85} />
      <Eye c={c} x={56.6} y={39} s={0.85} />
      <path d="M47.6 25.4c3.6-3.6 8-3.6 11 0-3.6-1.4-7.4-1.4-11 0z" fill={c.pkd} />

      {/* 手前。丸い耳。ここだけ表情を作りこむ */}
      <circle cx="22" cy="21" r="6" fill={c.crd} />
      <circle cx="42" cy="21" r="6" fill={c.crd} />
      <circle cx="22" cy="21" r="3" fill={c.pk} />
      <circle cx="42" cy="21" r="3" fill={c.pk} />
      <circle cx="32" cy="33" r="14" fill={c.cr} />
      <path d="M32 19a14 14 0 0 1 0 28z" fill={c.crd} opacity="0.4" />
      <ellipse cx="32" cy="38" rx="8" ry="5.6" fill={c.w} />
      <ellipse cx="32" cy="34.8" rx="2.6" ry="2" fill={c.ink} />
      <path d="M28.8 40.2c1.7 2 4.7 2 6.4 0" fill="none" stroke={c.ink} strokeWidth="1.8" strokeLinecap="round" />
      <Eye c={c} x={26.4} y={30} />
      <Eye c={c} x={37.6} y={30} />
      <Blush c={c} x={22} y={35.4} />
      <Blush c={c} x={42} y={35.4} />
      <Gl c={c} cx={26} cy={24} rx={4.6} ry={2.8} o={0.4} />
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
      <Sh c={c} cy={57} rx={22} ry={3.6} />
      {/* 電波。屋根に重ねると帽子のつばに見えたので、棟の上に間をあけて出す */}
      <rect x="30.6" y="2" width="2.8" height="7" rx="1.4" fill={c.gyd} />
      <g fill="none" strokeLinecap="round">
        <path d="M24 7a11 11 0 0 1 16 0" strokeWidth="4.6" stroke={c.skd} />
        <path d="M19 1.6a18 18 0 0 1 26 0" strokeWidth="4" stroke={c.sk} />
      </g>
      {/*
        脚。前は屋根 38px に対して脚が 26px しかなくて、**きのこに見えていた**。
        屋根を 30px に絞り、脚を 22px から 57px まで伸ばして、下ほど開かせる。
        やぐらは横幅ではなく**縦横の比**で分かる。
      */}
      <path d="M14 57 21 22h5.4L20 57z" fill={c.wod} />
      <path d="M50 57 43 22h-5.4L44 57z" fill={c.wo} />
      <g fill={c.wol}>
        <rect x="21.4" y="28" width="21.2" height="4" rx="2" />
        <rect x="19.6" y="37" width="24.8" height="4" rx="2" />
        <rect x="17.8" y="46" width="28.4" height="4" rx="2" />
      </g>
      {/* 見張り台。ここに床を1枚敷かないと、屋根が脚に刺さっているように見える */}
      <rect x="15" y="18.6" width="34" height="5.4" rx="2.7" fill={c.wo} />
      <rect x="18" y="14.6" width="28" height="4.6" rx="2.3" fill={c.wol} />
      <path d="M32 4.4 48 15a1.8 1.8 0 0 1-.9 3.4H16.9A1.8 1.8 0 0 1 16 15z" fill={c.rd} />
      <path d="M32 4.4 48 15a1.8 1.8 0 0 1-.9 3.4H32z" fill={c.rdd} />
      {/* 台の上のカメラ。やぐらが**配信**やぐらであることは、これでしか言えない */}
      <rect x="26" y="8.6" width="13" height="7" rx="2.4" fill={c.nv} />
      <path d="M39 10.6 44 8.4v7.4l-5-2.2z" fill={c.bld} />
      <circle cx="30" cy="12.2" r="2" fill={c.sk} />
      <Gl c={c} cx={22} cy={16} rx={4} ry={1.4} r={-24} o={0.4} />
    </>
  ),

  /**
   * アプリ工房 = /apps。
   *
   * 前は「端末＋歯車」だった。歯車は**どの設定画面にも付いている記号**で、
   * 場所の名前になっていない。おまけに端末は `misc.phone` と当たる。
   * `/apps` の顔はもう金床（`components/atlas/art.tsx` の `AnvilArt`）なので、
   * 小さいほうもそれに揃える。**屋根の下に金床**、で工房になる。
   */
  workshop: (c) => (
    <>
      <Sh c={c} cy={57} rx={24} ry={3.6} />
      {/*
        金床。屋根を足したら **26px で赤い日よけになって、`scene.market` の屋台**に
        見えた（トップの棚で実測）。屋根をやめて、道具ひとつを大きく描く。
        角（つの）を左へ長く伸ばし、腰をくびれさせるのが金床の形。
      */}
      <path d="M12 44h40l-4 8H16z" fill={c.gyd} />
      <rect x="9" y="51" width="46" height="6" rx="3" fill={c.gy} />
      <path d="M17 22h34a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H38v9c0 3 1.4 4.4 4 5H22c2.6-.6 4-2 4-5v-9H17a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2z" fill={c.gyd} />
      <path d="M32 22h19a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H38v9c0 3 1.4 4.4 4 5H32z" fill={c.gy} opacity={c.flat ? 1 : 0.45} />
      <path d="M15 24c-8-1.6-12 1.6-12 4 0 2.2 4 3.6 12 3z" fill={c.gyd} />
      <rect x="15" y="22" width="38" height="3.4" rx="1.7" fill={c.gy} />
      {/* 槌。柄を斜めに掛けると、置いてある道具ではなく**使う道具**になる */}
      <g transform="rotate(-28 44 14)">
        <rect x="41" y="12" width="22" height="5.4" rx="2.7" fill={c.wo} />
        <rect x="33" y="7" width="12" height="15" rx="3.4" fill={c.brd} />
        <rect x="33" y="7" width="12" height="5" rx="2.6" fill={c.br} />
      </g>
      {/* 火花。金床の上に3粒だけ。線で描くと溶接に見える */}
      <g fill={c.or}>
        <circle cx="20" cy="16" r="2.6" />
        <circle cx="27" cy="11" r="1.8" />
        <circle cx="14" cy="9" r="1.5" />
      </g>
      <Gl c={c} cx={22} cy={24} rx={5} ry={1.4} r={-4} o={0.45} />
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

  /**
   * キッチン小屋。
   *
   * 赤い屋根・クリームの壁・青い窓の家（`home`）と**16px でほぼ同じ絵**だった。
   * 屋根を板葺き（木）に替え、レンガの煙突を棟の上に立てて、窓を大きくとる。
   * 遠目で分かれるのは屋根の色なので、そこを変えるのがいちばん効く。
   */
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
      {/* レンガの煙突。棟の上に立てる（屋根の斜面から生やすと傾いて見える） */}
      <rect x="38.4" y="11" width="9.6" height="14" rx="2" fill={c.rdd} />
      <rect x="37" y="10" width="12.4" height="4.6" rx="2" fill={c.rd} />
      {/* 板葺きの屋根。家の赤い屋根と分けるのはここ */}
      <path d="M32 8 60 30a2.6 2.6 0 0 1-1.7 4.6H5.7A2.6 2.6 0 0 1 4 30z" fill={c.wo} />
      <path d="M32 8 60 30a2.6 2.6 0 0 1-1.7 4.6H32z" fill={c.wod} />
      <g fill={c.wol} opacity="0.6">
        <path d="M18.8 19.6 15 34.6h-4l4.4-17.4z" />
        <path d="M25.6 14.2 23 34.6h-4l3-23z" />
      </g>
      <rect x="11" y="33" width="42" height="20" rx="3" fill={c.cr} />
      <rect x="34" y="33" width="19" height="20" fill={c.crd} />
      {/* 大きな窓。中でやっていることが見える小屋にする */}
      <rect x="14" y="36.4" width="18" height="11" rx="2.4" fill={c.sk} />
      <rect x="14" y="36.4" width="18" height="3.4" rx="1.7" fill={c.w} opacity="0.55" />
      <rect x="37" y="39" width="12" height="14" rx="2.6" fill={c.br} />
      <circle cx="46" cy="46.5" r="1.4" fill={c.gd} />
      <Gl c={c} cx={16} cy={24} rx={3} ry={9} r={38} o={0.35} />
    </>
  ),

  /**
   * 伝説の丘 = /legends。
   *
   * 前は丘の上に星が浮いていて、台座が 8px しかなかった。
   * 16px にすると星だけが残って、`feel.star`（ただの星）と見分けがつかない。
   * **石碑を立てる。** `/legends` の紙の中で使っている記念碑
   * （`components/streams/Art.tsx` の `ArtMonument`）と同じ形にして、
   * 星はその天辺に載せる。丘は台であって、主役ではない。
   */
  hill: (c) => (
    <>
      <path d="M2 56c5-17 14-27 30-27s25 10 30 27z" fill={c.gr} />
      <path d="M32 29c16 0 25 10 30 27H32z" fill={c.grd} />
      {/* 石碑。台座を3段にすると、置いたのではなく建てたことになる */}
      <path d="M20 47h24l3 5H17z" fill={c.gyd} />
      <rect x="22" y="42" width="20" height="6" rx="2" fill={c.gy} />
      <path d="M25 16h14v27H25z" fill={c.cr} />
      <path d="M32 16h7v27h-7z" fill={c.crd} />
      <path d="M25 16a7 7 0 0 1 14 0z" fill={c.crd} />
      <g fill={c.crd} opacity={c.flat ? 1 : 0.7}>
        <rect x="28" y="26" width="8" height="2.6" rx="1.3" />
        <rect x="28" y="32" width="8" height="2.6" rx="1.3" />
      </g>
      {/* 星は碑の天辺に載せる。宙に浮かせると、ただの星になる */}
      <path
        d="m32 1 3.2 6.4 7 1-5 4.9 1.2 7-6.4-3.3-6.4 3.3 1.2-7-5-4.9 7-1z"
        fill={c.gd}
        stroke={c.gd}
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <Gl c={c} cx={27} cy={22} rx={1.8} ry={5} r={0} o={0.45} />
      <g fill={c.grl} opacity="0.75">
        <ellipse cx="13" cy="49" rx="3.4" ry="2" />
        <ellipse cx="51" cy="52" rx="3" ry="1.8" />
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

  island,

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

  /** 旅のしおり = /nordic/guide。折った紙に道筋と、赤いしおりひも。 */
  guide: (c) => (
    <>
      <Sh c={c} cy={56} rx={22} ry={4} />
      <path d="M10 8h36a6 6 0 0 1 6 6v38a6 6 0 0 1-6 6H10z" fill={c.cr} />
      <path d="M32 8h14a6 6 0 0 1 6 6v38a6 6 0 0 1-6 6H32z" fill={c.crd} />
      <path d="M4 8h8v50H4a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z" fill={c.grd} />
      <path d="M12 8h4v50h-4z" fill={c.gr} />
      <path d="M20 46c4-6 3-12 8-16s10 2 14-4 3-8 6-11" fill="none" stroke={c.rd} strokeWidth="3" strokeLinecap="round" strokeDasharray="1 6" />
      <circle cx="20.5" cy="46" r="3.6" fill={c.rdd} />
      <circle cx="47.5" cy="15.5" r="3.6" fill={c.rd} />
      <g fill={c.crd}>
        <rect x="19" y="22" width="18" height="2.6" rx="1.3" />
        <rect x="19" y="29" width="13" height="2.6" rx="1.3" />
      </g>
      <path d="M40 8h7v18l-3.5-4-3.5 4z" fill={c.rd} />
      <Gl c={c} cx={9} cy={14} rx={1.8} ry={5} r={0} o={0.45} />
    </>
  ),

  /** 投票 = 企画を選ぶ。箱の口に紙が入っていく途中を描く。 */
  vote: (c) => (
    <>
      <Sh c={c} cy={57} rx={22} ry={3.4} />
      <g transform="rotate(-10 32 16)">
        <rect x="20" y="2" width="24" height="22" rx="3" fill={c.w} />
        <rect x="32" y="2" width="12" height="22" rx="3" fill={c.wd} />
        <path d="m26 13 4 4 9-9" fill="none" stroke={c.gr} strokeWidth="4.4" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <path d="M8 26h48a4 4 0 0 1 4 4v22a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V30a4 4 0 0 1 4-4z" fill={c.tl} />
      <path d="M32 26h24a4 4 0 0 1 4 4v22a5 5 0 0 1-5 5H32z" fill={c.tld} />
      <rect x="18" y="29" width="28" height="6" rx="3" fill={c.nv} />
      <rect x="4" y="38" width="56" height="5" fill={c.cr} />
      <rect x="32" y="38" width="28" height="5" fill={c.crd} />
      <Gl c={c} cx={13} cy={31} rx={5} ry={1.8} r={-5} o={0.45} />
    </>
  ),

  /** いまどこにいるか。地球にピンを1本立てる。 */
  globe: (c) => (
    <>
      <Sh c={c} cy={57} rx={20} ry={3.4} />
      <circle cx="30" cy="32" r="26" fill={c.sk} />
      <path d="M30 6a26 26 0 0 1 0 52z" fill={c.skd} />
      <path d="M12 16c5 1 7 5 12 5s5-4 10-3 5 6 2 9-9 1-12 4 1 8-2 11-6-1-9-4-4-8-4-12 1-8 3-10z" fill={c.gr} />
      <path d="M40 12c4 2 6 5 8 9s1 8-2 9-4-4-7-5-4-6-2-9 2-4 3-4z" fill={c.grd} />
      <path d="M34 44c4-2 8-1 11 1s2 6-1 8-8 2-10-1-2-6 0-8z" fill={c.gr} />
      <g fill="none" stroke={c.w} strokeWidth="1.6" opacity="0.5">
        <path d="M4 32h52M30 6c-9 7-9 45 0 52M30 6c9 7 9 45 0 52" />
      </g>
      <path d="M48 14a10 10 0 0 1 10 10c0 7-10 19-10 19S38 31 38 24a10 10 0 0 1 10-10z" fill={c.rd} />
      <path d="M48 14a10 10 0 0 1 10 10c0 7-10 19-10 19z" fill={c.rdd} />
      <circle cx="48" cy="24" r="4" fill={c.w} />
      <Gl c={c} cx={17} cy={17} rx={5} ry={2.6} r={-34} o={0.5} />
    </>
  ),

  /** スタンプ帳 = /kitchen。押した跡が並んだ見開き。 */
  stampbook: (c) => (
    <>
      <Sh c={c} cy={55} rx={26} ry={4} />
      <path d="M3 12c8-3 17-3 27 0v40c-10-3-19-3-27 0z" fill={c.cr} />
      <path d="M61 12c-8-3-17-3-27 0v40c10-3 19-3 27 0z" fill={c.crd} />
      <rect x="29" y="10" width="6" height="43" rx="3" fill={c.wod} />
      <g fill="none" strokeWidth="2.6">
        <circle cx="14" cy="24" r="6.4" stroke={c.rd} />
        <circle cx="14" cy="41" r="6.4" stroke={c.tld} />
        <circle cx="48" cy="26" r="6.4" stroke={c.gd} />
      </g>
      <g fill={c.grd} opacity="0.55">
        <rect x="42" y="41" width="14" height="2.6" rx="1.3" />
        <rect x="42" y="47" width="10" height="2.6" rx="1.3" />
      </g>
      <path d="m14 21 1.4 2.8 3 .4-2.2 2.2.5 3-2.7-1.4-2.7 1.4.5-3-2.2-2.2 3-.4z" fill={c.rd} />
      <Gl c={c} cx={11} cy={17} rx={5} ry={2} r={-14} o={0.5} />
    </>
  ),
};
