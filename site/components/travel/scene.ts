import type { Scene } from "@/content/travel/types";

/**
 * 場面のリンクと、日付・時刻の書きかた。**面の上の書きかたはここ1か所**（`docs/guide-design.md` 5-5）。
 *
 * - 場面のリンクは **素の `<a href>`**（`https://www.youtube.com/watch?v=<id>&t=<秒>s`）。
 *   JS で開かない——AI の読み手は JS を動かさない（6章）
 * - 配信の時刻は、配信の頭からの経過（`0:56:30`）。現地の時刻とは混ぜない
 * - 本文は「2026年10月14日」、表と札は「10/14」。HTML は全部 `<time datetime>`
 */

export const watchUrl = (at: Pick<Scene, "v" | "t">) => `https://www.youtube.com/watch?v=${at.v}&t=${at.t}s`;

/** 配信そのもの（時刻なし）。写真の出どころ・配信の一覧で使う */
export const videoUrl = (v: string) => `https://www.youtube.com/watch?v=${v}`;

export function hms(t: number): string {
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** 「10/14」 */
export function md(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${m}/${d}`;
}

/** 「2026年10月14日」 */
export function jpDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return `${y}年${m}月${d}日`;
}

/** 「2026年10月12日〜11月12日」。同じ年なら後ろの年を省く */
export function jpRange(from: string, to: string): string {
  const [y2, m2, d2] = to.split("-").map(Number);
  return `${jpDate(from)}〜${from.slice(0, 4) === String(y2) ? "" : `${y2}年`}${m2}月${d2}日`;
}
