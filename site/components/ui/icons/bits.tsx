import type { ReactNode } from "react";
import type { Pal } from "./pal";

/** 1つのアイコンの絵。64×64 の枠に描く。 */
export type Draw = (c: Pal) => ReactNode;

/**
 * 接地影。
 *
 * どうぶつの森の影は思っているよりずっと濃くて、真下ではなく
 * 光源の反対（右下）へずれている（`docs/ac-reference.md`）。
 * 物が地面に乗って見えるかどうかは、ほぼこれで決まる。
 *
 * 既定を 0.28 から 0.34 へ上げた。色を測り直して暗い青（`pal.ts` の `sh`）に
 * したぶん、同じ 0.28 のままだと紙の上で影が薄い霞になっていた。
 * 実測した投影は α=0.5 まである（`pal.ts` の注）。接地影はそれより弱くていいが、
 * 0.3 は下回らない。
 */
export function Sh({
  c,
  cx = 33,
  cy = 55,
  rx = 19,
  ry = 4.6,
  o = 0.34,
}: {
  c: Pal;
  cx?: number;
  cy?: number;
  rx?: number;
  ry?: number;
  o?: number;
}) {
  if (c.flat) return null;
  return <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={c.sh} opacity={o} />;
}

/**
 * ハイライト。左上に1つだけ置く。
 *
 * これが有るか無いかで「プラスチックの玩具に見えるか」が変わる。
 * 2つ以上置くと、どこが手前か分からなくなるので1つに絞る。
 */
export function Gl({
  c,
  cx,
  cy,
  rx,
  ry,
  r = -28,
  o = 0.5,
}: {
  c: Pal;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  r?: number;
  o?: number;
}) {
  if (c.flat) return null;
  return (
    <ellipse
      cx={cx}
      cy={cy}
      rx={rx}
      ry={ry}
      fill={c.hl}
      opacity={o}
      transform={`rotate(${r} ${cx} ${cy})`}
    />
  );
}

/** 目。点ではなく縦長の楕円にすると、どうぶつの森の顔に近づく。 */
export function Eye({ c, x, y, s = 1 }: { c: Pal; x: number; y: number; s?: number }) {
  return <ellipse cx={x} cy={y} rx={1.5 * s} ry={2.1 * s} fill={c.ink} />;
}

/** ほお。目のすぐ下、外側に置く。 */
export function Blush({ c, x, y, s = 1 }: { c: Pal; x: number; y: number; s?: number }) {
  if (c.flat) return null;
  return <ellipse cx={x} cy={y} rx={2.6 * s} ry={1.7 * s} fill={c.pk} opacity={0.8} />;
}
