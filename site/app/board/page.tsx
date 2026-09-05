import type { Metadata } from "next";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import { GUIDE } from "@/content/voice";
import Board from "@/components/live/Board";

export const metadata: Metadata = {
  title: "企画掲示板",
  description: "こういうことやってほしい、を出せる掲示板。ログイン不要。票が集まった企画は企画会議に上がります。",
};

export default function BoardPage() {
  return (
    <PageShell current="board" crumbs={[{ label: "企画掲示板" }]}>
      <PageHead
        icon="signboard"
        title="企画掲示板"
        lead="「こういうことやってほしい」を貼る板。ログインも名前も要りません。票が集まったものから、週のはじめの会議に上がります。"
        say={GUIDE.board}
      />
      <Board />
    </PageShell>
  );
}
