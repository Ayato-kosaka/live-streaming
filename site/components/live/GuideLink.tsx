"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import Icon from "@/components/ui/IconCore";
import { BUILT_AT } from "@/content/plans";
import { guideOn, type GuideSpan } from "@/lib/guideDay";

export type GuideItem = GuideSpan & {
  href: string;
  name: string;
  lead: string;
  /** 国の絵。**面（サーバ側）で描いて渡す**——下の注 */
  art: ReactNode;
};

/**
 * トップページの「いま」に出る、いまいる国の案内への1本。
 *
 * ## なぜ部品にしたか（面に直に書かない）
 *
 * どの国の案内を出すかは、**その日に居る国**で決まる
 * （`components/isle/spec.ts` の `guidesOf`。期間は国の表から導いてある）。
 * **その入れ替わりを、焼いた日で決めない。**
 * 島は静的書き出しなので、面に直に書くとビルドした日の国が焼き込まれて、
 * 次のビルドまで直らない（`NextUp` が同じ理由で部品になっている）。
 *
 * **最初の1枚は焼いた日で出す。** ここで `new Date()` を呼ぶと、焼いた HTML と
 * ブラウザの最初の描画が別の国を指して、1フレームだけ違う札が出る。
 *
 * **どの期間にも当たらない日は、何も出さない。** いま居る国が案内の面を
 * 持っていない日がそれ。前は期間の無い行が受け皿になっていて、
 * もう居ない国の案内へ戻っていた（`lib/guideDay.ts`）。
 *
 * ## 選びかたをここに書かない
 *
 * 島の札（`spec.ts` の `guideOf`）と同じ式を `lib/guideDay.ts` から呼ぶ。
 * 写しを持つと、片方だけ直した日に島の札と紙の板が別の国を指す。
 *
 * ## 絵をここで描かない
 *
 * 国の絵（教会・山…）は `Icon.tsx` の 257 種のほうにある。あれを
 * `"use client"` の部品から名前で引くと、**174KB がまるごと束に入る**
 * （`components/ui/IconCore.tsx` の冒頭）。だから絵は面の側（サーバ）で描いて
 * `art` に入れて渡す。出す国は2〜3なので、使わないぶんの SVG が HTML に
 * 残るが、そちらは1枚 1KB 弱で、束に 174KB 積むより軽い。
 */
export default function GuideLink({ items }: { items: GuideItem[] }) {
  const [guide, setGuide] = useState(() => guideOn(items, BUILT_AT));

  useEffect(() => {
    setGuide(guideOn(items, new Date()));
    // items は面から焼いて渡す定数なので、毎回ひき直さない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!guide) return null;
  return (
    <Link prefetch={false} className="hjoin" href={guide.href}>
      {guide.art}
      <span className="hjoin-body">
        <b>{guide.name}</b>
        <i>{guide.lead}</i>
      </span>
      <Icon name="right" size={16} className="hjoin-go" />
    </Link>
  );
}
