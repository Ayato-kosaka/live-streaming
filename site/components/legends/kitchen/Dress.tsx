import type { KitchenDrawn } from "@/content/legends/kitchenCarDrawn";
import type { KitchenCarBook } from "@/content/legends/kitchenCarTypes";

/**
 * **キッチンカーの着せ替え（3D）の置き場。いまは何も描かない**（静かな置き場。3D を組み込む担当が差し替える）。
 *
 * 差し替えるときは、3D の担当の舞台（`./VanStage.tsx`）を置く。組の絵と静止画は `drawn.looks`（`content/legends/kitchenCarDrawn.ts`。
 * 舞台の `VanStageLook` と同じ形）、組の名前は `b.looks`、最初の車は `b.vehicles` の `first`。押しどころの字は焼いた中身に足してから渡す
 * （面の .tsx に字を書かない）。3D が「どう森」に届かないときは、静止画だけで出す（運営の決め 2026-11-23 の8）
 */
export default function Dress(_: { b: KitchenCarBook; drawn: KitchenDrawn }) {
  return null;
}
