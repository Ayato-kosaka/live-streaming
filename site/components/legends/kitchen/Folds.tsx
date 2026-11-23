import { Ext, SrcLine, jpDate } from "@/components/guidebook/parts";
import Fold from "@/components/ui/Fold";
import type { KitchenCarBook } from "@/content/legends/kitchenCarTypes";

import { SceneLink } from "./Sec";

/**
 * 下のほうに畳む3つ。**ここまでの進み具合**（古い順の年表。場面を持つ行だけ場面へのリンク）・**判断ログ**（新しい順。日付・何を・
 * なぜ・決めた人。企画で決めたことだけ）・**確かめた事実**（グループごと。出どころと見た日）。
 * あやとの答え「判断の記録と同じく、ページの下のほうに畳んで置く」・運営の決め 2026-11-23 の7（名前は「判断ログ」のまま）
 */
export default function Folds({ b }: { b: KitchenCarBook }) {
  const head = b.ui.log;
  return (
    <div className="kc-folds" data-gb="folds">
      <Fold title={b.folds.progress} note={String(b.progress.length)}>
        <ol className="kc-progress">
          {b.progress.map((x) => (
            <li key={`${x.date}-${x.title}`}>
              <time dateTime={x.date}>{jpDate(x.date)}</time>
              <b>{x.title}</b>
              <p>{x.body}</p>
              {x.scene?.v && <SceneLink s={x.scene} of={x.title} />}
            </li>
          ))}
        </ol>
      </Fold>
      <Fold title={b.folds.log} note={String(b.log.length)}>
        <div className="kc-scroll">
          <table className="gb-table kc-log">
            <thead>
              <tr>
                <th scope="col">{head.date}</th>
                <th scope="col">{head.what}</th>
                <th scope="col">{head.why}</th>
                <th scope="col">{head.by}</th>
              </tr>
            </thead>
            <tbody>
              {b.log.map((x, i) => (
                <tr key={i}>
                  <td>
                    <time dateTime={x.date}>{jpDate(x.date)}</time>
                  </td>
                  <td className="is-text">{x.what}</td>
                  <td className="is-text">{x.why}</td>
                  <td>{b.ui.who[x.by]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Fold>
      <Fold title={b.folds.facts} note={String(b.facts.reduce((n, g) => n + g.items.length, 0))}>
        {b.facts.map((g) => (
          <div className="kc-facts" key={g.id}>
            <p className="kc-h4">{g.name}</p>
            <ul>
              {g.items.map((x) => (
                <li key={x.id} id={`fact-${x.id}`}>
                  <Ext>
                    <p>{x.text}</p>
                    <SrcLine src={x.src} of={x.text} />
                  </Ext>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </Fold>
    </div>
  );
}
