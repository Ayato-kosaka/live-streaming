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
 * **読めなくても何も出さない。** 書いてあるはずのものが出ないのは残念だが、
 * 「読めませんでした」の箱が旅程表に9個並ぶほうが悪い。
 */
let cache: Promise<NordicLogEntry[]> | null = null;

export function loadNordicLog(): Promise<NordicLogEntry[]> {
  if (!cache) cache = getNordicLog().then((r) => r?.log ?? []).catch(() => []);
  return cache;
}

/** 書いたあとに、持ち回している約束のほうも入れ替える。取り直しに行かせない。 */
export function putNordicLog(e: NordicLogEntry) {
  const now = loadNordicLog();
  cache = now.then((list) => [...list.filter((x) => x.day !== e.day), e]);
}

export function dropNordicLog(day: string) {
  const now = loadNordicLog();
  cache = now.then((list) => list.filter((x) => x.day !== day));
}

/**
 * 書き出しの見本。
 *
 * 空の欄と「入れる」だけ置いても、疲れて宿に着いた人は何も書けない。
 * **この旅で毎日起きることだけを並べる。** 何回断られたか、誰が停まって
 * くれたか、どこで寝たか。順位でも点数でもない、その日そこにあった事実。
 *
 * 1日ぶんのページ（`DayLog`）と、じぶんのこと（`/me` の旅の道具）の
 * 両方が同じものを出す。**書く場所が2つあっても、書き出しは1つ。**
 */
export const LOG_SEEDS = [
  "何台目で停まってくれた：",
  "乗せてくれたのは：",
  "泊まったのは：",
  "食べたのは：",
  "いちばん驚いたのは：",
];

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
