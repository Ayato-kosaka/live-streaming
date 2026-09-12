import type { ReactNode } from "react";

/**
 * 旅程表の文の中で `**…**` で囲まれたところを、太字にして返す。
 *
 * `content/nordic.ts` を書いている人は、**その一文がいちばん大事だから**囲んでいる
 * （「歩けない」「この日がいちばん長い」「05:15 を過ぎると乗れない」）。
 * 囲みをそのまま焼くと、読む人には `**9.3km。歩けない。**` と記号ごと見える。
 *
 * **消すのは直し方として弱い。** 記号は消えるが、囲んだ理由——そこがいちばん
 * 大事だということ——も一緒に消える。この面はもう `<b>` を使っている
 * （`<b>{day.start.from}</b> から`、`起きる <b>{day.wake}</b>`）ので、
 * そこへ寄せる。
 *
 * ## ここはサーバで描き切る
 *
 * `"use client"` を付けない。旅の面は静的書き出しで、字を組み替えるだけの仕事に
 * ブラウザの JS は要らない（`DailyFood.tsx` / `AskCopy.tsx` と同じ分け方）。
 *
 * `dangerouslySetInnerHTML` も使わない。旅程表の文には `<` や `&` が入りうるし、
 * いつか視聴者さんの書いた文がここへ来ても壊れないほうがいい。
 * 文字列を割って、間に `<b>` を挟んだ配列を返す。
 *
 * ## 閉じていない `**` は、そのまま字として出す
 *
 * 割った数が合わないときは、何もせず元の文を返す。書き間違いで面が落ちるより、
 * 記号が1つ見えているほうがずっとまし。
 */
export function strong(t: string): ReactNode {
  const parts = t.split("**");
  // 割った数が偶数 ＝ `**` が奇数個 ＝ どこかが閉じていない。素通しで返す。
  if (parts.length % 2 === 0) return t;
  return parts.map((s, i) =>
    i % 2 === 1 ? (
      <b key={i} className="nstrong">
        {s}
      </b>
    ) : (
      s
    ),
  );
}

export default function Strong({ t }: { t: string }) {
  return <>{strong(t)}</>;
}
