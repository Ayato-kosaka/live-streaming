"use client";

import { useEffect, useState } from "react";
import { BUILT_AT } from "@/lib/builtAt";

/**
 * ある日から今日までの日数。
 *
 * 静的書き出し（`output: "export"`）なので、ビルドした日の数字が焼き込まれる。
 * 焼いた値をまず出しておいて、画面が出てから数え直す。
 * こうしないと「旅した日数」が何ヶ月も止まったまま出てしまう。
 *
 * **出るまでのあいだの数は `BUILT_AT`（焼いた日）から出す。**
 * ここには `new Date("2026-09-05")` が直に書いてあった。焼き直しても動かない
 * 日付なので、**焼いた日ではなく、その字を書いた日で止まる。** 2026-09-18 に
 * 焼いた HTML が、JS の動く前に「日本を出て、きょうで 724 日目」（本当は 737）と
 * 出していた——同じ字が表紙・`/about`・`/map` の3面にある。
 * 日ごとに1ずつ離れていくので、放っておくほど嘘が大きくなる。
 * `BUILT_AT` はビルドのたびに入る（`next.config.mjs`）ので、毎晩の焼き直しで
 * 追いつく。サーバ側とブラウザ側で同じ字なので水あわせも落ちない。
 *
 * 開発サーバでは `BUILT_AT` が 1970年になる（`lib/builtAt.ts`）。
 * そのまま引くと大きなマイナスが出るので、0 で止める——
 * **数え直しが走るまでの1フレームだけの値**で、本番では通らない道。
 */
export default function Days({ from, plus = 0 }: { from: string; plus?: number }) {
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    setN(Math.floor((Date.now() - new Date(from).getTime()) / 86400000) + plus);
  }, [from, plus]);
  const baked = Math.max(
    0,
    Math.floor((BUILT_AT.getTime() - new Date(from).getTime()) / 86400000) + plus,
  );
  return <>{(n ?? baked).toLocaleString()}</>;
}
