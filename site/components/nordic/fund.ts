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
  /** 合計（円）。スパチャは満額で数える。OBS の半額換算は真似しない */
  total: number;
  /** 出したことがある人の数。延べではなく人数。金額は誰のぶんも出さない */
  people: number;
};

let pending: Promise<Fund | null> | null = null;

function load(): Promise<Fund | null> {
  if (!pending) {
    pending = fetch("/island-api/fund")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const total = Number(j?.total);
        if (!Number.isFinite(total) || total <= 0) return null;
        const people = Number(j?.people);
        return { total, people: Number.isFinite(people) && people > 0 ? people : 0 };
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
