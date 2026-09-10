import { useEffect, useSyncExternalStore } from "react";
import { loadState } from "@/lib/liveStats";
import { placeOutdated, samePlace } from "@/lib/place";
import { planStop, tripDate, type PlanStop } from "./where";

/**
 * いま、道のどこにいるか。**わかれ道を閉じるためだけに使う。**
 *
 * もう越えた区間の分かれ目を開けたままにすると、とっくに決まったことに
 * 票が入り続ける。
 *
 * 「越えたか」を `NORDIC_LOG`（起きたことを手で書く席）で決めていない。
 * あれは手書きなので、着いた日から数日おくれる。**おくれているあいだ、
 * 決まったことに票が入る**ので、位置のほうを見る。
 *
 * **配るところが2つある。** `/nordic` は司令塔（`TripNow`）が配るが、
 * わかれ道はオーナーの指示で1日ぶんのページへ移してある。あちらには司令塔が
 * 居ないので、司令塔の居ない面のために `useHereAt` を置く。
 *
 * ## 出どころは、旅程の日付。手打ちは上書き
 *
 * ここは長いあいだ `current.place`——**あやとが手で打つ1本の文字列**——だけを
 * 読んでいた。本番のその字は「ジョージア・トビリシ」で、打たれたのは出発の
 * 1週間前（`updatedAt` 2026-09-04）。旅の17日間、あやとは走っている車の中に
 * いるので打ち直せない。
 *
 * その字は `STOP_SEQ` の先頭（トビリシ）に当たるので、**島から見るとあやとは
 * 永久にトビリシにいた。** 5日目に開いても1日目の問いが開いたままで、
 * すでに越えた日に票が入り続けていた。
 *
 * `/nordic` は #273 で直っている（`components/nordic/where.ts`）。同じ直しを
 * ここにも入れる。**旅程の日付から引いた居どころが既定で、手で打った字が上書き。**
 * 打ってあっても、いまの旅より前に打たれた字なら受け取らない
 * （`lib/place.ts` の `placeOutdated`）。
 *
 * ## 道の上の位置は、街と区間が半歩ずつ交互に並ぶ
 *
 * `seq` は `ROUTE` の何本目か（`content/nordic.ts` の `STOP_SEQ`）だが、
 * **街にいることと、その街を発つ区間を走っていることは別**なので、
 * 街は「その街を発つ区間の**半歩手前**」＝ `seq - 0.5` で表す。
 *
 *   … 街4 (3.5) → 区間4 (4) → 街5 (4.5) → 区間5 (5) → 街6 (5.5) …
 *
 * これが要るのは、**動かない日**があるから。9月15日はヴィリニュスで休息日で、
 * 9月16日にヴィリニュスを発つ。どちらも「ヴィリニュスにいる」ので、街の番号
 * だけでは2日を見分けられない。休息日の問い（トラカイまで行く？）は 15日に開いて
 * いて、16日には閉じていないといけない。半歩を入れると、
 * 15日 = 4.5・16日 = 5 になって、`seq < here` の1つの比べ方のまま両方通る。
 *
 * 司令塔（`TripNow`）が配るのは区間の番号（整数）だけ。あちらの面には
 * わかれ道が無いので、半歩を知らなくても困らない。
 */

/** 道の上の位置と、それが何で分かったか。 */
export type Here = {
  /** 道の上の位置。区間 j は j、街 i は i - 0.5 */
  seq: number;
  /**
   * **事実で押さえられているか。**
   *
   * 本人が打った字か、島から届いた「着いた日」で分かったときだけ `true`。
   * 旅程の日付から引いただけなら `false`——ヒッチハイクは乗せてもらえなければ
   * その日は進まないので、予定を「いま」と同じ強さで言わない（`where.ts`）。
   */
  sure: boolean;
};

let here: Here | null = null;
const subs = new Set<() => void>();

/**
 * いまの位置を配る。
 *
 * `sure` の既定が `true` なのは、`TripNow` が本人の字・島の事実・旅程を
 * すでに突き合わせたうえで区間の番号を配ってくるため。
 */
export function setHereSeq(n: number | null, sure = true) {
  if (here?.seq === n && here?.sure === sure) return;
  if (here == null && n == null) return;
  here = n == null ? null : { seq: n, sure };
  for (const f of subs) f();
}

function subscribe(f: () => void) {
  subs.add(f);
  return () => {
    subs.delete(f);
  };
}

/** 道の上の位置だけ。**書き出した HTML には無い**ので、初回は null。 */
export function useHereSeq(): number | null {
  return useSyncExternalStore(
    subscribe,
    () => here?.seq ?? null,
    () => null,
  );
}

/** 位置と、それが事実か予定か。 */
export function useHere(): Here | null {
  return useSyncExternalStore(
    subscribe,
    () => here,
    () => null,
  );
}

/** 止まる街1つぶん。名前と、道の上の位置と、旅程の日付。 */
export type StopAt = { name: string; seq: number } & PlanStop;

/**
 * 司令塔の居ない面で、いる場所を決める。**1回きり。**
 *
 * 順番は2段。まず旅程の日付から引いて置き、そのあと本人の字が新しければ
 * 上書きする。**島の様子が読めなくても、旅程のぶんは必ず出る**ので、
 * 電波の細い日に越えた日の問いが開き直ることがない。
 *
 * 島の様子は面のどこかで必ず1回読んでいる（`lib/liveStats` が約束を配る）ので、
 * ここで読んでも往復は増えない。
 *
 * @param route 止まる街の並び（`content/nordic.ts` の `STOP_SEQ` に旅程の日付を足したもの）
 * @param until 旅が終わる日(YYYY-MM-DD)。ここを過ぎたら、道の上の問いはぜんぶ越えている
 */
let asked = false;
export function useHereAt(route: StopAt[], until?: string): Here | null {
  const now = useHere();
  useEffect(() => {
    if (asked || route.length === 0) return;
    asked = true;
    const today = tripDate(new Date());
    const goal = route[route.length - 1].seq;
    /* 街の番号 → 道の上の位置。**発つ日でなければ、まだその街にいる。**
       休息日と出発日を見分けるのはここ1か所だけ。 */
    const posOf = (i: number) => (route[i].leaveOn === today ? route[i].seq : route[i].seq - 0.5);

    /* 既定は旅程の日付から。旅が終わったあとは終点そのものを置く——
       ここを空にすると、旅の1ヶ月後にぜんぶの日の問いが開き直る。 */
    const plan = planStop(route, today, until);
    if (plan != null) setHereSeq(posOf(plan), false);
    else if (until && today > until) setHereSeq(goal, false);

    loadState()
      .then((s) => {
        /* 着いたことは島から届いた事実（`docs/nordic-depart.md`）。
           そこから先は、道の上の問いはぜんぶ越えている。 */
        if (s?.nordic?.arrivedOn) return setHereSeq(goal, true);
        const typed = (s?.current?.place ?? "").trim();
        /* **古い字は「いま」ではない。** ここを素通しにしていたので、旅の17日間
           ずっとトビリシにいることになっていた。 */
        if (!typed || placeOutdated(s?.current?.updatedAt)) return;
        /* 「リガ」でも「ラトビア・リガ」でも、「ビリニュス」でも当たるように
           `samePlace` で見る（`lib/place.ts`）。走っている車の中で打つので
           1字ずれる。**後ろから探す。** 先へ進んだほうを採っておくと、街の名前が
           別の街の名前に含まれていても、旅の進み方を巻き戻さない。 */
        for (let i = route.length - 1; i >= 0; i--) {
          if (samePlace(typed, route[i].name)) return setHereSeq(posOf(i), true);
        }
        /* 旅程の外の街を打っている日（足止め・寄り道）。旅程から引いたものを
           そのまま残す。当たらなかったからといって、位置を捨てない。 */
      })
      .catch(() => {
        /* 島の様子が読めなくても、旅程から引いたぶんはもう置いてある */
      });
  }, [route, until]);
  return now;
}
