"use client";

import ReadAgain, { Waiting } from "@/components/me/ReadAgain";
import { Ask, Answer } from "./Fork";
import { reloadForks, useForkState } from "./forks";
import { useHereAt } from "./here";

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
 * わかれ道の無い日は、この区画そのものが出ない。
 *
 * **数が読めなかった日は、区画を消さない**（#34）。前は「読み込み中」と
 * 「読めなかった」がどちらも `null` で返っていたので、電波が細いだけの日に
 * 「この日に、言う」がまるごと消えていた。消えると、無かったのか届かなかったのかが
 * 読む人に分からない。区画は残して、**読み直す道**を出す。
 */

/**
 * 止まる街ひとつ。**名前と数字と日付だけ。**
 *
 * `content/nordic.ts` の `STOP_SEQ` に、旅程の日付（発つ日・着く日）を足したもの。
 * 日付が要るのは、**島から「いまどこ」が読めない日でも越えた日を閉じる**ため
 * （`here.ts`）。旅程表そのものは渡さない——渡すと見どころ161件ぶんの JSON まで
 * 面の JS に付いてくる。
 */
export type StopSeq = { name: string; seq: number; leaveOn?: string; arriveOn?: string };

export type SayItem = {
  leg: string;
  /**
   * 道の上の位置。もう越えた日かどうかを、これで見分ける。
   *
   * 区間の問いは `ROUTE` の何本目か。**動かない日の問いは、その街そのもの**
   * なので半歩手前（`seq - 0.5`）。見分け方は `here.ts` に書いてある。
   */
  seq: number;
  /** どこからどこへ。旅程表の行と同じ字 */
  way: string;
  fork: { q: string; options: { id: string; label: string }[] };
};

export default function DaySay({
  items,
  route,
  until,
}: {
  items: SayItem[];
  route: StopSeq[];
  /** 旅が終わる日(YYYY-MM-DD)。過ぎたら、道の上の問いはぜんぶ越えている */
  until?: string;
}) {
  /* 数は6つまとめて1回で読む（`forks.ts`）ので、先頭ひとつで面の状態が分かる。
     わかれ道の無い日は `null` を渡して、何も聞きに行かせない。 */
  const first = useForkState(items[0] ? `nordic-${items[0].leg}` : null);
  /* **この面には司令塔が居ない。** `/nordic` では `TripNow` がいる場所を配るが、
     わかれ道はこちらへ移してある。ここで自分で読まないと `here` が永久に null で、
     越えた日の問いが1つも閉じない（着いた日でも票が入り続けていた）。 */
  const here = useHereAt(route, until);
  if (!items.length) return null;

  /* 見出しは、読めても読めなくても同じ位置に置く。**面の背が変わらない。** */
  const zone = (inner: React.ReactNode) => (
    <section className="panel paper" id="say">
      <h2>この日に、言う</h2>
      {inner}
    </section>
  );
  if (first.read === "wait") return zone(<Waiting />);
  /* 読めなかったとき。**「0票」でも「この日は無い」でもない。**
     押しどころは出さない——数が読めないまま押されても、返せるものが無い。 */
  if (first.read === "down")
    return zone(<ReadAgain what="みんなの答え" onRetry={reloadForks} />);

  const left = items.filter((i) => here == null || i.seq >= here.seq);
  const done = items.filter((i) => here != null && i.seq < here.seq);

  return zone(
    <>
      {left.length > 0 ? (
        <>
          <p className="muted">まだ決まっていません。押すだけでいい。</p>
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
        /* **「いま」と「きょうは」を、同じ強さで言わない**（`/nordic` と同じ分け方）。
           本人の字か島から届いた事実で押さえられている日は「もう越えました」。
           旅程の日付から引いただけの日は、分かっているのは日付だけなので
           そう言う。ヒッチハイクは乗せてもらえなければその日は進まない。 */
        <p className="muted">
          {here?.sure ? "この日は、もう越えました。" : "きょうは、この日より先です。"}
        </p>
      )}
      {done.map((i) => (
        <Answer key={i.leg} leg={i.leg} seq={i.seq} fork={i.fork} />
      ))}
    </>,
  );
}
