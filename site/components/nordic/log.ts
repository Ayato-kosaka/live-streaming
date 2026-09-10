"use client";

import { useEffect, useState } from "react";
import { getNordicLog, type NordicLogEntry } from "@/lib/api";
import { amIOwner } from "@/lib/api";
import { useAuth } from "@/lib/auth";

/**
 * 旅の「その日に起きたこと」を、1回だけ取ってきて配る。
 *
 * 読むところが3つある（1日ぶんのページ・旅程表の行の印・旅の面の入口）。
 * 面ごとに叩くと、9日ぶんのページを行き来するだけで往復が増える。
 * `lib/liveStats` の `loadState` と同じ作りで、約束を1つ持ち回す。
 *
 * **読むだけ。** 入れるのは「管理スクリプトを実行」の `nordic_log`
 * （`python/admin/nordic_log.py`）で、画面からは書かない。
 * 入れ替えの仕掛けを持たないので、書いた直後の取り直しも要らない。
 *
 * **読めなくても何も出さない。** 書いてあるはずのものが出ないのは残念だが、
 * 「読めませんでした」の箱が旅程表に9個並ぶほうが悪い。
 */
let cache: Promise<NordicLogEntry[]> | null = null;

export function loadNordicLog(): Promise<NordicLogEntry[]> {
  if (!cache) cache = getNordicLog().then((r) => r?.log ?? []).catch(() => []);
  return cache;
}

/** 旅ぜんぶぶん。旅程表の行に印を付けるのに使う。 */
export function useNordicLog(): NordicLogEntry[] | null {
  const [log, setLog] = useState<NordicLogEntry[] | null>(null);
  useEffect(() => {
    let alive = true;
    loadNordicLog().then((l) => {
      if (alive) setLog(l);
    });
    return () => {
      alive = false;
    };
  }, []);
  return log;
}

/**
 * いま入っているのがあやとか。
 *
 * 出るのは**道具を出すかどうか**だけ。実際に書けるかは書く先の口が
 * もう一度見ているので、ここを騙しても何も書けない
 * （`functions/src/islandApi.ts` の `ownerUid`）。
 *
 * ログインしていない人には聞きにいかない。ほとんどの人はログインしない。
 */
export function useOwner(): boolean {
  const [owner, setOwner] = useState(false);
  const { user, token } = useAuth();
  useEffect(() => {
    if (!user) {
      setOwner(false);
      return;
    }
    let gone = false;
    (async () => {
      const t = await token();
      if (!t || gone) return;
      const yes = await amIOwner(t);
      if (!gone) setOwner(yes);
    })();
    return () => {
      gone = true;
    };
  }, [user, token]);
  return owner;
}
