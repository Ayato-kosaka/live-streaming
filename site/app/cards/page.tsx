import type { Metadata } from "next";
import Link from "next/link";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import Icon from "@/components/ui/Icon";
import CardWall from "@/components/cards/CardWall";
import { PLAN_BY_DAY } from "@/content/plans";

export const metadata: Metadata = {
  title: "あやと島カード",
  description:
    "その日に投げ銭してくれた人へ、その日の写真が1枚ずつ渡ります。写真の上に、その人のキャラクターが立っています。",
};

/**
 * あやと島カード（#173）。
 *
 * あやとの言葉:「その日に投げ銭してくれた人がこの『あやと島カード』を
 * ゲットします。焼き込みをしようがしまいがゲットした扱いになります。」
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
        lead="その日に投げ銭してくれた人へ、その日の写真が1枚ずつ。写真の上に、その人が立っています。"
      />
      <CardWall plans={PLAN_BY_DAY} />
      <section className="panel paper">
        <h2>どうやったら、もらえるんだろう</h2>
        <p className="muted">
          その日の配信で投げ銭すると、その日の写真が渡ります。焼いても焼かなくても、
          もらった扱いです。もらったカードは、じぶんのことにも勝手に増えていきます。
        </p>
        <Link className="tile" href="/nordic/photos">
          <span className="tile-mark">
            <Icon name="camera" size={24} />
          </span>
          <span className="tile-text">
            <b>旅の写真</b>
            <i>その日の1枚を、キャラクターごと持って帰る</i>
          </span>
          <Icon name="right" size={16} className="tile-go" />
        </Link>
      </section>
    </PageShell>
  );
}
