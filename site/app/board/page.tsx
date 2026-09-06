import type { Metadata } from "next";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import { GUIDE } from "@/content/voice";
import Board from "@/components/live/Board";

export const metadata: Metadata = {
  title: "企画をだす",
  description: "こういうことやってほしい、を出せる掲示板。ログイン不要。題ひとつで出して、あとから育てられます。",
};

/* 付箋の棚割りは、ここで組まなくなった。
   宛先は `content/themes.ts` が持っている（#160）。前は「どの企画に貼られたか」と
   「本文の頭の `【国名】`」の2本立てで、面の側が `PLANS` と `NORDIC_COUNTRIES` を
   読んで棚を組んでいた。宛先が正式な欄（`islandNotes.theme`）になったので、
   組み立てが要らなくなり、`content/nordic.ts` の 44KB もここから消えた。 */

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
