"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { BUILT_AT } from "@/lib/builtAt";
import { hereNow, type HereNow } from "@/lib/stayHere";

/**
 * 名刺（表紙）と `/about` の「いま ◯◯」。**字は滞在の表、押した先はいまの旅の島**（#1278）。
 *
 * ## Firestore を読まない
 *
 * 前はここが `island/state.current.place`——あやとが手で打つ1本の字——を読んでいた。
 * 打たれたのは 2026-09-28 が最後で、そのあとは「古ければ章か国で受ける」の継ぎ当てで
 * 隠していた。居場所の持ち主は滞在の表（`content/stays.ts`）1か所で（`docs/spec/model.md` M-20）、
 * 表紙の「これから」の［いまここ］も同じ表から引いている（`lib/leadPlan.ts` の `stayHere`）。
 * **同じ面の上と下が、同じ1本を読む。**
 *
 * ## 押した先は、いまの旅の島
 *
 * `/now`（いまどこ）は畳んだ（`docs/adr/0006-fold-next-and-now.md`。`/` へ 301）。
 * 「いま」を面として言うのは表紙だけなので（M-31）、ここから送る先は、いまの章の島
 * （`/island/<章>`）。道は `chapterHref` 1か所が持つ。
 *
 * ## 画面が出てから引き直す
 *
 * 静的書き出しなので、最初の1枚は**焼いた日**（`BUILT_AT`）で出す。ここで `new Date()` を
 * 呼ぶと、焼いた HTML とブラウザの最初の描画が別の国を指して水あわせが落ちる。
 * 画面が出たら今日で引き直し、1分ごとに数え直す（表紙の `NextUp` と同じ拍。
 * 国を移った日に、同じ表紙の上と下が別の国を言わないように）。
 *
 * 引きかたは `lib/stayHere.ts` の `hereNow`（見張りは `site/selftest/leadplan_selftest.mjs` の 8）。
 */
function useHere(): HereNow {
  const [here, setHere] = useState<HereNow>(() => hereNow(BUILT_AT));
  useEffect(() => {
    const read = () => {
      const next = hereNow(new Date());
      setHere((h) => (h.place === next.place && h.href === next.href && h.trip === next.trip ? h : next));
    };
    read();
    const id = setInterval(read, 60_000);
    return () => clearInterval(id);
  }, []);
  return here;
}

/**
 * 「いま ◯◯」の札。中身（絵・字の並び）は呼ぶ側が渡し、ここは行き先だけを持つ。
 * 字は中の `HerePlace` / `HereTrip` が同じ引きかたで出す。
 */
export default function HereLink({ className, children }: { className: string; children: ReactNode }) {
  const { href } = useHere();
  return (
    <Link prefetch={false} className={className} href={href}>
      {children}
    </Link>
  );
}

/** いまいる所（「ルーマニア」「ブルガリア・ソフィア」）。街が分からなければ国だけ */
export function HerePlace() {
  return <>{useHere().place}</>;
}

/** いまの旅の名前（「バルカン諸国周遊」）。押した先の島の名前と同じ字 */
export function HereTrip() {
  return <>{useHere().trip}</>;
}
