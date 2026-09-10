"use client";

import { useCallback, useEffect, useState } from "react";
import { StreamCard } from "@/components/ui/Bits";
import ReadAgain from "@/components/me/ReadAgain";
import { withRead } from "@/lib/auth";
import { loadState } from "@/lib/liveStats";
import { STREAM_TYPES } from "@/content/streamTypes";

/**
 * 表紙のいちばん下、「今夜も22時から」に並ぶ配信。
 *
 * ## なぜ差し替えたか
 *
 * ここは `STREAM_TYPES[0].samples`——**クッキング配信の代表として手で選んだ見本**
 * ——の先頭2本を出していた。見本は「その型がどんなものか」を見せるために選んで
 * あるので、新しい順ではない。本番では 2026/08/21 と 2026/07/16、
 * **3週間前と2ヶ月前**の2本が「今夜も22時から」の下に並んでいた。
 *
 * 直近の5本は `/island-api/state` の `stats.latest` に毎晩入っていて、
 * **同じページがもう読んでいる**（`lib/liveStats.tsx` の `loadState`）。
 * 取りに行く回数は増えない。
 *
 * ## 読めなかったときは、見本に落ちる。でも黙って落ちない
 *
 * 旅のあいだは電波の細いところを通る。読めない日に何も出さないと、
 * 「今夜も22時から」の下が空になって、配信が無いように見える。
 * だから見本の2本に落ちる——**が、「これが直近です」という顔はしない。**
 * 読めなかったことは、そう言う（`docs/island-standards.md` 10）。
 */
export default function Latest() {
  const baked = STREAM_TYPES[0].samples.slice(0, 2);
  const [vids, setVids] = useState<typeof baked | null>(null);
  const [off, setOff] = useState(false);

  const read = useCallback(() => {
    let alive = true;
    setOff(false);
    /* **返事が来ないのも「読めなかった」。** `getState` は自分では諦めないので、
       ここで切らないと、古い2本が「いま読んでいる最中」の顔のまま残る。 */
    withRead(loadState())
      .then((s) => {
        if (!alive) return;
        /* **鍵は `video_id`。** 本番の値を curl で見て決めた
           （`python/island_daily_stats.py` の `SELECT AS STRUCT video_id`）。
           型のほうが `videoId` と書いてあったので、そのまま読んでいたら
           動画IDが `undefined` のサムネイルを2枚並べるところだった。 */
        const list = s?.stats?.latest;
        if (list?.length)
          setVids(
            list.slice(0, 2).map((v) => ({ videoId: v.video_id, title: v.title, date: v.date })),
          );
        else setOff(true);
      })
      .catch(() => alive && setOff(true));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(read, [read]);

  return (
    <>
      {off && <ReadAgain what="今夜までの配信" onRetry={read} />}
      <div className="scards">
        {(vids ?? baked).map((v) => (
          <StreamCard key={v.videoId} {...v} />
        ))}
      </div>
    </>
  );
}
