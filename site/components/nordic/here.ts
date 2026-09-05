import { useSyncExternalStore } from "react";

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
