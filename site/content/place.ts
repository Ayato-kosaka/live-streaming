/**
 * 「いまどこ」に打たれた場所から、**国**と**旅程の街**を引く。
 *
 * ## なぜ要るのか
 *
 * `/now` の国旗も「いまいる国」も、島の景色（`current.theme`）から引いていた。
 * 景色に入れてよいのは `georgia` / `nordic` / `desert` の3つだけ
 * （`functions/src/islandApi.ts`）で、**`nordic` は国ではない。**
 * だから旅の途中に景色を北欧へ替えると旗が消え、替えないとジョージアの旗が
 * リトアニアの街の上に出る。実測（2026-09-15、ヴィリニュス）で両方出た。
 *
 * **島の景色と、いまいる国は別のもの。** 国は、人が打った場所の字から引く。
 * そこにはいつでも国の名前が入っている（「リトアニア・ヴィリニュス」）。
 *
 * ## 国の一覧を、ここで手で作らない
 *
 * 歩いた国は `COUNTRIES`、これから歩く国は `AHEAD_COUNTRIES`
 * （どちらも `content/countries.ts`）。**北欧の6カ国を `COUNTRIES` に足さない。**
 * あれは「歩いた国」の一覧で、`/map` の17カ国も、世界地図の焼き込みも、
 * `order` もそこから数えている。まだ歩いていない国を混ぜると、
 * 歩く前から歩いたことになる。
 * ここは2つを**読むだけ**で、名前と slug（国旗を引く鍵）だけを取り出す。
 */

/* **旅程（`content/nordic.ts` / `nordic/index.json`）からは読まない。**
   あちらを読むと旅のしおりごと付いてきて、`/now` の持ち物が 17〜22KB 増える
   （実測 140 → 157／162KB）。**`/now` は旅の17日間いちばん開かれる面で、
   開くのは電波の細いところを走っている車の中。** ここで要るのは国の名前と
   slug だけなので、`countries.ts` の2つの一覧を読む。 */
import { AHEAD_COUNTRIES, COUNTRIES } from "./countries";
import { pickPlace } from "@/lib/place";

/** 国の名前と、国旗を引く鍵。画面に要るのはこの2つだけ。 */
export type PlaceCountry = { slug: string; name: string };

/** 歩いた国と、これから歩く国。**どちらの表も、ここでは作らない。読むだけ。** */
const ALL_COUNTRIES: PlaceCountry[] = [
  ...COUNTRIES.map((c) => ({ slug: c.slug, name: c.name })),
  ...AHEAD_COUNTRIES,
];

/**
 * 打った字が指している国。**分からなければ `null`**（適当な国を当てない）。
 *
 * 国の名前は、人が打つ「いまどこ」にいつも入っている（「リトアニア・ヴィリニュス」）。
 * 街だけ打たれた日に国まで引きたいときは `content/tripPlaces.ts` を使う。
 */
export function placeCountry(place: string | undefined): PlaceCountry | null {
  return pickPlace(place, ALL_COUNTRIES, (c) => c.name);
}

/** その国の名前から引く。街から国を引くとき（`content/tripPlaces.ts`）に使う。 */
export const countryByName = (name: string) => ALL_COUNTRIES.find((c) => c.name === name) ?? null;
