/**
 * **島のあやとの、画面に見えている箱**（ページの中で動く関数の字）。
 *
 *   import { AYATO_BOX_FN } from "./ayatobox.mjs";
 *   page.evaluate(`(() => { ${AYATO_BOX_FN}; return ayatoBox(document.querySelector("g.ayato")); })()`)
 *
 * ## なぜ `g.ayato` の getBoundingClientRect ではだめか
 *
 * 歩いているあいだのあやとは、3段×4コマを並べた1枚（シート）を、1コマぶんの
 * 窓（入れ子の `<svg overflow="hidden">`）から覗かせて描いている
 * （`site/components/isle/AyatoSprite.tsx`）。**SVG の箱は、切り抜かれて見えない
 * ところまで含めて返る。** 窓の外にある11コマぶんが箱に入り、あやとが
 * 縦に 200px・横に 200px 動いているように測れた（`islewalk.mjs` の「定位置」。
 * 絵は1px も動いていなかった）。
 *
 * ここでは、窓が出ているときは窓の x/y/幅/高さを `<g>` の行列で画面に写し、
 * 出ていないとき（初めて歩くまでの1枚）は、その1枚の箱を返す。
 */
export const AYATO_BOX_FN = `function ayatoBox(g) {
  if (!g) return null;
  const walk = g.querySelector(".ayato-walk");
  if (walk && getComputedStyle(walk).display !== "none") {
    const m = walk.parentNode.getScreenCTM ? walk.parentNode.getScreenCTM() : g.getScreenCTM();
    const x = walk.x.baseVal.value, y = walk.y.baseVal.value;
    const w = walk.width.baseVal.value, h = walk.height.baseVal.value;
    const a = new DOMPoint(x, y).matrixTransform(m);
    const c = new DOMPoint(x + w, y + h).matrixTransform(m);
    const left = Math.min(a.x, c.x), top = Math.min(a.y, c.y);
    const width = Math.abs(c.x - a.x), height = Math.abs(c.y - a.y);
    return { left, top, width, height, right: left + width, bottom: top + height };
  }
  const still = g.querySelector(".ayato-still") || g;
  const r = still.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
}`;
