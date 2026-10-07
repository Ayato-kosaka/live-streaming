"use client";

import { useEffect, useState } from "react";
import { BUILT_AT } from "@/lib/builtAt";

/**
 * 年齢。
 *
 * 静的書き出し（`output: "export"`）なので、書いた数字は焼き込まれて止まる。
 * 誕生日を過ぎても1年ずれたままになるので、画面が出てから数え直す
 * （`components/atlas/Days.tsx` と同じ作り）。
 */
export default function Age({ born }: { born: string }) {
  const [n, setN] = useState<number | null>(null);
  useEffect(() => setN(years(born, new Date())), [born]);
  /* 焼き込みの値。サーバとクライアントの1回目が同じ字になるように、**焼いた日**
     （`BUILT_AT`）で引く。ここには日付を直に書いた `new Date` が置いてあった。
     焼き直しても動かない日付なので、**誕生日を過ぎると焼いた HTML だけ1つ若い。**
     JS の動かない読み手——OGP・検索の下見——には、その嘘しか見えない。
     開発サーバでは `BUILT_AT` が1970年になる（`lib/builtAt.ts`）ので、
     生まれる前＝0 で止める。数え直しが走るまでの1フレームだけの値 */
  return <>{n ?? Math.max(0, years(born, BUILT_AT))}</>;
}

function years(born: string, now: Date) {
  const b = new Date(born);
  let n = now.getFullYear() - b.getFullYear();
  const md = now.getMonth() * 100 + now.getDate() - (b.getMonth() * 100 + b.getDate());
  if (md < 0) n -= 1;
  return n;
}
