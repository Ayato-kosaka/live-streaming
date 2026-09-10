"use client";

import { useEffect, useState } from "react";
import { getNordicLog, type NordicLogEntry } from "@/lib/api";
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
 * ## 聞きにいくのは、島でいちど（`lib/auth.tsx`）
 *
 * 前はここが自分で `POST /me` を叩いていた。日誌・目標・板・カードの
 * 4か所から呼ばれるので、面を開くたびに何本も同じことを聞いていて、
 * **細い電波では、そのうち落ちたぶんだけが「あやとではない」に化けた。**
 * 1日ぶんのページを開いたら書く欄が消えている、というのがそれ。
 *
 * いまは島でひとつの答えを見る。読めなかったときは `"unknown"` で返ってきて、
 * ここは `false`（＝道具を出さない）に落ちる。**「読めなかったから出す」には
 * しない。** 出したら、読めなかっただけの視聴者さんにあやとの道具が見える。
 * 前に読めた答えは端末が覚えているので、あやとの端末では消えない。
 */
export function useOwner(): boolean {
  return useAuth().owner === "yes";
}
