/**
 * 中の区画の並び（three を読まない。画面の一覧と 3D の両方が読む）。
 *
 * 決まりは `dims.json` の `layout`: 区画の長さの和は荷室を超えない／窓口で売る区画（serve）は、真ん中が窓口の幅に入る所だけ。
 * 調理（cook）と生活（live）が隣り合う所には 3D が仕切りを立てる（Regulation (EC) No 852/2004 Annex II Chapter III）。
 */
import D from "./dims.json";

export type Item = { id: string; len: number; kind: string; serve?: boolean };
export const ITEMS = D.layout.items as Item[];
export const DEFAULT_ORDER = D.layout.order as string[];

/** 並びが決まりに合えば ""。合わなければ理由の鍵（items 区画がそろわない / fit 荷室を超える / serve 窓口から外れる） */
export function checkOrder(order: string[]): "" | "items" | "fit" | "serve" {
  const ids = ITEMS.map((i) => i.id);
  if (order.length !== ids.length || ids.some((id) => !order.includes(id))) return "items";
  const [c0, c1] = D.layout.cargo;
  const [h0, h1] = D.hatch.x;
  let x = c1;
  let total = 0;
  for (const id of order) {
    const it = ITEMS.find((i) => i.id === id)!;
    if (it.serve) {
      const mid = x - it.len / 2;
      if (mid < h0 || mid > h1) return "serve";
    }
    x -= it.len;
    total += it.len;
  }
  return total > c1 - c0 + 1e-9 ? "fit" : "";
}

/** i 番目を前（-1）か後ろ（+1）へ1つ動かした並び。動かせなければ null */
export function moved(order: string[], i: number, d: -1 | 1): string[] | null {
  const j = i + d;
  if (j < 0 || j >= order.length) return null;
  const next = [...order];
  [next[i], next[j]] = [next[j], next[i]];
  return checkOrder(next) === "" ? next : null;
}

/** 区画ごとの前後（x の範囲）。前（運転席の後ろ）から順に詰める */
export function spans(order: string[]): { id: string; x0: number; x1: number; kind: string }[] {
  let x = D.layout.cargo[1];
  return order.map((id) => {
    const it = ITEMS.find((i) => i.id === id)!;
    const s = { id, x0: x - it.len, x1: x, kind: it.kind };
    x -= it.len;
    return s;
  });
}
