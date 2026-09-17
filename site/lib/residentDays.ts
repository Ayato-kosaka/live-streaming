"use client";

import { useEffect, useState } from "react";
import { loadState } from "@/lib/liveStats";
import type { Read } from "@/lib/auth";

/**
 * 住人の「一緒にいた日数」を、最新のものにする（#91）。
 *
 * ## なぜ焼き込みだけでは足りないか
 *
 * `content/residents.ts` の `days` は Git に焼いてある。あれは
 * `python/build_residents.py` が数えるが、**書き先が Git なので、コミットして
 * Hosting を手で起動しないと変わらない。** 旅の途中にそれは回らない。
 * 「配信を重ねても数字が古いまま」というのが #91 そのもの。
 *
 * 数え直したものは毎晩 `islandChannels` に入る（`python/island_channels.py`）。
 * `/state` がその上位を `residentDays` で返すので、ここで受け取って差し替える。
 * 焼き込みの値は、読めなかったときの受け皿として残る。
 *
 * ## 島に出ている人の抽選には使わない
 *
 * `days` は**島に出ている人を日替わりで選ぶ重み**にもなっている
 * （`components/island/villagers.ts` の `rosterOf`）。**そこは焼き込みのまま。**
 *
 * 静的書き出しなので、島は書き出したときの `days` で1回描かれる。そこへ
 * 読み込みのあとで別の数を入れると、**開いた0.3秒あとに住人が目の前で
 * 入れ替わる**（ハイドレーションの食い違いにもなる）。
 * 数字を出すところは入れ替わっても「増えた」と読めるが、住人が消えるのは
 * 事故に見える。**見えている数だけを最新にする。**
 */
export type ResidentDaysState = {
  /** チャンネルID -> 日数。**入っていないチャンネルは「0日」ではなく「数が無い」** */
  days: Record<string, number>;
  read: Read;
};

/**
 * 日数と、**それが読めたかどうか**（#115）。
 *
 * `days` だけを返していたころは、読む側が「まだ来ていない」と
 * 「来たけれど、この人の数は入っていなかった」を区別できなかった。
 * 区別できないので、どちらも焼き込みの `0` に落ちて「0日」と出ていた。
 *
 * **`/state` の `residentDays` は上位60人ぶんしか返らない**
 * （`functions/src/islandApi.ts` の `residentDays`）。図鑑に並ぶ102人のうち
 * ここに載るのは一部で、**載っていないことは「一緒にいなかった」ではない。**
 */
export function useResidentDaysState(): ResidentDaysState {
  const [state, setState] = useState<ResidentDaysState>({ days: {}, read: "wait" });
  useEffect(() => {
    let alive = true;
    loadState().then((s) => {
      if (!alive) return;
      // `loadState` は落ちたぶんを null にして返す（`lib/liveStats.tsx`）
      setState(s ? { days: s.residentDays ?? {}, read: "ok" } : { days: {}, read: "down" });
    });
    return () => {
      alive = false;
    };
  }, []);
  return state;
}

export function useResidentDays(): Record<string, number> {
  return useResidentDaysState().days;
}
