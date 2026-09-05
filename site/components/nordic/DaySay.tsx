"use client";

import { Ask, Answer } from "./Fork";
import { useFork } from "./forks";
import { useHereSeq } from "./here";

/**
 * この日に、言う。**1日ぶんのページの中に置く。**
 *
 * オーナーの言葉:
 *
 * > 「この旅に言う」っていうやつ。これ多分アンケートみたいな感じになると思うんですけど、
 * > それは1日目のページ詳細みたいなところに入ったときに出すようにしてほしい
 *
 * もとは `/nordic` のいちばん下に5つまとめて並べていた。**そこだと、
 * どの問いも「どこの話か」を毎回1行足して説明しないと通じなかった**
 * （`content/nordic.ts` の `Leg.fork`。前にオーナーに止められている）。
 * その日のページの中なら、何日目のどの道の話かは面ぜんぶが言っている。
 *
 * **見出しごと、この中に置く。** 数が読めないときは問いを出さない決まりなので
 * （`forks.ts`）、外に見出しだけ残ると、空の区画が1つ増える。
 *
 * 越えた日は問いが消えて、答えが残る（`Fork.tsx` の `Ask` と `Answer`）。
 * どちらも出ない日は、この区画そのものが消える。
 */

export type SayItem = {
  leg: string;
  /** `ROUTE` の中での位置。もう越えた日かどうかを、これで見分ける */
  seq: number;
  /** どこからどこへ。旅程表の行と同じ字 */
  way: string;
  fork: { q: string; options: { id: string; label: string }[] };
};

export default function DaySay({ items }: { items: SayItem[] }) {
  /* 数がひとつも読めないなら、この区画そのものを出さない。
     `useFork` は読めるまで null を返すので、先頭ひとつで見分けがつく。 */
  const first = useFork(`nordic-${items[0]?.leg ?? ""}`);
  const here = useHereSeq();
  if (!items.length || first === null) return null;
  const left = items.filter((i) => here == null || i.seq >= here);
  const done = items.filter((i) => here != null && i.seq < here);

  return (
    <section className="panel paper" id="say">
      <h2>この日に、言う</h2>
      {left.length > 0 ? (
        <>
          <p className="muted">
            まだ決まっていません。押すと数に入ります。名前は残りません。
          </p>
          <ul className="nasks">
            {left.map((i) => (
              <li key={i.leg} className="nask">
                {/* 何日目・どこからどこへ、の一行はこの面が持っている。
                    問いの上にもう一度置かない（`when` を渡さない）。 */}
                <Ask leg={i.leg} seq={i.seq} fork={i.fork} way={i.way} />
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="muted">この日は、もう越えました。聞いた答えだけ残しておきます。</p>
      )}
      {done.map((i) => (
        <Answer key={i.leg} leg={i.leg} seq={i.seq} fork={i.fork} />
      ))}
    </section>
  );
}
