"use client";

import { Ask } from "./Fork";
import { useFork } from "./forks";
import { useHereSeq } from "./here";

/**
 * まだ決めていないこと。**押すだけで答えられる。**
 *
 * 提案の区画のいちばん上に置く。書くより先に、押すところがある形にしたい。
 * 何日目の話かを頭に付けるので、旅程表の中に混ぜなくても話が通る。
 *
 * 越えた日の問いは、ここから消えて旅程表のその日の行に答えが残る
 * （`Fork.tsx` の `Answer`）。旅が進むほど、この並びは短くなる。
 *
 * 中身がひとつも無いとき（サーバーが数を返せない・全部越えた）は、
 * 見出しごと出さない。空の見出しは、壊れているように見える。
 * だから見出しもこの中にある。
 */

export type AskItem = {
  leg: string;
  seq: number;
  day: number;
  fork: { q: string; options: { id: string; label: string }[] };
};

export default function Asks({ items }: { items: AskItem[] }) {
  /* 数がひとつも読めないなら、この区画そのものを出さない。
     `useFork` は読めるまで null を返すので、先頭ひとつで見分けがつく。 */
  const first = useFork(`nordic-${items[0]?.leg ?? ""}`);
  const here = useHereSeq();
  const left = items.filter((i) => here == null || i.seq >= here);
  if (!left.length || first === null) return null;
  return (
    <>
      <h3 className="nsub">まだ決めていないこと</h3>
      <p className="nsub-note">押すと数に入ります。名前は残りません。</p>
      <ul className="nasks">
        {left.map((i) => (
          <li key={i.leg} className="nask">
            <p className="nask-day">{i.day}日目</p>
            <Ask leg={i.leg} seq={i.seq} fork={i.fork} />
          </li>
        ))}
      </ul>
    </>
  );
}
