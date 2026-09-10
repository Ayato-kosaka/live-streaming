"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * この面から、別の面へ送る。**引っ越したあとの入口に置く。**
 *
 * `output: "export"` なので、面を消してしまうと貼られていた URL が
 * どこにも着かなくなる（Firebase の受け皿がトップを返すので、404 にすら
 * ならず、島の玄関が出る）。**貼られた URL は生かしたまま送る。**
 *
 * 本筋は Hosting の 301（`firebase.json` の `redirects`）で、こちらは
 * その手前で開いた人と、設定が外れたときのための控え。`replace` にして
 * 戻るボタンでここへ戻らないようにする。
 */
export default function GoTo({ to }: { to: string }) {
  const router = useRouter();
  useEffect(() => {
    router.replace(to);
  }, [router, to]);
  return null;
}
