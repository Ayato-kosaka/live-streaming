/**
 * いま歩いている旅の面。
 *
 * ## なぜ要るか
 *
 * 常設の入口（`components/island/layout.ts` の `PLACES`）は、島に建っている
 * ものだけを並べている。**旅は建物ではないので、そこに入らない。**
 * その結果、出発したあとの本番は「伝説の企画」も「作った料理」も砂浜に
 * 並んでいるのに、**いま起きていることだけが常設の外**にあった。
 * `/map` は「いまは北欧周遊のとちゅうです」と書きながら、そこへ行く道を
 * 1本も持っていなかった。
 *
 * ## 日付で決まるものは、焼かない
 *
 * 静的書き出し（`output: "export"`）なので、ここを呼んだ答えを HTML に
 * 焼くと、旅が終わっても口が残る。**呼ぶのは画面が出てから**
 * （`components/ui/TripDoor.tsx`／`app/map/parts.tsx`）。
 *
 * ## 期間の決めかたを、ここで新しく作らない
 *
 * 始まり・終わり・日数は、ぜんぶ `content/chapters.ts` が持っている
 * （`chapterNow` / `chapterSpan` / `chapterDays`）。ここが自前で日付を
 * 引き算しはじめると、島の札は「終わった」なのに砂浜の口だけ残る、
 * という食い違いが出る（`docs/island-misses.md` #21）。
 */

import { chapterDays, chapterNow, chapterSpan } from "@/content/chapters";

/**
 * 章ごとの、その旅そのものの面。
 *
 * **持っていない章は口を出さない。** 行き先を作れば「これから建っていく島」の
 * 薄い1枚に着くだけで、押した人には何も無い（`docs/island-misses.md` #12）。
 * 旅の面を作った章だけ、ここに1行足す。
 */
const TRIP_PAGES: Record<string, string> = {
  nordic: "/nordic",
};

/**
 * その章の旅の面。無ければ `null`。
 *
 * **旅の名前を画面に出したら、そこへ行けるようにする。**「いまは北欧周遊の
 * とちゅうです」と書きながら行き先を持っていないのが `docs/island-misses.md` #12
 * と同じ形だった。名前が出ているあいだは、旅が終わっていても押せてよい
 * （押した先の面は残る）。**下の `tripNow` とはわざと別にしてある**——
 * あちらは「いま起きていること」の口なので、旅が終われば下ろす。
 */
export function tripPageOf(slug: string | undefined): string | null {
  return (slug && TRIP_PAGES[slug]) || null;
}

export type TripDest = {
  /** 章の名前。そのまま「いまどこ」になる */
  name: string;
  slug: string;
  /** その旅の面 */
  href: string;
  /** 旅に出て何日目か。出た日が1日目 */
  day: number;
};

/**
 * いま歩いている旅。歩いていなければ `null`。
 *
 * 出しているあいだ ＝ 出発の日時を過ぎていて、まだ終わっていない。
 *
 * **終わりは、事実が入っていればそちら。入っていなければ見立ての日数で切る。**
 * `to` は旅から帰ったあやとが手で入れる欄で、旅の17日間は入らない
 * （`lib/stay.ts` と同じ事情）。入るのを待っていると、ストックホルムを
 * 発ったあとも砂浜が「この旅のこと」と言い続ける。
 *
 * **画面が出てから呼ぶこと。** 焼くと、旅が終わっても口が残る。
 */
export function tripNow(now: Date = new Date()): TripDest | null {
  const c = chapterNow(now);
  const href = TRIP_PAGES[c.slug];
  if (!href) return null;
  const { from, to } = chapterSpan(c, now);
  // まだ出発していない章と、次の章が始まって閉じた章は、いま歩いている旅ではない
  if (from == null || to != null) return null;
  const day = chapterDays(c, now);
  // 事実（`from`）が入っている章は、日数ではなく `to` が閉じる。まだ入っていない
  // あいだだけ、見立ての日数（`plannedDays`）で切る
  if (!c.from && c.plannedDays && day > c.plannedDays) return null;
  return { name: c.name, slug: c.slug, href, day };
}
