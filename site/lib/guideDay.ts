/**
 * 「この国の歩きかた」を、**その日のぶんだけ**選ぶ。
 *
 * ## なぜ、これだけで1つのファイルなのか
 *
 * 選ぶ所が2つある。島を組む側（`components/isle/spec.ts`。サーバ）と、
 * 表紙の紙の板（`components/live/GuideLink.tsx`。ブラウザ）。
 * **同じ式を2か所に書いていた**ので、片方だけ直すと、島の札と紙の板が
 * 別の国を指す。式はここに1本だけ置いて、両方がこれを呼ぶ。
 *
 * `spec.ts` に置かないのは、あちらを `"use client"` の部品から読むと
 * 島の材料（配信の一覧・伝説・国の表）が丸ごと束に入るから。
 * **ここは何も import しない。**
 */

/** 案内が当たる期間。**手で書かない**——国の表から導く（`spec.ts` の `guidesOf`） */
export type GuideSpan = {
  /** その国に入った日（JST の `YYYY-MM-DD`、その日を含む） */
  from: string;
  /** その国に居た最後の日（その日を含む）。まだ居れば無い */
  to?: string;
};

/** JST のその日（`YYYY-MM-DD`）。**ブラウザの時間帯で切らない**——
    日本の夜に見ている人と、現地（UTC+2）で見ているあやとで、入れ替わる日が1日ずれる */
export const guideDay = (d: Date) =>
  new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10);

/**
 * その日に当たる案内。**無ければ `null`。**
 *
 * 「いつでも当たる行」は無い。前は期間を書かない行が受け皿になっていて、
 * 滞在の期間が過ぎた日に**もう居ない国**の案内へ戻っていた。
 * どの行にも当たらない日は、案内を出さないのが本当のこと。
 */
export function guideOn<T extends GuideSpan>(items: readonly T[], on: Date): T | null {
  const day = guideDay(on);
  return items.find((g) => g.from <= day && (!g.to || day <= g.to)) ?? null;
}
