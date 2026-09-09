"use client";

import { useRef, useState, type ReactNode } from "react";
import Icon from "./IconCore";

/**
 * 溜まると縦に伸びる並びを、まとめて短くする（#225）。
 *
 * あやとの言葉:「マイページの貼った付箋も縦長すぎる。溜まってきたので、
 * こういう、データが溜まった時の設計が甘いので水平展開すること」。
 *
 * ## なぜ1つの部品にしたか
 *
 * 縦に伸びる並びは、掲示板にも・企画にも・じぶんのことにも・カードにもある。
 * 場所ごとに「24枚で切る」「全部出す」「もっと見る」とばらばらに畳んでいたので、
 * **面をまたぐと同じ形の並びが違う振る舞いをしていた。** 押しどころの形も
 * 言葉も揃わない。畳み方はここ1か所で決める。
 *
 * ## 出し切ったら畳める
 *
 * 押しどころは1つだけ置く。残りがあれば「あと◯枚だす」、出し切っていれば
 * 「たたむ」。2つ並べると、どちらが進む向きなのか読ませることになる。
 *
 * 畳むと、いま見ている位置が並びの下にあることがある。そのまま戻すと
 * 知らないところへ飛ばされるので、**並びの頭へ連れて帰る。**
 *
 * ## 上限で切らない
 *
 * 「◯枚まで出しています」で終わらせない。押せば必ず最後まで出る。
 * 溜まったものを読む道を塞ぐのは、伸びきっているのと別の壊れ方をする。
 */
export default function Longer<T>({
  items,
  first,
  step,
  unit,
  as = "ul",
  className,
  children,
}: {
  items: T[];
  /** はじめに出す数 */
  first: number;
  /** 1回押すたびに増える数。省くと `first` と同じだけ増える */
  step?: number;
  /** 残りの数に付ける単位。「枚」「件」「人」 */
  unit: string;
  /** 入れ物。並びなら ul、マスの格子なら div */
  as?: "ul" | "div";
  className?: string;
  children: (item: T, i: number) => ReactNode;
}) {
  const [shown, setShown] = useState(first);
  const box = useRef<HTMLElement | null>(null);
  const rest = items.length - shown;
  const Box = as;
  return (
    <>
      {/* ul と div のどちらにもなるので、ref は書き込みだけの入れ物で受ける */}
      <Box
        className={className}
        ref={(el: HTMLElement | null) => {
          box.current = el;
        }}
      >
        {items.slice(0, shown).map(children)}
      </Box>
      {items.length > first && (
        <button
          type="button"
          className="longer"
          onClick={() => {
            if (rest > 0) {
              setShown(shown + (step ?? first));
              return;
            }
            setShown(first);
            box.current?.scrollIntoView({ block: "start" });
          }}
        >
          {rest > 0 ? `あと${rest}${unit}だす` : "たたむ"}
          <Icon name={rest > 0 ? "chevron" : "up"} size={14} />
        </button>
      )}
    </>
  );
}
