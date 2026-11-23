/**
 * 居場所（［いまここ］［つぎ］）と、名刺・`/about` の「いま ◯◯」。**滞在の表から引く。**
 *
 * 表紙の「これから」（`lib/leadPlan.ts`）の上2段と同じ1本。ここに分けてあるのは、
 * 名刺と `/about` の「いま」（`components/home/NowPlace.tsx`）が画面の出たあとに引き直すため。
 * `lib/leadPlan.ts` は企画の表とお題の表を抱くので、そこから引くと `/about` の束に
 * 企画の表まで付いてくる（実測 +6kB。#1278）。`lib/leadPlan.ts` からも今までどおり取れる。
 *
 * 見張りは `site/selftest/leadplan_selftest.mjs`（5b と 8）。
 */
import { countryNameBySlug } from "@/content/countries";
import { STAYS, type Stay } from "@/content/stays";
import { chapterHref, chapterNow } from "@/content/chapters";
import { guideDay } from "@/lib/guideDay";

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
