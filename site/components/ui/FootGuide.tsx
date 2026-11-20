"use client";

import Link from "next/link";
import { BUILT_AT } from "@/lib/builtAt";
import { guideOn, type GuideStop } from "@/lib/guideStop";
import { jstNow } from "@/lib/nightly";
import { useToday } from "@/lib/useToday";

/**
 * 足もとの、いまいる街か次に行く街のガイドへの1本（`lib/guideStop.ts`）。
 *
 * **どの街かは画面が出てからもう一度選ぶ。** 静的書き出しなので、焼いた日に選んだ街が
 * 次に配り直すまでそのまま配られる。つぎの国へ移った日に前の街のガイドが残らないように、
 * 焼いた HTML と最初の1枚は焼いた日（`BUILT_AT`）で選び（水あわせを崩さない）、
 * 今日が分かったら今日で選び直す。
 */
export default function FootGuide({ stops }: { stops: GuideStop[] }) {
  const today = useToday();
  const stop = guideOn(stops, jstNow(today ?? BUILT_AT).date);
  if (!stop) return null;
  return (
    <Link href={stop.href} prefetch={false} className="ifoot-privacy">
      {stop.name}観光ガイド・見どころマップ
    </Link>
  );
}
