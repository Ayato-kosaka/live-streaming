import { C } from "@/components/ui/icons/pal";

/**
 * 区間カードの席に付ける、小さなイラスト。
 *
 * `components/ui/Icon.tsx` には足さない。あちらは島じゅうで使い回す印で、
 * ここにあるのは「連れていくボード」だけの絵（`Marks.tsx` と同じ考え方）。
 *
 * 描き方は島の絵と同じ（`docs/island-design.md` 2章）。
 *   - 輪郭線を引かない。形は色の差だけで見せる
 *   - 1枚 2〜4 色
 *   - 接地影は黒ではなく暖かい灰緑で、真下ではなく右下へずらす
 *   - 角は全部丸める
 *   - 48×48 で描いて、出すときだけ小さくする
 *
 * 席が2つあるので、色でも見分けられるようにしてある。
 * **足代は金、道しるべは緑。** つながりの絵（`TieMark`）は、この2色の輪でできている。
 */

function Svg({ size, children }: { size: number; children: React.ReactNode }) {
  return (
    <svg
      className="seatmark"
      width={size}
      height={size}
      viewBox="0 0 48 48"
      aria-hidden
      focusable="false"
    >
      {children}
    </svg>
  );
}

/** 接地影。真下ではなく右下へ寄せる。 */
function Ground({ cx = 24.8, cy = 41, rx = 14 }: { cx?: number; cy?: number; rx?: number }) {
  return <ellipse cx={cx} cy={cy} rx={rx} ry={3.2} fill={C.sh} opacity="0.24" />;
}

/**
 * 足代。硬貨を2枚重ねる。
 * 札束や募金箱にしないのは、この企画で動く額が1件320円だから。
 * 「重ねられる小さいもの」の絵にしておくと、320円を出す人が自分の額を想像できる。
 */
export function FareMark({ size = 26 }: { size?: number }) {
  return (
    <Svg size={size}>
      <Ground cx="23" rx="15" />
      {/* 奥の硬貨 */}
      <circle cx="31.5" cy="19" r="11.5" fill={C.gdd} />
      <circle cx="31.5" cy="19" r="8.6" fill={C.gd} />
      {/* 手前の硬貨 */}
      <circle cx="19" cy="25.5" r="13.5" fill={C.gdd} />
      <circle cx="19" cy="25.5" r="10.6" fill={C.gd} />
      <rect x="13.5" y="23.7" width="11" height="3.6" rx="1.8" fill={C.gdd} opacity="0.55" />
    </Svg>
  );
}

/**
 * 道しるべ。板を2枚、別の向きに付ける。
 * 1枚だと「案内」になってしまう。2枚が別の方を向いているから、
 * 「どっちへ行くかは、まだ決まっていない」の絵になる。
 */
export function PostMark({ size = 26 }: { size?: number }) {
  return (
    <Svg size={size}>
      <Ground cx="25.5" rx="11" />
      <rect x="21" y="7" width="6" height="33" rx="3" fill={C.br} />
      {/* 上の板。右を向く */}
      <rect x="7" y="11" width="25" height="10.5" rx="3.5" fill={C.grd} />
      <path d="M30 11.6l8 5.15-8 5.15z" fill={C.grd} />
      <rect x="10" y="14.5" width="14" height="3" rx="1.5" fill={C.grl} opacity="0.75" />
      {/* 下の板。左を向く */}
      <rect x="16" y="24.5" width="25" height="10.5" rx="3.5" fill={C.gr} />
      <path d="M18 25.1l-8 5.15 8 5.15z" fill={C.gr} />
      <rect x="24" y="28" width="14" height="3" rx="1.5" fill={C.grl} opacity="0.75" />
    </Svg>
  );
}

/**
 * つながり。輪が2つ。**足代の金と、道しるべの緑。**
 *
 * 離れているときは灰色にしない。灰色は失敗の色で、
 * 埋まっていない区間を失敗に見せないのがこのボードの決まり
 * （`docs/nordic-fund.md` 3章）。色はそのままで、**距離だけが変わる。**
 */
export function TieMark({ tied, size = 30 }: { tied: boolean; size?: number }) {
  // 噛み合うときは重ね、離れているときは左右へ開く。色は変えない
  const gap = tied ? 0 : 4.5;
  return (
    <Svg size={size}>
      {/* 輪の穴は、下の紙が透けないといけない。塗りつぶしで隠すと、
          畳みの中と外で紙の色が違うところに置いたときにズレる。
          マスクの座標は g の変形といっしょに動くので、id は使い回してよい。 */}
      <defs>
        <mask id="ntieA">
          <rect x="0" y="0" width="48" height="48" fill="#fff" />
          <rect x="6.2" y="20.2" width="17.6" height="6.6" rx="3.3" fill="#000" />
        </mask>
        <mask id="ntieB">
          <rect x="0" y="0" width="48" height="48" fill="#fff" />
          <rect x="24.2" y="20.2" width="17.6" height="6.6" rx="3.3" fill="#000" />
        </mask>
      </defs>
      <Ground cx="24.5" cy="34.5" rx="16" />
      {/* 足代の輪 */}
      <g transform={`translate(${-gap} 0)`}>
        <rect x="2" y="16" width="26" height="15" rx="7.5" fill={C.gdd} mask="url(#ntieA)" />
      </g>
      {/* 道しるべの輪。噛み合うときは、こちらが手前を通る */}
      <g transform={`translate(${gap} 0)`}>
        <rect x="20" y="16" width="26" height="15" rx="7.5" fill={C.grd} mask="url(#ntieB)" />
      </g>
    </Svg>
  );
}
