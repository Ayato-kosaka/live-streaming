"use client";

import { NOT_YET, useToday } from "@/lib/useToday";

/**
 * ある日から今日までの日数。**画面が出てから数える。焼いた HTML には数を出さない。**
 *
 * 静的書き出し（`output: "export"`）なので、ここで数えた値は焼いた日の答えになる。
 *
 * 2026-09-18 までは、出るまでのあいだの数に**日付を直に書いた `new Date`** を
 * 使っていて、焼いた HTML が「日本を出て、きょうで 724 日目」（本当は 737）と
 * 出していた。そこを `BUILT_AT`（焼いた日）に替えたが（#143）、
 * **焼いた日の数も、本当なのは焼いた日のうちだけ。** 焼いてから日付をまたげば
 * JS が動く前の字は1日ずれる（#337。重い見張りが、焼いてから数えるまでに
 * 日付をまたいだ晩にだけ赤くなっていた）。だから数は出さず、場所だけ取る
 * （`lib/useToday.ts`）。
 *
 * @param from  数えはじめの日（YYYY-MM-DD）
 * @param plus  足す日数（その日を1日目と数えるなら 1）
 * @param head  数の前に付ける字。**数が出るときだけ出す**——文の途中に置くと、
 *              数の無いあいだ「きょうで 日目」と、いつ読んでも嘘な字が残るので
 * @param tail  数のうしろに付ける字。`head` と同じく、数と一緒にだけ出す
 * @param wait  数えるまでのあいだに出すもの。既定は1行ぶんの空白（札の背を保つ）。
 *              文の中に置くときは `""`
 */
export default function Days({
  from,
  plus = 0,
  head = "",
  tail = "",
  wait = NOT_YET,
}: {
  from: string;
  plus?: number;
  head?: string;
  tail?: string;
  wait?: string;
}) {
  const now = useToday();
  if (!now) return <>{wait}</>;
  /* 先の日付から始まるものを渡されてもマイナスの日数は出さない */
  const n = Math.max(0, Math.floor((now.getTime() - new Date(from).getTime()) / 86400000) + plus);
  return <>{`${head}${n.toLocaleString()}${tail}`}</>;
}
