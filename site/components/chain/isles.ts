/**
 * 模型の材料を、章から作る。**ビルドのときだけ走る**（サーバ側）。
 *
 * ## なぜサーバで作るか
 *
 * 模型に建てるものは、歩ける島（`components/isle/spec.ts` + `world.ts`）が
 * 決めている。あちらは配信240本・企画・ショート58本・国の表を読むので、
 * **そのままクライアントへ持っていくと束が太る**（`/atlas` は島の連なりを
 * 見るだけの面で、配信の題名は1文字も要らない）。
 *
 * ここで **{絵・大きさ・位置} の3つだけに削ってから**渡す。
 * 位置は島の半径で割った割合なので、模型の縮尺が変わってもそのまま使える。
 *
 * ## 押した先と、押す前の絵をそろえる
 *
 * 建物の並びは `buildWorld` が決めたものをそのまま縮めている。
 * **模型で見えている配置が、渡った先の島の配置。**
 */

import { artOf } from "./shapes";
import { isleSpec, nordicSpec } from "@/components/isle/spec";
import { buildWorld, SQUASH } from "@/components/isle/world";
import { CHAPTERS } from "@/content/chapters";
import { COUNTRIES } from "@/content/countries";
import type { AtlasIsle } from "./diorama";

export type { AtlasBuilding, AtlasIsle } from "./diorama";

export function atlasIsles(): AtlasIsle[] {
  return CHAPTERS.map((c) => {
    const regions = c.countries.flatMap((s) => {
      const k = COUNTRIES.find((x) => x.slug === s);
      return k ? [k.region as string] : [];
    });
    const art = artOf(c.slug, regions);
    const spec = c.from ? isleSpec(c) : nordicSpec(c);
    const w = buildWorld(spec);
    return {
      slug: c.slug,
      art,
      buildings: w.places.map((p) => ({
        icon: p.icon,
        size: round(p.size / w.r),
        nx: round((p.x - w.cx) / w.r),
        ny: round((p.y - w.cy) / (w.r * SQUASH)),
      })),
    };
  });
}

/* 焼き出す HTML に入る数なので、桁を落とす。
   模型の半径は 121 単位までなので、小数第3位で 0.1px より細かい */
const round = (v: number) => Math.round(v * 1000) / 1000;

