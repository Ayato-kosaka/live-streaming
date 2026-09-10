/**
 * 「いまどこ」に打たれた字を読む。
 *
 * あやとは旅の17日間、**走っている車の中でスマホから**この欄を打つ。
 * そこで打つ字と、リポジトリが持っている旅程の綴りは、ふつうに1字ずれる。
 *
 * 実測（2026-09-15、ヴィリニュス）:
 *   「リトアニア・**ヴィ**リニュス」… 地図が動き「ストックホルムまで 603km」
 *   「リトアニア・**ビ**リニュス」 … 「いま ここ」が1つも出ず「数えています」
 *
 * 1字の違いで地図が黙って止まるのに、`/me/desk` は「島じゅうに出ました。」と
 * 言う。**打った本人には、止まったことが分からない。**
 *
 * ここは、その1字を吸収するためだけの道具。**街の表は持たない**（旅程から
 * 導出されたものが `content/nordic.ts` にある。`docs/island-misses.md` #3）。
 * 文字を寄せるところだけを引き受けて、突き合わせる相手は呼ぶ側が渡す。
 *
 * 打たれた字が**いつのものか**を見る `placeOutdated` も、ここに置いてある。
 * 字を読む話なので同じ道具箱でよく、`lib/stay.ts` に置いておくと国の表まで
 * 旅の面の JS に付いてくる。
 */

import { chapterNow, chapterSpan } from "@/content/chapters";

/**
 * 突き合わせるための形にそろえる。
 *
 * - 中黒・空白・かっこ・長音は落とす（「リトアニア・ヴィリニュス」も「リトアニアヴィリニュス」も同じ）
 * - `ヴ` はバ行に寄せる（**ヴィリニュス と ビリニュス は同じ街**）
 *
 * 寄せるのはこの2つだけ。ここを広げすぎると、別々の街が同じものとして当たる。
 */
export function normPlace(s: string | undefined): string {
  return (s ?? "")
    .normalize("NFKC")
    .replace(/[\s・･、,.．（）()「」【】\-ー―−]/g, "")
    .replace(/ヴァ/g, "バ")
    .replace(/ヴィ/g, "ビ")
    .replace(/ヴェ/g, "ベ")
    .replace(/ヴォ/g, "ボ")
    .replace(/ヴ/g, "ブ");
}

/**
 * 打った字が、その街（や国）を指しているか。
 *
 * 「リガ」でも「ラトビア・リガ」でも当たるように、含んでいるかで見る。
 */
export function samePlace(place: string | undefined, name: string | undefined): boolean {
  const p = normPlace(place);
  const n = normPlace(name);
  return !!p && !!n && p.includes(n);
}

/**
 * 打った字に当てはまる名前を、**長いものから**探す。
 *
 * 短いほうから見ると、「ユールマラ近郊」に泊まった日が「ユールマラ」で当たる。
 * 国も同じで、「イラン（国境まで）」より「イラン」が先に当たってはいけない。
 */
export function pickPlace<T>(
  place: string | undefined,
  list: readonly T[],
  nameOf: (x: T) => string,
): T | null {
  const p = normPlace(place);
  if (!p) return null;
  let best: T | null = null;
  let len = 0;
  for (const x of list) {
    const n = normPlace(nameOf(x));
    if (n && n.length > len && p.includes(n)) {
      best = x;
      len = n.length;
    }
  }
  return best;
}

/**
 * 人が書いた「いまどこ」が、**いまの旅より前に書かれたまま**か。
 *
 * `/island-api/state` の `current.place`（「ジョージア・トビリシ」）は
 * あやとが手で書く欄で、**旅の17日間、ヒッチハイクの途中では書き替えられない。**
 * 書き替えられないあいだ、島は「いまジョージアにいます」と言い続ける。
 * 旅の8日目の画面で、いちばん大きい絵がジョージアの国旗だった。
 *
 * **「人が書く欄だから直せない」ではない。** 直せないのは中身で、
 * **古くなったものをそのまま「いま」として出すかどうかは、こちらが決めること。**
 *
 * 判定は、便りを書いた日（`current.updatedAt`）といまの章の始まり。
 * 章が変わるより前に書かれていれば、その場所はもう「いま」ではない。
 * 日付が読めないものも、古いものとして扱う（読めないことを「新しい」にしない）。
 */
export function placeOutdated(updatedAt: string | undefined, now: Date = new Date()): boolean {
  const began = chapterSpan(chapterNow(now), now).from;
  if (began == null) return false;
  if (!updatedAt) return true;
  // その日いっぱいまでを「その日に書いた」とみなす
  const t = Date.parse(`${updatedAt}T23:59:59+09:00`);
  return Number.isNaN(t) || t < began;
}
