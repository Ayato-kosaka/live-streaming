import { useSyncExternalStore } from "react";
import { getIdeas, type Idea } from "@/lib/api";

/**
 * 島の提案を1回だけ読んで、みんなで使い回す。
 *
 * 区間ごとの道しるべは10か所ある。それぞれが `/island-api/state` を叩くと、
 * 1ページで10回の往復になる。中身は同じ1本のリストなので、まとめて1回だけ読む。
 *
 * ここを「読んだ約束を配る」だけにしていたが、いまは**貼った直後の反映**が要る。
 * 区間カードには席が2つあって、道しるべが1つ立った瞬間に「つながった」の表示が
 * 変わる（`Carry.tsx` の `Tie`）。同じ画面の別のところが同じリストを見ているので、
 * 貼った本人の欄だけが増えて、つながりの表示が変わらない、では嘘になる。
 * だから小さな置き場にして、変わったら見ている全員に知らせる。
 */

let list: Idea[] | null = null;
let started = false;
const subs = new Set<() => void>();

const emit = () => {
  for (const f of subs) f();
};

function load() {
  if (started) return;
  started = true;
  getIdeas()
    .then((r) => {
      list = r.ideas;
    })
    .catch(() => {
      // 読めなかったときは「0件」として扱う。読み込み中のまま止めない
      list = [];
    })
    .finally(emit);
}

/** 貼ったばかりのものを、その場で全部の欄に映す。 */
export function addIdea(i: Idea) {
  list = [i, ...(list ?? [])];
  emit();
}

/** いいねを1つ増やす。サーバの返事は待たない（次に読み直したときに正しい数になる）。 */
export function bumpVote(id: string) {
  list = (list ?? []).map((i) => (i.id === id ? { ...i, votes: i.votes + 1 } : i));
  emit();
}

const subscribe = (f: () => void) => {
  subs.add(f);
  load();
  return () => {
    subs.delete(f);
  };
};

/**
 * ある区間ぶんの道しるべ。読み込み中は null。
 * `list` の中身は差し替えでしか変わらないので、参照の比較で足りる。
 */
export function useLegIdeas(tag: string): Idea[] | null {
  const all = useSyncExternalStore(
    subscribe,
    () => list,
    () => null,
  );
  return all === null ? null : all.filter((i) => i.text.startsWith(tag));
}

/** 区間ごとの札。`content/nordic.ts` の `Leg.id` から作る。 */
export const legTag = (id: string) => `【区間:${id}】`;
