"use client";

import { useEffect, useState } from "react";
import { CHAPTERS, chapterDays, type Chapter } from "@/content/chapters";

/**
 * 章にいた日数。**画面が出てから数え直す。**
 *
 * 静的書き出し（`output: "export"`）なので、ビルドした日の答えが HTML に入る
 * （`CLAUDE.md` の「静的書き出し」）。終わった章は動かないが、いま歩いている
 * 島は毎日1日ずつ増えるので、焼いたままだと**デプロイした日で止まる。**
 *
 * **数え直しを1回で終わらせない。** 島は配信のあいだ何時間も開きっぱなしに
 * なる面で、日付をまたいだ瞬間から次に開き直すまで1日ずれる。
 * 1分に1度でよい（`components/home/TripToday.tsx` と同じ刻み。
 * 「あと◯分」は1つも出していない）。
 */
export default function ChapDays({ chapter, baked }: { chapter: Chapter; baked: number }) {
  return <>{useChapterDays(chapter.slug, baked).toLocaleString()}</>;
}

/**
 * 章の slug から、いま何日目かを数える。**焼いた数は最初の1枚だけ。**
 *
 * 章そのものではなく slug を取るのは、**島に建てるものの表（`IsleSpec`）が
 * サーバからブラウザへ丸ごと渡る**から（`app/page.tsx` → `Cover` →
 * `IsleStage`）。章の中身をそこへ入れると、島1つぶんの札に章の全部が付いてくる。
 *
 * `baked` を返すのは画面が出るまでのあいだだけ。焼いた側は `BUILT_AT` 相当の
 * 日で数えてあるので、サーバ側とブラウザ側の最初の1枚が食い違わない
 * （`docs/island-misses.md` #30）。
 *
 * @param slug  章の slug。無いもの・表に無いものを渡したら `baked` のまま
 * @param baked 焼いたときの答え
 */
export function useChapterDays(slug: string | undefined, baked: number): number {
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    const c = CHAPTERS.find((x) => x.slug === slug);
    if (!c) return;
    const tick = () => setN(chapterDays(c, new Date()));
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [slug]);
  return n ?? baked;
}

/**
 * 島の札の添え字のうち、**日数を名乗っているもの**。
 *
 * 「17日目」「17日いた」は、`components/isle/cover.ts` と
 * `components/isle/spec.ts` がサーバ側で**字にしてから**渡していたので、
 * 焼いた HTML に入ったきり動かなかった（2026-10-14 の本番が、
 * 表紙で「この島のこと 17日目」、`/island/balkans` で「17日いた」）。
 * 同じ島の中で、紙の側（`IsleReview` の `ChapDays`）だけが数え直していた。
 *
 * **札は字を持ち、数は持たない。** 渡すのは「どの章の、どういう言い方か」
 * だけにして、数はここで作る。
 *
 * @param since 数え直す材料（章の slug と、数のうしろに付く字）
 * @param baked 焼いた字。画面が出るまでと、章が引けなかったときに出す
 */
export function useSinceWord(
  since: { chapter: string; tail: string } | undefined,
  baked: string,
): string {
  const n = useChapterDays(since?.chapter, NaN);
  if (!since || !Number.isFinite(n)) return baked;
  return `${n.toLocaleString()}${since.tail}`;
}
