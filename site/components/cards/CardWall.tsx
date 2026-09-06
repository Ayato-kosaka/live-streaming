"use client";

import Link from "next/link";
import Icon from "@/components/ui/IconCore";
import CardOne from "./CardOne";
import { useCards, type PlanDays } from "./cards";

/**
 * 配られたカード、ぜんぶ（#173）。**新しい順。**
 *
 * サーバーがもう新しい順で返してくるので、ここで並べ直さない
 * （`functions/src/cards.ts` の `sortCards`）。日ごとに見出しを立てて
 * まとめることもしない。カード1枚がその日と企画を持っているので、
 * 見出しを足すと同じ字が2回出る。
 *
 * 名簿は BigQuery から**翌朝**に入る。だから「写真は貼ってあるのに
 * カードが0枚」の時間が、旅のあいだ毎日ある。**そこを空っぽの顔で
 * 出さない**（`docs/island-design.md` 4章）。何が起きているのかと、
 * 次にすることを1つ書く。
 */
export default function CardWall({ plans }: { plans: PlanDays }) {
  const { cards, off } = useCards();

  return (
    <section className="panel paper">
      <h2>配られたカード</h2>

      {cards === null && (
        <div className="wait is-card" aria-hidden>
          <span />
          <span />
        </div>
      )}

      {cards !== null && cards.length === 0 && (
        <div className={`blank${off ? " is-off" : ""}`}>
          <b>{off ? "いまつながりません" : "まだ1枚もありません"}</b>
          <p>
            {off
              ? "あとでもう一度ひらいてみてください。"
              : "その日の写真が貼られて、その日いた人がそろうと、ここに並びます。名簿は翌朝に入るので、貼られた夜はまだ0枚です。"}
          </p>
          <Link className="blank-go" href="/nordic/photos">
            旅の写真を見る
            <Icon name="right" size={15} />
          </Link>
        </div>
      )}

      {cards !== null && cards.length > 0 && (
        <>
          <div className="akd-grid">
            {cards.map((c) => (
              <CardOne key={c.id} card={c} plan={plans[c.day]} />
            ))}
          </div>
          <p className="muted akd-note">
            いま{cards.length}枚。名前が出ているのは、島に名前を出してよいと
            言ってくれた人です。出していない人も、絵はそのまま立っています。
          </p>
        </>
      )}
    </section>
  );
}
