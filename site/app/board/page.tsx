import type { Metadata } from "next";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import { GUIDE } from "@/content/voice";
import Board from "@/components/live/Board";

/* **面の名前は「やってほしいこと」。**
   「企画をだす」だったころ、面の名前と中の札1枚（企画）が同じ字だったので、
   付箋はその枝に見えていた。板の仕事は注文を受けることで、企画はそこから育つもの。
   実測（2026-09-30）では、視聴者さんが企画の欄に出した3件が3件とも付箋だった。
   URL（`/board`）は変えない。外から貼られたリンクが死ぬ。 */
export const metadata: Metadata = {
  title: "やってほしいこと",
  description: "「これ見てきて」「これやって」を書く板。ログイン不要。付箋1枚でも、1日つかう企画でも。",
};

/* 付箋の棚割りは、ここで組まなくなった。
   宛先は `content/themes.ts` が持っている（#160）。前は「どの企画に貼られたか」と
   「本文の頭の `【国名】`」の2本立てで、面の側が `PLANS` と `NORDIC_COUNTRIES` を
   読んで棚を組んでいた。宛先が正式な欄（`islandNotes.theme`）になったので、
   組み立てが要らなくなり、`content/nordic.ts` の 44KB もここから消えた。 */

export default function BoardPage() {
  return (
    <PageShell current="board" crumbs={[{ label: "やってほしいこと" }]}>
      <PageHead
        icon="signboard"
        title="やってほしいこと"
        lead="むちゃなものほど、だいたい通る。書いたことが、ほんとうに配信になる。"
        say={GUIDE.board}
      />
      <Board />
    </PageShell>
  );
}
