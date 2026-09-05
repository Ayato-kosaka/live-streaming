"use client";

import { useEffect, useState } from "react";
import { forkAnswer, rememberForkAnswer, voteFork } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Leg } from "@/content/nordic";
import { bumpFork, useFork } from "./forks";
import { useHereSeq } from "./here";

/**
 * まだ決めていないことに、押すだけで答えてもらう。
 *
 * この旅で参加できる形は、長いあいだ「文章を書く」だけだった。
 * 年間コメントした人は1,821人、投げ銭したことがある人は55人（3%）。
 * 残りの97%に用意してあるのが作文だけでは、入口が1つしかないのと同じ
 * （`docs/nordic-fund.md` 2.1）。
 *
 * **こちらから聞く。** 参加を呼びかけるボタンをいくら増やしても、
 * 声をかけるのがこちら側でなければ誰も押さない
 * （`docs/island-play.md` 「世界のほうが先に口を開く」）。
 *
 * 画面に出る言葉は「まだ決めていないこと」だけにしてある。
 * **説明の要る言い方を発明しない。** 押すのは無料で、お金とは何も結んでいない。
 *
 * やらないこと:
 *   - 押した数の順位表を作らない。並ぶのは選択肢2つだけで、人は並ばない
 *   - 押した人の名前を出さない。名前が出るのは、自分で名乗って書いた提案だけ
 *   - 押せる回数を日ごとに配らない。1つの問いに1人1票、それきり
 *   - 「押した数のとおりにする」とは書かない。天気でも車でもひっくり返る
 */

/**
 * サーバー側の名前。`nordic-` で始まる id しか受け取らない
 * （`functions/src/islandApi.ts`）。区間の id をそのまま使うので、
 * 押された数とその日が1対1で結びつく。**変えない。**
 *
 * `content/nordic.ts` に置かないのは、あちらを読み込むと
 * 見どころ161件ぶんの JSON がブラウザに落ちてくるため。
 */
const forkId = (legId: string) => `nordic-${legId}`;

type Props = {
  leg: string;
  /** `ROUTE` の中での位置。もう越えた日かどうかを、ここで見分ける */
  seq: number;
  fork: NonNullable<Leg["fork"]>;
  /**
   * 何日目の話か（「2日目」「出発」「リガのあと」）。
   * 数字が入っていない日もあるので、文字で受け取る。
   */
  when?: string;
  /** どこからどこへ。旅程表の行と同じ字にする */
  way?: string;
};

/** もう越えた日か。位置で決める。手書きの日記を待つと、決まったことに票が入り続ける。 */
function usePassed(seq: number) {
  const here = useHereSeq();
  return here != null && seq < here;
}

/** いちばん多く押されたもの。同じ数なら null。 */
function top(counts: Record<string, number>) {
  const s = [...Object.entries(counts)].sort((a, b) => b[1] - a[1]);
  return s[0] && (!s[1] || s[0][1] > s[1][1]) ? s[0][0] : null;
}

/** まだ決めていないこと。押せる。越えた日と、数が読めないときは出さない。 */
export function Ask({ leg, seq, fork, when, way }: Props) {
  const id = forkId(leg);
  const counts = useFork(id);
  const passed = usePassed(seq);
  const [mine, setMine] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const { token } = useAuth();

  // localStorage は書き出した HTML には無いので、画面が出てから読む。
  useEffect(() => {
    setMine(forkAnswer(id));
  }, [id]);

  // 数が読めないときは、問いそのものを出さない。
  // ボタンだけ出して押されても、返せるものが何も無い。
  if (counts === null || passed) return null;

  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  const press = async (option: string) => {
    if (mine) return;
    // 押した瞬間に数字が動く。返事を待つと、押した手応えが遅れて届く
    setMine(option);
    setFailed(false);
    bumpFork(id, option);
    try {
      const r = await voteFork(id, option, await token());
      bumpFork(id, r.mine || option, r.votes);
      setMine(r.mine || option);
      rememberForkAnswer(id, r.mine || option);
    } catch {
      // 数えられなかったのに数字だけ動いていると嘘になる。押す前まで戻す
      bumpFork(id, option, counts);
      setMine(null);
      setFailed(true);
    }
  };

  return (
    <div className="fork">
      {/* **問いの上に、どこの話かを置く。**
          「始発まで、空港で数時間あります」だけが並んでいたころ、
          オーナーに「何のこと？ ってなる」と止められた。
          何日目・どこからどこへ、は旅程表の行と同じ字を使う。
          手で書くと、旅程が変わったときにこちらだけ古い字が残る。 */}
      {(when || way) && (
        <p className="fork-where">
          {when && <b className="fork-day">{when}</b>}
          {way}
        </p>
      )}
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
      {mine && !failed && (
        <p className="fork-said">
          {total > 1 ? (
            <>
              いま <b>{total}人</b> が答えています。
            </>
          ) : (
            <>いちばんに答えました。</>
          )}
          くわしくは、下に書けます。
        </p>
      )}
      {failed && (
        <p className="fork-said">いま数えられませんでした。少し待ってから、もう一度どうぞ。</p>
      )}
    </div>
  );
}

/** 越えた日に残る答え。旅程表の、その日の行に置く。 */
export function Answer({ leg, seq, fork }: Props) {
  const counts = useFork(forkId(leg));
  const passed = usePassed(seq);
  if (!passed || counts === null) return null;
  const label = fork.options.find((o) => o.id === top(counts))?.label;
  return (
    <p className="fork-was">
      {label ? (
        <>
          聞いてみたら、いちばん多かったのは <b>{label}</b> でした
        </>
      ) : (
        <>聞いてみたら、答えは半分に割れました</>
      )}
    </p>
  );
}
