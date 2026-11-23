import type { KitchenCarBook } from "@/content/legends/kitchenCarTypes";

import { KcSec } from "./Sec";

/** 最初に見せる本数（あやとの答えの Q8「最初に見えるのは10本ほど」） */
const FIRST = 10;

/**
 * 6 30日後にキッチンカーでヨーロッパを一周する人。**添える字 → 番号つきの1〜10 → 「もっと見る」で11〜30**
 * （あやとの答えの Q8）。題だけを並べ、押しても動画は開かない。カウントダウンや、まだ開かないマスは置かない。
 * **30本とも HTML に焼く**（`<details>` は閉じていても中身が DOM に在る。`ui/Longer.tsx` は出していない行を HTML に置かないので使わない）
 */
export default function Shorts({ b }: { b: KitchenCarBook }) {
  const head = b.shorts.slice(0, FIRST);
  const rest = b.shorts.slice(FIRST);
  return (
    <KcSec b={b} s="shorts" lead={b.side.shorts}>
      <ol className="kc-shorts">
        {head.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ol>
      {rest.length > 0 && (
        <details className="kc-more">
          <summary>{b.ui.more}</summary>
          <ol className="kc-shorts" start={FIRST + 1}>
            {rest.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ol>
        </details>
      )}
    </KcSec>
  );
}
