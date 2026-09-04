"use client";

import { useEffect, useState } from "react";
import { getState, type IslandStats } from "@/lib/api";
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
let cache: Promise<Partial<IslandStats> | null> | null = null;

const load = () => {
  if (!cache) {
    cache = getState()
      .then((s) => s.stats ?? null)
      .catch(() => null);
  }
  return cache;
};

export type StatKey = keyof typeof STATS_FALLBACK | "activeFriends";

/** 焼き込みの値をまず返し、最新値が取れたら差し替える。 */
export function useLiveStats(): IslandStats {
  const [stats, setStats] = useState<Partial<IslandStats> | null>(null);
  useEffect(() => {
    let alive = true;
    load().then((s) => {
      if (alive && s) setStats(s);
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
      const v = s ? (s as Record<string, unknown>)[statKey] : undefined;
      if (alive && typeof v === "number") setN(v);
    });
    return () => {
      alive = false;
    };
  }, [statKey]);
  return <>{format(n ?? fallback)}</>;
}
