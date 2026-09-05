import type { Draw } from "./bits";

/**
 * 操作の印。
 *
 * ここだけは絵ではなく記号でいい。文章の行の中に置くもので、
 * CSS 側で `color` を変えている場所があるから（`.rleg-h .ic` など）、
 * 色は currentColor のまま単色で描く。
 *
 * 線で描くが、太さを 9〜10（64 枠）まで上げて端を丸めてあるので、
 * 見た目は「細い棒という物体」になる。とがった角は残さない。
 */

const L = (d: string, w = 9.5) => (
  <path
    d={d}
    fill="none"
    stroke="currentColor"
    strokeWidth={w}
    strokeLinecap="round"
    strokeLinejoin="round"
  />
);

export const nav: Record<string, Draw> = {
  right: () => L("M26 15 45 32 26 49"),
  left: () => L("M38 15 19 32 38 49"),
  up: () => L("M15 38 32 19 49 38"),
  chevron: () => L("M15 26 32 45 49 26"),
  close: () => (
    <>
      {L("M18 18 46 46")}
      {L("M46 18 18 46")}
    </>
  ),
  plus: () => (
    <>
      {L("M32 15V49", 10)}
      {L("M15 32H49", 10)}
    </>
  ),
  minus: () => L("M15 32H49", 10),
  menu: () => (
    <>
      {L("M13 20H51", 8.5)}
      {L("M13 32H51", 8.5)}
      {L("M13 44H51", 8.5)}
    </>
  ),
  check: () => L("M13 33 26 46 51 18", 10),

  external: () => (
    <>
      {/* 窓。右上の角をあけて、そこから矢が出ていく */}
      <path
        d="M11 27h17v6H17v18h18V40h6v17a3 3 0 0 1-3 3H14a3 3 0 0 1-3-3V30a3 3 0 0 1 3-3z"
        fill="currentColor"
      />
      <path d="M37 7h17a3 3 0 0 1 3 3v17h-6V17.2L34.1 40.1l-4.2-4.2L52.8 13H37z" fill="currentColor" />
    </>
  ),

  download: () => (
    <>
      <path
        d="M27 9h10a3 3 0 0 1 3 3v14h6.6c2.5 0 3.8 3 2 4.8L34.1 44.9a3 3 0 0 1-4.2 0L15.4 30.8c-1.8-1.8-.5-4.8 2-4.8H24V12a3 3 0 0 1 3-3z"
        fill="currentColor"
      />
      <path
        d="M11 40h6v9h30v-9h6v12a3 3 0 0 1-3 3H14a3 3 0 0 1-3-3z"
        fill="currentColor"
      />
    </>
  ),

  search: () => (
    <>
      <path
        d="M28 8a20 20 0 1 1 0 40 20 20 0 0 1 0-40zm0 7a13 13 0 1 0 0 26 13 13 0 0 0 0-26z"
        fill="currentColor"
      />
      {L("M43 43 55 55", 9.5)}
    </>
  ),

  share: () => (
    <>
      {L("M24 27 41 18", 7)}
      {L("M24 37 41 46", 7)}
      <circle cx="17" cy="32" r="8.5" fill="currentColor" />
      <circle cx="46" cy="15" r="8" fill="currentColor" />
      <circle cx="46" cy="49" r="8" fill="currentColor" />
    </>
  ),

  play: () => (
    <path
      d="M24.5 13.6 48 29.4a3.2 3.2 0 0 1 0 5.2L24.5 50.4c-2.1 1.4-5-.1-5-2.6V16.2c0-2.5 2.9-4 5-2.6z"
      fill="currentColor"
    />
  ),

  pause: () => (
    <g fill="currentColor">
      <rect x="16" y="13" width="11" height="38" rx="5.5" />
      <rect x="37" y="13" width="11" height="38" rx="5.5" />
    </g>
  ),

  /** もっと見る。行の右端に置く3つの点。 */
  dots: () => (
    <g fill="currentColor">
      <circle cx="14" cy="32" r="5.4" />
      <circle cx="32" cy="32" r="5.4" />
      <circle cx="50" cy="32" r="5.4" />
    </g>
  ),

  /** 絞り込み。じょうごの形。角は全部丸める。 */
  filter: () => (
    <path
      d="M9 12h46a3 3 0 0 1 2.3 4.9L40 37.4V52a3 3 0 0 1-4.3 2.7l-8-4A3 3 0 0 1 26 48V37.4L6.7 16.9A3 3 0 0 1 9 12z"
      fill="currentColor"
    />
  ),

  /** 並べ替え。長さの違う3本と、下向きの矢。 */
  sort: () => (
    <g fill="currentColor">
      <rect x="6" y="14" width="30" height="8" rx="4" />
      <rect x="6" y="28" width="22" height="8" rx="4" />
      <rect x="6" y="42" width="14" height="8" rx="4" />
      <path d="M48 12a4 4 0 0 1 4 4v24.6l4.2-4.2a4 4 0 1 1 5.6 5.6l-11 11a4 4 0 0 1-5.6 0l-11-11a4 4 0 1 1 5.6-5.6l4.2 4.2V16a4 4 0 0 1 4-4z" />
    </g>
  ),

  /** これは何か。輪と点と棒で作る。字を置かない。 */
  info: () => (
    <g fill="currentColor">
      <path d="M32 4a28 28 0 1 1 0 56 28 28 0 0 1 0-56zm0 8a20 20 0 1 0 0 40 20 20 0 0 0 0-40z" />
      <circle cx="32" cy="21" r="4.2" />
      <rect x="27.8" y="28" width="8.4" height="20" rx="4.2" />
    </g>
  ),

  /**
   * もう一度。輪を4分の3だけ描いて、切れたところに矢じりを付ける。
   *
   * **これを回して読み込み中に使わない。** 島に回っているものは無い
   * （`docs/island-design.md` 4章）。押して取り直すためのボタンの印。
   */
  refresh: () => (
    <>
      <path
        d="M32 12A20 20 0 1 1 14.8 42"
        fill="none"
        stroke="currentColor"
        strokeWidth="9"
        strokeLinecap="round"
      />
      <path d="M28.5 2 44 12 28.5 22z" fill="currentColor" />
    </>
  ),
};
