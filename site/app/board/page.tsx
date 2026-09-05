import type { Metadata } from "next";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import { GUIDE } from "@/content/voice";
import Board from "@/components/live/Board";

export const metadata: Metadata = {
  title: "企画をだす",
  description: "こういうことやってほしい、を出せる掲示板。ログイン不要。票が集まった企画は企画会議に上がります。",
};

export default function BoardPage() {
  return (
    <PageShell current="board" crumbs={[{ label: "企画をだす" }]}>
      <PageHead
        icon="signboard"
        title="企画をだす"
        lead="「こういうことやってほしい」を貼る板。むちゃな企画ほど、だいたい通る。"
        say={GUIDE.board}
      />
      <Board />
    </PageShell>
  );
}
