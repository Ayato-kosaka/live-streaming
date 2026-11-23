import type { KitchenCarBook } from "@/content/legends/kitchenCarTypes";

/**
 * **1日の収益のシミュレーションの置き場。いまは何も描かない**（静かな置き場。部品を作る担当が差し替える）。
 *
 * 差し替えるときの決まり（build-plan ⑤・あやとの答えの Q7）:
 * - 見出しは `b.subs.daySim`。つまみ7つ（`b.money.inputs`。最初の値は `default`）→ 税抜の売上 − 材料 − 出店料 − ガス・電気・燃料
 *   → 1日に残るお金（€と円。円は `b.rate.jpyPerEur` で面が計算する）。**ひと月にしない・日数を掛けない**
 * - 式の手本は `python/legend_kitchen_bake.py` の `day()`。電気は最初の1匹の値（`b.money.start.elec`）で、最初の結果は `b.money.start.left`
 */
export default function DaySim(_: { b: KitchenCarBook }) {
  return null;
}
