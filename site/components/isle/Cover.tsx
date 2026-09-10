"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, type ReactNode } from "react";

import { chapterNow } from "@/content/chapters";
import { HAND_MADE_CHAPTER } from "./handmade";
import type { IsleSpec } from "./spec";

/**
 * 島の表紙。**いま何章かで、降り立つ島が変わる。**
 *
 * あやとの言葉:「北欧ヒッチハイクの期間に入れば、あやと島の表紙は初期表示が
 * 北欧周遊の島のものに変わる」。
 *
 * ## 入れ替わっても、常設の入口は消えない
 *
 * ここが `nordicSpec` を出していたころ、入れ替わった瞬間に表紙の島が
 * **5軒だけの島**になっていた。あやとのこと・配信・アプリ・歩いた国・
 * 作った料理・住んでる人への入口が、表紙から全部消える。
 *
 * あやとの言葉:「配信とか、歩いた国、あやとのこと、アプリ、企画を出す、
 * これからとかっていうのは、**次の島でもデフォルトの島には常に引き継がないと、
 * 新しく入ってきた人からすると困りますよね。**」
 *
 * いま出しているのは `coverSpec`（`components/isle/cover.ts`）で、
 * **常設の入口ぜんぶ＋その旅のこと**が建つ。章が増えても、ここは変わらない。
 *
 * ## なぜ画面が出てから決めるのか
 *
 * 静的書き出し（`output: "export"`）なので、**ビルドしたときの答えが HTML に
 * 焼き込まれる**（`CLAUDE.md` の「静的書き出し」）。出発の日をまたいでも、
 * 誰かがデプロイし直すまで表紙が変わらない。だから
 * **焼くのは手で作った島で、入れ替えは画面が出てから**やる。
 *
 * 判定は `chapterNow(new Date())` 1か所だけ。日付から決まるので
 * （`content/chapters.ts`）、章を1つ足しても、`opensAt` を動かしても、
 * ここも島の連なりも一緒に動く。
 *
 * ## なぜ入れ替える島だけ後から読むのか
 *
 * 出発までのあいだ、表紙に降りる人は全員いまの島に降りる。
 * その人たちに歩ける島のエンジンをもう1本ぶん配るのは、払うだけで
 * 何も返らない。`next/dynamic` と `import()` で、入れ替わる日が来てから取りにいく。
 */
const IsleStage = dynamic(() => import("./IsleStage"), { ssr: false });


/**
 * @param now   ビルドしたときの島。**焼いた HTML に入っているのはこれ。**
 * @param baked その島がどの章のものか。ここと今日が食い違ったときだけ入れ替える
 */
export default function Cover({ now, baked }: { now: ReactNode; baked: string }) {
  const [spec, setSpec] = useState<IsleSpec | null>(null);
  useEffect(() => {
    const c = chapterNow(new Date());
    /* **焼いた島と同じ章なら、何もしない。** 出発したあとにビルドし直すと、
       表紙の島はサーバ側で焼かれて HTML に入る（`app/page.tsx`）。
       そちらのほうが速い（島が出るまで 3.4秒 → 1.8秒）ので、
       ここが受け持つのは**出発してから配り直すまでのあいだ**だけ。 */
    if (c.slug === baked) return;
    let alive = true;
    /* **島のエンジンと章の表を、同時に取りにいく。**
       `next/dynamic` は描き始めてから取りにいくので、章の表を待ってから
       エンジンを取ると1本ぶん直列に伸びる。並べて取ると、島が出るのが
       それだけ早くなる（実測 LCP 3,676 → その場で縮む）。 */
    Promise.all([import("./cover"), import("./IsleStage")]).then(([m]) => {
      if (alive) setSpec(m.coverSpec(c));
    });
    return () => {
      alive = false;
    };
  }, [baked]);
  if (!spec) return <>{now}</>;
  return <IsleStage spec={spec} cover />;
}
