/**
 * 曜日の並び。月はじまり（0=月 … 6=日）。
 *
 * **サーバ側（`WeekRail`）とブラウザ側（`WeekToday`）の両方が読むので、
 * どちらでもないファイルに置く。** "use client" のファイルから配列を持ち出すと、
 * サーバ側では中身ではなく**参照**が渡って `DAYS.map is not a function` で落ちる
 * （`docs/island-misses.md` #22 と同じ形。ビルドで実際に落ちた）。
 */
export const DAYS = ["月", "火", "水", "木", "金", "土", "日"];
