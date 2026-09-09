"use client";

import Link from "next/link";
import CardOne from "@/components/cards/CardOne";
import { useCards, type PlanDays } from "@/components/cards/cards";
import Icon from "@/components/ui/IconCore";
import Longer from "@/components/ui/Longer";

/**
 * じぶんのあやと島カード（#173）。
 *
 * あやとの言葉:「マイページにも勝手に追加されていくっていう感じのイメージ。
 * このカードがコレクションみたいな感じでどんどん集まっていく」。
 *
 * **「勝手に増えていく」を、増やす処理なしで作る。** カードは配られておらず、
 * その日の写真とその日の名簿から引くたびに組み立てられている
 * （`functions/src/cards.ts` 冒頭）。ここは全部のカードから
 * **自分のチャンネルのぶんだけ**を残すだけ。だから、あとから名簿が
 * 入った日のカードも、次に開いたときには並んでいる。
 *
 * ## チャンネルが分からない人
 *
 * カードの持ち主は YouTube のチャンネルで見分けている。
 * `islandUsers/{uid}.channelId` が空の人は突き合わせるものが無い。
 * **そのときは「無い」と言わない**（本人のせいではないし、実際には
 * もらっているかもしれない）。全部の並びへの行き先だけを出す。
 *
 * Doneru でだけ投げ銭している人のカードも、ここには出ない。あちらは
 * チャンネルを持たないので、**カードはあっても持ち主が分からない**
 * （`python/admin/nordic_supporter.py` から手で入る人）。
 */
export default function MyCards({
  channelId,
  plans,
}: {
  /** サーバーが覚えている、自分の YouTube チャンネル */
  channelId?: string;
  plans: PlanDays;
}) {
  const { cards, off } = useCards();
  const mine = channelId ?
    (cards ?? []).filter((c) => c.channelId === channelId) :
    [];

  return (
    <>
      {cards === null && channelId && (
        <div className="wait is-card" aria-hidden>
          <span />
          <span />
        </div>
      )}

      {mine.length > 0 && (
        <>
          {/* カードは**勝手に増えつづける**（`useCards` の頭）。溜まるほど
              じぶんのことの下が遠くなるので、はじめは4枚だけ出す（#225）。
              「いま◯枚」は畳んでいても数が分かるように、下に置いたまま。 */}
          <Longer items={mine} first={4} step={8} unit="枚" as="div" className="akd-grid">
            {(c) => (
              <CardOne key={c.id} card={c} plans={plans[c.day]} showName={false} />
            )}
          </Longer>
          <p className="muted akd-note">
            いま{mine.length}枚。その日の配信で投げ銭すると、翌朝には1枚増えています。
          </p>
        </>
      )}

      {(cards !== null || !channelId) && mine.length === 0 && (
        <div className={`blank${off ? " is-off" : ""}`}>
          <b>
            {off ?
              "いまつながりません" :
              channelId ?
                "まだ1枚もありません" :
                "ここに、もらったカードが並びます"}
          </b>
          <p>
            {off ?
              "あとでもう一度ひらいてみてください。" :
              channelId ?
                "その日の配信で投げ銭すると、その日の写真が1枚渡ります。焼いても焼かなくても、もらった扱いです。" :
                "カードは YouTube のチャンネルで見分けています。まだ結び付いていないので、ここには出せません。配られたぶんは、下の面から見られます。"}
          </p>
          <Link className="blank-go" href="/cards">
            あやと島カードを見る
            <Icon name="right" size={14} />
          </Link>
        </div>
      )}
    </>
  );
}
