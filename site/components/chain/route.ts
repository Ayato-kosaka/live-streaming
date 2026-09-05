import { CHAPTERS, NOW_CHAPTER, type Chapter } from "@/content/chapters";
import { CHAPTER_STREAMS } from "@/content/chapterStreams";

/**
 * 島の行き先。
 *
 * **いまいる島はトップそのもの**（`docs/island-atlas.md` 7章）。
 * だから連なりからは `/` へ送る。それ以外の章は、ぜんぶ
 * `/island/<章>/` に**歩ける島**が建っている。
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
 * `/island/<章>/` を持つ章 = **全部。**
 *
 * 過去の島も、まだ建っていない次の島も、同じだけ歩ける
 * （`docs/island-atlas.md` 10章の「歩ける島にするかどうか」は "する" に決まった）。
 * ここが `generateStaticParams` の出どころなので、`content/chapters.ts` に
 * 章を1行足すと、**画面を1文字も触らずに島が1つ建つ。**
 *
 * **いまいる島も焼く。** 前はここで `NOW_CHAPTER` を外していた。いまいる島は
 * トップそのものなので、確かに誰もそこへは行かない——**ビルドした日のあいだは。**
 * `NOW_CHAPTER` は焼かれた答えで、いまいる島は日付で変わる。北欧へ出発した瞬間、
 * 連なりのコーカサスの行き先が `/island/caucasus` に変わり、**その面が無かった**
 * （436本・1,893人の島が、出発の日から丸ごと開けなくなる）。
 * 1面ぶん増えるだけなので、日付で消えるほうの面を先に焼いておく。
 */
export const ISLE_CHAPTERS: Chapter[] = CHAPTERS;

/** そのうち、配信の一覧（`/island/<章>/streams`）を持つ章 */
export const ISLE_STREAM_CHAPTERS: Chapter[] = ISLE_CHAPTERS.filter(
  (c) => CHAPTER_STREAMS[c.slug]?.length,
);
