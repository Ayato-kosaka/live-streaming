/**
 * 旅のガイドの区画（`/travel`）の道。**道の字はここだけが持つ。**
 *
 * 国の表（`content/countries.ts`）も読まない軽い1枚にしてあるのは、
 * 島の札（`components/island/layout.ts`）のような**画面の部品からも引く**ため。
 * 名簿（どの国が `/travel/<国>` を持つか）は `content/travel.ts` が組む。
 *
 * 区画の形は #1201 で決めた:
 *
 *     /travel              旅の入口（歩いた国）
 *     /travel/<国>          国（歩いた記録と、行く前に調べたこと）
 *
 * 前の道（`/map` `/map/<国>` `/nordic/<国>` `/north-macedonia`）は
 * `firebase.json` の `redirects` が 301 でここへ送る。
 */
export const TRAVEL = "/travel";

/** 国ひとつの面の道 */
export const travelHref = (slug: string) => `${TRAVEL}/${slug}`;
