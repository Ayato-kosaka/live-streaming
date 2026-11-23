/**
 * 国でやった企画（`docs/spec/model.md` 6章「引きかた」の「国・街でやった企画」）。
 *
 * 国の一言（`content/countries.ts` の `summary`）から企画の話を外したので、その国の面から
 * 企画へ1行で辿れるようにする。札の段ぜんぶ（国・旅・企画・料理・月をつなぐ）は W10（#1357）が
 * ここを引き取って作る。それまでの、伝説の企画への1行。
 *
 * 引きかた:
 * - **旅を指している企画**（旅と1対1。`trip`）は、その旅が回った国（滞在から引く）。日付では引かない——
 *   北欧ヒッチハイクは出発した晩（09-11）を含むので、日付で引くとジョージアにも出てしまう
 * - それ以外は、企画の日（`date`）か期間（`range`）が、その国の滞在と重なるもの
 */
import { LEGENDS, type Legend } from "@/content/legends";
import { chapterOf } from "@/content/chapters";
import { chapterCountrySlugs } from "@/content/stayChapters";
import { STAYS } from "@/content/stays";

/** 期間 [a, b] と [c, d] が重なるか（日付の字で比べる。滞在の空の終わりは「いま」まで） */
const overlaps = (a: string, b: string, c: string, d: string) => a <= (d || "9999-12-31") && c <= b;

export function legendsOfCountry(slug: string): Legend[] {
  const stays = STAYS.filter((s) => s.country === slug);
  return LEGENDS.filter((l) => {
    if (l.trip) return chapterCountrySlugs(chapterOf(l.trip)).includes(slug);
    const spans: [string, string][] = [[l.date, l.date], ...(l.range ? [l.range] : [])];
    return stays.some((s) => spans.some(([a, b]) => overlaps(a, b, s.from, s.to ?? "")));
  }).sort((a, b) => a.date.localeCompare(b.date));
}
