import { memo } from "react";

import SPRITE_META from "@/content/sprites.json";

type Meta = {
  /** 画像そのものの大きさ(px) */
  w: number;
  h: number;
  /** 影を除いた「物体」が画像の中で占める範囲(px) */
  ox: number;
  oy: number;
  ow: number;
  oh: number;
};

const META = SPRITE_META as Record<string, Meta>;

export type SpriteName = keyof typeof SPRITE_META;

/**
 * 島に置く物ひとつ。
 *
 * スプライトには接地影が焼き込んであるので、画像の下端は地面ではない。
 * 焼くときに測っておいた「物体そのものの範囲」を使って、
 * 物体の足元の中央が (x, y) に来るように置く。
 * こうしないと木が地面から浮いたり、めり込んだりする。
 */
function SpriteRaw({
  name,
  x,
  y,
  size,
  flip = false,
  opacity,
  className,
  style,
  sway,
}: {
  /** スプライト名(site/public/sprites/ のファイル名) */
  name: string;
  /** 足元の位置 */
  x: number;
  y: number;
  /** 物体そのものの高さ(ワールド単位。影は含まない) */
  size: number;
  flip?: boolean;
  opacity?: number;
  className?: string;
  style?: React.CSSProperties;
  /** そよ風で揺らす。値は揺れ始めをずらすための秒数。 */
  sway?: number;
}) {
  const m = META[name];
  if (!m) return null;
  const k = size / m.oh; // 1px あたりのワールド単位
  const left = x - (m.ox + m.ow / 2) * k;
  const top = y - (m.oy + m.oh) * k;
  const img = (
    <image
      href={`/sprites/${name}.webp`}
      x={left}
      y={top}
      width={m.w * k}
      height={m.h * k}
      opacity={opacity}
      className={className}
      style={style}
      transform={flip ? `translate(${2 * x} 0) scale(-1 1)` : undefined}
      preserveAspectRatio="none"
    />
  );
  // 揺らすときは、足元を軸にして回すために g で包む。
  // image に直接 CSS の transform をかけると、左右反転の指定と衝突する。
  if (sway === undefined) return img;
  return (
    <g className="sway" style={{ transformOrigin: `${x}px ${y}px`, animationDelay: `${sway}s` }}>
      {img}
    </g>
  );
}

/**
 * 島に置く物は 140 個ある。島の札を開いたり住人に話しかけたりするたび、
 * 親が描き直されて、その 140 個ぶんが毎回作り直されていた。
 * 渡す値はどれも数と文字なので、memo で包めば「同じなら作り直さない」で済む。
 */
export const Sprite = memo(SpriteRaw);

/** 物体の見た目の横幅(ワールド単位)。当たり判定やラベルの位置決めに使う。 */
export function spriteWidth(name: string, size: number): number {
  const m = META[name];
  return m ? (size / m.oh) * m.ow : size;
}

export const spriteMeta = (name: string): Meta | undefined => META[name];
