"use client";

import { useCallback, useSyncExternalStore } from "react";
import { getNordicLog, type NordicLogEntry } from "@/lib/api";
import { useAuth, withRead, type Read } from "@/lib/auth";

/**
 * 旅の「その日に起きたこと」を、1回だけ取ってきて配る。
 *
 * 読むところが2つある（1日ぶんのページ・旅程表の行の印）。
 * 面ごとに叩くと、9日ぶんのページを行き来するだけで往復が増える。
 * 最初のひとりが読んだ結果を全員で使い回す（`forks.ts` と同じ作り）。
 *
 * **読むだけ。** 入れるのは「管理スクリプトを実行」の `nordic_log`
 * （`python/admin/nordic_log.py`）で、画面からは書かない（2026-09-10 に
 * 書く欄を外した。`docs/nordic-depart.md` 2章）。
 *
 * ## 「読んでいる最中」と「読めなかった」を混ぜない（#34 #36）
 *
 * ここは長いあいだ `catch(() => [])` だった。**空の配列は「読めた上で、
 * まだ1日も書かれていない」のことば**で、届かなかった日に言ってよい嘘ではない。
 * そのせいで、
 *
 *   - 1日ぶんのページ（`DayLog`）が「まだ書いていません。」と言い切る
 *   - 旅程表の行（`DayLogMarks`）から、印が9日ぶんまとめて消える
 *
 * ここに書いてあった「読めなくても何も出さない。『読めませんでした』の箱が
 * 旅程表に9個並ぶほうが悪い」は、**箱を9個並べない**ところまでは正しい。
 * 正しくないのは、そのために**読めなかったことまで黙った**こと。
 * 箱は旅程表にひとつ（`DayLogMarks`）、1日ぶんのページにひとつ出す。
 *
 * 答えは3つ持つ（`lib/auth.tsx` の `Read`）。
 *   - `wait` … まだ返っていない。骨を出してよい
 *   - `ok`   … 読めた。**ここではじめて「まだ書いていません」と言ってよい**
 *   - `down` … 読めなかった。**そう言って、読み直す道を出す**
 *
 * 落ちたら黙って読み直す（間隔を倍にしながら30秒まで）。電波が戻った合図
 * （`online`・画面に戻ってきた）でも読み直す。**画面を開き直させない。**
 */

/** 読めた「その日に起きたこと」。**読めていないあいだの空は、0件ではない。** */
let entries: NordicLogEntry[] = [];
let read: Read = "wait";
/** いま聞きに行っているか。何か所から呼ばれても、往復は1回 */
let running = false;
let started = false;
/** 落ちたあとの読み直し。間隔を倍にしながら待つ */
let retry: ReturnType<typeof setTimeout> | null = null;
let miss = 0;
const subs = new Set<() => void>();
/** 変わったことを知らせる印。中身ではなく、この数を見てもらう */
let version = 0;

const emit = () => {
  version += 1;
  for (const f of subs) f();
};

/** `loadNordicLog()` を待っている人。**読めた日に、はじめて返事をする。** */
let waiting: Promise<NordicLogEntry[]> | null = null;
let handOver: ((l: NordicLogEntry[]) => void) | null = null;

function run() {
  if (running) return;
  running = true;
  withRead(getNordicLog())
    .then((r) => {
      entries = r?.log ?? [];
      read = "ok";
      miss = 0;
      if (handOver) {
        handOver(entries);
        handOver = null;
        waiting = null;
      }
    })
    .catch(() => {
      /* **返事が来ないのも「読めなかった」**（`withRead` が12秒で見切る）。
         細い電波では、断られるより固まるほうが多い。 */
      read = "down";
      later();
    })
    .finally(() => {
      running = false;
      emit();
    });
}

/** 落ちたぶんを、押されるのを待たずに読み直す。 */
function later() {
  miss += 1;
  if (retry) clearTimeout(retry);
  retry = setTimeout(
    () => {
      retry = null;
      run();
    },
    Math.min(2000 * 2 ** (miss - 1), 30000),
  );
}

/**
 * いますぐ読み直す。
 *
 * `showWait` は、押されて読み直すときだけ `true`。骨に戻して「いま行った」と
 * 分かるようにする。ひとりでに読み直すときは顔を入れ替えない——灰色の骨と
 * 「読みに行けなかった」が数秒おきに入れ替わる面になる。
 */
function retryNow(showWait: boolean) {
  if (read !== "down") return;
  if (retry) {
    clearTimeout(retry);
    retry = null;
  }
  miss = 0;
  if (showWait) {
    read = "wait";
    emit();
  }
  run();
}

/** 「もう一度よみこむ」の札から呼ぶ。 */
export function reloadNordicLog() {
  retryNow(true);
}

/** 電波が戻った合図。**画面を開き直させないため**に、ここでも読み直す。 */
let woke = false;
function listen() {
  if (woke || typeof window === "undefined") return;
  woke = true;
  const wake = () => retryNow(false);
  window.addEventListener("online", wake);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") wake();
  });
}

function ask() {
  listen();
  if (started) return;
  started = true;
  run();
}

/**
 * 読めるまで待つ約束。**読めなかったときは、まだ返事をしない。**
 *
 * 前はここで `catch(() => [])` していた。受け取る側には「読めた上での0件」と
 * 見分けがつかないので、**嘘のほうを渡していた**。いまは黙って読み直しながら、
 * 本当に読めた日にはじめて返す（受け取る側から見れば、読めるまで
 * 「まだ読んでいる最中」のまま）。読めたかどうかまで要るところは
 * `useNordicLogState()` を使う。
 */
export function loadNordicLog(): Promise<NordicLogEntry[]> {
  ask();
  if (read === "ok") return Promise.resolve(entries);
  if (!waiting) waiting = new Promise((ok) => (handOver = ok));
  return waiting;
}

/** 旅ぜんぶぶんと、**読めたかどうか**。 */
export type NordicLog = {
  /** 読めたぶん。`read !== "ok"` のあいだの空を「無い」と読まないこと */
  log: NordicLogEntry[];
  read: Read;
  reload: () => void;
};

/** 旅ぜんぶぶん。1日ぶんのページと、旅程表の行の印が使う。 */
export function useNordicLogState(): NordicLog {
  useSyncExternalStore(
    useCallback((f: () => void) => {
      subs.add(f);
      ask();
      return () => {
        subs.delete(f);
      };
    }, []),
    () => version,
    () => 0,
  );
  return { log: read === "ok" ? entries : [], read, reload: reloadNordicLog };
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
 * 面を開いたらあやとの道具が消えている、というのがそれ。
 *
 * いまは島でひとつの答えを見る。読めなかったときは `"unknown"` で返ってきて、
 * ここは `false`（＝道具を出さない）に落ちる。**「読めなかったから出す」には
 * しない。** 出したら、読めなかっただけの視聴者さんにあやとの道具が見える。
 * 前に読めた答えは端末が覚えているので、あやとの端末では消えない。
 */
export function useOwner(): boolean {
  return useAuth().owner === "yes";
}
