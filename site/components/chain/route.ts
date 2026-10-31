import { CHAPTERS, type Chapter } from "@/content/chapters";
import { CHAPTER_STREAMS } from "@/content/chapterStreams";

/**
 * 島の行き先は `content/chapters.ts` に移した。**ここからは再輸出だけ。**
 *
 * 中身（いまいる島は `/`、ほかは `/island/<章>`）も、`now` を渡せる理由も
 * あちらの `chapterHref` に書いてある。
 *
 * 移したのは、このファイルが `chapterStreams.ts`（毎晩焼く大きい表）を読むから。
 * **行き先を1つ引きたいだけの面が、それを束ごと抱き込んでいた。**
 * 既にここから読んでいる面があるので、名前はそのまま通す。
 */
export { chapterHref } from "@/content/chapters";

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
 * `NOW_CHAPTER` は焼いた時刻の答えで、いまいる島は日付で変わる。北欧へ出発した瞬間、
 * 連なりのコーカサスの行き先が `/island/caucasus` に変わり、**その面が無かった**
 * （436本・1,893人の島が、出発の日から丸ごと開けなくなる）。
 * 1面ぶん増えるだけなので、日付で消えるほうの面を先に焼いておく。
 */
export const ISLE_CHAPTERS: Chapter[] = CHAPTERS;

/** そのうち、配信の一覧（`/island/<章>/streams`）を持つ章 */
export const ISLE_STREAM_CHAPTERS: Chapter[] = ISLE_CHAPTERS.filter(
  (c) => CHAPTER_STREAMS[c.slug]?.length,
);

/**
 * `/all` が「章の島の行」を見分けるための表（行き先 → 章の slug）。
 *
 * **いまいる島は `/island/<章>` ではない。トップそのもの**（`chapterHref`）。
 * それを知っているのは日付なので、焼いた一覧（`content/directory.ts`）では
 * 決められない。一覧のほうは全部の章を並べておいて、
 * 画面が出てから行き先を引き直す（`components/chain/AllIsleRow.tsx`）。
 *
 * これが無かったころ、旅に出ると `/all` だけが `/island/nordic` を
 * 「これから建っていく島」として案内していた。**同じ島が2か所にあり、
 * しかも片方は紙1行の薄い面**という状態が、旅のあいだ17日つづく。
 */
export const ISLE_ROW: Record<string, string> = Object.fromEntries(
  ISLE_CHAPTERS.map((c) => [`/island/${c.slug}`, c.slug]),
);
