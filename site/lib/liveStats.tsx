"use client";

import { useEffect, useState } from "react";
import { RESIDENTS } from "@/content/residents";
import { getState, type IslandState, type IslandStats, type ResidentShow } from "@/lib/api";
import { STATS_FALLBACK } from "@/content/site";

/**
 * サイトに出す数字を、Firestore の最新値に差し替える。
 *
 * 数字は毎日 BigQuery から集計して Firestore に入っているが、
 * 静的書き出しのページはビルド時の値を焼き込んでいるので、
 * そのままだと配信を何本やっても表示が増えない。
 * ここで一度だけ読みに行って、読めたら上書きする。
 *
 * 読み込みは1回だけ。ページを移っても同じ結果を使い回す。
 */
let cache: Promise<IslandState | null> | null = null;

const load = () => {
  if (!cache) {
    cache = getState().catch(() => null);
  }
  return cache;
};

/**
 * `/state` を1回だけ取ってきて、みんなで使い回す。
 *
 * 「いま島にいる人」（`lib/here.ts`）も、誰なのかを引くのにこれが要る。
 * 島の数字と同じものなので、別に取りにいかせない。
 */
export const loadState = load;

export type StatKey = keyof typeof STATS_FALLBACK | "activeFriends";

/** 焼き込みの値をまず返し、最新値が取れたら差し替える。 */
export function useLiveStats(): IslandStats {
  const [stats, setStats] = useState<Partial<IslandStats> | null>(null);
  useEffect(() => {
    let alive = true;
    load().then((s) => {
      if (alive && s?.stats) setStats(s.stats);
    });
    return () => {
      alive = false;
    };
  }, []);
  return { ...(STATS_FALLBACK as IslandStats), ...(stats ?? {}) };
}

/**
 * 数字ひとつ。サーバ側では焼き込みの値を出しておき、
 * 最新値が取れたら静かに差し替える。
 */
export function LiveNumber({
  statKey,
  fallback,
  format = (n) => n.toLocaleString(),
}: {
  statKey: StatKey;
  /** 最新値が読めないときに出す値 */
  fallback: number;
  format?: (n: number) => string;
}) {
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    load().then((s) => {
      const v = s?.stats ? (s.stats as Record<string, unknown>)[statKey] : undefined;
      if (alive && typeof v === "number") setN(v);
    });
    return () => {
      alive = false;
    };
  }, [statKey]);
  return <>{format(n ?? fallback)}</>;
}

/**
 * 名前を出すと決めた住人の一覧。**鍵はキャラクターの絵**。
 * 出すか出さないかは本人が決めるので、ここに載る人は少ない。
 *
 * サーバーは YouTube のチャンネルで返してくる。どの絵が誰のものかを決めるのは
 * あやとの表（`content/residents.ts` に焼いてある `channel`）だけで、
 * ログインした人が自分で絵を選ぶことはできない。他人の絵を自分のものに
 * できてしまうため。表に無いチャンネルの人は、名前が出ないまま島にいる。
 */
export function useResidentShow(): Map<string, ResidentShow> {
  const [m, setM] = useState<Map<string, ResidentShow>>(() => new Map());
  useEffect(() => {
    let alive = true;
    load().then((s) => {
      if (!alive || !s?.residents?.length) return;
      const iconOf = new Map(
        RESIDENTS.filter((r) => r.icon && r.channel).map((r) => [r.channel!, r.icon!]),
      );
      const next = new Map<string, ResidentShow>();
      for (const r of s.residents) {
        const icon = r.channelId && iconOf.get(r.channelId);
        if (icon) next.set(icon, r);
      }
      setM(next);
    });
    return () => {
      alive = false;
    };
  }, []);
  return m;
}
