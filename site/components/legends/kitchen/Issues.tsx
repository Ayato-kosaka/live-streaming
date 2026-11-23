import type { Src } from "@/content/guidebook/types";
import { Ext, SrcLine, jpDate } from "@/components/guidebook/parts";
import Fold from "@/components/ui/Fold";
import type { KitchenCarBook } from "@/content/legends/kitchenCarTypes";

import { KcSec } from "./Sec";

/**
 * 5 課題一覧。**特大課題2つ**（ヨーロッパで働くための手続き＝決めた1文だけ／食べ物を売る許可＝あやとの考え（案内鳥の地の文）・
 * 4層の重さ・日本の許可と並べた表・出どころ）→ **暮らしの課題46件**（グループ10の畳み。行は題・考え・難しさの★）。
 * 添える字「2026年11月23日時点の考え」。実現度の % を出さない（あやとの答えの Q2）
 */
export default function Issues({ b }: { b: KitchenCarBook }) {
  const { work, permit, life } = b.issues;
  const seen = new Set<string>();
  const cmpSrc: Src[] = permit.compare.flatMap((c) => c.src).filter((s) => !seen.has(s.url) && !!seen.add(s.url));
  const star = (n: number) => b.ui.star.repeat(n);
  return (
    <KcSec b={b} s="issues" lead={b.side.issues}>
      <h3 className="gb-sub" id="big">
        {b.subs.big}
      </h3>
      <div className="kc-big">
        <h4 className="kc-h4">{work.title}</h4>
        <p>{work.text}</p>
      </div>
      <div className="kc-big">
        <h4 className="kc-h4">{permit.title}</h4>
        <p className="kc-plan">{permit.plan.text}</p>
        <p className="kc-when">
          <time dateTime={permit.plan.date}>{jpDate(permit.plan.date)}</time>
        </p>
        <ol className="kc-layers">
          {permit.layers.map((x) => (
            <li key={x.id} className={`is-${x.weight}`}>
              <b>{x.title}</b>
              <span className="kc-weight">{x.weightLabel}</span>
              <Ext>
                <p>{x.text}</p>
                <SrcLine src={x.src} of={x.title} />
              </Ext>
            </li>
          ))}
        </ol>
        <Ext className="kc-cmp">
          <div className="kc-scroll">
            <table className="gb-table">
              <thead>
                <tr>
                  <td className="is-name" />
                  <th scope="col">{b.ui.japan}</th>
                  <th scope="col">{b.ui.europe}</th>
                </tr>
              </thead>
              <tbody>
                {permit.compare.map((c) => (
                  <tr key={c.id}>
                    <th scope="row" className="is-name">
                      {c.label}
                    </th>
                    <td className="is-text">{c.japan}</td>
                    <td className="is-text">{c.europe}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <SrcLine src={cmpSrc} of={permit.title} />
        </Ext>
      </div>
      <h3 className="gb-sub" id="life">
        {b.subs.life}
      </h3>
      {life.map((g) => (
        <Fold key={g.name} title={g.name} note={String(g.items.length)}>
          <ol className="kc-life">
            {g.items.map((x) => (
              <li key={x.id} value={x.n}>
                <b>{x.title}</b>
                <span className="kc-stars" role="img" aria-label={`${b.ui.stars} ${x.stars}`}>
                  {star(x.stars)}
                </span>
                <p>{x.plan}</p>
                {x.src.length > 0 && <SrcLine src={x.src} of={x.title} />}
              </li>
            ))}
          </ol>
        </Fold>
      ))}
    </KcSec>
  );
}
