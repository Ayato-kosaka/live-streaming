"use client";

import { useCallback, useState } from "react";
import Longer from "@/components/ui/Longer";
import CardOne from "./CardOne";
import CardSheet from "./CardSheet";
import { soloGroup, type PlanDays, type ShownCard } from "./cards";

/**
 * その人のカードを並べて、押したら**持って帰れる紙**を開く。
 *
 * あやと（2026-10-08）:
 *
 * > 当たり前すぎてキレそうですけど、このページからあやとじまカード
 * > ダウンロードできないとダメ。キャラクターの移動や、あやとと一緒にも
 * > 含めて。**同じコンポーネントでね。**
 *
 * 図鑑（`/friends`）とじぶんのこと（`/me`）は `CardOne` を並べるだけで、
 * 落とす道が1本も無かった。**自分のカードが並んでいる面なのに、
 * 持って帰れない。**
 *
 * ## 新しい紙を書かない
 *
 * 開くのは `/cards` と同じ `CardSheet`。引きずって立ち位置を変えるのも、
 * あやとを入れるのも、保存の3段構えも、ぜんぶあちらが持っている。
 * **ここが持っているのは「どのカードを開いているか」だけ。**
 *
 * ## 1人ぶんの紙は、その人が入った状態で開く
 *
 * `startIcon` を渡す。あちら（`/cards`）は何人も写っている写真なので
 * 素の写真で開くが、ここは**その人の1枚を押して開く**ので、素の写真が
 * 出ると押した絵と別ものになる。
 *
 * 立てる候補もその1人だけ（`soloGroup`）。ほかの人を混ぜると、
 * 投げ銭していない人のキャラクターを合成して持ち帰れることになる
 * （`docs/island-cards.md` 1章。**約束であって、作り方ではない**）。
 *
 * ## 畳みは、並べる側の都合で決まる
 *
 * 図鑑は欄の1つなので2枚から、じぶんのことはカードの札なので4枚から。
 * **人が変わったら畳み直す**のは、呼ぶ側が `key` を付けてやる
 * （開いている紙も一緒に閉じる）。
 */
export default function CardPeek({
  cards,
  planDays,
  first,
  step,
}: {
  /** 並べるカード。**新しい順で渡ってくるので並べ直さない** */
  cards: ShownCard[];
  /** 日付 → その日の企画。`content/plans.ts` の表 */
  planDays: PlanDays;
  /** はじめに出す枚数 */
  first: number;
  /** 「もっとだす」で増える枚数 */
  step: number;
}) {
  const [open, setOpen] = useState<ShownCard | null>(null);
  const close = useCallback(() => setOpen(null), []);
  return (
    <>
      <Longer items={cards} first={first} step={step} unit="枚" as="div" className="akd-grid">
        {(c) => (
          <CardOne
            key={c.id}
            card={c}
            plans={planDays[c.day]}
            showName={false}
            onOpen={() => setOpen(c)}
          />
        )}
      </Longer>
      {open && (
        <CardSheet
          group={soloGroup(open)}
          plans={planDays[open.day]}
          startIcon={open.icon}
          onClose={close}
        />
      )}
    </>
  );
}
