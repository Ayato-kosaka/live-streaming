/**
 * 章（旅）と滞在を、**期間の重なりで結ぶ**（`docs/spec/model.md` 6章の「引きかた」）。
 *
 * どちらの表も相手を持たない——章（`content/chapters.ts`）は回った国を書かず、滞在
 * （`content/stays.ts`）はどの旅の中かを書かない。結ぶのはここだけ。
 *
 * **別のファイルにしてあるのは、2つの表を軽いまま置くため。** `chapters.ts` は島の連なりの
 * 画面（クライアント）や多くの確かめが単独で読むので、滞在の表を連れてこさせない。
 * 同じ決めかたを `python/stays.py` の `chapter_countries()` も持っていて、2つが割れていないかは
 * `site/selftest/stays_table_selftest.mjs` が突き合わせる。
 */
import { CHAPTERS, type Chapter } from "./chapters";
import { STAYS, type Stay } from "./stays";

/** その日の前日。滞在の切れ目を引くためだけなので、暦は UTC で足りる */
const dayBefore = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) - 86400_000).toISOString().slice(0, 10);

/** 終わりの空いた期間の、終わりの代わり */
const OPEN = "9999-12-31";

/**
 * 滞在の、事実上の期間（着いた順）。**終わりは、`to` と「つぎに着いた日の前日」の早いほう。**
 *
 * 国を移る日は前の行の `to` とつぎの行の `from` が同じ日になる（境目の日は入った国が取る。
 * `content/stays.ts` の頭）。`to` のまま重ねると、ケルンの 2025-03-30 が中東周遊にも入る。
 */
const STAY_SPANS = [...STAYS]
  .sort((a, b) => a.from.localeCompare(b.from))
  .map((s, i, all) => {
    const next = all.slice(i + 1).find((x) => x.from > s.from);
    const to = [s.to || OPEN, next ? dayBefore(next.from) : OPEN].sort()[0];
    return { stay: s, from: s.from, to };
  });

/**
 * その章の滞在（着いた順）。**章と期間が重なる行**（`docs/spec/model.md` 6章「旅が回った国」）。
 * 国の記録の無い国の行（いま歩いている国・これから着く国）も入る。
 *
 * **枝の旅（`branchOf`）にすっぽり入る滞在は、枝のもの。** 本線には数えない。いまはイラン国境の行が
 * アルメニアの行と重なっているので（M-12）、こう読まないと本線のコーカサスに国境が入る。
 * W8（#1355）でイラン国境をアルメニアの地点にしたら、この決まりは要らなくなる。
 */
export function staysOfChapter(c: Chapter): Stay[] {
  if (!c.from) return [];
  const inside = (x: { from: string; to: string }, ch: Chapter) =>
    !!ch.from && ch.from <= x.from && x.to <= (ch.to || OPEN);
  const overlaps = (x: { from: string; to: string }, ch: Chapter) =>
    x.from <= (ch.to || OPEN) && ch.from <= x.to;
  const branches = CHAPTERS.filter((x) => x.branchOf);
  return STAY_SPANS.filter((x) =>
    c.branchOf ? inside(x, c) : overlaps(x, c) && !branches.some((b) => inside(x, b)),
  ).map((x) => x.stay);
}

/**
 * その章で回った国（slug。着いた順、重ねない）。**国の記録（`content/countries.ts`）のある国だけ。**
 * まだ記録の無い国（滞在の行が `name` を持つ国）は入らない——いま歩いている国まで数えるときは
 * `content/walked.ts` の `chapterCountries()`。
 */
export function chapterCountrySlugs(c: Chapter): string[] {
  return [...new Set(staysOfChapter(c).filter((s) => !s.name).map((s) => s.country))];
}
