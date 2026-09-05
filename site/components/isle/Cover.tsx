"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, type ReactNode } from "react";

import { chapterNow } from "@/content/chapters";
import type { IsleSpec } from "./spec";

/**
 * 島の表紙。**いま何章かで、降り立つ島が変わる。**
 *
 * あやとの言葉:「北欧ヒッチハイクの期間に入れば、あやと島の表紙は初期表示が
 * 北欧周遊の島のものに変わる」。
 *
 * ## なぜ画面が出てから決めるのか
 *
 * 静的書き出し（`output: "export"`）なので、**ビルドしたときの答えが HTML に
 * 焼き込まれる**（`CLAUDE.md` の「静的書き出し」）。出発の日をまたいでも、
 * 誰かがデプロイし直すまで表紙が変わらない。だから
 * **焼くのはいまの島（コーカサス）で、入れ替えは画面が出てから**やる。
 *
 * 判定は `chapterNow(new Date())` 1か所だけ。日付から決まるので
 * （`content/chapters.ts`）、`chapters.ts` の `opensAt` を書きかえれば
 * ここも島の連なりも一緒に動く。
 *
 * ## なぜ入れ替える島だけ後から読むのか
 *
 * 出発までのあいだ、表紙に降りる人は全員いまの島に降りる。
 * その人たちに歩ける島のエンジンをもう1本ぶん配るのは、払うだけで
 * 何も返らない。`next/dynamic` で、入れ替わる日が来てから取りにいく。
 */
const IsleStage = dynamic(() => import("./IsleStage"), { ssr: false });

export default function Cover({ now, next }: { now: ReactNode; next: IsleSpec }) {
  const [sailed, setSailed] = useState(false);
  useEffect(() => {
    setSailed(chapterNow(new Date()).slug === next.slug);
  }, [next.slug]);
  if (!sailed) return <>{now}</>;
  return <IsleStage spec={next} cover />;
}
