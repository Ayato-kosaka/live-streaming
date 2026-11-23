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
 *
 * **読み込んだときに、旅と滞在の不変条件（M-10〜M-12）を確かめる。** 外れていれば書き出しが止まる
 * （下の `checkTrips`）。前はアルメニアの滞在とイラン国境の滞在が重なっていて、同じ配信6本が
 * 2つの国に数えられていた（#1355）。重なりを読み手の側の決まり（「枝にすっぽり入る行は枝のもの」）で
 * ごまかしていたので、表のほうは何も言わなかった。
 */
import { BUILT_AT } from "@/lib/builtAt";
import { CHAPTERS, type Chapter } from "./chapters";
import { STAYS, type Stay } from "./stays";

/** その日の前日・翌日。滞在の切れ目を引くためだけなので、暦は UTC で足りる */
const dayBefore = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) - 86400_000).toISOString().slice(0, 10);
const dayAfter = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 86400_000).toISOString().slice(0, 10);

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

const overlaps = (x: { from: string; to: string }, ch: Chapter) =>
  !!ch.from && x.from <= (ch.to || OPEN) && ch.from <= x.to;

/**
 * その章の滞在（着いた順）。**章と期間が重なる行**（`docs/spec/model.md` 6章「旅が回った国」）。
 * 国の記録の無い国の行（いま歩いている国・これから着く国）も入る。
 *
 * **枝の旅も同じ引きかた。** 「イランまで歩く」はアルメニアの滞在の中にあるので、アルメニアが
 * コーカサス周遊と「イランまで歩く」の両方に出る（1つの国が、いくつもの旅に出てよい。M-5 の引きかた）。
 */
export function staysOfChapter(c: Chapter): Stay[] {
  return STAY_SPANS.filter((x) => overlaps(x, c)).map((x) => x.stay);
}

/**
 * その章で回った国（slug。着いた順、重ねない）。**国の記録（`content/countries.ts`）のある国だけ。**
 * まだ記録の無い国（滞在の行が `name` を持つ国）は入らない——いま歩いている国まで数えるときは
 * `content/walked.ts` の `chapterCountries()`。
 */
export function chapterCountrySlugs(c: Chapter): string[] {
  return [...new Set(staysOfChapter(c).filter((s) => !s.name).map((s) => s.country))];
}

/**
 * その国が出る旅（本線も枝も。始まった順）。**国の面の「どの旅で行ったか」の札**と、題の旅の名前に使う。
 * 2回入った国は、入った旅の数だけ返る（同じ旅に2回入っていれば1つ）。
 */
export function tripsOfCountry(slug: string): Chapter[] {
  const mine = STAY_SPANS.filter((x) => x.stay.country === slug);
  return CHAPTERS.filter((c) => mine.some((x) => overlaps(x, c))).sort((a, b) => a.from.localeCompare(b.from));
}

/**
 * 旅と滞在の不変条件（`docs/spec/model.md` 5章）。**1つでも外れていれば、理由を並べて止める。**
 *
 * - M-10 本線の旅（親を持たない旅）は、最初の旅の始まりから今日まで、隙間も重なりも無く並ぶ
 * - M-11 枝の旅の期間は、親の旅の期間の中に収まる
 * - M-12 滞在は互いに重ならない（境目の日だけは前の行の `to` とつぎの行の `from` が同じでよい）。
 *   滞在は、本線の旅ちょうど1つの期間に収まる
 *
 * 「今日」は焼いた日（`BUILT_AT`）。**画面が出てからの時計では見ない**——ブラウザで読み込んだ日に
 * 答えが変わると、焼いたときに通ったものが画面で落ちる。
 *
 * 表を引数で受けるのは、見張り（`site/selftest/stays_table_selftest.mjs`）が壊した表を当てるため。
 */
export function tripProblems(chapters: Chapter[], stays: Stay[], today: string): string[] {
  const out: string[] = [];
  const started = chapters.filter((c) => c.from);
  const main = started.filter((c) => !c.branchOf).sort((a, b) => a.from.localeCompare(b.from));

  // ---- M-10 ----
  for (let i = 1; i < main.length; i++) {
    const a = main[i - 1];
    const b = main[i];
    if (!a.to) out.push(`M-10: ${a.slug} が閉じていないのに ${b.slug} が始まっている`);
    else if (dayAfter(a.to) < b.from) out.push(`M-10: ${a.slug}（${a.to} まで）と ${b.slug}（${b.from} から）のあいだに隙間がある`);
    else if (dayAfter(a.to) > b.from) out.push(`M-10: ${a.slug}（${a.to} まで）と ${b.slug}（${b.from} から）が重なっている`);
  }
  const last = main.at(-1);
  if (last?.to && last.to < today) out.push(`M-10: 本線の最後の旅 ${last.slug} が ${last.to} で閉じていて、今日（${today}）までが空いている`);

  // ---- M-11 ----
  for (const b of started.filter((c) => c.branchOf)) {
    const p = chapters.find((c) => c.slug === b.branchOf);
    if (!p || !p.from) {
      out.push(`M-11: 枝の旅 ${b.slug} の親 ${b.branchOf} が無い（始まっていない）`);
      continue;
    }
    if (b.from < p.from || (b.to || OPEN) > (p.to || OPEN))
      out.push(`M-11: 枝の旅 ${b.slug}（${b.from}〜${b.to || "いま"}）が親 ${p.slug}（${p.from}〜${p.to || "いま"}）からはみ出している`);
  }

  // ---- M-12 ----
  const rows = [...stays].sort((a, b) => a.from.localeCompare(b.from));
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1];
    const b = rows[i];
    if (!a.to) out.push(`M-12: ${a.country}（${a.from} から）が閉じていないのに ${b.country}（${b.from}）が始まっている`);
    else if (a.from === b.from || a.to > b.from)
      out.push(`M-12: ${a.country}（${a.from}〜${a.to}）と ${b.country}（${b.from}〜${b.to || "いま"}）が重なっている`);
  }
  rows.forEach((s, i) => {
    const next = rows.slice(i + 1).find((x) => x.from > s.from);
    const span = { from: s.from, to: [s.to || OPEN, next ? dayBefore(next.from) : OPEN].sort()[0] };
    const homes = main.filter((c) => c.from <= span.from && span.to <= (c.to || OPEN));
    if (homes.length !== 1)
      out.push(
        `M-12: ${s.country}（${s.from}〜${s.to || "いま"}）が本線の旅 ${homes.length} つに収まっている（${homes.map((c) => c.slug).join(", ") || "どれにも収まらない"}）`,
      );
  });
  return out;
}

/** 読み込んだときに1度。外れていれば書き出しを止める（`content/countries.ts` の `checkStays` と同じ形） */
const PROBLEMS = tripProblems(CHAPTERS, STAYS, BUILT_AT.toISOString().slice(0, 10));
if (PROBLEMS.length) throw new Error(`content/stayChapters.ts: 旅と滞在の不変条件が外れている\n${PROBLEMS.join("\n")}`);
