import { CHAPTERS, NOW_CHAPTER, type Chapter } from "@/content/chapters";
import { CHAPTER_STREAMS } from "@/content/chapterStreams";

/**
 * 島の行き先。
 *
 * **いまいる島はトップそのもの**（`docs/island-atlas.md` 7章）。
 * `/island/caucasus` を別に作ると、同じ島が2つある画面になる。
 * それ以外の章は、ぜんぶ `/island/<章>/` に**歩ける島**が建っている。
 *
 * `now` を渡せるようにしてあるのは、**「いまいる島」が日付で変わるから**。
 * 静的書き出しに焼いた `NOW_CHAPTER` だけで決めると、北欧に出発した日から
 * 誰かがビルドし直すまで、行き先が古いままになる。
 * 画面（クライアント）は `chapterNow(new Date())` を渡すこと。
 */
export function chapterHref(c: Chapter, now: Chapter = NOW_CHAPTER): string {
  return c.slug === now.slug ? "/" : `/island/${c.slug}`;
}

/**
 * `/island/<章>/` を持つ章 = **いまいる島いがい全部**。
 *
 * 過去の島も、まだ建っていない次の島も、同じだけ歩ける
 * （`docs/island-atlas.md` 10章の「歩ける島にするかどうか」は "する" に決まった）。
 * ここが `generateStaticParams` の出どころなので、`content/chapters.ts` に
 * 章を1行足すと、**画面を1文字も触らずに島が1つ建つ。**
 */
export const ISLE_CHAPTERS: Chapter[] = CHAPTERS.filter((c) => c.slug !== NOW_CHAPTER.slug);

/** そのうち、配信の一覧（`/island/<章>/streams`）を持つ章 */
export const ISLE_STREAM_CHAPTERS: Chapter[] = ISLE_CHAPTERS.filter(
  (c) => CHAPTER_STREAMS[c.slug]?.length,
);

/** 終わった章。**期間が確定しているものだけ**を並べたいところが使う */
export const PAST_CHAPTERS: Chapter[] = CHAPTERS.filter((c) => c.from && c.to);
