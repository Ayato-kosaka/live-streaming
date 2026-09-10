"use client";

import { useEffect, useState } from "react";
import { NOW_FALLBACK } from "@/content/site";
import { loadState } from "@/lib/liveStats";
import { placeWord } from "@/lib/stay";

/**
 * 表紙の名刺にある「いま ◯◯」。
 *
 * ## なぜ焼いた字のままではいけないか
 *
 * ここは `NOW_FALLBACK.place` をそのまま出していた。あれは
 * `/island-api/state` の `current.place`——**あやとが手で打つ1本の文字列**——を
 * 焼いたもので、本番の値は「ジョージア・トビリシ」、書かれたのは出発の1週間前
 * （2026-09-04）。**旅の17日間、あやとは走っている車の中にいて打ち直せない。**
 * 時計を旅の2日目に進めて本番を開くと、表紙がずっと
 * 「いま ジョージア・トビリシ」と言っていた（4回撮って4回とも同じ）。
 *
 * しかも押した先の `/now` は同じ日に「北欧周遊のとちゅう」と言う。
 * **1タップで言うことが変わる**（`docs/island-misses.md`「面の上と下で、
 * 違うことを言っていた」）。判定は `lib/stay.ts` にもうあったので、
 * 表紙もそこを見るだけでよかった。
 *
 * ## なぜ画面が出てから引き直すのか
 *
 * 静的書き出し（`output: "export"`）なので、焼いた HTML に入るのは
 * **配った日の答え**。出発の日をまたいでも、配り直すまで変わらない。
 * だから焼くのは配った日の答えで、そこから先は画面が出てから引き直す
 * （`components/isle/Cover.tsx` と同じ形）。
 *
 * 引き直しは2段。**便りを待たない。**
 *
 *   1. まず、焼いてある便りの日付と**今日**で引き直す（通信なし）
 *   2. 便りが届いたら、打たれた字と日付でもう一度引き直す
 *
 * 1 を飛ばして便りを待つと、電波の細いところでは待っているあいだじゅう
 * 焼いた「ジョージア・トビリシ」が出たままになる。**待っても答えは変わらない**
 * （日付だけで決まる）ので、先に引く。
 *
 * 便りは `loadState()`（`lib/liveStats.tsx`）から取る。表紙は数字のために
 * もう1回読んでいるので、**取りにいく回数は増えない。**
 */
export default function NowPlace({ baked }: { baked: string }) {
  const [word, setWord] = useState(baked);

  useEffect(() => {
    let alive = true;
    // 1. 焼いた答えは配った日のもの。まず今日の日付で引き直す
    setWord(placeWord(NOW_FALLBACK.place, NOW_FALLBACK.updatedAt, new Date()));
    // 2. 便りが届いたら、打たれた字が新しいかを見て決め直す（新しければ人の字が勝つ）
    loadState()
      .then((s) => {
        if (!alive) return;
        const c = s?.current;
        const place = typeof c?.place === "string" && c.place ? c.place : NOW_FALLBACK.place;
        const at = typeof c?.updatedAt === "string" ? c.updatedAt : NOW_FALLBACK.updatedAt;
        setWord(placeWord(place, at, new Date()));
      })
      .catch(() => {
        /* 読めないときは 1 の答えのまま。旅かどうかは日付だけで決まるので、
           読めなくても「いまどこ」が嘘になることはない */
      });
    return () => {
      alive = false;
    };
  }, []);

  return <>{word}</>;
}
