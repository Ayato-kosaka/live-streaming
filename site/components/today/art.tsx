/**
 * 今日の島の板だけで使う小さな絵。
 *
 * `components/ui/Icon.tsx` は島じゅうで共有する印を置くところなので、
 * この板でしか出てこないものはここに置く。
 *
 * 描き方は島の絵と同じ（`docs/island-design.md` / `docs/ac-reference.md`）:
 *   - 輪郭線を引かない。形は色の差だけで見せる
 *   - 1つの絵に2〜4色
 *   - 影は黒くしない。暖かい灰緑で、光の反対（右下）へずらす
 *   - 角は全部丸める
 *   - viewBox は 48 か 64 で描いて、表示だけ小さくする
 */

/** 接地影。島の他の絵と同じ色にして、光の向きを揃える。 */
const SHADE = "#7d9268";

/**
 * まだ見ていない、の赤い丸。
 *
 * 島の合図は「入口＝札」「新しいものがある＝赤い丸」の2種類しかない
 * （`docs/island-design.md` 3-3）。**3つ目を作らない。**
 * `components/live/art.tsx` のベルに付いているものと同じ形・同じ色を写してある。
 */
export function NewDot({ size = 12 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden focusable="false" className="today-dot">
      <circle cx="12" cy="12" r="12" fill="#fffbf0" />
      <circle cx="12" cy="12" r="9.2" fill="#e04a68" />
      <circle cx="9.4" cy="9.2" r="3.2" fill="#ff8ea3" />
    </svg>
  );
}

/**
 * 板を開く／閉じるの向き。
 * 記号（▲）で済ませると端末で形が変わるので、面で塗った小さな三角にする。
 */
export function Wedge({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden focusable="false" className="today-wedge">
      <path d="M24 31.5c-1 0-1.9-.4-2.6-1.1L11.8 20.7c-1.4-1.4-.4-3.7 1.6-3.7h21.2c2 0 3 2.3 1.6 3.7l-9.6 9.7c-.7.7-1.6 1.1-2.6 1.1z" fill="#6b5a45" />
    </svg>
  );
}

/** 行き先の矢印。島の外へ出るときも中で移るときも、同じ形を使う。 */
export function Arrow({ size = 13 }: { size?: number }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden focusable="false" className="today-arrow">
      <rect x="7" y="20.5" width="24" height="7" rx="3.5" fill="currentColor" />
      <path d="M28.6 12.4c-1.4-1.4-3.7-.4-3.7 1.6v20c0 2 2.3 3 3.7 1.6l10-10c.9-.9.9-2.3 0-3.2z" fill="currentColor" />
    </svg>
  );
}

/**
 * カレンダーの1枚。「1年前の今日」の日付に添える。
 * 日めくりなので、上のリングと、めくれた角だけで言う。
 */
export function DayLeaf({ size = 22 }: { size?: number }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden focusable="false">
      <ellipse cx="25" cy="42.5" rx="15" ry="3" fill={SHADE} opacity="0.3" />
      <rect x="7" y="10" width="34" height="31" rx="7" fill="#d8c8a4" />
      <rect x="7" y="8" width="34" height="31" rx="7" fill="#fffaea" />
      <rect x="7" y="8" width="34" height="10" rx="5" fill="#e0623f" />
      <rect x="13" y="4" width="5.5" height="9" rx="2.75" fill="#b9a882" />
      <rect x="29.5" y="4" width="5.5" height="9" rx="2.75" fill="#b9a882" />
      <rect x="14" y="23" width="20" height="5" rx="2.5" fill="#cbbf9c" />
      <rect x="14" y="31" width="12" height="4" rx="2" fill="#ddd3b4" />
    </svg>
  );
}
