/**
 * 表紙の「これから」（M-32）。**つぎの滞在・これからの企画・定例の配信のつぎの回、の3つ。**
 *
 * - 居場所（［いまここ］［つぎ］）は滞在の表（`content/stays.ts`）から引く。移動は企画ではない（M-4）
 * - これからの企画は企画の表（`content/projects.ts`）から、日付で状態を決めて引く（M-30）
 * - 定例の配信のつぎの回は、日を持つお題（`content/themes.ts` の `date` と `stream`）から引く
 *
 * 前は告知の札の表（`content/plans.ts`）1枚に、移動・単発の企画・月末配信が混ざっていて、
 * 着いたあとも「〜へ移動」「進行中」と出ていた（あやと 2026-11-18）。その表と、札を並べる面（`/next`）は
 * 畳んだ（#1277。`docs/adr/0006-fold-next-and-now.md`）。
 *
 * **先の予定が0件なのは、正常な状態。** 0件のときに行ってきた企画を出さない（#673。
 * 北欧旅が終わってから25日、表紙が「行ってきた」を「いちばん近い企画」として出していた）。
 * 見張りは `site/selftest/leadplan_selftest.mjs`。
 */
import { daysUntil } from "@/lib/nightly";
import { STAYS, type Stay } from "@/content/stays";
import { stayHere, stayNext, type StayCard } from "@/lib/stayHere";
import { PROJECTS, isLegend, type Project } from "@/content/projects";
import { THEMES } from "@/content/themes";
import { streamTypeBySlug } from "@/content/streamTypes";

/** これからの企画か、定例の配信の回。表紙の「これから」の3段目に並ぶ1件 */
export type Ahead = {
  /** 企画の slug か、お題の id */
  id: string;
  kind: "project" | "stream";
  title: string;
  /** 始まる日（`YYYY-MM-DD`、日本時間の暦日） */
  date: string;
  /** 終わる日。何日かにまたがる企画だけ */
  until?: string;
  /** 押した先。伝説の企画はその面、それ以外の企画は掲示板のそのお題、配信の回はその配信の型の面 */
  href: string;
  /** ひとこと。伝説の企画はその頭の1行、配信の回はその型の1行。単発の企画は持たない */
  note?: string;
};

/** 3つの状態（M-30）。これから／いま／おわった */
export type Phase = "before" | "during" | "after";

/** 日付から状態を決める。手で書かない（M-30） */
export function phaseOf(a: Pick<Ahead, "date" | "until">, now: Date): Phase {
  if ((daysUntil(a.date, now) ?? 0) > 0) return "before";
  return (daysUntil(a.until ?? a.date, now) ?? 0) < 0 ? "after" : "during";
}

/**
 * 企画の押した先。**道を表に書かない**（M-6）。伝説の企画は `/legends/<slug>`。
 * 単発の企画は面を持たない（ADR 0004）ので、その企画に結んだお題（掲示板）へ。お題も無ければ掲示板の頭へ
 */
export function projectHref(p: Project): string {
  if (isLegend(p)) return `/legends/${p.slug}`;
  const t = THEMES.find((x) => x.project === p.slug);
  return t ? `/board#${t.id}` : "/board";
}

const ofProject = (p: Project): Ahead => ({
  id: p.slug,
  kind: "project",
  title: p.title,
  date: p.date,
  ...(p.range && p.range[1] > p.date ? { until: p.range[1] } : {}),
  href: projectHref(p),
  ...(isLegend(p) ? { note: p.lead } : {}),
});

/** 企画と、日を持つ配信の回の全部（日付の早い順） */
export const AHEAD: Ahead[] = [
  ...PROJECTS.map(ofProject),
  ...THEMES.filter((t) => t.stream && t.date).map(
    (t): Ahead => ({
      id: t.id,
      kind: "stream",
      title: t.name,
      date: t.date as string,
      href: `/streams/${t.stream}`,
      note: streamTypeBySlug(t.stream as string)?.short,
    }),
  ),
].sort((a, b) => a.date.localeCompare(b.date));

/** その日の企画と配信の回（始まる日がその日のもの）。今日の便りが読む */
export const aheadOn = (day: string): Ahead[] => AHEAD.filter((a) => a.date === day);

/* 居場所（［いまここ］［つぎ］）と名刺の「いま」は `lib/stayHere.ts` に分けた（#1278）。ここからも取れる */
export { hereNow, stayCard, stayHere, stayNext, type HereNow, type StayCard } from "@/lib/stayHere";

/** 表紙の「これから」に出すもの、上から順に（M-32）。 */
export type UpNext = {
  here: StayCard | undefined;
  next: StayCard | undefined;
  /** 日にちの決まった回（いま行っている → まだ来ていない）。**行ってきたものは入らない** */
  plans: Ahead[];
};

export function upNext(today: Date, rows: readonly Stay[] = STAYS, ahead: readonly Ahead[] = AHEAD): UpNext {
  const during = ahead.filter((a) => phaseOf(a, today) === "during");
  const before = ahead.filter((a) => phaseOf(a, today) === "before");
  return { here: stayHere(today, rows), next: stayNext(today, rows), plans: [...during, ...before] };
}

/** 3段目の先頭の1件。**先が0件なら `undefined`**——行ってきた企画に落ちない（#673） */
export const leadPlan = (today: Date): Ahead | undefined => upNext(today).plans[0];

/* 島の軒に貼る「あと◯日」の日（前の `countdownDay`）は #1279 で外した。常設の軒には状態を貼らない
   （R-24。`components/isle/cover.ts` の注）。つぎまでの日数は表紙の「これから」の段（`upNext`）が言う */
