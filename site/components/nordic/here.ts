import { useEffect, useSyncExternalStore } from "react";
import { loadState } from "@/lib/liveStats";

/**
 * いま、ルートの何本目の区間を走っているか。
 *
 * `TripNow` が `/island-api/state` の `current.place` を読んで決めた場所を、
 * 同じ画面の区間カードにも配る。読むところが2つあるからといって
 * `/state` を2回叩かない。
 *
 * 使うのは**わかれ道を閉じるため**。もう越えた区間の分かれ目を開けたままにすると、
 * とっくに決まったことに票が入り続ける。
 *
 * 「越えたか」を `NORDIC_LOG`（起きたことを手で書く席）で決めていない。
 * あれは手書きなので、着いた日から数日おくれる。**おくれているあいだ、
 * 決まったことに票が入る**ので、位置のほうを見る。
 *
 * 出発前と、場所が分からないときは null。そのときは何も閉じない。
 *
 * **配るところが2つある。** `/nordic` は司令塔（`TripNow`）が配るが、
 * わかれ道はオーナーの指示で1日ぶんのページへ移してある。あちらには司令塔が
 * 居ないので、長いあいだ **1日ぶんのページの `here` は永久に null** だった。
 * 越えた日の問いが1つも閉じず、ストックホルムに着いた日でも
 * 「ヴィリニュス→リガ、シャウレイに寄る？」に票が入り続けていた（実測）。
 * だから、司令塔の居ない面のために `useHereAt` を置く。
 */

let seq: number | null = null;
const subs = new Set<() => void>();

/** いま走っている区間の、`ROUTE` の中での位置。 */
export function setHereSeq(n: number | null) {
  if (seq === n) return;
  seq = n;
  for (const f of subs) f();
}

export function useHereSeq(): number | null {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => {
        subs.delete(f);
      };
    },
    () => seq,
    () => null,
  );
}

/**
 * 司令塔の居ない面で、いる場所から「何本目か」を決める。
 *
 * 島の様子は面のどこかで必ず1回読んでいる（`lib/liveStats` が約束を配る）ので、
 * ここで読んでも往復は増えない。**1回きり**。読めなくても、読めた場所が
 * 道の上に無くても、null のままにして何も閉じない。
 *
 * @param route 止まる街と、そこへ着く区間が `ROUTE` の何本目か（`STOP_SEQ`）
 */
let asked = false;
export function useHereAt(route: { name: string; seq: number }[]): number | null {
  const here = useHereSeq();
  useEffect(() => {
    if (asked || route.length === 0) return;
    asked = true;
    loadState().then((s) => {
      const p = (s?.current?.place ?? "").trim();
      if (!p) return;
      // 「リガ」でも「ラトビア・リガ」でも当たるように、含んでいるかで見る。
      // **後ろから探す。** 先へ進んだほうを採っておくと、街の名前が
      // 別の街の名前に含まれていても、旅の進み方を巻き戻さない。
      for (let i = route.length - 1; i >= 0; i--) {
        if (p.includes(route[i].name)) {
          setHereSeq(route[i].seq);
          return;
        }
      }
    });
  }, [route]);
  return here;
}
