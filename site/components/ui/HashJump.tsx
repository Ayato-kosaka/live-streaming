"use client";

import { useEffect } from "react";

/**
 * `#…` 付きの行き先に着いたとき、そこまで送る。
 *
 * ## なぜ要るか
 *
 * あやとの言葉（2026-09-10）:「あお文字おしても food wine fest が見れない」。
 *
 * カードの企画の札は `/next#food-wine-fest` を指している。押すと URL は
 * 変わるが、**画面はその場所まで送られない**（実測：目当ての段が 3,055px
 * にあるのに、止まったのは 238px）。面の中身が出てから伸びるからで、
 * ブラウザが `#` を探しにいく時点では、まだその段が今の高さに無い。
 * 島の面はどこも中身を取りにいくので、**この面だけの話ではない。**
 *
 * ## 追いかけて、追いつけたらやめる
 *
 * 出たあとしばらく、目当ての段の位置を見て送り直す。同じ位置に2回続けて
 * 止まったら追いつけたと見なしてやめる。**人が自分で送りはじめたら、
 * その場でやめる**（読んでいる途中に飛ばされるほうが害が大きい）。
 *
 * 送り方は `behavior: "auto"`。滑らかに送ると、追いかけている途中の
 * 送り直しが重なって、画面が上下に泳ぐ。
 */
export default function HashJump() {
  useEffect(() => {
    let stop: (() => void) | null = null;

    const chase = () => {
      stop?.();
      const id = decodeURIComponent(location.hash.slice(1));
      if (!id) return;
      let tries = 0;
      let same = 0;
      let last = NaN;
      let timer = 0;
      const quit = () => {
        window.clearTimeout(timer);
        window.removeEventListener("wheel", quit);
        window.removeEventListener("touchstart", quit);
        window.removeEventListener("keydown", quit);
        stop = null;
      };
      const tick = () => {
        const el = document.getElementById(id);
        if (el) {
          const top = Math.round(el.getBoundingClientRect().top + window.scrollY);
          if (top === last) same++;
          else same = 0;
          last = top;
          el.scrollIntoView({ block: "start", behavior: "auto" });
          // 2回続けて同じ位置なら、面はもう伸びきっている
          if (same >= 2) return quit();
        }
        if (++tries > 24) return quit();
        timer = window.setTimeout(tick, 100);
      };
      window.addEventListener("wheel", quit, { passive: true });
      window.addEventListener("touchstart", quit, { passive: true });
      window.addEventListener("keydown", quit);
      stop = quit;
      tick();
    };

    chase();
    window.addEventListener("hashchange", chase);
    return () => {
      window.removeEventListener("hashchange", chase);
      stop?.();
    };
  }, []);

  return null;
}
