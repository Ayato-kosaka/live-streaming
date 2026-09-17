"use client";

import { useEffect, useState } from "react";
import { walkedSaid, WALKED } from "@/content/chatter";
import { BUILT_AT } from "@/lib/builtAt";

/**
 * 住人のセリフの中の「歩いた国の数」を、**画面が出てから**差し込む。
 *
 * 島の吹き出しは押されたときに組み立てるので `linesOf` の中で替えられるが、
 * 住んでる人の面（`/friends`）はセリフを**そのまま並べて焼く。**
 * 焼くと、国境を越えた日の朝から晩の焼き直しまで、この面だけ1つ少ない数を出す。
 *
 * **最初の描画は焼いた時刻で替える**（`components/ui/Say.tsx` と同じ理由）。
 * `new Date()` で始めると、焼いた HTML とブラウザの最初の描画で数が変わる。
 */
export default function Walk({ t }: { t: string }) {
  const [s, setS] = useState(() => walkedSaid(t, BUILT_AT));
  useEffect(() => setS(walkedSaid(t, new Date())), [t]);
  return <>{s}</>;
}

/** 印の入っているセリフか。並べる前に見分けたいとき用。 */
export const hasWalked = (t: string) => t.includes(WALKED);
