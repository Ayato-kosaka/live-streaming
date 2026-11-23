import type { KitchenCarBook } from "@/content/legends/kitchenCarTypes";

/**
 * **メニュー開発のシミュレーションの置き場。いまは何も描かない**（静かな置き場。部品を作る担当が差し替える）。
 *
 * 差し替えるときの決まり（build-plan ⑤・#1418 本文2章の4）:
 * - 見出しは `b.subs.menuSim`。生地（`b.foods` の `sim` が true のもの）→ 中身1〜3（`b.fillings`）→ 値段 → 売る場所（`b.places`）
 *   → 結果（1個の原価・利益と利益率・1時間に焼ける数・1日に売れそうな人数・1日に残るお金・初めての人が買いたくなるか・案内鳥のひとこと）
 * - 式の手本は `python/legend_kitchen_bake.py` の `menu()`・`say()`。最初の姿（`b.sim`）の結果は `b.sim.start` と同じ値になる
 *   （刻みに丸めた原価・出店料で数える。1日の収益の最初の結果 `b.money.start.left` とも同じ）
 * - ひとこと7つと3段の字は DOM に `hidden` で置く（押してから出る字が書体に入るように。build-plan ⑨）
 * - 付箋に貼るのは、お題 `kitchen-car-menu` の行が在るときだけ（下書きのあいだは無い）
 */
export default function MenuSim(_: { b: KitchenCarBook }) {
  return null;
}
