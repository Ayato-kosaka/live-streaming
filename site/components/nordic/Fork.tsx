"use client";

import { useEffect, useState } from "react";
import { forkAnswer, rememberForkAnswer, voteFork } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Leg } from "@/content/nordic";
import { bumpFork, useFork } from "./forks";
import { useHereSeq } from "./here";

/**
 * わかれ道。**押すだけで答えられる、参加のいちばん下の段。**
 *
 * 道しるべの席には、これまで「文章を書く」しか入口が無かった。
 * 書くのは重い。年間コメントした人は1,821人、投げ銭したことがある人は55人（3%）で、
 * 残りの97%に用意してあるのが作文だけなら、席が2つあるとは言えない
 * （`docs/nordic-fund.md` 2.1）。
 *
 * **こちらから問いを出す。** 参加を呼びかけるボタンをいくら増やしても、
 * 声をかけるのがこちら側でなければ誰も押さない
 * （`docs/island-play.md` 「世界のほうが先に口を開く」）。
 *
 * ここで決まるのは**旅の中身**で、足代では何も決まらない。
 * お金の席が主で言葉の席が従、という順にしないための重石でもある。
 *
 * 移してこなかったもの:
 *   - 押した数の順位表を作らない。並ぶのは選択肢2つだけで、人は並ばない
 *   - 押した人の名前を出さない。名前が出るのは、自分で名乗って書いた道しるべだけ
 *   - 押せる回数を日ごとに配らない。1つのわかれ道に1人1票、それきり
 */

/**
 * サーバー側の名前。`nordic-` で始まる id しか受け取らない
 * （`functions/src/islandApi.ts`）。区間の id をそのまま使うので、
 * 押された数と区間が1対1で結びつく。**変えない。**
 *
 * `content/nordic.ts` に置かないのは、あちらを読み込むと
 * 見どころ161件ぶんの JSON がブラウザに落ちてくるため。
 */
const forkId = (legId: string) => `nordic-${legId}`;

/** 押したあとの見え方。押す前は数を出さない（多いほうに引っぱられる）。 */
type Sent = "none" | "sending" | "failed";

export default function Fork({
  leg,
  seq,
  fork,
  logged,
}: {
  leg: string;
  /** `ROUTE` の中での位置 */
  seq: number;
  fork: NonNullable<Leg["fork"]>;
  /** 起きたことが書かれた区間か */
  logged?: boolean;
}) {
  const id = forkId(leg);
  const counts = useFork(id);
  const here = useHereSeq();
  /* もう越えた区間。**位置で決める。** 起きたことの手書き（`NORDIC_LOG`）を
     待つと、着いた日から数日、決まったことに票が入り続ける。 */
  const done = !!logged || (here != null && seq < here);
  const [mine, setMine] = useState<string | null>(null);
  const [sent, setSent] = useState<Sent>("none");
  const { token } = useAuth();

  // localStorage は書き出した HTML には無いので、画面が出てから読む。
  useEffect(() => {
    setMine(forkAnswer(id));
  }, [id]);

  // 数が読めないときは、わかれ道そのものを出さない。
  // ボタンだけ出して押されても、返せるものが何も無い。
  if (counts === null) return null;

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const press = async (option: string) => {
    if (mine || sent === "sending" || done) return;
    // 押した瞬間に数字が動く。返事を待つと、押した手応えが遅れて届く
    setMine(option);
    setSent("sending");
    bumpFork(id, option);
    try {
      const r = await voteFork(id, option, await token());
      bumpFork(id, r.mine || option, r.votes);
      setMine(r.mine || option);
      rememberForkAnswer(id, r.mine || option);
      setSent("none");
    } catch (e) {
      // 数えられなかったのに数字だけ動いていると嘘になる。押す前まで戻す
      bumpFork(id, option, counts);
      setMine(null);
      setSent("failed");
      if (String(e).includes("429")) setSent("failed");
    }
  };

  // 越えた区間。もう押せない。押された数だけが残る
  if (done) {
    const top = [...Object.entries(counts)].sort((a, b) => b[1] - a[1]);
    const said = top[0] && (!top[1] || top[0][1] > top[1][1]) ? top[0][0] : null;
    const label = fork.options.find((o) => o.id === said)?.label;
    return (
      <p className="fork-was">
        {label ?
          <>
            この分かれ目で、みんなが押したのは <b>{label}</b> でした
          </> :
          <>この分かれ目は、押した数が同じでした</>}
      </p>
    );
  }

  return (
    <div className={`fork${mine ? " is-said" : ""}`}>
      <p className="fork-q">{fork.q}</p>
      <ul className="fork-list">
        {fork.options.map((o) => (
          <li key={o.id}>
            <button
              className={`fork-pick${mine === o.id ? " is-mine" : ""}`}
              onClick={() => press(o.id)}
              disabled={!!mine}
              aria-pressed={mine === o.id}
            >
              <span>{o.label}</span>
              {/* 押す前は数を出さない。先に見せると、多いほうに引っぱられる */}
              {mine && <em>{counts[o.id] ?? 0}</em>}
            </button>
          </li>
        ))}
      </ul>
      {/* 押したあとに、次の段（書く）への橋を1本。
          押した直後がいちばん気分の乗っている瞬間（`docs/island-play.md` 仕掛け3）。 */}
      {mine && sent !== "failed" && (
        <p className="fork-said">
          {total > 1 ?
            <>
              いま <b>{total}人</b> が、この分かれ目を押しています。
            </> :
            <>いちばんに押しました。</>}
          理由も書けます。
        </p>
      )}
      {sent === "failed" && (
        <p className="fork-said">
          いま数えられませんでした。少し待ってから、もう一度どうぞ。
        </p>
      )}
    </div>
  );
}
