/**
 * 伝説の企画（`/legends` に並ぶもの）。**表ではない。企画の表の、印の付いた行を面の形に組んだもの。**
 *
 * 伝説は種類ではなく、企画に付く印（`docs/spec/model.md` M-3）。中身はぜんぶ
 * `content/projects.ts` の `PROJECTS` に在る。ここでやるのは2つだけ:
 * - 旅の記録から数える数（北欧の台数・距離・国の数。`Counted`）を数えて字にする
 * - 企画のために作った面（`pages`）の道を、企画が指す旅（`trip`）から引く（M-6。道を表に書かない）
 *
 * **ここは旅程の表（`content/nordic.ts`）を読むので重い。client から読まない。**
 * 伝説の名前と数だけが要る client（掲示板）は `content/projects.ts` を直に読む。
 */
import { PROJECTS, isLegend, type Counted, type Figure, type FigureSrc, type LegendProject, type ProjectPage } from "./projects";
import { HITCH_KM, NORDIC_GUIDE_HREF, NORDIC_HREF, RIDES_TOTAL } from "./nordic";
import { chapterHref, chapterOf } from "./chapters";
import { chapterCountrySlugs } from "./stayChapters";

export type { Figure };

export type Legend = Omit<LegendProject, "figure" | "facts" | "pages" | "notice" | "legend"> & {
  figure: Figure;
  facts?: Figure[];
  pages?: { href: string; title: string; note: string }[];
};

/** 旅の記録から数える数。**表に写さない**（写した数が正になることはない。`docs/island-misses.md` #38） */
const COUNTED: Record<Counted, () => number> = {
  /* 乗せてくれた車の台数。バスと船は数えない（`rideCount`） */
  "nordic-rides": () => RIDES_TOTAL,
  /* 人の車で進んだ距離。`ROUTE` の hitch 区間の合計 */
  "nordic-km": () => HITCH_KM,
  /* 北欧周遊で入った国。滞在から引く（章に国を書かない。`content/chapters.ts` の頭） */
  "nordic-countries": () => chapterCountrySlugs(chapterOf("nordic")).length,
};

const figure = (f: FigureSrc): Figure => {
  if (!("count" in f)) return f;
  const { count, ...rest } = f;
  const n = COUNTED[count]();
  /* 0 を答えとして出さない。数える先が動いたら、焼く前に止める */
  if (!n) throw new Error(`伝説の数「${count}」が 0 になった（数える先が動いた？）`);
  return { ...rest, n: n.toLocaleString("en-US") };
};

/** 企画のために作った面の道。**企画が指す旅から引く。** 旅を指していない企画が面を持つと投げる */
const pageHref = (l: LegendProject, pg: ProjectPage): string => {
  if (!l.trip) throw new Error(`伝説「${l.slug}」は旅を指していないのに、旅の面（${pg.of}）を持っている`);
  const trip = chapterHref(chapterOf(l.trip));
  if (pg.of === "trip") return trip;
  /* 旅のしおりは、いまは北欧周遊だけが持つ。ほかの旅に付けたら止める */
  if (trip !== NORDIC_HREF) throw new Error(`旅「${l.trip}」には旅のしおりが無い`);
  return NORDIC_GUIDE_HREF;
};

const toLegend = (l: LegendProject): Legend => {
  const { figure: f, facts, pages, notice: _notice, legend: _legend, ...rest } = l;
  return {
    ...rest,
    figure: figure(f),
    facts: facts?.map(figure),
    pages: pages?.map((pg) => ({ href: pageHref(l, pg), title: pg.title, note: pg.note })),
  };
};

/** 伝説の企画。並びは企画の表のまま（先頭が「いちばん語られている」） */
export const LEGENDS: Legend[] = PROJECTS.filter(isLegend).map(toLegend);

export const legendBySlug = (slug: string) => LEGENDS.find((l) => l.slug === slug);
