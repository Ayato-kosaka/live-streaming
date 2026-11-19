"use client";

import { CHAPTERS, chapterDays, chapterSpan, type Chapter } from "@/content/chapters";
import { BUILT_AT } from "@/lib/builtAt";
import { NOT_YET, useToday } from "@/lib/useToday";

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
  const n = useChapterDays(chapter.slug, baked);
  return <>{n === null ? NOT_YET : n.toLocaleString()}</>;
}

/**
 * 章の日数が**もう動かない**か。焼いた日の時点で、その章が終わっていたか。
 *
 * 終わった章の日数は、どの日に読んでも同じなので焼いてよい（JS を読まない
 * 読み手にも「この島にいた 17日」が残る）。**いま歩いている章の日数は焼かない**——
 * 焼いた日の数は焼いた日のうちしか本当でなく、焼いてから日付をまたげば
 * JS が動く前の札が1日ずれる（`docs/island-misses.md` #339）。
 * まだ始まっていない章も焼かない（始まった日から数えはじめるので）。
 */
export function closedWhenBaked(c: Chapter): boolean {
  return chapterSpan(c, BUILT_AT).to !== null;
}

/**
 * 章の slug から、いま何日目かを数える。
 *
 * 章そのものではなく slug を取るのは、**島に建てるものの表（`IsleSpec`）が
 * サーバからブラウザへ丸ごと渡る**から（`app/page.tsx` → `Cover` →
 * `IsleStage`）。章の中身をそこへ入れると、島1つぶんの札に章の全部が付いてくる。
 *
 * **画面が出るまでは、終わった章なら `baked`、それ以外は `null`。**
 * `null` を受けた側は数を出さずに場所だけ取る（`lib/useToday.ts` の `NOT_YET`）。
 * 前は歩いている章でも `baked`（焼いた日の数）を返していて、表紙の札が
 * JS の動く前に前の日の数を出していた（#339）。サーバ側と最初の1枚は
 * どちらも同じ答えになる（`BUILT_AT` しか見ない）ので、水あわせは落ちない（#30）。
 *
 * 数え直しは `useToday` の刻み（1分に1度）。島は配信のあいだ何時間も
 * 開きっぱなしになる面で、日付をまたいだ瞬間から次に開き直すまで1日ずれるので。
 *
 * @param slug  章の slug。無いもの・表に無いものを渡したら `baked` のまま
 * @param baked 焼いたときの答え。**終わった章のときだけ**、画面が出るまでに出す
 */
export function useChapterDays(slug: string | undefined, baked: number): number | null {
  const today = useToday();
  const c = CHAPTERS.find((x) => x.slug === slug);
  if (!c) return baked;
  if (today) return chapterDays(c, today);
  return closedWhenBaked(c) ? baked : null;
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
 * @param baked 焼いた字。**終わった章**の画面が出るまでと、章が引けなかったときに出す
 */
export function useSinceWord(
  since: { chapter: string; tail: string } | undefined,
  baked: string,
): string {
  const n = useChapterDays(since?.chapter, NaN);
  if (!since) return baked;
  // 歩いている章で、まだ今日が分からない。数を名乗らず場所だけ取る（#339）
  if (n === null) return NOT_YET;
  if (!Number.isFinite(n)) return baked;
  return `${n.toLocaleString()}${since.tail}`;
}
