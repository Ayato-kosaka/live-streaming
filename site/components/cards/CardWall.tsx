"use client";

import Link from "next/link";
import { useState } from "react";
import Icon from "@/components/ui/IconCore";
import Longer from "@/components/ui/Longer";
import PhotoPost from "@/components/nordic/PhotoPost";
import { useOwner } from "@/components/nordic/log";
import CardSheet from "./CardSheet";
import { cardWhen, useCardWall, type PhotoGroup, type PlanDays } from "./cards";

/**
 * あやと島カード。**1日ぶんが1枚の紙で、並ぶのは写真。**
 *
 * ## 旅の写真（`/nordic/photos`）を、ここへ寄せた（2026-09-10）
 *
 * 同じ写真の同じ人を、2つの面が別々の言い方で出していた。
 * あやとの言葉:
 *
 * > そもそもこの画面入らなくて cards に統合すべきでは？
 * > /nordic/photos のUXの方がわかりやすいから統合して欲しい
 *
 * 寄せ先を `/cards` にしたのは、**写真が旅より長く残る**から。
 * `/nordic/photos` は「これから › 北欧ヒッチハイク › 旅の写真」の下にいて、
 * 旅が終わると入口ごと過去の話になる。カードは島の常設で、
 * `/about`・`/friends`・`/me` の3か所から来る。
 *
 * 見た目と手ざわりは**写真の側**に寄せた。日ごとの紙・素の写真のマス・
 * 押すと大きく出て入れる人を選ぶ、まで元の `PhotoWall` と同じ。
 *
 * ## 写真の口とカードの口の、両方を読む
 *
 * カードは「写真 × その日に投げてくれた人」なので、カードだけを見ていると
 * **まだ誰も投げていない写真が1枚も出ない。** あやとが貼った直後がそれで、
 * 貼った本人が「入らなかった」と思う。写真の一覧を土台にして、
 * 立てる人をカードから重ねる（`cards.ts` の `useCardWall`）。
 *
 * ## マスに、代表の1人を埋めない
 *
 * あやとの言葉:「代表でキャラクターを埋めるのはやめて欲しい」。
 * 一覧のマスは**素の写真**で、キャラクターを入れるのは開いた先だけ。
 * 開いた先も、はじめは誰も入っていない（`CardSheet`）。
 *
 * ## マスに厚みを付けない
 *
 * 並びのマスが**全部押せる**ので、1枚ずつには付けない（`docs/island-design.md`
 * 3章の3の例外）。押せないマスをこの並びに混ぜないこと。
 */
export default function CardWall({ plans }: { plans: PlanDays }) {
  const { days, off, add } = useCardWall();
  const [open, setOpen] = useState<PhotoGroup | null>(null);
  /* 貼る道具は、あやとにだけ出す。判定は1か所に置いてある
     （`components/nordic/log.ts` の `useOwner`）。 */
  const owner = useOwner();

  return (
    <>
      {/* 貼る道具は紙の上に載せない。**板（`.dform`）そのものが作業台**で、
          紙に入れると枠が二重になる（`docs/island-design.md` 3章）。 */}
      {owner && <PhotoPost onAdded={add} />}

      {days === null && (
        <section className="panel paper">
          <div className="wait is-card" aria-hidden>
            <span />
            <span />
          </div>
        </section>
      )}

      {days !== null && days.length === 0 && (
        <div className={`blank${off ? " is-off" : ""}`}>
          <b>{off ? "いまつながりません" : "まだ1枚もありません"}</b>
          <p>
            {off
              ? "あとでもう一度ひらいてみてください。"
              : "旅に出た日の夜から、その日に撮った写真がここに並びます。"}
          </p>
          <Link className="blank-go" href="/nordic">
            旅のよていを見る
            <Icon name="right" size={15} />
          </Link>
        </div>
      )}

      {/* 1日ぶんが1枚の紙。**旅の日数ぶんだけ増える**ので、はじめは3日ぶん
          （#225）。写真は1日に何枚でも貼るので、10日目には送っても送っても
          下に着かない面になる。 */}
      <Longer items={days ?? []} first={3} step={6} unit="日ぶん" as="div">
        {(d) => (
          <section className="panel paper akd-day" key={d.day}>
            <h2>{cardWhen(d.day)}</h2>
            {/* その日の企画（あやとの「フードワインフェスの企画に紐つけて欲しい」）。
                **1日に企画は何本でも立つ。** 9月11日はそれが4本ある。
                1本に絞ると、残りは黙って消える。 */}
            {plans[d.day] && plans[d.day].length > 0 && (
              <div className="akd-day-plans">
                {plans[d.day].map((p) => (
                  <Link key={p.href} className="akd-day-plan" href={p.href} prefetch={false}>
                    {p.title}
                  </Link>
                ))}
              </div>
            )}
            <div className="akd-shelf">
              {d.photos.map((g) => (
                <button
                  key={g.photoId}
                  type="button"
                  className="akd-tile"
                  onClick={() => setOpen(g)}
                  aria-label={g.note || "その日の写真をひらく"}
                >
                  {/* **crossOrigin を付ける。** 開いた先の canvas が同じ URL を
                      読む。片方を素で先に読むと、CORS のヘッダを持たない絵が
                      キャッシュに残る端末があり、あとから焼こうとすると
                      汚れて落ちる。 */}
                  {/* **`width`/`height` の欄を書かない。** 書くと `height` が
                      そのまま効いて（HTML の欄は CSS の height になる）、
                      `aspect-ratio: 1` が無視される。1600 の写真がマスの中で
                      1,639px の背になっていた。形はマスの側が決める */}
                  <img src={g.url} alt="" loading="lazy" crossOrigin="anonymous" />
                </button>
              ))}
            </div>
          </section>
        )}
      </Longer>

      {open && (
        <CardSheet group={open} plans={plans[open.day]} onClose={() => setOpen(null)} />
      )}
    </>
  );
}
