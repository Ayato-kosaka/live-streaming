import type { Draw } from "./bits";

/**
 * 印を1つ描く枠。
 *
 * `Icon.tsx`（紙の面で使う 223 種）と `IconCore.tsx`（ブラウザまで運ぶ 31 種）で
 * 中身が同じなので、枠だけここに出してある。
 * **表が2つに割れているのは束の大きさの話で、絵の作りは1つ**（`docs/island-design.md` 2章）。
 */

/**
 * 上からの光。
 *
 * 焼いたスプライトは上から光が当たっていて、上下に階調がある。SVG の塗りは平らなので、
 * 並べると別の世界のものに見える（`docs/island-world.md` 6章）。
 * だから絵の上に、**上を明るく・下を暗く**する薄い膜を1枚かぶせる。
 *
 * 中身は絵ごとに変わらないので、1つ書いて全部から参照する。
 * 同じ id が何度も出るが、**どれも中身が同じ**なので、ブラウザが文書順の1つ目に
 * 解決しても、その1つ目が消えて2つ目に解決し直されても、描かれるものは変わらない。
 * **中身が同じものだけを id で共有する** — このファイルの決めごとはこれ1つ。
 */
const LIGHT = (
  <linearGradient id="ic-light" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stopColor="#ffffff" stopOpacity="0.13" />
    <stop offset="0.42" stopColor="#ffffff" stopOpacity="0" />
    <stop offset="0.58" stopColor="#2a2415" stopOpacity="0" />
    <stop offset="1" stopColor="#2a2415" stopOpacity="0.1" />
  </linearGradient>
);

export function Shell({
  name,
  draw,
  size,
  flat,
  className,
  pal,
}: {
  name: string;
  draw: Draw;
  size: number;
  flat: boolean;
  className?: string;
  pal: Parameters<Draw>[0];
}) {
  // 単色の印には光を乗せない。操作の印とブランドマークは currentColor 1色であることが
  // 置いた側の CSS との約束になっている（`.rleg-h .ic` など）。
  // 上からの光は色を1つ足すのと同じなので、約束のあるものには乗せない
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
        {draw(pal)}
      </svg>
    );
  }

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
          塗りの明るさではなく**不透明度**で抜く（`mask-type: alpha`）ので、
          抜き型の中の色は何でもよい。形だけを見ている。

          ここで絵をもう一度描いているのは、**`<use href="#id">` で同じ形を借りると
          絵が黙って平らになる**から。id は文書ぜんぶで1つの名前空間なので、
          同じ印を2つ置くと id がぶつかる。ぶつかった参照は文書順の1つ目に解決され、
          その1つ目が消えると（別のページへ移った、折りたたみを閉じた）参照先が無くなって、
          残った印から光だけが落ちる。**壊れないので気づけない。**

          いま id を持つのは「どの印でも中身が同じもの」— この抜き型と `ic-light` の
          2つだけ。どれに解決されても結果が変わらないので、消えても困らない。
          代わりに絵1つぶんマークアップが増える。**黙って絵が変わるよりはいい。**
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
          {draw(pal)}
        </mask>
      </defs>
      {draw(pal)}
      <rect width="64" height="64" fill="url(#ic-light)" mask={`url(#im-${name})`} />
    </svg>
  );
}
