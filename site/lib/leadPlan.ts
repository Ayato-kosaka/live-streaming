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
import { countryNameBySlug } from "@/content/countries";
import { STAYS, type Stay } from "@/content/stays";
import { PROJECTS, isLegend, type Project } from "@/content/projects";
import { THEMES } from "@/content/themes";
import { streamTypeBySlug } from "@/content/streamTypes";
import { guideDay } from "@/lib/guideDay";
import { chapterHref, chapterNow } from "@/content/chapters";

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

/* ------------------------------------------------------------------ 滞在から引く
   表紙の「これから」の上2段（［いまここ］［つぎ］）は、企画ではなく滞在の表から引く
   （`docs/spec/model.md` 6章「引きかた」・M-22・M-30。#1276）。 */

/** 滞在1行を、表紙で呼ぶ名前つきで。 */
export type StayCard = Stay & {
  /** 国の名前（「ルーマニア」）。名前の持ち主は国の記録、記録の無い国だけ滞在の行（`stays.ts` の `name`） */
  countryName: string;
  /** 「ルーマニア」「ブルガリア・ソフィア」。**街が分からなければ国だけ**（推測で埋めない） */
  place: string;
};

/** 滞在1行に、表紙で呼ぶ名前を付ける（カードの札も同じ名前で呼ぶ。`lib/cardDays.ts`） */
export const stayCard = (s: Stay): StayCard => {
  const countryName = s.name ?? countryNameBySlug(s.country)?.name ?? s.country;
  /* 街が2つ以上なら国だけ。並べると、どこに「いる」のかが言えない */
  return { ...s, countryName, place: s.cities.length === 1 ? `${countryName}・${s.cities[0]}` : countryName };
};

/**
 * ［いまここ］。**着いた日が今日より前（今日を含む）の行のうち、いちばん新しく着いた行。**
 *
 * - ふつうは「終わりの日が空の行」（M-13）と同じ1行になる
 * - つぎの国の行が先に足されていても（前の行の `to` が入り、つぎの行の `to` が空）、
 *   **着く日まではいまの国**。つぎの行の着いた日に入れ替わる（M-22）
 * - **日付が過ぎただけでは消えない**（M-22）。`to` が過ぎても、つぎの行が始まっていなければ、
 *   その行のまま。どの日に開いても0件にならない
 * - 枝の行が本線の行の中に重なっているとき（アルメニアとイラン国境。M-12 の残り、W8）は、
 *   **その日に終わっていない行**を先に見る（終わった枝の行に、いまの国を取られない）
 *
 * 日は日本時間で切る（`lib/guideDay.ts` の `guideDay`。島の札と同じ日に替わる）。
 */
export function stayHere(today: Date, rows: readonly Stay[] = STAYS): StayCard | undefined {
  const day = guideDay(today);
  const came = rows.filter((s) => s.from <= day);
  const open = came.filter((s) => !s.to || day <= s.to);
  const pick = (xs: Stay[]) => xs.reduce<Stay | undefined>((a, s) => (!a || s.from >= a.from ? s : a), undefined);
  const s = pick(open) ?? pick(came);
  return s && stayCard(s);
}

/** ［つぎ］。**着く日が今日より先の行のうち、いちばん近いもの。**無ければ `undefined`（6章「引きかた」） */
export function stayNext(today: Date, rows: readonly Stay[] = STAYS): StayCard | undefined {
  const day = guideDay(today);
  const s = rows
    .filter((x) => x.from > day)
    .reduce<Stay | undefined>((a, x) => (!a || x.from < a.from ? x : a), undefined);
  return s && stayCard(s);
}

/** 名刺（表紙）と `/about` の「いま ◯◯」。 */
export type HereNow = {
  /** いまいる所。［いまここ］の `place`（街が分からなければ国だけ） */
  place: string;
  /** いまの旅の名前。押した先の島の名前 */
  trip: string;
  /** 押した先。いまの旅の島（`/island/<章>`） */
  href: string;
};

/**
 * 名刺と `/about` の「いま ◯◯」（#1278）。**字は［いまここ］と同じ1本、押した先はいまの旅の島。**
 *
 * 前は Firestore の `island/state.current.place`（あやとが手で打つ欄）を読み、`/now` へ送っていた。
 * `/now` は畳み（`docs/adr/0006-fold-next-and-now.md`）、居場所の持ち主は滞在の表だけ（M-20）。
 * 「いま」を面として言うのは表紙だけなので（M-31）、押した先は面ではなく、いまの章の島。
 */
export function hereNow(today: Date, rows: readonly Stay[] = STAYS): HereNow {
  const c = chapterNow(today);
  return { place: stayHere(today, rows)?.place ?? "", trip: c.name, href: chapterHref(c) };
}

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

/**
 * 島の「これから」のテントに貼る「あと◯日」の日（`YYYY-MM-DD`）。**無ければ `undefined`。**
 *
 * つぎの滞在の着く日と、まだ来ていない回の日のうち、**今日から数えていちばん近い日。**
 * 表紙の段と同じもの（`upNext`）から引く。今日の日は入る（「今日」と出る）。過ぎた日は入らない。
 */
export function countdownDay(today: Date, rows: readonly Stay[] = STAYS, ahead: readonly Ahead[] = AHEAD): string | undefined {
  const u = upNext(today, rows, ahead);
  return [u.next?.from, ...u.plans.map((p) => p.date)]
    .filter((d): d is string => !!d && (daysUntil(d, today) ?? -1) >= 0)
    .sort()[0];
}
