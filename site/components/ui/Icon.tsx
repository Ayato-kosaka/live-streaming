import { C, INK } from "./icons/pal";
import { GLYPHS, FLAT, type IconName } from "./icons";

export type { IconName };

/**
 * 島のアイコン。
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
 * 場所や物のうち、**大きく出すもの**は今までどおりスプライト
 * （`site/public/sprites/*.webp`）を使う。ここは 12〜60px で出すもの。
 */
/**
 * 上からの光。
 *
 * 焼いたスプライトは上から光が当たっていて、上下に階調がある。SVG の塗りは平らなので、
 * 並べると別の世界のものに見える（`docs/island-world.md` 6章）。
 * だから絵の上に、**上を明るく・下を暗く**する薄い膜を1枚かぶせる。
 *
 * 中身は絵ごとに変わらないので、1つ書いて全部から参照する。
 * 同じ id が何度も出るが、中身が同じなので最初の1つに解決されて困らない。
 */
const LIGHT = (
  <linearGradient id="ic-light" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stopColor="#ffffff" stopOpacity="0.13" />
    <stop offset="0.42" stopColor="#ffffff" stopOpacity="0" />
    <stop offset="0.58" stopColor="#2a2415" stopOpacity="0" />
    <stop offset="1" stopColor="#2a2415" stopOpacity="0.1" />
  </linearGradient>
);

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
  // 操作の印とブランドマークは、指定が無くても単色。CSS の color に従わせる
  const flat = tone === "ink" || (tone !== "color" && FLAT.has(name));

  // 単色の印には光を乗せない。currentColor 1色であることが、
  // 置いた側の CSS との約束になっている（`.rleg-h .ic` など）
  if (flat) {
    return (
      <svg
        className={className ? `ic ${className}` : "ic"}
        width={size}
        height={size}
        viewBox="0 0 64 64"
        aria-hidden
        focusable="false"
      >
        {draw(INK)}
      </svg>
    );
  }

  // 絵ごとに1つ。中身が同じなら重なっても困らないので、名前から作る
  const gid = `ig-${name}`;
  return (
    <svg
      className={className ? `ic ${className}` : "ic"}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden
      focusable="false"
    >
      <defs>
        {LIGHT}
        {/*
          光を絵の形だけに乗せるための抜き型。
          絵をもう一度描くとマークアップが倍になるので、`use` で同じ形を借りる。
          塗りの明るさではなく**不透明度**で抜く（`mask-type: alpha`）。
        */}
        <mask
          id={`im-${name}`}
          maskUnits="userSpaceOnUse"
          x="0"
          y="0"
          width="64"
          height="64"
          style={{ maskType: "alpha" }}
        >
          <use href={`#${gid}`} />
        </mask>
      </defs>
      <g id={gid}>{draw(C)}</g>
      <rect width="64" height="64" fill="url(#ic-light)" mask={`url(#im-${name})`} />
    </svg>
  );
}
