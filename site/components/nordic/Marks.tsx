import { C } from "@/components/ui/icons/pal";

/**
 * 北欧旅のページだけで使う、小さなイラスト。
 *
 * 区間ごとに**別の絵**を描く。同じ印（ヒッチハイクの親指）を10回並べると、
 * 見た目が単調になるだけでなく「どの区間も同じこと」に見えてしまう。
 * 実際は、深夜の空港で朝を待つ日と、十字架の丘を越える日と、
 * 夜行フェリーで寝る日は、まったく違う一日になる。
 *
 * 描き方は島の絵と同じ（`docs/island-design.md` 2章）。
 *   - 輪郭線を引かない。形は色の差だけで見せる
 *   - 1枚 2〜4 色。ベース・影・ハイライト・差し色
 *   - 角は全部丸める
 *   - 64×64 で描いて、出すときだけ小さくする
 *
 * `components/ui/Icon.tsx` には足さない。あちらは島じゅうで使い回す印で、
 * ここにあるのは「この企画の、この区間」だけの絵。使い回さない。
 * 色だけ `icons/pal.ts` から借りて、島と同じ色相に揃える。
 */

/** 絵の下地。空と地面を1枚ずつ置いて、その上に物を乗せる。 */
function Scene({
  sky,
  ground,
  horizon = 40,
  children,
}: {
  sky: string;
  ground?: string;
  horizon?: number;
  children: React.ReactNode;
}) {
  return (
    <>
      <rect x="1" y="1" width="62" height="62" rx="17" fill={sky} />
      {/* はみ出しは `Mark` の角丸で切られるので、地面はただの四角でいい。 */}
      {ground && <rect x="1" y={horizon} width="62" height={63 - horizon} fill={ground} />}
      {children}
    </>
  );
}

const HILL = "#88b56a";
const NIGHT = "#2b3a68";
const NIGHT_SEA = "#1e2b52";
const DAWN = "#ffc98a";
const ROAD = "#7b7568";

/**
 * 区間ごとの絵。キーは `content/nordic.ts` のルートの並び順に対応する。
 * 増やすときは、その区間で実際に起きることから描く。飾りを描かない。
 */
export const LEG_ART: Record<string, React.ReactNode> = {
  /** 唯一の飛行機。深夜0時前に飛んで、真夜中に着く。 */
  nightflight: (
    <Scene sky={NIGHT}>
      <circle cx="46" cy="17" r="7.5" fill="#ffe9a8" />
      <circle cx="42.5" cy="14.5" r="7" fill={NIGHT} />
      <circle cx="17" cy="13" r="1.7" fill="#ffe9a8" opacity="0.9" />
      <circle cx="26" cy="22" r="1.2" fill="#ffe9a8" opacity="0.7" />
      <circle cx="13" cy="26" r="1" fill="#ffe9a8" opacity="0.6" />
      {/* 雲の海。夜の飛行機の窓から見えるのは、これと月だけ */}
      <path d="M1 47c5-1 11-3 14-4s10 1 16 0 9-5 15-2 11-2 17 2v20H1z" fill="#4d5f96" />
      <g transform="rotate(-16 32 38)">
        <path d="M14 39h27l9-4 5 3-6 5H16z" fill="#f4f7fb" />
        <path d="M25 39l-6-9h5l10 9z" fill="#dfe6ef" />
        <path d="M25 43l-5 8h4l8-8z" fill="#dfe6ef" />
      </g>
    </Scene>
  ),

  /** 深夜1時に空港に着いて、始発まで座って待つところから旅が始まる。 */
  airportwait: (
    <Scene sky="#6c7fae" ground="#4d5a80" horizon={44}>
      {/* 空港の窓。まだ外は暗い */}
      <rect x="6" y="10" width="52" height="22" rx="5" fill="#39456b" />
      <rect x="10" y="14" width="20" height="14" rx="3" fill="#8fa4d6" opacity="0.6" />
      <rect x="34" y="14" width="20" height="14" rx="3" fill="#8fa4d6" opacity="0.35" />
      <path d="M10 28h20l-4-9h-12z" fill={DAWN} opacity="0.55" />
      {/* ベンチ */}
      <rect x="8" y="42" width="48" height="6" rx="3" fill="#b9c2d6" />
      <rect x="12" y="48" width="5" height="10" rx="2.5" fill="#8e98b0" />
      <rect x="47" y="48" width="5" height="10" rx="2.5" fill="#8e98b0" />
      {/* 置いたバックパック */}
      <rect x="20" y="33" width="17" height="16" rx="6" fill={C.gr} />
      <rect x="30" y="33" width="7" height="16" rx="5" fill={C.grd} />
      <rect x="24" y="37" width="8" height="5" rx="2" fill={C.gd} />
      <path d="M24 33v-3a5 5 0 0 1 10 0v3h-3v-3a2 2 0 0 0-4 0v3z" fill={C.brd} />
    </Scene>
  ),

  /** クラクフの旧市街。戦火を逃れた本物の中世が、まるごと残っている。 */
  oldtown: (
    <Scene sky="#9fd8f2" ground="#c9ab7e" horizon={46}>
      <circle cx="14" cy="15" r="6" fill="#ffe9a8" opacity="0.8" />
      {/* 織物会館と、聖マリア教会の塔ふたつ（高さが違うのがあの広場の顔） */}
      <rect x="10" y="30" width="26" height="18" rx="3" fill="#f0e0c2" />
      <path d="M8 30h30l-4-6H12z" fill={C.rdd} />
      <rect x="14" y="36" width="5" height="12" rx="2" fill="#c9ab7e" />
      <rect x="23" y="36" width="5" height="12" rx="2" fill="#c9ab7e" />
      <rect x="38" y="18" width="9" height="30" rx="2" fill="#f0e0c2" />
      <path d="M36 19l6.5-11L49 19z" fill={C.rdd} />
      <rect x="48" y="26" width="8" height="22" rx="2" fill="#e7d4b3" />
      <path d="M46 27l6-9 6 9z" fill={C.rd} />
      <rect x="40" y="30" width="4" height="6" rx="2" fill="#8d7a5c" />
      <rect x="50" y="36" width="4" height="6" rx="2" fill="#8d7a5c" />
    </Scene>
  ),

  /** 行くかどうかも含めて、配信で相談したい場所。線路だけを描く。 */
  rails: (
    <Scene sky="#a8b0b8" ground="#7f7a6e" horizon={34}>
      <path d="M23 34 8 62h6l14-28z" fill="#5f5a52" />
      <path d="M41 34l15 28h-6L36 34z" fill="#5f5a52" />
      <g fill="#4c4841">
        <rect x="18" y="40" width="28" height="3" rx="1.5" />
        <rect x="14" y="48" width="36" height="3.4" rx="1.7" />
        <rect x="9" y="57" width="46" height="3.8" rx="1.9" />
      </g>
      <path d="M1 30h62v4H1z" fill="#8b9199" opacity="0.5" />
    </Scene>
  ),

  /** ポーランドは大きなガソリンスタンドが多くて、声をかけやすいらしい。 */
  gasstation: (
    <Scene sky="#9fd8f2" ground={ROAD} horizon={44}>
      <ellipse cx="16" cy="14" rx="10" ry="5" fill="#ffffff" opacity="0.7" />
      <ellipse cx="46" cy="11" rx="8" ry="4" fill="#ffffff" opacity="0.5" />
      {/* 屋根とポール */}
      <rect x="6" y="18" width="48" height="8" rx="4" fill="#f4f7fb" />
      <rect x="6" y="24" width="48" height="4" rx="2" fill={C.rd} />
      <rect x="10" y="26" width="5" height="20" rx="2.5" fill="#cfd6de" />
      <rect x="46" y="26" width="5" height="20" rx="2.5" fill="#cfd6de" />
      {/* 給油機と、停まっている車 */}
      <rect x="30" y="32" width="8" height="14" rx="3" fill="#e0c04a" />
      <rect x="22" y="40" width="26" height="9" rx="4" fill={C.bl} />
      <path d="M27 40l3-5h11l3 5z" fill={C.sk} />
      <circle cx="28" cy="50" r="3.4" fill="#3f4550" />
      <circle cx="43" cy="50" r="3.4" fill="#3f4550" />
    </Scene>
  ),

  /** ワルシャワからビャウィストクへ。まっすぐな道と、車の少なさ。 */
  longroad: (
    <Scene sky="#bfe6f7" ground={HILL} horizon={30}>
      <ellipse cx="47" cy="12" rx="11" ry="5" fill="#ffffff" opacity="0.75" />
      <path d="M26 30h12l14 33H12z" fill={ROAD} />
      <g fill="#f6efe0">
        <rect x="30.6" y="33" width="2.6" height="5" rx="1.3" />
        <rect x="30.2" y="42" width="3.4" height="7" rx="1.7" />
        <rect x="29.6" y="53" width="4.4" height="9" rx="2.2" />
      </g>
      {/* 電柱。奥へ小さくなる並びだけで距離が出る */}
      <g fill="#8a6a45">
        <rect x="49" y="20" width="3" height="16" rx="1.5" />
        <rect x="45" y="20" width="11" height="2.4" rx="1.2" />
        <rect x="57" y="26" width="3.6" height="20" rx="1.8" />
        <rect x="53" y="26" width="12" height="2.6" rx="1.3" />
      </g>
      <ellipse cx="12" cy="36" rx="9" ry="4" fill="#76a55c" />
    </Scene>
  ),

  /** オグロドニキの国境を越えてリトアニアへ。この区間はとにかく車が少ない。 */
  border: (
    <Scene sky="#bfe6f7" ground={HILL} horizon={40}>
      {/* 松林。バルトの国境はだいたい森の中にある */}
      <g fill="#3f7f4a">
        <path d="M6 40 12 20l6 20z" />
        <path d="M50 40 56 22l6 18z" />
      </g>
      <g fill="#57a05c">
        <path d="M6 40 12 20l1 20z" />
        <path d="M50 40 56 22l1 18z" />
      </g>
      {/* 遮断棒 */}
      <rect x="20" y="30" width="5" height="24" rx="2.5" fill="#cfd6de" />
      <rect x="22" y="34" width="36" height="6" rx="3" fill="#f4f7fb" />
      <rect x="30" y="34" width="8" height="6" fill={C.rd} />
      <rect x="46" y="34" width="8" height="6" fill={C.rd} />
      <rect x="6" y="47" width="52" height="4" rx="2" fill={ROAD} />
    </Scene>
  ),

  /** 十字架の丘。丘ひとつが、立てられた十字架で埋まっている。 */
  crosses: (
    <Scene sky="#cfe9f5" ground="#9ec27c" horizon={38}>
      <path d="M1 46c10-13 22-15 31-15s21 3 31 15v18H1z" fill="#8fb46f" />
      <g fill="#8a6a45">
        {[
          [12, 34, 1.0],
          [20, 30, 1.3],
          [29, 26, 1.6],
          [39, 29, 1.3],
          [48, 33, 1.1],
          [16, 44, 1.1],
          [25, 41, 1.3],
          [35, 40, 1.2],
          [45, 43, 1.0],
        ].map(([x, y, s], i) => (
          <g key={i} transform={`translate(${x} ${y}) scale(${s})`}>
            <rect x="-1.3" y="0" width="2.6" height="13" rx="1.3" />
            <rect x="-5" y="3" width="10" height="2.4" rx="1.2" />
          </g>
        ))}
      </g>
      <g fill="#b98f5f" opacity="0.85">
        {[
          [33, 33, 1.1],
          [22, 36, 1.0],
          [42, 36, 0.9],
        ].map(([x, y, s], i) => (
          <g key={i} transform={`translate(${x} ${y}) scale(${s})`}>
            <rect x="-1.2" y="0" width="2.4" height="12" rx="1.2" />
            <rect x="-4.6" y="3" width="9.2" height="2.2" rx="1.1" />
          </g>
        ))}
      </g>
    </Scene>
  ),

  /** 9月のバルトは3日に1日は雨。濡れながら立つ日が必ずある。 */
  rainroad: (
    <Scene sky="#9aa9bb" ground="#6f8a63" horizon={38}>
      <ellipse cx="22" cy="16" rx="15" ry="8" fill="#7d8b9c" />
      <ellipse cx="40" cy="14" rx="12" ry="7" fill="#8d9bab" />
      <g stroke="#bcd5e6" strokeWidth="2.4" strokeLinecap="round">
        <path d="M14 26l-3 8" />
        <path d="M24 28l-3 8" />
        <path d="M34 26l-3 8" />
        <path d="M44 28l-3 7" />
      </g>
      {/* 海と、その内側を走る道 */}
      <rect x="1" y="44" width="62" height="19" fill="#5d7a86" />
      <path d="M8 53h48" stroke={ROAD} strokeWidth="9" strokeLinecap="round" />
      <path d="M14 53h6M30 53h6M44 53h6" stroke="#f6efe0" strokeWidth="2.6" strokeLinecap="round" />
    </Scene>
  ),

  /** タリンからヘルシンキ。ここだけは親指では渡れない。 */
  ferryday: (
    <Scene sky="#bfe6f7" ground="#4aa6d6" horizon={40}>
      <circle cx="50" cy="14" r="7" fill="#ffe08a" />
      <path d="M14 30h30l4 8H14z" fill="#f4f7fb" />
      <rect x="18" y="20" width="18" height="10" rx="3" fill="#eef3f8" />
      <rect x="21" y="23" width="4" height="4" rx="1.4" fill={C.sk} />
      <rect x="28" y="23" width="4" height="4" rx="1.4" fill={C.sk} />
      <rect x="38" y="16" width="4" height="14" rx="2" fill={C.rd} />
      <path d="M8 38h44l-6 10H14z" fill={C.bl} />
      <g stroke="#ffffff" strokeWidth="2.6" strokeLinecap="round" opacity="0.8">
        <path d="M8 54h9" />
        <path d="M24 57h11" />
        <path d="M42 53h10" />
      </g>
    </Scene>
  ),

  /** 夜に出て朝に着く一泊フェリー。宿代が浮く。 */
  ferrynight: (
    <Scene sky={NIGHT} ground={NIGHT_SEA} horizon={40}>
      <circle cx="15" cy="14" r="6" fill="#ffe9a8" />
      <circle cx="43" cy="12" r="1.5" fill="#ffe9a8" opacity="0.8" />
      <circle cx="52" cy="20" r="1.1" fill="#ffe9a8" opacity="0.6" />
      <path d="M12 30h34l4 8H12z" fill="#5a6a9c" />
      <rect x="16" y="19" width="22" height="11" rx="3" fill="#6879ae" />
      <g fill="#ffe08a">
        <rect x="19" y="22" width="3.4" height="3.4" rx="1.2" />
        <rect x="25" y="22" width="3.4" height="3.4" rx="1.2" />
        <rect x="31" y="22" width="3.4" height="3.4" rx="1.2" />
        <rect x="16" y="32" width="3" height="3" rx="1" />
        <rect x="23" y="32" width="3" height="3" rx="1" />
        <rect x="30" y="32" width="3" height="3" rx="1" />
        <rect x="37" y="32" width="3" height="3" rx="1" />
      </g>
      <rect x="40" y="15" width="4" height="15" rx="2" fill="#8a97c4" />
      <path d="M6 38h46l-6 10H12z" fill="#46548a" />
      <path d="M28 48c0 6 0 8 0 14" stroke="#ffe08a" strokeWidth="4" opacity="0.25" strokeLinecap="round" />
    </Scene>
  ),
};

/** 絵を1枚出す枠。`size` は表示する大きさ。 */
export function Mark({
  art,
  size = 40,
  className,
}: {
  art: keyof typeof LEG_ART | string;
  size?: number;
  className?: string;
}) {
  const a = LEG_ART[art];
  if (!a) return null;
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden
      focusable="false"
    >
      {/* 角丸の枠で切る。丘や船が枠からはみ出すのを、絵ごとに気にしなくて済む。
          id はどの絵でも同じでよい。切る形が同じなので、重複しても結果は変わらない。 */}
      <defs>
        <clipPath id="nmarkClip">
          <rect x="1" y="1" width="62" height="62" rx="17" />
        </clipPath>
      </defs>
      <g clipPath="url(#nmarkClip)">{a}</g>
    </svg>
  );
}
