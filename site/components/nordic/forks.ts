import { useCallback, useSyncExternalStore } from "react";
import { getForks, type ForkCounts } from "@/lib/api";
import { withRead, type Read } from "@/lib/auth";

/**
 * わかれ道の数を、1回だけまとめて読む。
 *
 * わかれ道は6区間にある。それぞれが読みに行くと1ページで6往復になるので、
 * 最初のひとりが読んだ結果を全員で使い回す（`ideas.ts` と同じ作り）。
 *
 * **どの区間にわかれ道があるかを、ここでは持たない。**
 * `content/nordic.ts` を読み込むと、そこが `nordic/index.json`（見どころ161件と
 * 旅のしおり）を丸ごと連れてくる。実測で `/nordic` のJSが 7.7kB から 26.4kB に
 * 増えた。だから id は画面の側から名乗ってもらって、
 * 出そろうのを1拍待ってから、まとめて1回だけ聞きに行く。
 *
 * ## 「読んでいる最中」と「読めなかった」を混ぜない（#34）
 *
 * 前はどちらも `null` を返していた。受け取る側（`DaySay`）はそれで
 * `return null` していたので、**電波が細い日は「この日に、言う」の区画が
 * まるごと消えた**。しかも一度聞いた id は二度と読み直さないので、
 * 画面を開き直すまで直らない。
 *
 * 答えは3つ持つ（`lib/auth.tsx` の `Read`）。
 *   - `wait` … まだ返っていない。骨を出してよい
 *   - `ok`   … 数が読めた。押せる
 *   - `down` … 読めなかった。**0票でも「無い」でもない。**
 *              押しどころは出さず、読み直す道を出す
 *
 * 押せるのは `ok` のときだけ、というのは前と同じ。数が読めないまま
 * ボタンを出すと、押した人に何も返せない。**読めていない相手に、
 * 書ける口を開かない。**
 *
 * 落ちたら黙って読み直す（間隔を倍にしながら30秒まで）。電波が戻った合図
 * （`online`・画面に戻ってきた）でも読み直す。**画面を開き直させない。**
 */

/** 読めた数。**読めていない区間は、ここに入らない。** */
let counts: Record<string, ForkCounts> = {};
/** 区間ごとの、読めたかどうか。ここに無い＝まだ誰も名乗っていない */
const state = new Map<string, Read>();
/** 読みに行く id。同じ画面の6つが名乗り終わるのを待ってから、1回で聞く。 */
const want = new Set<string>();
let timer: ReturnType<typeof setTimeout> | null = null;
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

function run() {
  timer = null;
  const ids = [...want];
  want.clear();
  if (ids.length === 0) return;
  /* すでに `down` と出ているものを `wait` に戻さない。戻すと、灰色の骨と
     「読みに行けなかった」の顔が数秒おきに入れ替わる（`lib/auth.tsx` と同じ）。 */
  for (const id of ids) if (!state.has(id)) state.set(id, "wait");
  withRead(getForks(ids))
    .then((r) => {
      counts = { ...counts, ...(r.forks ?? {}) };
      // 1票も入っていないわかれ道は返ってこない。0として置いておかないと、
      // 「まだ読めていない」と見分けがつかず、いつまでもボタンが出ない。
      for (const id of ids) {
        if (!counts[id]) counts[id] = {};
        state.set(id, "ok");
      }
      miss = 0;
    })
    .catch(() => {
      /* **返事が来ないのも「読めなかった」**（`withRead` が12秒で見切る）。
         細い電波では、断られるより固まるほうが多い。 */
      for (const id of ids) state.set(id, "down");
      later(ids);
    })
    .finally(emit);
}

/** 落ちたぶんを、押されるのを待たずに読み直す。 */
function later(ids: string[]) {
  miss += 1;
  if (retry) clearTimeout(retry);
  retry = setTimeout(
    () => {
      retry = null;
      for (const id of ids) want.add(id);
      if (timer == null) timer = setTimeout(run, 0);
    },
    Math.min(2000 * 2 ** (miss - 1), 30000),
  );
}

/**
 * 落ちているぶんを、いますぐ読み直す。
 *
 * `showWait` は、押されて読み直すときだけ `true`。骨に戻して「いま行った」と
 * 分かるようにする。ひとりでに読み直すときは顔を入れ替えない。
 */
function retryNow(showWait: boolean) {
  if (retry) {
    clearTimeout(retry);
    retry = null;
  }
  miss = 0;
  let any = false;
  for (const [id, s] of state) {
    if (s !== "down") continue;
    any = true;
    want.add(id);
    if (showWait) state.set(id, "wait");
  }
  if (!any) return;
  if (showWait) emit();
  if (timer == null) timer = setTimeout(run, 0);
}

/** 「もう一度よみこむ」の札から呼ぶ。 */
export function reloadForks() {
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

function ask(id: string) {
  listen();
  if (state.has(id) || want.has(id)) return;
  want.add(id);
  if (timer == null) timer = setTimeout(run, 0);
}

/** 押した直後の数を、同じ画面の全員に配る。返事を待たずに1つ足しておく。 */
export function bumpFork(id: string, option: string, fresh?: ForkCounts) {
  const before = counts[id] ?? {};
  counts = {
    ...counts,
    [id]: fresh ?? { ...before, [option]: (before[option] ?? 0) + 1 },
  };
  emit();
}

/** ある区間のわかれ道。**数と、読めたかどうかを一緒に返す。** */
export type Fork = { counts: ForkCounts | null; read: Read };

/**
 * ある区間のわかれ道。
 *
 * `id` に `null` を渡すと、何も聞きに行かない（その日にわかれ道が無いとき）。
 * 空の id で聞くと、返ってこないものを永久に読み直すことになる。
 */
export function useForkState(id: string | null): Fork {
  useSyncExternalStore(
    useCallback(
      (f: () => void) => {
        subs.add(f);
        if (id) ask(id);
        return () => {
          subs.delete(f);
        };
      },
      [id],
    ),
    () => version,
    () => 0,
  );
  const read: Read = id ? state.get(id) ?? "wait" : "wait";
  return { read, counts: read === "ok" && id ? counts[id] ?? {} : null };
}

/**
 * 数だけが要るところ用。読めていないあいだも、読めなかったときも `null`。
 *
 * **紙の面の問い（`components/live/Ask.tsx`）はこちらを使う。** あちらは
 * 数が読めなくてもボタンを出す面なので、区別が要らない。
 * 読めなかったことを言う面は `useForkState` を使う。
 */
export function useFork(id: string | null): ForkCounts | null {
  return useForkState(id).counts;
}
