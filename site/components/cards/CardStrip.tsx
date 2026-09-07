"use client";

import Link from "next/link";
import Icon from "@/components/ui/IconCore";
import CardOne from "./CardOne";
import { useCards, type PlanDays } from "./cards";

/**
 * 最近のあやと島カードを数枚（#173）。**`/about` の「住んでる人」の下。**
 *
 * あやとの言葉:「導線は /about の住んでる人の下で一覧見れると良いかも」。
 * ここは島の紹介の面なので、**カード置き場にしない。** 出すのは最近の数枚と、
 * `/cards` への行き先1つだけ。
 *
 * まだ1枚も無いあいだ（旅の前・名簿が入る前）は、絵の代わりに1行だけ置く。
 * 行き先の札は消さない。**「まだ何も無い」で終わらせない**という決まりの、
 * いちばん軽い形（`docs/island-design.md` 4章）。
 */
export default function CardStrip({
  plans,
  max = 2,
}: {
  plans: PlanDays;
  /** ここに出す枚数。**この面の主役ではない。**
     3枚にすると 390px で2段になり、あやとの紹介の途中に
     カード置き場が挟まる。1段で終わる枚数にする */
  max?: number;
}) {
  const { cards } = useCards();

  return (
    <div className="akd-strip">
      <p className="akd-strip-h">
        <b>あやと島カード</b>
        その日に投げ銭してくれた人に、その日の写真が1枚ずつ渡ります。
      </p>

      {cards === null && (
        <div className="wait is-card" aria-hidden>
          <span />
          <span />
        </div>
      )}

      {/* 読めなかったときも、まだ1枚も無いときも、同じこの1行でよい。
          この面に来た人には、どちらの話も関係が無い */}
      {cards !== null && cards.length === 0 && (
        <p className="muted akd-note">
          まだ1枚もありません。旅のその日の写真が貼られると、そこにいた人から順に渡っていきます。
        </p>
      )}

      {cards !== null && cards.length > 0 && (
        <div className="akd-grid">
          {cards.slice(0, max).map((c) => (
            <CardOne key={c.id} card={c} plans={plans[c.day]} />
          ))}
        </div>
      )}

      <Link className="tile" href="/cards">
        <span className="tile-mark">
          <Icon name="island" size={24} />
        </span>
        <span className="tile-text">
          <b>あやと島カード</b>
          <i>配られたカード、ぜんぶ</i>
        </span>
        <Icon name="right" size={16} className="tile-go" />
      </Link>
    </div>
  );
}
