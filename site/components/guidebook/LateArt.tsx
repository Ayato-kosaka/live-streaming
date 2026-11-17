"use client";

import { useEffect } from "react";

/**
 * **画面に近づいた絵だけを出す。** `data-gb-late` の付いた箱の中の絵は、CSS で `display: none` にしてある
 * （`guidebook.css`）。画面の 600px 手前まで来たら、その印を外して絵を出す。
 *
 * ## なぜ `loading="lazy"` だけでは足りないか
 *
 * Chrome は lazy の絵でも、**画面の下 1,250px までは送られる前に読む。** 390幅のソフィアの面では、
 * 2画面目の下（y≈1,700）にある絵地図（800px・227KB）が、表紙と一緒に最初の1画面の代金に乗っていた
 * （`tools/sprites/firstload.mjs` の上限 810KB を超えた。#944）。
 * **`display: none` の lazy の絵は、どのブラウザも要求しない**ので、近づくまでは箱（比は親が持つ）だけ置く。
 *
 * 600px は、読み込みを始めてから絵が出るまでの余裕（4G で 227KB は 0.2秒前後）。最初の1画面（844px）の
 * 下 600px に入る絵は、はじめから出る。JS の無い読み手には、CSS の `@media (scripting: none)` で最初から出す。
 *
 * 面に1つ置けば、面じゅうの `data-gb-late` を見る（いまは絵地図だけ）。
 */
export default function LateArt() {
  useEffect(() => {
    const els = [...document.querySelectorAll<HTMLElement>("[data-gb-late]")];
    if (!els.length) return;
    const show = (el: Element) => el.removeAttribute("data-gb-late");
    if (!("IntersectionObserver" in window)) {
      els.forEach(show);
      return;
    }
    const io = new IntersectionObserver(
      (es) => {
        for (const e of es) {
          if (!e.isIntersecting) continue;
          show(e.target);
          io.unobserve(e.target);
        }
      },
      { rootMargin: "600px 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return null;
}
