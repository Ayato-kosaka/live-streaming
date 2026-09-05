"use client";

import { Ask } from "./Fork";
import { useFork } from "./forks";
import { useHereSeq } from "./here";

/**
 * まだ決めていないこと。**押すだけで答えられる。**
 *
 * 提案の区画のいちばん上に置く。書くより先に、押すところがある形にしたい。
 *
 * **問いだけを並べない。** 何日目の、どこからどこへの話なのかを上に1行置いて、
 * 問いの文そのものも、それだけ読んで通じる字にしてある
 * （`content/nordic.ts` の `Leg.fork`）。前は「3日目行くかどうかまだ決めてません」が
 * 並んでいて、オーナーに「何のこと？ ってなる」と止められた。
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
  /** 何日目の話か。数字の無い日は「リガのあと」のような札が入る */
  when: string;
  /** どこからどこへ。旅程表の行と同じ字 */
  way: string;
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
            {/* どこの話かを、問いの上に1行。ここを省くと
                「3日目行くかどうかまだ決めてません」だけが並んで、
                何のことか分からない（オーナーの指摘）。 */}
            <Ask leg={i.leg} seq={i.seq} fork={i.fork} when={i.when} way={i.way} />
          </li>
        ))}
      </ul>
    </>
  );
}
