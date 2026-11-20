/**
 * **足もとに出す街のガイドを、その日に1本だけ選ぶ。**（あやと 2026-11-20）
 *
 * > 行ったのにスコピエ観光ガイドとかソフィア観光ガイドが出てきてる。
 * > これ全部出す気ですか。意味がわからない
 *
 * 前は全面の足もとに、公開した街のガイドを全部並べていた（`docs/seo.md` 2章 2026-11-18）。
 * 街は行くたびに増えるので、足もとが行った街の一覧になっていく。
 * **出すのは、いまいる街か、次に行く街の1本だけ。** 行った街のガイドは、
 * 国の面と `/travel` から辿れる。
 *
 * ## ここは型しか import しない
 *
 * 選ぶのは画面が出てからもう一度やる（`components/ui/FootGuide.tsx`）。
 * 全面の足もとに付く JS なので、企画の表（`content/plans.ts`）を連れていかない。
 * 表を渡すのは面の側（`components/ui/PageShell.tsx`）で、ブラウザへは
 * `guideStops` が組んだ小さな並びだけが行く。
 *
 * 見張りは `site/selftest/guidestop_selftest.mjs`（本物の滞在の表で、選んだ1本が
 * 企画の段と食い違わないか）。
 */

import type { Plan } from "@/content/plans";
import type { TravelCity } from "@/content/travel";

/** 街のガイドのある滞在1つ。**滞在の始まる日の順**に並ぶ */
export type GuideStop = {
  /** 街のガイドの道（`content/travel.ts` の `TRAVEL_CITIES`） */
  href: string;
  /** 街の名前（ガイドの h1 と同じ字） */
  name: string;
  /**
   * 滞在の終わる日（`YYYY-MM-DD`。この日までは居る）。**まだ決まっていなければ無い。**
   *
   * つぎの国へ移る日が企画の表に入ると、その前の日がここに入る（`content/plans.ts` の `closeStays`）。
   */
  until?: string;
};

/**
 * 滞在の表から、足もとに出せる街のガイドを組む。
 *
 * `stays` は**つぎの国へ移ったら終わる企画**（`endsWhen` が `NEXT_MOVE`）。街を手で書かない——
 * 企画の行き先（`href`）が街のガイドの道と同じ滞在だけを、始まる日の順に並べる。
 * 終わる日は事実（`done`）が先、なければ予定（`until`。つぎの国の日の前の日）。
 * **公開前の印（`draft`）の付いた街も入れる**（`components/ui/PageShell.tsx` の注）。
 */
export function guideStops(
  stays: Pick<Plan, "date" | "href" | "until" | "done">[],
  cities: Pick<TravelCity, "href" | "name">[],
): GuideStop[] {
  return stays
    .filter((p) => p.date)
    .sort((a, b) => (a.date as string).localeCompare(b.date as string))
    .flatMap((p) => {
      const city = cities.find((c) => c.href === p.href);
      const until = p.done ?? p.until;
      return city ? [{ href: city.href, name: city.name, ...(until ? { until } : {}) }] : [];
    });
}

/**
 * その日（日本時間の `YYYY-MM-DD`）に出す1本。**無ければ出さない。**
 *
 * 終わっていない滞在のうち、いちばんあとに始まるもの。次の国へ移る日が決まって
 * そこにガイドがあれば次の街、無ければいまいる街。いまいる街にガイドが無ければ何も出さない
 * ——前の街のガイドは、つぎの国へ移った日に終わっている（`until`）ので選ばれない。
 */
export function guideOn(stops: GuideStop[], day: string): GuideStop | undefined {
  for (let i = stops.length - 1; i >= 0; i--) {
    const s = stops[i];
    if (!s.until || s.until >= day) return s;
  }
  return undefined;
}
