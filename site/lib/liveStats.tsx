"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
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
 *
 * ## 落ちた結果も控えるが、**押されたときだけ捨てる**
 *
 * 前はここが `getState().catch(() => null)` を控えるだけだったので、
 * **最初の1回が落ちると、その面を閉じるまで二度と読みに行かなかった。**
 * 「もう一度よみこむ」を押しても同じ `null` が返るので、押すと必ず元に戻る
 * （`components/home/Latest.tsx`。押しどころが効かないのは、押しどころが
 * 無いのより悪い）。
 *
 * かといって、落ちるたびに勝手に読み直す作りにはしない。口が落ちている
 * あいだじゅう、10か所から叩き続けることになる。だから
 *
 * - **読めた結果は、いままでどおり使い回す**（捨てない）
 * - **落ちた結果も控える**ので、ひとりでには叩き直さない
 * - **`reloadState()` が呼ばれたときだけ**、落ちた控えを捨てて読み直す
 *
 * 読めた結果を捨てないのは、島に立つ人がここの数から選ばれているため。
 * 途中で入れ替えると、住人が目の前で入れ替わる。
 */
let cache: Promise<IslandState | null> | null = null;
/**
 * 直前の読みが「落ちた」で確定しているか。
 *
 * **読みに行っている最中は false。** ここを「読めていない」で持つと、
 * 返事を待っているあいだに押された1回が、もう1本の `/state` になる。
 */
let down = false;

const load = () => {
  if (!cache) {
    cache = getState().then(
      (s) => {
        down = false;
        return s;
      },
      () => {
        down = true;
        return null;
      },
    );
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

/** 読み直しが届いた回数。面の側はこれが変わったら読み直す */
let gen = 0;
const subs = new Set<() => void>();
const subscribe = (f: () => void) => {
  subs.add(f);
  return () => {
    subs.delete(f);
  };
};

/**
 * 落ちたぶんだけ、もう一度読みに行く。**押されたときだけ呼ぶ。**
 *
 * - 読めているときは、控えをそのまま返す（**読めたものは捨てない**）
 * - 読みに行っている最中も、その約束を返す（二重に叩かない）
 * - 落ちて確定しているときだけ、控えを捨てて読み直す
 *
 * 届いたら、同じ便りを見ている面（数字・住人の名前）にも知らせる。
 * 押した面だけが直って、隣の数字が古いまま残ると、同じ面の中で
 * 言うことが割れる。
 */
export function reloadState(): Promise<IslandState | null> {
  if (!down) return load();
  cache = null;
  down = false;
  const p = load();
  void p.then((s) => {
    if (!s) return;
    gen += 1;
    for (const f of [...subs]) f();
  });
  return p;
}

/**
 * 読み直しが届いたことを受け取る番号。
 *
 * 焼いた HTML には読み直しなど無いので、サーバー側は必ず 0。
 * ここが変わった面だけが、`loadState()` を引き直す。
 */
function useStateGen(): number {
  return useSyncExternalStore(
    subscribe,
    () => gen,
    () => 0,
  );
}

export type StatKey = keyof typeof STATS_FALLBACK | "activeFriends";

/** 焼き込みの値をまず返し、最新値が取れたら差し替える。 */
export function useLiveStats(): IslandStats {
  const [stats, setStats] = useState<Partial<IslandStats> | null>(null);
  /* 読み直しが届いたら引き直す。押した面（`Latest`）だけが新しくなって、
     すぐ上の数字が焼き込みのままだと、同じ面が2つの日付を言うことになる */
  const gen = useStateGen();
  useEffect(() => {
    let alive = true;
    load().then((s) => {
      if (alive && s?.stats) setStats(s.stats);
    });
    return () => {
      alive = false;
    };
  }, [gen]);
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
  const gen = useStateGen();
  useEffect(() => {
    let alive = true;
    load().then((s) => {
      const v = s?.stats ? (s.stats as Record<string, unknown>)[statKey] : undefined;
      if (alive && typeof v === "number") setN(v);
    });
    return () => {
      alive = false;
    };
  }, [statKey, gen]);
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
  const gen = useStateGen();
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
  }, [gen]);
  return m;
}
