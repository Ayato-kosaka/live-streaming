"use client";

import { useEffect } from "react";
import { loadNordicLog } from "./log";

/**
 * その日に起きたことが書かれた行に、印を付ける。
 *
 * **書いたものが旅程表から見えないと、誰も読まない。** 9日ぶんの行を
 * 1つずつ開いて確かめる人はいない。旅の途中に来た人が「もう何日ぶんか
 * 書いてある」と気づけるのは、この印だけ。
 *
 * 印を付けるだけで、字も数字も持たない。旅程表そのもの（区間の表と
 * 見どころ161件）を面の JS に連れてこないため、`TripNow` が
 * 「いま、ここ」を付けるのと同じやり方にしてある
 * （`docs/island-design.md` 3章「動きは React の外で」）。
 *
 * 読めなかった日は、何も付かない。書いてあるのに印が出ないのは残念だが、
 * 「読めませんでした」の箱が旅程表に9個並ぶほうが悪い。
 */
export default function DayLogMarks() {
  useEffect(() => {
    let alive = true;
    loadNordicLog().then((list) => {
      if (!alive || list.length === 0) return;
      const has = new Set(list.map((x) => x.day));
      document.querySelectorAll<HTMLElement>(".nday").forEach((el) => {
        el.toggleAttribute("data-log", has.has(el.id));
      });
    });
    return () => {
      alive = false;
    };
  }, []);
  return null;
}
