"use client";

import { useEffect, useState } from "react";
import { loadState } from "@/lib/liveStats";

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
export function useResidentDays(): Record<string, number> {
  const [days, setDays] = useState<Record<string, number>>({});
  useEffect(() => {
    let alive = true;
    loadState().then((s) => {
      if (alive && s?.residentDays) setDays(s.residentDays);
    });
    return () => {
      alive = false;
    };
  }, []);
  return days;
}
