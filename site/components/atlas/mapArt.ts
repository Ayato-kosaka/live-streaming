import { createHash } from "node:crypto";

import { COUNTRY_MAPS } from "./countryMaps";
import { ART_WIDTHS, artSrc, countryArtSvg } from "./countryArt";
import BAKED from "@/content/atlas/mapArt.json";

/**
 * **国の寄り地図の、焼いた絵（`site/public/travel/<国>/<国名>の地図-<幅>.webp`）を引く。**（#1262・#332）
 *
 * 焼くのは `tools/sprites/countrymap_bake.mjs`。焼いたときの絵の字の指紋（`hash`）を `content/atlas/mapArt.json` に
 * 控えてあり、**いまの地図のデータと絵の組みかた（`countryArt.ts`）から出した指紋と同じときだけ**焼いた絵を返す。
 * 違えば `undefined`——面は前のとおり SVG を直に描く（絵が古いまま出るより、検索の点を落とすほうがまし）。
 * 古いことは `tools/sprites/countrymap_selftest.mjs` が赤くして知らせる（焼き直すのは道具1本）。
 *
 * 書き出しのときにだけ走る（サーバーの部品と sitemap から。ブラウザには来ない）。
 */

type Baked = Record<string, { name: string; hash: string; w: number; h: number }>;

export type MapArt = {
  /** 大きい版（横 1200px）。画像のサイトマップ・構造化データにはこちら */
  src: string;
  srcSet: string;
  w: number;
  h: number;
  alt: string;
};

export const artHash = (svg: string) => createHash("sha1").update(svg).digest("hex");

/**
 * 地図の絵の alt。**「〈国〉の地図」で始めて、絵に描いてあるものだけを言う**（Google: alt は中身を言う・語を詰めない）。
 * 街の名前は絵ではなく面の字（名札）だが、点は絵に在るので「どこに点があるか」として言う
 */
export function mapAlt(slug: string, name: string): string {
  const m = COUNTRY_MAPS[slug];
  if (!m) return `${name}の地図`;
  const own = m.cities.filter((c) => c.country === slug).map((c) => c.name);
  const towns = own.length > 5 ? `${own.slice(0, 5).join("・")}ほか` : own.join("・");
  return (
    `${name}の地図。まわりの国の中の${name}の位置` +
    (towns ? `と、回った街（${towns}）の場所` : "") +
    (m.legs.length ? "、国の中を移動した道すじ" : "")
  );
}

export function countryMapArt(slug: string, name: string): MapArt | undefined {
  const m = COUNTRY_MAPS[slug];
  const b = (BAKED as Baked)[slug];
  if (!m || !b || b.name !== name) return undefined;
  if (b.hash !== artHash(countryArtSvg(m, slug))) return undefined;
  const big = ART_WIDTHS[ART_WIDTHS.length - 1];
  return {
    src: artSrc(slug, name, big),
    srcSet: ART_WIDTHS.map((x) => `${artSrc(slug, name, x)} ${x}w`).join(", "),
    w: b.w,
    h: b.h,
    alt: mapAlt(slug, name),
  };
}
