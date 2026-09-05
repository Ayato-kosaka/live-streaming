import { C, INK } from "./icons/pal";
import type { Draw } from "./icons/bits";
import { Shell } from "./icons/shell";
import { nav } from "./icons/nav";
import { alert, calendar, clock, comment, island, light, live, map, pin, signpost, walk } from "./icons/core";

/**
 * ブラウザまで運ぶぶんの印。
 *
 * `Icon.tsx` と絵も枠も同じもので、**違うのは呼べる名前の数だけ。**
 * あちらは 257 種を1つの表にまとめていて、名前で引くから静的に絞れない。
 * `"use client"` の部品から読むと 174KB がまるごと束に入り、走るのは 6% だった。
 *
 * こちらは表を手で書いてあるので、束には**ここに並んだぶんしか入らない**。
 * 名前の型もこの表から作るので、置いていない印を呼ぶと**型で落ちる**。
 * 気づかないうちに 257 種へ戻ることがない、というのがこの形の主眼。
 *
 * ブラウザで描き直す部品が新しい印を要るようになったら、`icons/core.tsx` へ絵を移して
 * ここに1行足す。要らなくなったら群のファイルへ戻す。**小さいことに意味がある。**
 */
const CORE = {
  ...nav,
  alert,
  calendar,
  clock,
  comment,
  island,
  light,
  live,
  map,
  pin,
  signpost,
  walk,
} satisfies Record<string, Draw>;

export type CoreIconName = keyof typeof CORE;

/** 操作の印は単色。CSS 側の `color` に従わせる（`Icon.tsx` の `FLAT` と同じ決まり）。 */
const FLAT_CORE = new Set<string>(Object.keys(nav));

export default function Icon({
  name,
  size = 18,
  tone,
  className,
}: {
  name: CoreIconName;
  size?: number;
  tone?: "color" | "ink";
  className?: string;
}) {
  const draw = CORE[name] as Draw | undefined;
  if (!draw) return null;
  const flat = tone === "ink" || (tone !== "color" && FLAT_CORE.has(name));
  return <Shell name={name} draw={draw} size={size} flat={flat} className={className} pal={flat ? INK : C} />;
}
