import { SHORTS, shortHref, shortThumb, type Short } from "@/content/shorts";

/**
 * 北欧旅のショート動画を、**旅程表の日に結びつける。**
 *
 * ## 本数を手で並べない
 *
 * ショートの一覧は `content/shorts.ts` にある。あれは
 * `python/build_shorts.py` がチャンネルのショートのタブから取り直して焼くもので、
 * **本数も題名も向こうが正。** ここに4本を書き写すと、次の1本が出た日に
 * **片方だけ古くなる**（`docs/island-misses.md` の決めごと3）。
 * だから持つのは「どの日の話か」だけで、題名も住所もサムネイルも向こうから引く。
 *
 * ## 日は、題名から読む
 *
 * どの日のショートかは、題名が言っている——「1日目レッツゴー！」「【二日目】」
 * 「【三日目】」「【五日目】」。漢数字と算用数字が混ざるので両方読む。
 *
 * **読めなかった本を落とさない。** 日が読めない題名（振り返りや告知）は
 * `undefined` のまま返って、`/nordic` の一覧には出る。旅の日ページに
 * 出ないだけで、**島のどこからも行けない本は作らない。**
 * ここを「表に書いてあるものだけ出す」作りにすると、表を更新し忘れた1本が
 * 黙って消える。黙って消えるほうが、日が付かないより悪い。
 *
 * ## 再生回数は持たない
 *
 * 変わる数字を焼くと、画面だけが止まる（`docs/island-fresh.md`）。
 * 出すのは題名と絵と住所だけ。
 */

/** 章の slug。ショートの表はここで引く（`content/chapters.ts` の北欧の章）。 */
const CHAPTER = "nordic";

const KANJI: Record<string, number> = {
  一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
};

/** 「二」→2、「十」→10、「十五」→15、「二十」→20。旅は17日なので二桁まで読めれば足りる。 */
function fromKanji(s: string): number {
  const i = s.indexOf("十");
  if (i < 0) return KANJI[s] ?? 0;
  const hi = i === 0 ? 1 : (KANJI[s[0]] ?? 0);
  const lo = i === s.length - 1 ? 0 : (KANJI[s[i + 1]] ?? 0);
  return hi * 10 + lo;
}

/**
 * 題名から「何日目か」。読めなければ `undefined`。
 *
 * **数字だけを拾わない。** 題名には「6カ国」のような数字も入っているので、
 * 「◯日目」という形になっているところだけを見る。
 */
export function dayNoOf(title: string): number | undefined {
  const m = title.match(/([0-9０-９]+|[一二三四五六七八九十]+)日目/);
  if (!m) return undefined;
  const raw = m[1];
  const n = /^[0-9０-９]+$/.test(raw)
    ? Number(raw.replace(/[０-９]/g, (c) => String(c.charCodeAt(0) - 0xff10)))
    : fromKanji(raw);
  return n > 0 ? n : undefined;
}

/** ショート1本と、それが何日目の話か。日が読めなかった本は両方とも空。 */
export type NordicShort = Short & { dayN?: number; dayId?: string };

/** この旅のショート、出した順に全部。**日が読めなかった本も入っている。** */
export const NORDIC_SHORTS: NordicShort[] = (SHORTS[CHAPTER] ?? []).map((s) => {
  const n = dayNoOf(s.title);
  return n ? { ...s, dayN: n, dayId: `day-${n}` } : s;
});

/** その日のショート。無い日のほうが多いので、空の配列が既定。 */
export const shortsOfDay = (dayId: string): NordicShort[] =>
  NORDIC_SHORTS.filter((s) => s.dayId === dayId);

export { shortHref, shortThumb };
