"use client";

import { useEffect, useState } from "react";
import { forkAnswer, rememberForkAnswer, voteFork, type ForkCounts } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { bumpFork, useFork } from "@/components/nordic/forks";

/**
 * 紙の面に置く「押すだけの問い」。
 *
 * 島の外の面は、ほとんどが読み物で終わっている。実測で、押しても何かが起きる面は
 * 106面のうち18面しかなく、残りは送りのリンクか折りたたみだけだった。
 * 字を減らして絵を大きくしても、そこは埋まらない。**その面にしかできないことを
 * 1つ置く**ところまで行かないと、島との落差は消えない。
 *
 * ここに置くのは、その1つのうち「書かずに参加できる」いちばん下の段
 * （`docs/island-play.md` 7章）。**こちらから聞く。**
 * 参加を呼びかけるボタンをいくら足しても、声をかけるのがこちら側でなければ誰も押さない。
 *
 * ## 北欧の `components/nordic/Fork.tsx` と何が同じで、何が違うか
 *
 * 入れ物（`islandPolls`）も、数を配る仕組み（`nordic/forks.ts`）も、
 * 見た目（`.fork-*`）も**同じものを使う**。同じ意味の部品を2つ持たない
 * （`docs/island-world.md` 4章）。数を配る仕組みまで写すと、
 * 同じ面に両方が出たときに同じ id を2回聞きに行く。
 *
 * 別部品にしてあるのは、あちらが旅の区間のもの（何日目か・もう越えた日か）を
 * 抱えているから。こちらは面の名前と問いしか持たない。
 *
 * ## 数が読めなくてもボタンを出す
 *
 * あちらは「数が読めないときは問いを出さない」。区間の問いは旅程表の行の中にいて、
 * そこだけ空くぶんには読み物として成立するからだ。
 * **紙の面ではそうしない。** この問いがその面の「できること」そのものなので、
 * 消すと面が読み物に戻る。押したときの返事に数が乗ってくる
 * （`voteFork` が `votes` を返す）ので、先に読めていなくても押せば数は出る。
 */

export type AskOption = { id: string; label: string };

type Props = {
  /**
   * サーバー側の名前。頭が面の名前になっていないと受け取ってもらえない
   * （`functions/src/islandApi.ts` の `FORK_ID`）。**変えない。**
   * 変えると、それまでに押された数と結びつかなくなる。
   */
  id: string;
  /** 問い。1つの面に1つだけ置く */
  q: string;
  options: AskOption[];
  /** 押したあとに出す一言。次の段（書く）への橋をここに置く */
  after?: React.ReactNode;
};

export default function Ask({ id, q, options, after }: Props) {
  const read = useFork(id);
  const [mine, setMine] = useState<string | null>(null);
  const [got, setGot] = useState<ForkCounts | null>(null);
  const [failed, setFailed] = useState(false);
  const { token } = useAuth();

  // localStorage は書き出した HTML には無いので、画面が出てから読む
  useEffect(() => {
    setMine(forkAnswer(id));
  }, [id]);

  const counts = got ?? read;
  const total = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : 0;
  /* 前に押したことは覚えているのに、数だけ読めなかった日がある
     （`/fork` が落ちていて、`localStorage` に自分の1票が残っているとき）。
     このとき 0 を並べて「いちばんに答えました」と出ていた。**数が無いなら黙る。**
     読めなかったことは、こちらの都合であって、見ている人には関係がない
     （`docs/island-design.md` 4章）。 */
  const shows = !!mine && !!counts;

  const press = async (option: string) => {
    if (mine) return;
    // 押した瞬間に数字が動く。返事を待つと、押した手応えが遅れて届く
    setMine(option);
    setFailed(false);
    bumpFork(id, option);
    try {
      const r = await voteFork(id, option, await token());
      bumpFork(id, r.mine || option, r.votes);
      setGot(r.votes);
      setMine(r.mine || option);
      rememberForkAnswer(id, r.mine || option);
    } catch {
      // 数えられなかったのに数字だけ動いていると嘘になる。押す前まで戻す
      if (read) bumpFork(id, option, read);
      setMine(null);
      setFailed(true);
    }
  };

  return (
    <div className="fork ask">
      <p className="fork-q">{q}</p>
      <ul className="fork-list">
        {options.map((o) => (
          <li key={o.id}>
            <button
              className={`fork-pick${mine === o.id ? " is-mine" : ""}`}
              onClick={() => press(o.id)}
              disabled={!!mine}
              aria-pressed={mine === o.id}
            >
              <span>{o.label}</span>
              {/* 押す前は数を出さない。先に見せると、多いほうに引っぱられる */}
              {shows && <em>{counts?.[o.id] ?? 0}</em>}
            </button>
          </li>
        ))}
      </ul>
      {mine && !failed && (
        <p className="fork-said">
          {!shows ? (
            <>答えました。</>
          ) : total > 1 ? (
            <>
              いま <b>{total}人</b> が答えています。
            </>
          ) : (
            <>いちばんに答えました。</>
          )}
          {after}
        </p>
      )}
      {failed && (
        <p className="fork-said">いま数えられませんでした。少し待ってから、もう一度どうぞ。</p>
      )}
    </div>
  );
}
