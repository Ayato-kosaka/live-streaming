"use client";

import { useEffect, useState } from "react";
import Icon from "@/components/ui/Icon";
import { tripDate } from "./where";

/**
 * しおりの頭に置く、**いま歩いている国のことばへの近道。**
 *
 * しおりは11章・畳み53個ある。ことばの章は10章目で、その中でさらに5言語が
 * 縦に並ぶ。**旅の最中に「ありがとう」を1つ引くのに、面を何画面も送ることになる。**
 * 並びは旅で出会う順に直した（`content/nordic.ts` の `NORDIC_GUIDE`）ので、
 * 旅の前半はいちばん上に出る。**後半になるほど下がる**ので、近道を1本置く。
 *
 * 近道は**1本だけ。** 2本目を置くと目次になる（目次はすぐ下にある）。
 *
 * ## なぜ書き出しに焼かないか
 *
 * 静的書き出し（`output: "export"`）なので、ビルドした日の国を焼くと
 * **翌日から嘘になる**（`docs/island-misses.md` #71）。日付は画面が出てから見る。
 *
 * ## なぜ、分かる前も同じ札を出すのか
 *
 * 分かってから札を足すと、**目次がその厚みぶん下がる。** 押そうとした指の下で
 * 行がずれる。だから札は最初から同じ大きさで置いて、**行き先と字だけ入れ替える。**
 * 日付が旅の外（出発前・旅のあと）なら、章そのものへ行く札のまま。
 */
export default function GuideNow({
  days,
}: {
  /** 日付 → その日の終わりにいる国。ことばの載っている国だけ渡すこと。 */
  days: { date: string; slug: string; name: string }[];
}) {
  const [now, setNow] = useState<{ slug: string; name: string } | null>(null);
  useEffect(() => {
    const t = tripDate();
    const d = days.find((x) => x.date === t);
    setNow(d ? { slug: d.slug, name: d.name } : null);
  }, [days]);

  /* 飛んだ先の章を開ける。**目次を押しても、開くのは畳んだ帯までだった。**
     章は `<details>` なので、着いた人はもう一度、帯を押さないと中が出ない。
     11章ぜんぶがそうで、日ページの「しおりの、おみやげ13品」から
     面をまたいで来た人も、着いた先で同じ2度押しをしていた。
     **押しどころは合っていて、押す回数だけが1つ多い。**

     JavaScript が来る前でも `<details>` はそのまま押せるので、
     ここは上乗せだけ。**開いたぶん下の行が伸びるので、開いてから寄せ直す**
     （寄せ直さないと、帯が画面の外へ出ていく）。 */
  useEffect(() => {
    const open = (hash?: string) => {
      const id = decodeURIComponent((hash ?? location.hash).slice(1));
      if (!id) return;
      const el = document.getElementById(id);
      if (!el) return;
      // 章そのもの（`#money`）でも、章の中の札（`#ph-lithuania`）でも、その章の畳みを開く
      const d = el.querySelector("details") ?? el.closest("details");
      if (!d || d.open) return;
      d.open = true;
      requestAnimationFrame(() => el.scrollIntoView({ block: "start" }));
    };
    /* 同じ錨をもう一度押したときは `hashchange` が来ない。
       **一度開いて自分で閉じた章を、目次から開き直せなくなる**ので、
       押されたこと自体からも数える。 */
    const tap = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.('a[href^="#"]');
      if (a) setTimeout(() => open(a.getAttribute("href") || undefined), 0);
    };
    open();
    const onHash = () => open();
    window.addEventListener("hashchange", onHash);
    document.addEventListener("click", tap);
    return () => {
      window.removeEventListener("hashchange", onHash);
      document.removeEventListener("click", tap);
    };
  }, []);
  return (
    <p className="chips gnow">
      <a className="chip link" href={now ? `#ph-${now.slug}` : "#phrases"}>
        <Icon name="phrase" size={18} />
        {/* 分からないうちは章そのものへ。**旅の外で開いた人にも嘘にならない字**にする。
            旅の最中は国が入って、ことばの札まで直に飛ぶ。 */}
        {now ? `いま ${now.name}のことば` : "現地のことば"}
      </a>
    </p>
  );
}
