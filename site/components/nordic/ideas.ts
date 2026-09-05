import { getIdeas, type Idea } from "@/lib/api";

/**
 * 島の提案を1回だけ読んで、みんなで使い回す。
 *
 * 区間ごとの道しるべは10か所ある。それぞれが `/island-api/state` を叩くと、
 * 1ページで10回の往復になる。中身は同じ1本のリストなので、
 * 最初の1人が読んだ約束（Promise）をそのまま配る。
 *
 * 貼ったあとに他の欄へ反映する必要はない。区間はそれぞれ別の札なので、
 * 自分の欄だけが増えればいい。
 */
let pending: Promise<{ ideas: Idea[] }> | null = null;

export function allIdeas(): Promise<{ ideas: Idea[] }> {
  if (!pending) {
    pending = getIdeas().catch((e) => {
      // 失敗した約束を握り続けると、次に開いた欄も永久に失敗する。
      pending = null;
      throw e;
    });
  }
  return pending;
}

/** 区間ごとの札。`content/nordic.ts` の `Leg.id` から作る。 */
export const legTag = (id: string) => `【区間:${id}】`;
