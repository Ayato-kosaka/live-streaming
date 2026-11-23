/**
 * **札を引く関数。島じゅうで、ここ1か所**（`docs/spec/model.md` 6章「引きかた」・M-6・M-7・M-20。#1357）。
 *
 * 札は、ほかの切り口のもの（国・街・旅・企画・料理・月）を、題・1行・リンクで見せる部品。本文を持たない。
 * どの面も、相手の表を自分で読んで札を組まない。**ここを呼んで、返った段をそのまま並べる**
 * （描くのは `components/ui/Tags.tsx`）。
 *
 * ## 結びかたは、名前の鍵（slug）と日付だけ（M-6）
 *
 * | 面 | 出る札 | 引きかた |
 * | --- | --- | --- |
 * | 国・街 | いつ居たか（月）・どの旅で・ここでやった企画・ここで作った料理 | 滞在の期間と重なる月・旅・企画。料理は「作った国」と「作った日」 |
 * | 旅 | 回った国（順に）・この旅の企画・この旅で作った料理・月 | 旅の期間と重なる滞在・企画・月。旅と1対1の企画は鍵（`trip`） |
 * | 企画 | どの旅の中で・通った国と街・関係する料理 | 企画の期間と重なる旅・滞在・料理の日。旅と1対1の企画はその旅の国 |
 * | 料理 | 作った国と街・その旅・この1品の企画 | 「作った国」の鍵と、作った日が入る滞在・旅・企画の期間 |
 * | 月 | その月に居た国・旅・企画 | 月の期間と重なる滞在・旅・企画 |
 *
 * 期間の重なりは、滞在の**事実上の期間**（`content/stayChapters.ts` の `spanOfStay`。境目の日は入った国が取る）で見る。
 * カードの札（その日に居た国と街）は W3（#1277）がカードの面と一緒に作る。引きかたは `stayOn` を使う。
 *
 * ## 札の決まり
 *
 * - **0件の段は返さない。** 見出しだけの空の段を面に作らない
 * - **面の無いものは札にしない**（押した先が無い札を建てない）。国は国の面、街は公開したガイド、企画は伝説の面、月はふりかえりの面
 * - **札の字は、種類で見分けがつくように**する。旅と企画は同じ名前のことがある（イランまで歩く）ので、旅は「旅「…」」、企画は「伝説「…」」。
 *   同じ字が別の先を指すと、読み上げで区別がつかない（`tools/sprites/reachkeys.mjs` の「おなじ字」）
 * - 道は `content/kinds.ts` の `hrefOf` で組む（字で組まない）
 *
 * ## 読み込んだときに、種類と関係の不変条件を確かめる（M-13〜M-17）
 *
 * 外れていれば書き出しを止める（下の `modelProblems`）。M-10〜M-12 は `content/stayChapters.ts` の `tripProblems`。
 */
import type { IconName } from "@/components/ui/icons";
import { BUILT_AT } from "@/lib/builtAt";
import { CHAPTERS, type Chapter } from "@/content/chapters";
import { CITIES, type CityRow } from "@/content/cities";
import { COUNTRIES, countryNameBySlug } from "@/content/countries";
import { hrefOf } from "@/content/kinds";
import { MONTHS } from "@/content/months";
import { pastOn } from "@/content/onThisDay";
import { PROJECTS, byDate, isLegend, type Project } from "@/content/projects";
import { RECIPES, type Recipe } from "@/content/recipes";
import { spanOfStay, staySpans } from "@/content/stayChapters";
import { STAYS, type Stay } from "@/content/stays";
import { publicCities, travelPlace } from "@/content/travel";

/** 札1枚。題・1行・リンク */
export type Tag = {
  /** 段の中で重ねないための鍵（種類の中の slug） */
  key: string;
  /** 題。**種類で見分けがつく字**（上の決まり） */
  label: string;
  /** 1行。無ければ出さない */
  note?: string;
  href: string;
  /** 札の頭の絵。印・スプライト・国旗のどれか */
  art: { icon: IconName } | { sprite: string } | { flag: string };
};

/** 札の段の種類。面の上で並ぶ順もこの順 */
export type TagKind = "month" | "trip" | "country" | "city" | "project" | "dish";

/** 札の段。**0件の段は作らない**（返す前に落とす） */
export type TagRow = {
  kind: TagKind;
  /** 段の見出し（「どの旅で」） */
  title: string;
  tags: Tag[];
  /** 多すぎる段の、のこりの行き先（料理のスタンプ帳など） */
  more?: { href: string; label: string };
};

// ---------------------------------------------------------------- 期間

type Span = { from: string; to: string };
const OPEN = "9999-12-31";
const hit = (a: Span, b: Span) => a.from <= b.to && b.from <= a.to;
const inSpan = (d: string, s: Span) => s.from <= d && d <= s.to;

/** 旅の期間。始まっていない旅は持たない */
const tripSpan = (c: Chapter): Span | undefined => (c.from ? { from: c.from, to: c.to || OPEN } : undefined);

/**
 * 月の期間。**ふりかえりの面が数えている期間**（前の月末配信の日〜その月の月末配信の前日。`content/months.ts` の頭）。
 * 面の無い月は暦のひと月（`docs/spec/model.md` 3章「月」・決定の記録 0016）
 */
const monthSpan = (key: string): Span => {
  const rec = MONTHS.find((m) => m.key === key);
  if (rec) return { from: rec.from, to: rec.to };
  const [y, m] = key.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${key}-01`, to: `${key}-${String(last).padStart(2, "0")}` };
};

/**
 * 企画の期間。**企画の日と、続いていた期間**（1日で終わったものは、その日だけ）。
 * 日の決まっていない企画（`UndatedProject`。M-30）は空——どの期間とも重ならない
 */
const projectSpans = (p: Project): Span[] => [
  ...(p.date ? [{ from: p.date, to: p.date }] : []),
  ...(p.range ? [{ from: p.range[0], to: p.range[1] }] : []),
];

const chapterBySlug = (slug: string) => CHAPTERS.find((c) => c.slug === slug);

/** 企画が重なる滞在。**旅と1対1の企画は、その旅の滞在**（日付では引かない。出発した晩を前の国に数えない） */
function staysOfProject(p: Project): Stay[] {
  const trip = p.trip ? chapterBySlug(p.trip) : undefined;
  const ts = trip && tripSpan(trip);
  if (ts) return STAYS.filter((s) => hit(spanOfStay(s), ts));
  const spans = projectSpans(p);
  return STAYS.filter((s) => spans.some((x) => hit(spanOfStay(s), x)));
}

/** 企画が中にある旅（本線も枝も。始まった順）。**旅と1対1の企画は、その旅だけ** */
function tripsOfProject(p: Project): Chapter[] {
  if (p.trip) return CHAPTERS.filter((c) => c.slug === p.trip);
  const spans = projectSpans(p);
  return CHAPTERS.filter((c) => {
    const ts = tripSpan(c);
    return !!ts && spans.some((x) => hit(ts, x));
  }).sort((a, b) => a.from.localeCompare(b.from));
}

/** 料理の日に居た滞在（その国の行のうち、作った日が入るもの） */
const stayOfDish = (r: Recipe): Stay | undefined => STAYS.find((s) => s.country === r.country && inSpan(r.date, spanOfStay(s)));

/** その日に居た滞在。**カードの札（W3）もここから引く** */
export const stayOn = (day: string): Stay | undefined => staySpans().find((x) => inSpan(day, x))?.stay;

// ---------------------------------------------------------------- 札1枚（面の在るものだけ）

const ym = (key: string) => `${key.slice(0, 4)}年${Number(key.slice(5, 7))}月`;
const md = (d: string) => `${Number(d.slice(5, 7))}月${Number(d.slice(8, 10))}日`;

function countryTag(slug: string): Tag | undefined {
  if (!travelPlace(slug)) return undefined;
  const name = countryNameBySlug(slug)?.name;
  if (!name) return undefined;
  return { key: slug, label: name, href: hrefOf("/travel/<国>", slug), art: { flag: slug } };
}

function cityTag(c: CityRow): Tag | undefined {
  if (!publicCities(c.country).some((x) => x.slug === c.slug)) return undefined;
  const country = countryNameBySlug(c.country)?.name;
  return {
    key: `${c.country}/${c.slug}`,
    label: c.name,
    note: country ? `${country}の街` : undefined,
    href: hrefOf("/travel/<国>/<街>", c.country, c.slug),
    art: { icon: "pin" },
  };
}

const tripTag = (c: Chapter): Tag => ({
  key: c.slug,
  /* 旅と企画は同じ名前のことがある（イランまで歩く）。旅の島へ送る札は「旅「…」」、企画は「伝説「…」」 */
  label: `旅「${c.name}」`,
  note: c.from ? `${c.from.slice(0, 4)}年${Number(c.from.slice(5, 7))}月から${c.branchOf ? "の寄り道" : ""}` : undefined,
  href: hrefOf("/island/<旅>", c.slug),
  art: { icon: "island" },
});

function projectTag(p: Project): Tag | undefined {
  /* 面を持つのは伝説の印の付いた企画だけ（`/legends/<企画>`）。告知だけの企画は札にしない */
  if (!isLegend(p)) return undefined;
  return { key: p.slug, label: `伝説「${p.title}」`, note: p.span, href: hrefOf("/legends/<企画>", p.slug), art: { sprite: p.icon } };
}

const dishTag = (r: Recipe): Tag => ({
  key: r.slug,
  label: r.name,
  note: md(r.date),
  href: hrefOf("/kitchen/<料理>", r.slug),
  art: { sprite: r.icon },
});

function monthTag(key: string): Tag | undefined {
  if (!MONTHS.some((m) => m.key === key)) return undefined;
  return { key, label: ym(key), note: "ふりかえり", href: hrefOf("/months/<月>", key), art: { icon: "calendar" } };
}

// ---------------------------------------------------------------- 段を組む

const uniq = (tags: (Tag | undefined)[]): Tag[] => {
  const seen = new Set<string>();
  return tags.filter((t): t is Tag => !!t && !seen.has(t.key) && !!seen.add(t.key));
};

/** 段を並べる。**0件の段は落とす** */
const rows = (...xs: (TagRow | undefined)[]): TagRow[] => xs.filter((r): r is TagRow => !!r && r.tags.length > 0);

/** 期間と重なる月（ふりかえりの面の在る月だけ。古い順） */
function monthsOf(spans: Span[]): Tag[] {
  const keys = MONTHS.map((m) => m.key).filter((k) => spans.some((s) => hit(monthSpan(k), s)));
  return uniq(keys.sort().map(monthTag));
}

const tripsOf = (spans: Span[]): Chapter[] =>
  CHAPTERS.filter((c) => {
    const ts = tripSpan(c);
    return !!ts && spans.some((s) => hit(ts, s));
  }).sort((a, b) => a.from.localeCompare(b.from));

const projectsOf = (spans: Span[]): Project[] =>
  PROJECTS.filter((p) => staysSpansHit(p, spans)).sort(byDate);

/** 企画が、滞在の期間（ぜんぶ）のどれかと重なるか。旅と1対1の企画は、その旅の滞在で */
function staysSpansHit(p: Project, spans: Span[]): boolean {
  return staysOfProject(p).some((s) => spans.some((x) => hit(spanOfStay(s), x)));
}

/** 料理の段。多い面（ジョージア25品）は、頭だけ出して、のこりはスタンプ帳へ */
const DISHES = 8;
function dishRow(title: string, list: Recipe[]): TagRow {
  const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
  return {
    kind: "dish",
    title,
    tags: sorted.slice(0, DISHES).map(dishTag),
    more: sorted.length > DISHES ? { href: hrefOf("/kitchen"), label: `のこりの${sorted.length - DISHES}品も見る` } : undefined,
  };
}

const sinceOf = (s: Stay[]) => s.map((x) => spanOfStay(x));

/** 国の面の札 */
export function tagsOfCountry(slug: string): TagRow[] {
  const mine = STAYS.filter((s) => s.country === slug);
  const spans = sinceOf(mine);
  return rows(
    { kind: "month", title: "いつ居たか", tags: monthsOf(spans) },
    { kind: "trip", title: "どの旅で", tags: uniq(tripsOf(spans).map(tripTag)) },
    { kind: "project", title: "ここでやった企画", tags: uniq(projectsOf(spans).filter((p) => isLegend(p)).map(projectTag)) },
    dishRow("ここで作った料理", RECIPES.filter((r) => r.country === slug)),
  );
}

/** 街の面の札（街に居た滞在から。滞在の表が街を slug で指す。M-6） */
export function tagsOfCity(country: string, city: string): TagRow[] {
  const mine = STAYS.filter((s) => s.country === country && s.towns?.some((t) => t.city === city));
  const spans = sinceOf(mine);
  return rows(
    { kind: "month", title: "いつ居たか", tags: monthsOf(spans) },
    { kind: "trip", title: "どの旅で", tags: uniq(tripsOf(spans).map(tripTag)) },
    { kind: "project", title: "ここでやった企画", tags: uniq(projectsOf(spans).map(projectTag)) },
    dishRow("ここで作った料理", RECIPES.filter((r) => r.country === country && spans.some((s) => inSpan(r.date, s)))),
  );
}

/** 旅の面の札 */
export function tagsOfTrip(slug: string): TagRow[] {
  const c = chapterBySlug(slug);
  const ts = c && tripSpan(c);
  if (!c || !ts) return [];
  const stays = STAYS.filter((s) => hit(spanOfStay(s), ts)).sort((a, b) => a.from.localeCompare(b.from));
  /* この旅の企画: 旅と1対1の企画は鍵で。ほかは期間が重なるもの。**枝の旅は、鍵で結んだ企画だけ**
     （「イランまで歩く」の島に、コーカサスの1年ぶんの企画を並べない。`components/isle/spec.ts` の `legendsOf` と同じ） */
  const projects = PROJECTS.filter((p) =>
    p.trip ? p.trip === slug : !c.branchOf && projectSpans(p).some((x) => hit(x, ts)),
  ).sort(byDate);
  return rows(
    { kind: "country", title: "回った国", tags: uniq(stays.map((s) => countryTag(s.country))) },
    { kind: "project", title: "この旅の企画", tags: uniq(projects.map(projectTag)) },
    dishRow("この旅で作った料理", RECIPES.filter((r) => inSpan(r.date, ts))),
    { kind: "month", title: "月", tags: monthsOf([ts]) },
  );
}

/** 企画の面の札 */
export function tagsOfProject(slug: string): TagRow[] {
  const p = PROJECTS.find((x) => x.slug === slug);
  if (!p) return [];
  const stays = staysOfProject(p).sort((a, b) => a.from.localeCompare(b.from));
  const spans = p.trip ? sinceOf(stays) : projectSpans(p);
  /* 街は、滞在が鍵で指している街のうち、企画の期間に居た滞在のもの */
  const cities = stays.flatMap((s) => (s.towns ?? []).flatMap((t) => (t.city ? [CITIES.find((c) => c.country === s.country && c.slug === t.city)] : [])));
  return rows(
    { kind: "trip", title: "どの旅の中で", tags: uniq(tripsOfProject(p).map(tripTag)) },
    { kind: "country", title: "通った国", tags: uniq(stays.map((s) => countryTag(s.country))) },
    { kind: "city", title: "通った街", tags: uniq(cities.map((c) => c && cityTag(c))) },
    dishRow("関係する料理", RECIPES.filter((r) => spans.some((s) => inSpan(r.date, s)))),
  );
}

/** 料理の面の札 */
export function tagsOfDish(slug: string): TagRow[] {
  const r = RECIPES.find((x) => x.slug === slug);
  if (!r) return [];
  const stay = stayOfDish(r);
  /* 街は、その日の滞在が鍵で指している街。**街が1つの滞在だけ**——2つ以上なら、どちらで作ったか言えない */
  const keyed = (stay?.towns ?? []).filter((t) => t.city);
  const city = stay && stay.towns?.length === 1 && keyed.length === 1 ? CITIES.find((c) => c.country === r.country && c.slug === keyed[0].city) : undefined;
  const day = { from: r.date, to: r.date };
  return rows(
    { kind: "country", title: "作った国", tags: uniq([countryTag(r.country)]) },
    { kind: "city", title: "作った街", tags: uniq([city && cityTag(city)]) },
    { kind: "trip", title: "その旅", tags: uniq(tripsOf([day]).map(tripTag)) },
    /* 作った日が企画の期間に入る企画（イワシ祭りの3品）。企画の面の「関係する料理」と同じ引きかたの裏返し */
    {
      kind: "project",
      title: "この1品の企画",
      tags: uniq(PROJECTS.filter((p) => !p.trip && projectSpans(p).some((x) => inSpan(r.date, x))).map(projectTag)),
    },
  );
}

/** 月の面の札 */
export function tagsOfMonth(key: string): TagRow[] {
  const span = monthSpan(key);
  const stays = STAYS.filter((s) => hit(spanOfStay(s), span)).sort((a, b) => a.from.localeCompare(b.from));
  return rows(
    { kind: "country", title: "この月に居た国", tags: uniq(stays.map((s) => countryTag(s.country))) },
    { kind: "trip", title: "旅", tags: uniq(tripsOf([span]).map(tripTag)) },
    {
      kind: "project",
      title: "企画",
      tags: uniq(PROJECTS.filter((p) => projectSpans(p).some((x) => hit(x, span))).sort(byDate).map(projectTag)),
    },
  );
}

// ---------------------------------------------------------------- 不変条件（M-13〜M-17）

export type ModelTables = {
  stays: Stay[];
  chapters: Chapter[];
  projects: Project[];
  recipes: Recipe[];
  /** 国の記録（歩き終わった国）の slug */
  countries: string[];
  /** 配信の在る日（JST の YYYY-MM-DD） */
  streamDays: string[];
};

/** 配信の在る日ぜんぶ。毎晩焼かれる「1年前の今日」（`content/onThisDay.ts`）が、配信の在った日を1日1本ずつ持っている */
export function streamDays(): string[] {
  const out: string[] = [];
  for (let m = 1; m <= 12; m++)
    for (let d = 1; d <= 31; d++) out.push(...pastOn(`${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`).map((s) => s.d));
  return [...new Set(out)].sort();
}

/**
 * 種類と関係の不変条件（`docs/spec/model.md` 5章）。**1つでも外れていれば、理由を並べて止める。**
 *
 * - M-13 終わりの日が空の滞在は、多くて1つ
 * - M-14 配信の在る日は、ちょうど1つの滞在に入る（滞在の事実上の期間で。境目の日は入った国が取る）
 * - M-15 名前の鍵の指す先が在る（滞在の国・企画の旅・料理の国。街の鍵は `content/stays.ts` の `stayKeyProblems`）
 * - M-16 旅と1対1で結ぶ企画は、旅1つにつき多くて1つ
 * - M-17 国の一覧に、国でないものを置かない（旅の slug・国境の区間）
 *
 * 表を引数で受けるのは、見張り（`site/selftest/tags_selftest.mjs`）が壊した表を当てるため。
 */
export function modelProblems(t: ModelTables): string[] {
  const out: string[] = [];
  // ---- M-13 ----
  const open = t.stays.filter((s) => !s.to);
  if (open.length > 1) out.push(`M-13: 終わりの日が空の滞在が ${open.length} 行ある（${open.map((s) => `${s.country} ${s.from}`).join(", ")}）`);

  // ---- M-14 ----（事実上の期間は、この表で組み直す。`spanOfStay` は本物の表しか知らない）
  const rows = [...t.stays].sort((a, b) => a.from.localeCompare(b.from));
  const dayBefore = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) - 86400_000).toISOString().slice(0, 10);
  const spans = rows.map((s, i) => {
    const next = rows.slice(i + 1).find((x) => x.from > s.from);
    return { s, from: s.from, to: [s.to || OPEN, next ? dayBefore(next.from) : OPEN].sort()[0] };
  });
  const lost: string[] = [];
  const twice: string[] = [];
  for (const d of t.streamDays) {
    const n = spans.filter((x) => inSpan(d, x)).length;
    if (n === 0) lost.push(d);
    if (n > 1) twice.push(d);
  }
  if (lost.length) out.push(`M-14: 配信の在る日が、どの滞在にも入っていない（${lost.length}日: ${lost.slice(0, 5).join(", ")}${lost.length > 5 ? " …" : ""}）`);
  if (twice.length) out.push(`M-14: 配信の在る日が、2つ以上の滞在に入っている（${twice.length}日: ${twice.slice(0, 5).join(", ")}）`);

  // ---- M-15 ----
  const named = new Set([...t.countries, ...t.stays.filter((s) => s.name).map((s) => s.country)]);
  const trips = new Set(t.chapters.map((c) => c.slug));
  for (const p of t.projects) if (p.trip && !trips.has(p.trip)) out.push(`M-15: 企画 ${p.slug} の旅 ${p.trip} が旅の表（content/chapters.ts）に無い`);
  for (const r of t.recipes) if (!named.has(r.country)) out.push(`M-15: 料理 ${r.slug} の国 ${r.country} が、国の記録にも滞在の表にも無い`);
  for (const c of t.countries) if (!t.stays.some((s) => s.country === c)) out.push(`M-15: 国 ${c} に滞在の行が無い`);

  // ---- M-16 ----
  for (const slug of trips) {
    const ps = t.projects.filter((p) => p.trip === slug);
    if (ps.length > 1) out.push(`M-16: 旅 ${slug} を指す企画が ${ps.length} つある（${ps.map((p) => p.slug).join(", ")}）`);
  }

  // ---- M-17 ----
  for (const c of named) {
    if (trips.has(c)) out.push(`M-17: 国の一覧に旅（${c}）が居る`);
    if (c.endsWith("-border")) out.push(`M-17: 国の一覧に国境の区間（${c}）が居る`);
  }
  return out;
}

/** 読み込んだときに1度。外れていれば書き出しを止める（`content/stayChapters.ts` の `tripProblems` と同じ形） */
const PROBLEMS = modelProblems({
  stays: STAYS,
  chapters: CHAPTERS,
  projects: PROJECTS,
  recipes: RECIPES,
  countries: COUNTRIES.map((c) => c.slug),
  streamDays: streamDays().filter((d) => d <= BUILT_AT.toISOString().slice(0, 10)),
});
if (PROBLEMS.length) throw new Error(`lib/tags.ts: 種類と関係の不変条件が外れている\n${PROBLEMS.join("\n")}`);
