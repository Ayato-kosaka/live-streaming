import { useEffect, useState } from "react";

/**
 * 連れていってもらった合計を、1回だけ読む。
 *
 * Doneru の金額は自動で取れる（`functions/src/doneruAmount.ts` が本番にある）ので、
 * あやとが毎日入力する運用は作らない。ただし goal key を静的書き出しのページに
 * 焼き込みたくないので、ブラウザからは Doneru を直接叩かず `/island-api/fund` を読む
 * （`docs/nordic-fund.md` 提案5）。
 *
 * **読めなかったら、足代の数字をどこにも出さない。**
 * 0円と出すのがいちばん悪い。誰も出していないように見える。
 * だから 0 以下や数字でないものは「読めなかった」と同じ扱いにして null を返す。
 *
 * ページに区間カードは10枚ある。10回読みに行かないよう、最初の1人が読んだ約束を配る
 * （`ideas.ts` と同じ作り）。
 */

export type Fund = {
  /**
   * 目標に対して、いまどこまで来ているか（円）。
   *
   * **配信の豚の貯金箱と同じ数字**（あやとの指示 2026-09-05「貯金箱と仕様は
   * 合わせる」）。`startAmount + superChatAmount + doneruAmount` で、
   * startAmount はこの企画の起点なので**負の数が入っている**。
   *
   * **画面に出すのはこれ。** 一度 `given` を出していて、貯金箱の 37,800円 の横で
   * サイトが 287,446円 と言っていた（あやとの指摘 2026-09-06）。
   * 同じものを指す数字が2つあるほうが、どちらが正しいかより害が大きい。
   */
  total: number;
  /**
   * 人が実際に出した額（円）。起点のマイナスを含まない。
   *
   * **いま画面には出していない。** 消さずに残してあるのは、月末の集計や
   * 「この企画で人がいくら出したか」を後から知りたくなるため。
   * **画面に出すときは、貯金箱と食い違うことを承知のうえで出すこと。**
   */
  given: number;
  /** 目標額（円）。GAS の targetAmount。読めなければ 0 */
  goal: number;
  /**
   * 出したことがある人の数。延べではなく人数。
   *
   * **画面には出さない**（あやとの指示 2026-09-06「何人かは出なくて良い」）。
   * 額と並べると割り算されて「1人あたりいくら」が読めてしまう。
   */
  people: number;
  /**
   * Doneru のぶんが、いつまで入っているか（"2026-09-12"）。#294
   *
   * **ふだんは null。** 口（`GET /island-api/fund`）は、取り込みが何日か
   * 止まっているときだけこの欄を足して返す。だから画面は「あったら出す」でよく、
   * 何日で止まっていると見なすかを知らなくていい（決めているのは
   * `functions/src/islandApi.ts` の `DONERU_STALE_DAYS` ひとつ）。
   *
   * **分からないときも null。** 取り込みの記録が読めなかった日に
   * 「止まっています」と出すと、それ自体が嘘になる。倒れる方向は黙る側へ。
   */
  asOf: string | null;
};

let pending: Promise<Fund | null> | null = null;

function load(): Promise<Fund | null> {
  if (!pending) {
    pending = fetch("/island-api/fund")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const total = Number(j?.total);
        if (!Number.isFinite(total) || total <= 0) return null;
        const num = (v: unknown) => {
          const n = Number(v);
          return Number.isFinite(n) && n > 0 ? n : 0;
        };
        /* 日付の形になっているものだけ通す。**画面に出る字なので、
           来たものをそのまま並べない。** 古い口はこの欄を返さないので、
           そのときは null になって、今までどおりの見た目になる。 */
        const asOf = String(j?.doneruAsOf ?? "");
        return {
          total,
          // given が来ないうちは total に落ちる（古い API を読んだとき）
          given: num(j?.given) || total,
          goal: num(j?.goal),
          people: num(j?.people),
          asOf: /^\d{4}-\d{2}-\d{2}$/.test(asOf) ? asOf : null,
        };
      })
      .catch(() => null);
  }
  return pending;
}

/** 読めるまでは null。読めなくても null のまま（例外を投げない）。 */
export function useFund(): Fund | null {
  const [f, setF] = useState<Fund | null>(null);
  useEffect(() => {
    let alive = true;
    load().then((v) => {
      if (alive) setF(v);
    });
    return () => {
      alive = false;
    };
  }, []);
  return f;
}
