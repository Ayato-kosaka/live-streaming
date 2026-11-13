import { BUILT_AT } from "./builtAt";
import { APPS, PAST_APPS, type AppEntry } from "@/content/apps";
import { CHAPTER_STREAMS } from "@/content/chapterStreams";
import { streamsOfCity } from "@/content/cityStreams";
import type { Country } from "@/content/countries";
import { legendDays } from "@/content/legendDays";
import { LEGENDS, type Legend } from "@/content/legends";
import { MONTHS, type Month } from "@/content/months";
import { RECIPES, type Recipe } from "@/content/recipes";
import type { StreamType } from "@/content/streamTypes";
import { UPDATES } from "@/content/updates";

/**
 * **その面の中身が、最後に増えた日**（sitemap の `<lastmod>`）。
 *
 * ## なぜ要るか
 *
 * 2026-11-13 の本番の sitemap は、150行ぜんぶの `<lastmod>` が**同じビルド時刻**だった
 * （`new Date()`）。毎晩の配りで、去年の料理の面まで「今日変わった」と名乗る。
 * 読む側は、当てにならない日付は丸ごと読まなくなる——付けていないのと同じになる。
 *
 * ## 出しかた — **その面に並んでいる記録の、いちばん新しい1件の日**
 *
 * 島の面のほとんどは、日付の付いた記録（配信・年表・お知らせ）が増えていく面。
 * 記録が1件増えた日が、その面が変わった日。だから**データが持っている日付**から出す。
 *
 * | 面 | 何を正とするか |
 * | --- | --- |
 * | `/updates` | お知らせの `on`（本番に配った日） |
 * | `/kitchen/<品>` | その品の回（`streams[].date`）と、できた日（`date`） |
 * | `/apps/<アプリ>` | 年表（`milestones[].date`） |
 * | `/legends/<企画>` | 見どころの回・期間のおわり（`range`）・その期間の配信ぜんぶ（`legendDays`） |
 * | `/months/<月>` | 月末配信の日（`final`）と、その月の配信（`streams[].d`） |
 * | `/streams/<型>` | 見本の回（`samples[].date`） |
 * | `/map/<国>` | その国の街の配信（`cityStreams`）と、出来事（`highlights[].date`） |
 * | `/island/<章>/streams` | その章の配信（`chapterStreams`） |
 * | `/kitchen` `/apps` `/legends` `/months` | 上の、並んでいる全部のうちいちばん新しい日 |
 *
 * **これは下限**（その日よりあとに字を直していても、ここには出ない）。
 * 外れる向きは「実際より古い」だけで、「変わっていないのに新しい」には倒れない。
 *
 * ## 付けない面
 *
 * 表紙・`/about`・`/now`・`/board`・`/friends`・旅の面（`/nordic/*` `/bulgaria` …）・章の島
 * （`/island/<章>`）・`/atlas`・`/map`・`/streams`・`/all`・`/goods*`・`/cards`・`/next`・`/privacy`。
 * **中身がいつ変わったかを、データが持っていない。** 旅の面の日付は「その日のこと」で
 * あって「その日に書いた」ではないし、表紙の直近の配信は画面が出てから取りにいく。
 * 分からない面には `undefined` を返す（＝ `<lastmod>` を書かない）。嘘の日付より、無いほうがよい。
 *
 * ## git の日付を使わない
 *
 * ソースの最後のコミット日は、いちばん正確に見える。けれど本番の書き出しは
 * 浅い checkout（履歴1件）で走るので、**全部のファイルが同じ日**になる——元の不具合と同じ形。
 * 履歴を深く取るにはワークフローを変える必要があり、取れなかった日に黙って壊れる。
 * データから出せば、どこで書き出しても同じ字になる。
 *
 * ## 守っていること
 *
 * - **中身を変えずに2回書き出して、同じ値**（時計から出していない。日付をまたいでも動かない）
 * - **書き出した時刻より未来にならない**（下の `newest`）
 * - 見張りは `python/seo_audit.py --expect 'lastmod-distinct>=2,lastmod-future=0'`
 */

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const utcDay = (at: Date) => at.toISOString().slice(0, 10);
/** データの日付は日本時間の日。書き出した時刻を、同じ物差しに直す */
const jstDay = (at: Date) => utcDay(new Date(at.getTime() + 9 * 3600_000));

/**
 * 日付の束から、**書き出した日までの**いちばん新しい日。無ければ `undefined`。
 *
 * - `YYYY-MM-DD` でないもの・暦に無い日は数えない（月だけの日付から日を作らない）
 * - **書き出した日（日本時間）より先の日付は数えない。** 先の予定が表に入っていても、
 *   その日が来るまでは「中身が増えた日」ではない
 * - 答えが UTC の書き出した日より先なら、そこで止める。日本時間の0時〜9時の配信は、
 *   UTC ではまだ前の日。日付だけの `<lastmod>` を UTC で読む相手にも、未来に見えないように
 */
export function newest(days: Iterable<string | null | undefined>, builtAt: Date = BUILT_AT): string | undefined {
  const today = jstDay(builtAt);
  let best: string | undefined;
  for (const d of days) {
    if (!d || !DAY.test(d) || d > today) continue;
    if (Number.isNaN(Date.parse(`${d}T00:00:00Z`)) || utcDay(new Date(`${d}T00:00:00Z`)) !== d) continue;
    if (!best || d > best) best = d;
  }
  if (!best) return undefined;
  const cap = utcDay(builtAt);
  return best > cap ? cap : best;
}

const recipeDays = (r: Recipe) => [r.date, ...r.streams.map((s) => s.date)];
const appDays = (a: AppEntry) => a.milestones.map((m) => m.date);
const legendDaysOf = (l: Legend) => [
  l.date,
  l.range?.[1],
  ...l.streams.map((s) => s.date),
  ...(legendDays(l.slug)?.streams.map((s) => s[0]) ?? []),
];
const monthDays = (m: Month) => [m.final, m.to, ...m.streams.map((s) => s.d)];

/** 面の型ごとの `<lastmod>`。`app/sitemap.ts` だけが読む。型の表はこのファイルの頭 */
export const LASTMOD = {
  updates: () => newest(UPDATES.map((u) => u.on)),
  recipe: (r: Recipe) => newest(recipeDays(r)),
  kitchen: () => newest(RECIPES.flatMap(recipeDays)),
  app: (a: AppEntry) => newest(appDays(a)),
  apps: () => newest([...APPS, ...PAST_APPS].flatMap(appDays)),
  legend: (l: Legend) => newest(legendDaysOf(l)),
  legends: () => newest(LEGENDS.flatMap(legendDaysOf)),
  month: (m: Month) => newest(monthDays(m)),
  months: () => newest(MONTHS.flatMap(monthDays)),
  streamType: (t: StreamType) => newest(t.samples.map((s) => s.date)),
  /* 街の並べかたは `app/map/[slug]/page.tsx` の `towns` と同じ（その面に出る配信だけを見る） */
  country: (c: Country) =>
    newest([
      ...[...new Set(c.stays.flatMap((s) => s.cities))].flatMap((city) => streamsOfCity(c.slug, city).map((v) => v.date)),
      ...c.highlights.map((h) => h.date),
    ]),
  chapterStreams: (slug: string) => newest((CHAPTER_STREAMS[slug] ?? []).map((s) => s[0])),
};
