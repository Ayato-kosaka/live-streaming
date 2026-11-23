import type { ReactNode } from "react";

import { Sec } from "@/components/guidebook/parts";
import Icon, { type IconName } from "@/components/ui/Icon";
import type { KcScene, KitchenCarBook, KitchenSection } from "@/content/legends/kitchenCarTypes";

/**
 * **ノマドキッチンカーの面の、節の枠と小さな部品。** 中身は焼いたもの（`content/legends/nomad-kitchen-car.ts`）で、
 * **ここにも、ほかの部品にも字は書かない**——節の名前・押しどころ・表の頭まで焼いた中身から読む。
 * 形は街のガイドのまま（`components/guidebook/parts.tsx` の `Sec`。番号・絵・問いの見出し・節の終わりの「目次へ」）。
 *
 * サーバで描き切る（`Icon` を名前で引くので、`"use client"` の部品から読まない）。
 */

/** 節の絵。目次の札と節の見出しで同じ */
const ICON: Record<KitchenSection, IconName> = {
  route: "road",
  menu: "eat",
  look: "camper",
  money: "wallet",
  issues: "checklist",
  shorts: "film",
};

/** 節の並び（#1418 本文2章とあやとの答え） */
const ORDER: KitchenSection[] = ["route", "menu", "look", "money", "issues", "shorts"];

/** 節の番号（01〜） */
export const secNo = (s: KitchenSection) => ORDER.indexOf(s) + 1;

/** 目次の札（`components/guidebook/Toc.tsx` に渡す）。名前と数は焼いた中身の `toc` */
export function kitchenToc(b: KitchenCarBook): { id: string; label: string; icon: IconName; note: string }[] {
  return b.toc.map((t) => ({ id: t.id, label: t.label, icon: ICON[t.id], note: t.note }));
}

/** 節ひとつ（街のガイドの `Sec` に、焼いた名前と絵を渡すだけ） */
export function KcSec({ b, s, lead, children }: { b: KitchenCarBook; s: KitchenSection; lead?: string; children: ReactNode }) {
  return (
    <Sec id={s} n={secNo(s)} icon={ICON[s]} title={b.sections[s]} lead={lead}>
      {children}
    </Sec>
  );
}

/** 本人の言葉の場面へのリンク（その秒の配信を開く）。**場面を持たない言葉は、日付だけを字で置く** */
export function SceneLink({ s, of }: { s: KcScene; of?: string }) {
  if (!s.v) {
    return (
      <span className="kc-scene">
        <time dateTime={s.date}>{s.cite}</time>
      </span>
    );
  }
  return (
    <a
      className="kc-scene"
      href={`https://www.youtube.com/watch?v=${s.v}&t=${s.t ?? 0}s`}
      target="_blank"
      rel="noreferrer"
      aria-label={of ? `${of}（${s.cite}）` : undefined}
    >
      <Icon name="play" size={14} />
      <time dateTime={s.date}>{s.cite}</time>
    </a>
  );
}

/** 見立ての印（出どころが見立ての数のそば） */
export function Est({ b, on }: { b: KitchenCarBook; on: boolean }) {
  return on ? <i className="kc-est">{b.ui.est}</i> : null;
}
