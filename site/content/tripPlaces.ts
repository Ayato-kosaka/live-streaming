/**
 * 旅程で降りる街を、そのまま「いまどこ」に入れられる形にしたもの。
 *
 * 押すだけで入るようにするための札（`components/me/TripTools.tsx`）と、
 * 「打った字で旅の地図が動くか」を返すため。
 *
 * **街の表をここで作らない。** 旅程は一度ぜんぶ変わっていて、そのとき手で
 * 並べたほうだけが古くなる（`docs/island-misses.md` #3）。
 * 通る街は `content/nordic.ts` が旅程から導出して持っている。
 *
 * `content/place.ts` と分けてあるのは、あちらが `/now` からも読まれるため。
 * ここは `content/nordic.ts` を丸ごと連れてくるので、旅程を既に持っている面
 * （島の手入れ・北欧の面）からだけ読む。
 */

import { COUNTRIES } from "./countries";
import { VISIT_CITIES, cityCountry } from "./nordic";
import { countryByName } from "./place";
import { pickPlace } from "@/lib/place";

export type TripPlace = {
  /** 街の名前。札に出すのはこれ */
  city: string;
  /** その街のある国 */
  country: string;
  /** 「いまどこ」に入れる形。「リトアニア・ヴィリニュス」 */
  label: string;
  /**
   * 旅の地図（`/nordic`）に点があるか。**「いま ここ」が立つのはここだけ。**
   *
   * 地図はポーランドから先しか描いていないので、出発地（トビリシ・クタイシ）と
   * 夜行フェリーの「船の中」には点が無い。**そこを「動きます」と言わない。**
   * 点のある街の一覧（`nordic/map.json`）は 94KB あって画面には持ち込めないので、
   * 「北欧の国に属する街か」で見る。地図に点があるのはその9つと同じ。
   */
  onMap: boolean;
};

/** 通る順。旅は北へ一方通行なので、その順に読めるほうが分かる。 */
export const TRIP_PLACES: TripPlace[] = VISIT_CITIES.map((city) => {
  const nordic = cityCountry(city);
  const name = nordic?.name ??
    COUNTRIES.find((c) => c.stays.some((s) => s.cities.includes(city)))?.name ??
    "";
  return { city, country: name, label: name ? `${name}・${city}` : city, onMap: !!nordic };
});

/**
 * 打った字が指している、旅程の街。**旅の地図が動くかどうかは `onMap` で決まる。**
 *
 * `/nordic` の「いま ここ」と同じ読み方をする（`components/nordic/TripNow.tsx` も
 * `lib/place.ts` の `samePlace` を見る）。揃えておかないと、`/me/desk` が
 * 「動きます」と言ったのに地図が動かない、という食い違いが出る。
 */
export const tripCity = (place: string | undefined) =>
  pickPlace(place, TRIP_PLACES, (c) => c.city);

/** 街から国を引く。「ヴィリニュス」とだけ打たれた日に使う。 */
export const countryOfCity = (city: string) => countryByName(TRIP_PLACES.find((c) => c.city === city)?.country ?? "");
