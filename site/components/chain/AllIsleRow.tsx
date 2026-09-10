"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import Icon from "@/components/ui/Icon";
import { CHAPTERS, chapterNow, NOW_CHAPTER } from "@/content/chapters";
import { chapterHref } from "./route";

/**
 * 「島のなか ぜんぶ」に並ぶ、章の島の1行。
 *
 * ## なぜ、この1行だけ画面が出てから決めるのか
 *
 * **いまいる島は `/island/<章>` ではなく、トップそのもの**
 * （`docs/island-atlas.md` 7章・`components/chain/route.ts` の `chapterHref`）。
 * どれが「いまいる島」かは日付で変わるのに、`/all` は静的書き出しなので、
 * 焼いた答えのままだと出発の日をまたいでも変わらない（`CLAUDE.md`）。
 *
 * 実際、北欧に出発したあとの `/all` は `/island/nordic` を
 * 「これから建っていく島」として案内していた。押した先は紙1行の面で、
 * **同じ島が `/` にも建っている。** 連なり（`/atlas`）は正しく `/` へ送るので、
 * 薄いほうへの入口はここ1本だけ残っていた。
 *
 * 判定は `chapterNow(new Date())` 1つで、島の連なりや表紙と同じもの。
 */
export default function AllIsleRow({
  slug,
  name,
  note,
}: {
  slug: string;
  name: string;
  note: string;
}) {
  /* 焼いた答えでまず刷って、画面が出てから今日の答えに差し替える。
     最初から `new Date()` で決めると、サーバとブラウザで刷ったものが食い違う */
  const [now, setNow] = useState(NOW_CHAPTER);
  useEffect(() => setNow(chapterNow(new Date())), []);
  const here = slug === now.slug;
  /* 行き先は `chapterHref` に決めさせる。**ここで `/island/…` を組み立てない**
     ——決めかたが2か所に分かれると、片方だけ古くなる */
  const c = CHAPTERS.find((x) => x.slug === slug);
  return (
    <Link className="dx" href={c ? chapterHref(c, now) : `/island/${slug}`} prefetch={false}>
      <span className="dx-body">
        <b>{name}</b>
        {/* いまいる島は、押した先が島そのもの。**「これから建っていく島」と
            書いたままにしない**——降りれば10軒建っている島に、
            まだ何も無いと言うことになる */}
        <i>{here ? "いまここ。島に降りる" : note}</i>
      </span>
      <Icon name="right" size={15} className="dx-go" />
    </Link>
  );
}
