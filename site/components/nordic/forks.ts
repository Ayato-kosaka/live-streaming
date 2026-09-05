import { useCallback, useSyncExternalStore } from "react";
import { getForks, type ForkCounts } from "@/lib/api";

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
 * **読めなかったら、わかれ道そのものを出さない。**
 * 数が読めない状態でボタンだけ出すと、押した人に何も返せない。
 * 足代と同じで、分からないときは席を消す（`docs/nordic-fund.md` 提案5）。
 * サーバーがまだ古いあいだ（`/fork` が無いあいだ）も、ここに落ちる。
 */

let counts: Record<string, ForkCounts> | null = null;
/** 読みに行く id。同じ画面の6つが名乗り終わるのを待ってから、1回で聞く。 */
const want = new Set<string>();
let asked = new Set<string>();
let timer: ReturnType<typeof setTimeout> | null = null;
const subs = new Set<() => void>();

const emit = () => {
  for (const f of subs) f();
};

function run() {
  timer = null;
  const ids = [...want].filter((id) => !asked.has(id));
  if (ids.length === 0) return;
  asked = new Set([...asked, ...ids]);
  getForks(ids)
    .then((r) => {
      counts = { ...(counts ?? {}), ...(r.forks ?? {}) };
      // 1票も入っていないわかれ道は返ってこない。0として置いておかないと、
      // 「まだ読めていない」と見分けがつかず、いつまでもボタンが出ない。
      for (const id of ids) if (!counts[id]) counts[id] = {};
    })
    .catch(() => {
      // 読めなかったときは null のまま。ボタンを出さない
    })
    .finally(emit);
}

function ask(id: string) {
  if (asked.has(id) || want.has(id)) return;
  want.add(id);
  if (timer == null) timer = setTimeout(run, 0);
}

/** 押した直後の数を、同じ画面の全員に配る。返事を待たずに1つ足しておく。 */
export function bumpFork(id: string, option: string, fresh?: ForkCounts) {
  const now = counts ?? {};
  const before = now[id] ?? {};
  counts = {
    ...now,
    [id]: fresh ?? { ...before, [option]: (before[option] ?? 0) + 1 },
  };
  emit();
}

/** ある区間のわかれ道の数。読めていないあいだと、読めなかったときは null。 */
export function useFork(id: string): ForkCounts | null {
  const all = useSyncExternalStore(
    useCallback(
      (f: () => void) => {
        subs.add(f);
        ask(id);
        return () => {
          subs.delete(f);
        };
      },
      [id],
    ),
    () => counts,
    () => null,
  );
  return all === null ? null : all[id] ?? null;
}
