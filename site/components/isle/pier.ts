import type { IsleItem, IslePlaceSpec } from "./spec";

/** となりの島。名前と、そこへの行き先 */
export type Neighbour = { name: string; href: string };

/**
 * 船着き場。**どの島にも建つ。**
 *
 * 島から島へは船で行く（`docs/island-atlas.md` 6章）。着いた舟がつないである
 * ところから歩きはじめて、帰るときも同じところから出る。
 * これが無いと、島から出る道が画面の隅のボタンだけになって、
 * 「島の中にいる」が切れる。
 */
export function pier(prev?: Neighbour, next?: Neighbour): IslePlaceSpec {
  const items: IsleItem[] = [];
  if (prev) items.push({ label: prev.name, sub: "ひとつ前の島", href: prev.href, icon: "canoe" });
  if (next) items.push({ label: next.name, sub: "つぎの島", href: next.href, icon: "canoe" });
  items.push({ label: "島の地図", sub: "島の連なりぜんぶ", href: "/atlas", icon: "signpost" });
  return {
    id: "pier",
    label: "となりの島へ",
    blurb: "船で渡る",
    icon: "pier",
    size: 34,
    // 島から出る道は、引き（島ぜんぶ）でも名前が出ていること。
    // 消えると、島が袋小路になる
    sign: true,
    note: "旅は西から東へ。",
    items,
  };
}

