"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Icon from "@/components/ui/IconCore";
import CardOne from "./CardOne";
import { cardIcon, cardWhen, type PhotoGroup, type PlanBrief } from "./cards";

/**
 * 1枚の写真から出たカードを、開いて見るところ。
 *
 * あやとの言葉:「カード画像を列挙してタップしたらキャラクター埋め込み版が
 * 見れるようにしないと、カード一覧画面が散らかる気がする」。一覧が持つのは
 * 写真1枚につき1マス（`CardWall`）で、**キャラクターが入った版はここにしかない。**
 *
 * ## 何人ぶんあっても、写真は1枚しか出さない
 *
 * 同じ写真から出たカードは、写真も日付も企画も同じで、**違うのは立っている
 * 人だけ。** 人数ぶん並べると、同じ絵が縦に積み上がる（本番の1枚の写真に
 * いま4人、旅に出れば1枚に十数人つく）。だから大きく1枚だけ出して、
 * 下の顔を押して人を入れ替える。図鑑の「一覧と1枚を分ける」形と同じ
 * （`docs/ac-reference.md` 7章、`components/live/FriendsWall.tsx`）。
 *
 * ## 日付と企画は、ここの見出しが1回だけ言う
 *
 * カード1枚ずつには持たせない（`CardOne` の `showWhen`）。持たせると、
 * 人を入れ替えるたびに同じ字が出入りするだけになる。
 *
 * 開け閉ての作りは `components/nordic/PhotoStudio.tsx` と同じにしてある。
 * 旅の写真を開くのもカードを開くのも同じ人がやるので、覚えることを2つにしない。
 */
export default function CardSheet({
  group,
  plans,
  onClose,
}: {
  /** 開いた写真1枚ぶん。新しい順のまま渡ってくるので並べ直さない */
  group: PhotoGroup;
  /** その日の企画。**1日に何本でも立つ** */
  plans?: PlanBrief[];
  onClose: () => void;
}) {
  const [at, setAt] = useState(0);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const many = group.cards.length;
  const one = group.cards[Math.min(at, many - 1)];
  if (!one) return null;

  return (
    <div className="akd-modal" role="dialog" aria-modal="true" aria-label="あやと島カード">
      {/* 外を押しても閉じる。絵の裏なので、押せる合図は持たせない */}
      <button className="akd-back" aria-label="閉じる" onClick={onClose} />
      <div className="akd-sheet">
        <button ref={closeRef} className="akd-close" onClick={onClose} aria-label="閉じる">
          <Icon name="close" size={18} />
        </button>

        <p className="akd-sheet-h">
          <b>{cardWhen(group.day)}</b>
          <span>{many}人ぶん</span>
        </p>
        {/* 企画への行き先。**押せるのは字なので、厚みではなく下線で示す** */}
        {plans?.map((p) => (
          <Link key={p.href} className="akd-sheet-plan" href={p.href} prefetch={false}>
            {p.title}
          </Link>
        ))}

        {/* 縦の写真は、幅を止めないと高さが画面を越える（`app/css/cards.css`）。
            止めるのは幅なので、向きをここで渡す */}
        <div className={`akd-open${one.h > one.w ? " is-tall" : ""}`}>
          <CardOne card={one} showWhen={false} />
        </div>

        {/* 誰が立っているかを入れ替える。**全部のマスが押せるので厚みは付けない**
            （`docs/island-design.md` 3章の3の例外）。1人しかいない写真では、
            押しても何も起きない列になるので出さない。 */}
        {many > 1 && (
          <>
            <p className="akd-pick-h">ほかの人のぶんも見る</p>
            <div className="akd-pick" role="tablist" aria-label="この写真のカード">
              {group.cards.map((c, i) => (
                <button
                  key={c.id}
                  type="button"
                  role="tab"
                  aria-selected={i === at}
                  aria-label={c.name || `${i + 1}人目`}
                  className={`akdp${i === at ? " is-on" : ""}`}
                  onClick={() => setAt(i)}
                >
                  <img src={cardIcon(c.icon, 128)} alt="" loading="lazy" />
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
