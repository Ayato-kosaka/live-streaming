"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { jstNow } from "@/lib/nightly";
import Ask, { type AskOption } from "./Ask";

/**
 * スタンプ帳の、空いているところ。
 *
 * どうぶつの森の博物館は、持っているものを数えて見せない。**空いている台座**を見せる
 * （`docs/island-play.md` C）。台所の帳面も同じで、押した32品より
 * 「今月のマスがまだ空いている」ほうが、次に何が起きるかを言っている。
 *
 * ここに置く「できること」は、その空きマスに**押すだけで答えられる**ようにしたもの。
 * 埋めるのは視聴者ではなくあやとなので、宿題にならない。
 * 何を作るかは実際に週のはじめの企画会議で決まるので、押した先に現実がある
 * （`docs/island-play.md` 仕掛け11）。
 *
 * **今月が何月かは、画面が出てから数える。** 静的書き出しなので、ビルドした日の
 * 月を焼き込むと、月が変わった日から次のビルドまで嘘をつく。
 * 分かるまでは月の行を出さない（焼き込みを先に出して差し替えると、
 * 数秒だけ違う月が出る）。
 */

type Thin = { id: string; label: string; n: number };

type Props = {
  /** 月ごとに何品押したか（"YYYY-MM" → 品数）。今月ぶんはここに無いこともある */
  months: Record<string, number>;
  /** スタンプの少ない種類。少ない順。id は `content/recipes.ts` の `RecipeKind` */
  thin: Thin[];
};

export default function KitchenNext({ months, thin }: Props) {
  const [now, setNow] = useState<{ m: number; n: number } | null>(null);

  useEffect(() => {
    const j = jstNow();
    const key = `${j.y}-${String(j.m).padStart(2, "0")}`;
    setNow({ m: j.m, n: months[key] ?? 0 });
  }, [months]);

  const options: AskOption[] = thin.map((t) => ({ id: t.id, label: t.label }));

  return (
    <>
      <p className="zk-lead">
        {now &&
          (now.n === 0
            ? `${now.m}月のマスは、まだ空いている。`
            : `${now.m}月はここまで${now.n}品。`)}
        いちばん少ないのは{thin[0].label}の{thin[0].n}品。
      </p>
      <Ask
        id="kitchen-next-kind"
        q="次のスタンプ、どれにする?"
        options={options}
        after={
          <>
            品名まで決めたいときは、<Link href="/board">掲示板</Link>に書けます。
          </>
        }
      />
    </>
  );
}
