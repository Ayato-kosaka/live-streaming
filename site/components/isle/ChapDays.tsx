"use client";

import { useEffect, useState } from "react";
import { chapterDays, type Chapter } from "@/content/chapters";

/**
 * 章にいた日数。**画面が出てから数え直す。**
 *
 * 静的書き出し（`output: "export"`）なので、ビルドした日の答えが HTML に入る
 * （`CLAUDE.md` の「静的書き出し」）。終わった章は動かないが、いま歩いている
 * 島は毎日1日ずつ増えるので、焼いたままだと**デプロイした日で止まる。**
 */
export default function ChapDays({ chapter, baked }: { chapter: Chapter; baked: number }) {
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    setN(chapterDays(chapter, new Date()));
  }, [chapter]);
  return <>{(n ?? baked).toLocaleString()}</>;
}
