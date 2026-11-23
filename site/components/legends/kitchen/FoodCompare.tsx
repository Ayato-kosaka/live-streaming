import type { Src } from "@/content/guidebook/types";
import { Ext, SrcLine } from "@/components/guidebook/parts";
import type { KitchenCarBook } from "@/content/legends/kitchenCarTypes";

import { Est } from "./Sec";

/**
 * 食べ物ごとの比較。**同じ物差し**（1時間に焼ける数・値段・1個の材料・1個の利益・利益率・機材・電気とガス）で5品を並べる
 * （#1418 本文2章の4）。字は焼いた中身の `compare`（利益と利益率は、値段と材料の幅の真ん中と税抜の値段から焼いた）。
 * 数字は全部「目安」で、出どころが見立ての数には印を付ける。出どころは表の下に1行
 */
export default function FoodCompare({ b }: { b: KitchenCarBook }) {
  const seen = new Set<string>();
  const src: Src[] = b.foods.flatMap((f) => f.src).filter((s) => !seen.has(s.url) && !!seen.add(s.url));
  return (
    <Ext className="kc-compare">
      <div className="kc-scroll">
        <table className="gb-table">
          <caption>{b.side.money}</caption>
          <thead>
            <tr>
              {b.compare.head.map((h, i) => (
                <th key={h} scope="col" className={i === 0 ? "is-name" : undefined}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {b.compare.rows.map((r) => (
              <tr key={r.id}>
                <th scope="row" className="is-name">
                  {r.name}
                </th>
                {r.cells.map((c, i) => (
                  <td key={i} className={i >= 5 ? "is-text" : undefined}>
                    {c.text}
                    <Est b={b} on={c.est} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <SrcLine src={src} of={b.subs.foodCompare} />
    </Ext>
  );
}
