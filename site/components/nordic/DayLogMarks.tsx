"use client";

import { useEffect } from "react";
import ReadAgain from "@/components/me/ReadAgain";
import { useNordicLogState } from "./log";

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
 * ## 読めなかったときに、黙らない（#34 #36）
 *
 * ここには「読めなかった日は何も付かない。『読めませんでした』の箱が
 * 旅程表に9個並ぶほうが悪い」と書いてあった。**箱を9個並べない**ところまでは
 * 正しい。正しくなかったのは、そのために**読めなかったことまで黙った**こと。
 * 印が1つも付かない旅程表は「まだ誰も何も書いていない旅」に見えるので、
 * 電波の細い日に、書いてある9日ぶんを無かったことにする。
 *
 * **箱は9個ではなく、旅程表にひとつ。** 押せば読み直せるし、押されなくても
 * 電波が戻れば黙って直る（`./log`）。読めた瞬間に箱は消えて、印が付く。
 */
export default function DayLogMarks() {
  const { log, read, reload } = useNordicLogState();

  useEffect(() => {
    if (read !== "ok") return;
    const has = new Set(log.map((x) => x.day));
    document.querySelectorAll<HTMLElement>(".nday").forEach((el) => {
      el.toggleAttribute("data-log", has.has(el.id));
    });
  }, [log, read]);

  if (read !== "down") return null;
  /* 旅程表（`ol.ndays`）の中に置くので、包むのは li。並びの先頭に1枚だけ出る。 */
  return (
    <li className="nday-off">
      <ReadAgain what="その日の話" onRetry={reload} />
    </li>
  );
}
