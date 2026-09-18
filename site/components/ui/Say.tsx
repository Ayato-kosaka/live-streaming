"use client";

import { useEffect, useState } from "react";
import { CHAPTERS } from "@/content/chapters";
import { marked, said } from "@/content/nights";

/**
 * 旅のあいだだけ言い方の変わる文を、**画面が出てから**差し込む。
 *
 * 静的書き出し（`output: "export"`）なので、ここを焼くと出発の日から
 * 17日間ずっと「毎晩22時」と言い続ける。旅の途中は電波の細いところを通るので、
 * 誰も直しに来られない。だから**焼いた HTML に時刻を入れない。**
 *
 * 印（`content/voice.ts` の `say`）の付いていない文は、そのまま焼いて出す。
 * 印の付いた文だけが、画面の出るまでのあいだ空白になる。改行しない空白を置くのは、
 * 1行ぶんの高さを保って、差し込んだ瞬間に行が跳ねないようにするため。
 *
 * **1行ぶんで足りるのは、1行に収まる文だけ。** 長い文は差し込んだ瞬間に
 * 2行3行へ折れて背が伸びる。そこは `SayRoom` で先に場所を取る。
 */
export default function Say({ t }: { t: string }) {
  // サーバ側と、画面が出た最初の1回は同じものを返す（水あわせを崩さない）
  const [s, setS] = useState(() => (marked(t) ? "\u00a0" : t));
  useEffect(() => setS(said(t, new Date())), [t]);
  return <>{s}</>;
}

/**
 * 印の付いた文が**取りうる言い方**を、重複なく全部。
 *
 * 言い方の分かれ目は「時刻を言えない章（`content/chapters.ts` の `looseStart`）の
 * 中に居るか」だけなので、**章の変わり目を1時間過ぎた時刻**と、どの章にも
 * 入らない時刻（1970年）で `said` を引けば、出うるものが全部そろう。
 * 章が増えても、ここは書き足さなくてよい。
 *
 * **字を決めるためには使わない。** どの言い方をいま出すかは今までどおり
 * `said(t, new Date())` が決める（`docs/island-misses.md` #143）。
 * ここで集めるのは、**場所をいくつ取るか**を決めるためだけのもの。
 */
const WHEN: Date[] = [
  new Date(0),
  ...CHAPTERS.flatMap((c) => [c.opensAt, c.from ? `${c.from}T00:00:00+09:00` : ""])
    .map((s) => (s ? Date.parse(s) : NaN))
    .filter((t) => Number.isFinite(t))
    .map((t) => new Date(t + 3_600_000)),
];

function ways(t: string): string[] {
  if (!marked(t)) return [t];
  return [...new Set(WHEN.map((d) => said(t, d)))];
}

/**
 * 印の付いた文を、**背の動かない箱**に入れて出す。
 *
 * `Say` は焼いた HTML に空白1文字しか置かない。1行に収まる文ならそれで足りるが、
 * 折り返す文は差し込んだ瞬間に背が伸びて、下にあるものが全部ずれる
 * （`docs/island-misses.md` #146）。島の足もとの一行がこれで、
 * **131面ぜんぶ**が幅390で 21.59 → 43.19px、幅320で 21.59 → 64.78px 伸びていた。
 *
 * 取りかたは `#146` の `.tnow-ghost`・`#535` の `.nx-ghost` と同じで、
 * **出たあとと同じ形の写しを置く。** ただしここは写しが1つでは足りない。
 * 出うる言い方が2つあって、**どちらが来るかは読む日で変わる**（#143）。
 * 高さを px や行数で書くと、**どこで折れるかは幅で変わる**ので
 * 幅ごとに数を持つことになり、文を1文字直した日に黙ってずれる。
 *
 * だから**出うる言い方を全部、同じ1マスに重ねて置く**（`.sayroom`）。
 * マスの背はいちばん高いものが決めるので、どの幅でも、どの言い方が来ても、
 * 先に取った場所のほうが必ず広い。**幅の境目を1つも持たなくてよい。**
 *
 * 写しは `visibility: hidden` なので、読み上げにも選択にも出ない。
 */
export function SayRoom({
  t,
  className,
  as: As = "p",
}: {
  t: string;
  className?: string;
  /**
   * 器の名前。**既に器のある中へ入れるときは `span`。**
   *
   * 前置き（`PageHead` の `<p class="phead-lead">`）や章の見出し（`Chapter` の
   * `<h2>`）は、**器のほうを直せない**——`components/ui/PageShell.tsx` と
   * `components/home/Chapter.tsx` が持っていて、呼ぶ側からは中身しか渡せない。
   * そこへ `<p>` を置くと、`<p>` の中に `<p>` が来てブラウザが器を割る。
   *
   * `span` でも場所の取り方は変わらない。`.sayroom` は `display: grid` なので、
   * `span` でも外の器いっぱいの1マスになり、背はいちばん高い写しが決める。
   */
  as?: "p" | "span";
}) {
  return (
    <As className={className ? `sayroom ${className}` : "sayroom"}>
      <span>
        <Say t={t} />
      </span>
      {ways(t).map((w) => (
        <span key={w} className="sayroom-ghost" aria-hidden>
          {w}
        </span>
      ))}
    </As>
  );
}
