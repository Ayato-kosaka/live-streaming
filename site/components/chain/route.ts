import { CHAPTERS, type Chapter } from "@/content/chapters";

/**
 * 島の行き先。
 *
 * **いまの島はトップそのもの**（`docs/island-atlas.md` 7章）。
 * `/island/caucasus` を別に作ると、同じ島が2つある画面になる。
 *
 * **次の島は、もう建っている企画のページへ**。北欧旅は `/nordic` に
 * 旅程も地図も見どころも入っている。島の中に同じものを作り直さない。
 *
 * 過去の島だけ `/island/<章>/` を持つ。あそこは**振り返る場所**なので、
 * その章のあいだのものしか出さない。
 */
export function chapterHref(c: Chapter): string {
  if (!c.from) return "/nordic";
  if (!c.to && !c.branchOf) return "/";
  return `/island/${c.slug}`;
}

/** `/island/<章>/` を持つ章。終わった章と、枝 */
export const PAST_CHAPTERS: Chapter[] = CHAPTERS.filter((c) => c.from && c.to);
