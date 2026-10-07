/**
 * 「今週、なにをするんだろう」から、**過ぎた日の行を落とす。**
 *
 * この欄（`/island-api/state` の `current.week`）はあやとが手で打つ。
 * 旅のあいだは電波の細いところを通るので、打ち直せない日が何日も続く。
 * 画面がそのまま並べていたので、**10日以上前の行が「今週」として出ていた**
 * （実測 2026-10-07。`updatedAt` は 2026-09-28）:
 *
 *     9/27 ストックホルムを発つ        ← 10日前
 *     9/28 アルバニア着                ← 同上
 *     回る先はこれから。島の風船に貼ってもらったものから決める
 *
 * あやとの言葉（2026-10-07 / #673）に沿って、**打ち直してもらうのではなく
 * 画面の側で落とす。** `current` の中身は書き換えない（あちらは島の記録で、
 * `/me/desk` から本人が直す欄）。
 *
 * ## 落とすのは「行の中のどの日付も過ぎている」行だけ
 *
 * 日付を持たない行（「回る先はこれから」）は**残す。** 日付が無い行は
 * いつ読んでも本当なので、落とす理由が無い。
 *
 * 1行に日付が2つあるとき（「9/27〜10/2」）は**いちばん遅いほう**で決める。
 * 頭の日付で決めると、まだ続いている予定が初日を過ぎた瞬間に消える。
 *
 * ## 年は書いていないので、**今日にいちばん近い年**として読む
 *
 * 欄にあるのは `9/27` までで、年は無い。12/30 を 1/3 に読んだら去年の話、
 * 1/10 を 12/28 に読んだら来年の話。年をまたぐ日に、どちらとも読めてしまう。
 * 前後1年のうち**今日にいちばん近い**ものを採る。
 */
import { jstNow } from "./nightly";

/** 行の中の `M/D`。全角のスラッシュも拾う（スマホの入力で混ざる）。 */
const MD = /(\d{1,2})[/／](\d{1,2})/g;

/** 日本時間の今日を、UTC の通し番号（ミリ秒）で。日付の比べ相手はこれ1つ。 */
function jstToday(now: Date): number {
  const j = jstNow(now);
  return Date.UTC(j.y, j.m - 1, j.d);
}

/**
 * `M/D` を、**今日にいちばん近い年**の日付として読む。
 *
 * 月・日として在りえない数（13/40 など）は `null`。番地や「2/3の人」のような
 * 数が混ざったときに、ありえない日付を作らないため。
 */
function readMd(m: number, d: number, today: number): number | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const y0 = new Date(today).getUTCFullYear();
  let best: number | null = null;
  for (const y of [y0 - 1, y0, y0 + 1]) {
    const t = Date.UTC(y, m - 1, d);
    // 月をまたいだ日（2/30 など）は、その月に無いので採らない
    if (new Date(t).getUTCMonth() !== m - 1) continue;
    if (best === null || Math.abs(t - today) < Math.abs(best - today)) best = t;
  }
  return best;
}

/**
 * その行が、もう過ぎているか。
 *
 * **日付を1つも持たない行は、過ぎていない。** 読めない数しか無い行も同じ。
 */
export function weekRowPast(row: string, now: Date = new Date()): boolean {
  const today = jstToday(now);
  let last: number | null = null;
  for (const hit of row.matchAll(MD)) {
    const t = readMd(Number(hit[1]), Number(hit[2]), today);
    if (t === null) continue;
    if (last === null || t > last) last = t;
  }
  if (last === null) return false;
  return last < today;
}

/**
 * 「今週やること」のうち、**まだ過ぎていない行だけ。**
 *
 * 返りが空なら、画面は**その箱ごと出さない。** 見出しだけ残すと
 * 「今週やること」と書いてある空の紙になる。
 */
export function weekAhead(rows: string[] | undefined | null, now: Date = new Date()): string[] {
  if (!rows?.length) return [];
  return rows.filter((r) => !weekRowPast(r, now));
}
