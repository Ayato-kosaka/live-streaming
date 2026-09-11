"use client";

import { useEffect, useState } from "react";
import { marked, said } from "@/content/nights";

/**
 * 旅のあいだだけ言い方の変わる文を、**画面が出てから**差し込む。
 *
 * 静的書き出し（`output: "export"`）なので、ここを焼くと出発の日から
 * 17日間ずっと「毎晩22時」と言い続ける。旅の途中は電波の細いところを通るので、
 * 誰も直しに来られない。だから**焼いた HTML に時刻を入れない。**
 *
 * 印（`content/voice.ts` の `say`）の付いていない文は、そのまま焼いて出す。
 * 印の付いた文だけが、画面の出るまでのあいだ空白になる。改行しない空白を置くのは、
 * 1行ぶんの高さを保って、差し込んだ瞬間に行が跳ねないようにするため。
 */
export default function Say({ t }: { t: string }) {
  // サーバ側と、画面が出た最初の1回は同じものを返す（水あわせを崩さない）
  const [s, setS] = useState(() => (marked(t) ? "\u00a0" : t));
  useEffect(() => setS(said(t, new Date())), [t]);
  return <>{s}</>;
}
