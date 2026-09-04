"use client";

import { useEffect } from "react";
import { getState } from "@/lib/api";

/**
 * 島の景色を、あやとがいまいる場所に合わせる。
 *
 * 北欧に行けば島の緑が寒色になり、砂浜が白くなる。
 * 元の値は /island-api/state の current.theme で、
 * GitHub Actions の「あやと島の『いま』を更新」から書きかえる。
 *
 * 描き始めの値は layout.tsx のスクリプトで入れてあるので、ここでは
 * 実際の値が取れたときだけ上書きする。取れなくても既定の景色のままになる。
 */
export default function IslandTheme() {
  useEffect(() => {
    let alive = true;
    getState()
      .then((s) => {
        const t = s.current?.theme;
        if (alive && t) document.documentElement.dataset.theme = t;
      })
      .catch(() => {
        /* 取れなければ既定の景色のまま */
      });
    return () => {
      alive = false;
    };
  }, []);
  return null;
}
