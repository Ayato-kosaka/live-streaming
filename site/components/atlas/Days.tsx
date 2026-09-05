"use client";

import { useEffect, useState } from "react";

/**
 * ある日から今日までの日数。
 *
 * 静的書き出し（`output: "export"`）なので、ビルドした日の数字が焼き込まれる。
 * 焼いた値をまず出しておいて、画面が出てから数え直す。
 * こうしないと「旅した日数」が何ヶ月も止まったまま出てしまう。
 */
export default function Days({ from, plus = 0 }: { from: string; plus?: number }) {
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    setN(Math.floor((Date.now() - new Date(from).getTime()) / 86400000) + plus);
  }, [from, plus]);
  const baked = Math.floor((new Date("2026-09-05").getTime() - new Date(from).getTime()) / 86400000) + plus;
  return <>{(n ?? baked).toLocaleString()}</>;
}
