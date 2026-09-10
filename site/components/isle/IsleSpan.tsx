"use client";

import { useEffect, useState } from "react";
import { type Chapter } from "@/content/chapters";
import { isleLead, isleSpanNote } from "./span";

/**
 * 島の期間。**画面が出てから引き直す。**
 *
 * 静的書き出し（`output: "export"`）なので、ビルドした日の答えが HTML に入る。
 * 「〜いま」は次の島へ出発した日に閉じるが、その日にビルドは走らない。
 * 焼いたままだと、**旅に出たあとも過去の島が「いま」と言い続ける。**
 * `components/isle/ChapDays.tsx`（日数）と同じ形。
 */
export default function IsleSpan({
  chapter,
  kind,
  baked,
}: {
  chapter: Chapter;
  /** lead は島の1行目、note は紙の見出しの添え字 */
  kind: "lead" | "note";
  /** ビルドしたときの字。画面が出るまではこれを出す */
  baked: string;
}) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    setText(kind === "lead" ? isleLead(chapter, new Date()) : isleSpanNote(chapter, new Date()));
  }, [chapter, kind]);
  return <>{text ?? baked}</>;
}
