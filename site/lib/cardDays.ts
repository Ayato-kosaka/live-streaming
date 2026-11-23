/**
 * カードの「その日」の札。**その日の企画と、その日の滞在から引く**（#173・#202・#1277）。
 *
 * カードは「その日の画像 × その日に投げてくれた人」でできていて、札とは日付で結ぶ（M-6・M-7）。
 * 札は3種類:
 *
 * | 札 | どこから | 押した先 |
 * | --- | --- | --- |
 * | その日に始まった企画 | 企画の表（`content/projects.ts`） | 伝説の企画はその面、単発の企画は掲示板のそのお題（`lib/leadPlan.ts` の `projectHref`） |
 * | 旅の1日 | 北欧の旅程（`content/nordic.ts` の `DAY_PAGES`） | その日の面。**ページのある日だけ** |
 * | その日に居た所 | 滞在の表（`content/stays.ts`） | 街のガイドか国の面。面の無い国は札にしない（押した先の無い札を建てない） |
 *
 * 前は告知の札の表（`content/plans.ts`）から引いていて、札は `/next#<id>` を指していた。
 * 企画を並べる面（`/next`）を畳んだので、札は企画そのものの行き先へ向ける。
 *
 * **期間のある企画は、始まった日にしか付けない。** 10日ものを毎日に付けると、旅の写真ぜんぶに同じ名前が並ぶ。
 * 滞在は毎日付く——「どこで撮ったか」は、どの日のカードにも要る1行なので。
 *
 * ## 滞在は、日ごとに焼かない
 *
 * 滞在は日をまたぐので、日ごとの表に開くと何百日ぶんになる。この表は面（server）が client へ
 * 値で渡す（カードは client で Firestore から読む）ので、**期間の並び（30行あまり）のまま渡して**、
 * 日はカードの側で引く（`components/cards/cards.ts` の `briefsOn`）。
 *
 * ここを画面（client）から直に読まない。旅程表（44KB）と企画の表を連れていくことになる。
 */
import type { DayBriefs, PlanBrief, StaySpan } from "@/components/cards/cards";
import { PROJECTS } from "@/content/projects";
import { STAYS } from "@/content/stays";
import { DAY_PAGES, dayHref, dayName } from "@/content/nordic";
import { TRAVEL_CITIES, travelPlace } from "@/content/travel";
import { projectHref, stayCard } from "@/lib/leadPlan";

const byDay = (() => {
  const out: Record<string, PlanBrief[]> = {};
  const put = (date: string, brief: PlanBrief) => {
    (out[date] ??= []).push(brief);
  };
  /* 並びは企画の表のまま（9月11日は3本立つ。表の並びがその日の札の並び）。日の決まっていない企画（M-30）はどの日にも立たない */
  for (const p of PROJECTS) if (p.date) put(p.date, { title: p.title, href: projectHref(p) });
  /* 名前は「北欧旅 出発」「北欧旅 3日目」。カードは島じゅうの並びに出るので、何の3日目かを付ける */
  for (const d of DAY_PAGES) if (d.date) put(d.date, { title: `北欧旅 ${dayName(d)}`, href: dayHref(d) });
  return out;
})();

/**
 * 滞在の札の行き先。案内の面が街のガイドならそこ（ソフィア・ブカレスト）、それ以外は国の面。
 * **字で街を当てない**（M-6）——滞在の案内の街の鍵（`guide.city`）と国の slug で、街の名簿から引く。
 * 前は案内の面の道（`guide.href`）と街の面の道を字で突き合わせていた（#1279）。
 */
const stayHref = (s: (typeof STAYS)[number]): string | undefined =>
  (s.guide?.city ? TRAVEL_CITIES.find((c) => c.country === s.country && c.slug === s.guide!.city)?.href : undefined) ??
  travelPlace(s.country)?.href;

const stays: StaySpan[] = STAYS.flatMap((s) => {
  const href = stayHref(s);
  return href ? [{ from: s.from, ...(s.to ? { to: s.to } : {}), title: stayCard(s).place, href }] : [];
});

export const DAY_BRIEFS: DayBriefs = { byDay, stays };
