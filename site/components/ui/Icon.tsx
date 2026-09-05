import { C, INK } from "./icons/pal";
import { GLYPHS, FLAT, BRAND, type IconName } from "./icons";
import { Shell } from "./icons/shell";

export type { IconName };

/**
 * 島のアイコン。**紙の面（サーバで描き切る面）で使う。**
 *
 * 絵文字は1文字も使わない（`docs/island-design.md`）。
 * ただし「絵文字をやめた代わりの記号」では足りない。ここに置くのは**小さなイラスト**で、
 * 島の絵と同じ作りにする（`docs/ac-reference.md`）:
 *
 *   - 輪郭線を引かない。形は色の差だけで見せる
 *   - 1つの絵に 2〜4 色。ベース・影・ハイライト・差し色
 *   - 影は黒くしない。同じ色相のまま暗くする。接地影だけ暖かい灰緑で右下へずらす
 *   - 角は全部丸める
 *
 * 枠は 64×64。24 だと描き込みが足りず、線が潰れる。
 * 絵は `components/ui/icons/*.tsx` に分けてある。増やすときはそこへ足して、
 * `icons/index.ts` の `IconName` に1行足す。
 *
 * **ブラウザで描き直す部品（`"use client"` の付いたもの）からは、これを読まない。**
 * ここは 223 種を1つの表にまとめていて、名前で引くから、どれが要るか静的に分からない。
 * 束に入れると 174KB がまるごとブラウザへ行って、そのうち走るのは 6% しかない。
 * そちらは `IconCore.tsx` を読む（呼べる名前が狭いので、間違えると型で落ちる）。
 *
 * 場所や物のうち、**大きく出すもの**は今までどおりスプライト
 * （`site/public/sprites/*.webp`）を使う。ここは 12〜60px で出すもの。
 */
export default function Icon({
  name,
  size = 18,
  tone,
  className,
}: {
  name: IconName;
  /** 表示する大きさ(px)。文字に添えるなら 14〜18、単体なら 24〜40、主役なら 48〜64。 */
  size?: number;
  /**
   * `ink` にすると単色（currentColor）で描く。
   * 色を CSS 側で決めたい場所や、色数を落としたい小さな行の中で使う。
   */
  tone?: "color" | "ink";
  className?: string;
}) {
  const draw = GLYPHS[name];
  if (!draw) return null;
  // 操作の印は、指定が無くても単色。CSS の color に従わせる。
  // ブランドマークは **`tone="color"` を渡されても単色のまま。**
  // 他人のマークなので、こちらの都合で色や陰影を足してはいけない
  // （`docs/island-design.md` 1章「本物の形を写す」／`icons/brand.tsx`）。
  const flat = tone === "ink" || BRAND.has(name) || (tone !== "color" && FLAT.has(name));
  return <Shell name={name} draw={draw} size={size} flat={flat} className={className} pal={flat ? INK : C} />;
}
