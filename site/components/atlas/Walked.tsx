"use client";

import { useEffect, useState } from "react";
import { countriesWalked } from "@/content/walked";
import { BUILT_AT } from "@/lib/builtAt";

/**
 * これまで歩いた国の数。**画面が出てから数え直す。**
 *
 * 静的書き出し（`output: "export"`）なので、焼くと国境を越えた日から
 * その晩の焼き直しが配られるまで、1つ少ない数が出つづける
 * （出どころと決めかたは `content/walked.ts`）。
 *
 * **最初の描画は焼いた時刻で数える**（`docs/island-misses.md` #30）。
 * `new Date()` で始めると、焼いた HTML とブラウザの最初の描画で数が変わって
 * 水あわせが崩れる。`components/atlas/Days.tsx` と同じ形。
 */
export default function Walked() {
  const [n, setN] = useState(() => countriesWalked(BUILT_AT));
  useEffect(() => setN(countriesWalked(new Date())), []);
  return <>{n}</>;
}
