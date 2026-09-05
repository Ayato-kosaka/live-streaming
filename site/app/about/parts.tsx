"use client";

import { useEffect, useState } from "react";

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
  // 焼き込みの値。サーバとクライアントの1回目が同じ字になるように、日付を直に書く
  return <>{n ?? years(born, new Date("2026-09-05"))}</>;
}

function years(born: string, now: Date) {
  const b = new Date(born);
  let n = now.getFullYear() - b.getFullYear();
  const md = now.getMonth() * 100 + now.getDate() - (b.getMonth() * 100 + b.getDate());
  if (md < 0) n -= 1;
  return n;
}
