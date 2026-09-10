"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import Icon from "@/components/ui/IconCore";
import Longer from "@/components/ui/Longer";
import CardSheet from "./CardSheet";
import { byDay, byPhoto, cardWhen, useCards, type PhotoGroup, type PlanDays } from "./cards";

/**
 * 配られたカード、ぜんぶ（#173）。**並ぶのは写真。カードではない。**
 *
 * ## なぜ写真の列挙にしたか
 *
 * カードは「写真 × その日に投げてくれた人」で増える（#202）。写真が3枚あって
 * 10人いれば30枚で、**同じ写真が10枚ずつ、日付も企画も同じ字を連れて並ぶ。**
 * あやとの言葉:「埋め込みキャラクターごと全部表示するのではなく、カード画像を
 * 列挙してタップしたらキャラクター埋め込み版が見れるようにしないと、
 * カード一覧画面が散らかる気がする」。
 *
 * だから一覧は**写真1枚につき1マス**にして、キャラクターの入った版は押した先
 * （`CardSheet`）に置く。一覧と1枚を分けるのは図鑑と同じ形
 * （`docs/ac-reference.md` 7章。`components/live/FriendsWall.tsx` が先例）。
 *
 * ## 日付と企画は棚の見出しに上げた
 *
 * 前は1枚ずつが日付と企画を持っていて、「日ごとの見出しを立てると同じ字が
 * 2回出る」からまとめていなかった。**まとめる単位が写真になったので、逆になる。**
 * 見出しで1回言えば、マスは絵と人数だけで済む。
 *
 * ## マスに厚みを付けない
 *
 * 並びのマスが**全部押せる**ので、1枚ずつには付けない（`docs/island-design.md`
 * 3章の3の例外）。押せないマスをこの並びに混ぜないこと。混ぜた瞬間に
 * 「どれが押せるか」が分からなくなる。
 *
 * 台帳は投げてくれたその日に入るが、絵に結びつかない人のカードは出ない
 * （`cards.ts` の `withIcons`）。**そこを空っぽの顔で出さない**
 * （`docs/island-design.md` 4章）。何が起きているのかと、次にすることを1つ書く。
 */
export default function CardWall({ plans }: { plans: PlanDays }) {
  const { cards, off } = useCards();
  const days = useMemo(() => byDay(byPhoto(cards ?? [])), [cards]);
  const [open, setOpen] = useState<PhotoGroup | null>(null);
  const shots = days.reduce((n, d) => n + d.photos.length, 0);

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
              : "その日の写真が貼られると、その日に投げてくれた人のぶんだけ、ここに並びます。"}
          </p>
          <Link className="blank-go" href="/nordic/photos">
            旅の写真を見る
            <Icon name="right" size={15} />
          </Link>
        </div>
      )}

      {/* **日ごとの棚は、1日ずつ増えつづける。** 旅に出れば毎日1つ足されるので、
          そのまま並べると溜まるほど下が遠くなる（#225 と同じ形）。
          はじめは3日ぶんだけ出して、押せば最後まで出る
          （`components/ui/Longer.tsx`）。 */}
      <Longer items={days} first={3} step={6} unit="日ぶん" as="div" className="akd-days">
        {(d) => (
        <div className="akd-day" key={d.day}>
          <h3>{cardWhen(d.day)}</h3>
          {/* その日の企画（あやとの「フードワインフェスの企画に紐つけて欲しい」）。
              **1日に企画は何本でも立つ。** 9月11日はそれが4本ある。
              1本に絞ると、残りは黙って消える。 */}
          {plans[d.day]?.map((p) => (
            <Link key={p.href} className="akd-day-plan" href={p.href} prefetch={false}>
              {p.title}
            </Link>
          ))}
          <div className="akd-shelf">
            {d.photos.map((g) => (
              <button
                key={g.photoId}
                type="button"
                className="akd-tile"
                onClick={() => setOpen(g)}
                aria-label={`${g.note || "旅のその日の写真"}。${g.cards.length}人ぶんのカードを見る`}
              >
                {/* **crossOrigin を付ける。** 開いた先のカードと同じ URL を読む。
                    片方を素で先に読むと、CORS のヘッダを持たない絵がキャッシュに
                    残る端末があり、あとから焼こうとすると汚れて落ちる
                    （`components/nordic/PhotoWall.tsx` に同じ用心がある）。 */}
                {/* **`width`/`height` の欄を書かない。** 書くと `height` が
                    そのまま効いて（HTML の欄は CSS の height になる）、
                    `aspect-ratio: 1` が無視される。1600 の写真がマスの中で
                    1,639px の背になっていた。形はマスの側が決める */}
                <img src={g.url} alt="" loading="lazy" crossOrigin="anonymous" />
                <span className="akd-tile-n">{g.cards.length}人ぶん</span>
              </button>
            ))}
          </div>
        </div>
        )}
      </Longer>

      {cards !== null && cards.length > 0 && (
        <p className="muted akd-note">
          写真{shots}枚に、いま{cards.length}枚。
        </p>
      )}

      {open && (
        <CardSheet group={open} plans={plans[open.day]} onClose={() => setOpen(null)} />
      )}
    </section>
  );
}
