import type { Metadata } from "next";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import { GUIDE } from "@/content/voice";
import Board from "@/components/live/Board";

/* **面の名前は「やってほしいこと」。変えない。**
   「企画をだす」だったころ、面の名前と中の札1枚（企画）が同じ字だったので、
   付箋はその枝に見えていた。板の仕事は注文を受けること。
   URL（`/board`）も変えない。外から貼られたリンクが死ぬ。 */
export const metadata: Metadata = {
  /* **「企画」を名乗らない（2026-10-01）。** 前は「付箋1枚でも、1日つかう企画でも」で、
     その2つを選ばせる札がこの面にあった。札を畳んで付箋ひとつにしたので、
     ここに企画の字が残っていると、検索から来た人が無い欄を探すことになる。 */
  title: "やってほしいこと",
  description: "「これ見てきて」「これやって」を書く板。ひとことでいい。ログイン不要。",
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
        /* **ここが約束。** 「むちゃでいい」と「ほんとうにやる」の2つだけを言う。
           何を書く場所かは、書く欄の「どこへ」の札が言っている
           （`Notes.tsx`。札の添え書きだった「行き先や、いまの旅へ」の役目は
           そちらへ移した）。 */
        lead="むちゃなものほど、だいたい通る。書いたことが、ほんとうに配信になる。"
        say={GUIDE.board}
      />
      <Board />
    </PageShell>
  );
}
