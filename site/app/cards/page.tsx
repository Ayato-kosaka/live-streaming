import type { Metadata } from "next";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import CardWall from "@/components/cards/CardWall";
import { PLAN_BY_DAY } from "@/content/planDays";

export const metadata: Metadata = {
  title: "あやと島カード",
  description:
    "その日の配信で撮った写真。好きなキャラクターを1人だけ入れて、そのまま持って帰れます。入れずに写真だけでも持って帰れます。",
};

/**
 * あやと島カード（#173）。**旅の写真（`/nordic/photos`）を寄せた先。**
 *
 * あやとの言葉:「その日に投げ銭してくれた人がこの『あやと島カード』を
 * ゲットします。焼き込みをしようがしまいがゲットした扱いになります。」
 *
 * ## 2つあった面を、ここ1つにした（2026-09-10）
 *
 * > そもそもこの画面入らなくて cards に統合すべきでは？
 * > /nordic/photos のUXの方がわかりやすいから統合して欲しい
 *
 * 同じ写真の同じ人を、`/cards` と `/nordic/photos` が別々の言い方で
 * 出していた。寄せ先をこちらにした理由は `components/cards/CardWall.tsx`
 * の頭に書いた（写真は旅より長く残る）。`/nordic/photos` は
 * この面へ送る（`app/nordic/photos/page.tsx` と `firebase.json`）。
 *
 * ## URL が日本語ではない理由
 *
 * 面の名前は「あやと島カード」だが、URL は `/cards`。日本語の URL は
 * 貼ったときに `%E3%81%82…` へ化けるので、配信の画面にも、
 * 誰かが誰かに送るときにも出せない。
 *
 * ## パンくずが島の直下にある理由
 *
 * カードは `/about` と `/friends` と `/me` の3か所から見える。
 * どれかの子にすると、パンくずと実際の行き方が食い違う
 * （`docs/island-design.md` 6章）。だから島の直下に置く。
 *
 * ## 面が説明をしない
 *
 * 前はここに「どうやったら、もらえるんだろう」という紙があって、
 * すぐ上のリード文と同じことを言っていた。カードの数え方も、名前が
 * 出る人と出ない人の違いも、下に長い注記で書いてあった。
 * あやとの言葉:「この画面すごくUXが悪い」「説明が最上部と被ってて要らない」。
 * **書くのは、その人がこれから何をするかだけ**（`docs/island-misses.md` 7）。
 *
 * ## 企画を渡してから開く
 *
 * カードにはその日の企画が出る。表（`PLAN_BY_DAY`）はここで引いて、
 * **値だけを渡す。** `content/plans.ts` は 20KB あって、client の部品から
 * 直に読むと、カードの出る面ぜんぶがそれを連れていくことになる。
 */
export default function CardsPage() {
  return (
    <PageShell crumbs={[{ label: "あやと島カード" }]}>
      <PageHead
        icon="tent-small"
        title="あやと島カード"
        lead="その日の写真に、キャラクターを1人だけ入れて持って帰れます。"
      />
      <CardWall plans={PLAN_BY_DAY} />
    </PageShell>
  );
}
