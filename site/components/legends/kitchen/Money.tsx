import type { Src } from "@/content/guidebook/types";
import { Ext, SrcLine } from "@/components/guidebook/parts";
import Fold from "@/components/ui/Fold";
import type { KcRow, KitchenCarBook } from "@/content/legends/kitchenCarTypes";

import DaySim from "./DaySim";
import { Est, KcSec } from "./Sec";

/** 前提の1行ずつ（見出し・字・見立ての印） */
function Rows({ b, rows }: { b: KitchenCarBook; rows: KcRow[] }) {
  return (
    <dl className="gb-facts kc-rows">
      {rows.map((r) => (
        <div key={r.label}>
          <dt>{r.label}</dt>
          <dd>
            {r.text}
            <Est b={b} on={r.est} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * 4 収益構造。**1日の収益のシミュレーション（置き場）と、畳んだ前提**（build-plan ①の5・あやとの答えの Q7「1日まで」）。
 * 数字は全部「目安」。前提には固定の値・円に直す率・売る場所ごとの時間と出店料と来て買う人を、見立ての印と出どころつきで置き、
 * 「車・保険・泊まる所は入っていない」と書く（税と電気は入っている）。式は面に出さない（`docs/island-standards.md` 6章）
 */
export default function Money({ b }: { b: KitchenCarBook }) {
  const seen = new Set<string>();
  const src: Src[] = [
    ...Object.values(b.money.fixed).flatMap((f) => f.src),
    ...b.rate.src,
    ...b.places.flatMap((p) => p.src),
    ...b.money.inputs.flatMap((x) => x.src),
  ].filter((s) => !seen.has(s.url) && !!seen.add(s.url));
  return (
    <KcSec b={b} s="money">
      <p className="kc-side">{b.side.money}</p>
      <DaySim b={b} />
      <Fold title={b.ui.premise}>
        <Ext>
          <Rows b={b} rows={b.money.premise} />
          {b.places.map((p) => (
            <div className="kc-place" key={p.id}>
              <p className="kc-h4">{p.name}</p>
              <Rows b={b} rows={p.rows} />
            </div>
          ))}
          <p className="kc-notin">{b.ui.notIn}</p>
          <SrcLine src={src} of={b.ui.premise} />
        </Ext>
      </Fold>
    </KcSec>
  );
}
