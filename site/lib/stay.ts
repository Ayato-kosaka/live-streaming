/**
 * いまいる国に、今日で何日いるか（`docs/island-play.md` 仕掛け10）。
 *
 * 旅は演出ではなく事実として進んでいるので、**この数字は毎日1ずつ増える**。
 * 「歩いた国」の面には、いままで「いまここ ジョージア」としか出ていなかった。
 * 国の名前は数ヶ月変わらないので、あの欄だけが止まって見えていた。
 *
 * 静的書き出しなので、**画面が出てから数え直す**（`components/atlas/StayDays.tsx`）。
 * ここで数えた値をそのまま焼くと、ビルドした日の日数が固定で出る。
 *
 * ## 終わりの空いた滞在を、いつまでも続けない
 *
 * 前はここが `stays.find((x) => !x.to)`——**終わりの日が入っていない滞在**——を
 * そのまま「いまいる国」として、今日まで数えつづけていた。
 * ジョージアの最後の滞在に `to` が無いので、**北欧へ出発しても止まらない。**
 * 旅の1週間後に開いても「ジョージアに来て 126日目」「いまもここにいる」と出る。
 *
 * `to` は事実の欄で、旅に出た日にあやとが手で入れるものだが、
 * **その17日間、あやとは画面を直せない。** だからデータではなくコードで閉じる。
 *
 * 閉じ方は `content/chapters.ts` の `chapterSpan()` が持っている
 * （**次の章が始まったら、そこで終わり**）。滞在もそこを見る。
 * 期間の閉じ方を2か所に書くと、島の札は「終わった」なのに国だけ数えつづける、
 * という食い違いが出る（`docs/island-misses.md` #21）。
 */

import { CHAPTERS, chapterDays, chapterNow, chapterSpan, type Chapter } from "@/content/chapters";
import { COUNTRIES } from "@/content/countries";
/* 「人が書いた欄が古いか」（`placeOutdated`）は、打たれた字を読む道具のほう
   （`lib/place.ts`）に移した。旅の面（`/nordic`）はそれだけを使うので、
   ここに置いたままだと国の表まで面の JS に付いてくる（実測 8kB）。
   ここから読んでいた側は今までどおり `@/lib/stay` から取れる。 */
import { placeOutdated } from "@/lib/place";
import { jstNow } from "@/lib/nightly";

export { placeOutdated };

export type StayNow = {
  /** 国の名前 */
  name: string;
  /** 国の slug。国旗と行き先に使う */
  slug: string;
  /** その国に入って、今日で何日目か。入った日が1日目 */
  days: number;
  /** 入った日（YYYY-MM-DD） */
  from: string;
};

/**
 * いま歩いている旅。**国の記録が追いつくまでのあいだ、「いまどこ」はこちらが受ける。**
 *
 * 出発してからの17日間、`content/countries.ts` に北欧の6カ国は無い
 * （歩いてから足す決まり）。国が引けないからといって前の国を出しつづけると、
 * 画面が嘘をつく。国のかわりに**章そのもの**——いまどの旅の途中か——を出す。
 */
export type TravelNow = {
  /** 章の名前。そのまま「いまどこ」になる */
  name: string;
  slug: string;
  /** その旅の島 */
  href: string;
  /** 章の一行（`content/chapters.ts` の note） */
  note: string;
  /** 旅に出て何日目か。出た日が1日目 */
  days: number;
};

/**
 * その国を歩いた章。**本線のうち、いちばん新しいもの。**
 *
 * 枝（イランまで歩く）は本線の滞在を閉じる側ではないので見ない。
 * 同じ国に何度も入っている場合、滞在を閉じるのはいちばん新しい章。
 */
function chapterOfCountry(slug: string): Chapter | undefined {
  return [...CHAPTERS].reverse().find((c) => !c.branchOf && c.countries.includes(slug));
}

/**
 * その国の滞在が閉じた日（YYYY-MM-DD）。まだ続いていれば `null`。
 *
 * **日付は、次の章が始まる日をその土地の暦で読む。** `chapterSpan()` が返すのは
 * 瞬間（ミリ秒）で、北欧への出発は現地の 23:30 なので、日本時間に直すと翌日になる。
 * 「出国 2026/09/12」は1日ずれた嘘になるので、章が持っている日付の欄
 * （`from` / `opensAt` の日付部分）をそのまま使う。
 */
export function stayClosedOn(slug: string, now: Date = new Date()): string | null {
  const ch = chapterOfCountry(slug);
  if (!ch) return null;
  // 章に終わりが入っていれば、それがそのまま滞在の終わり
  if (ch.to) return ch.to;
  const to = chapterSpan(ch, now).to;
  if (to == null) return null; // まだこの島にいる
  // 閉じたのは「次に始まった章」。始まった瞬間が一致するものを引く
  const next = CHAPTERS.find((x) => !x.branchOf && chapterSpan(x, now).from === to);
  return next ? next.from || next.opensAt?.slice(0, 10) || null : null;
}

/**
 * 入った日を1日目として、何日目か。
 *
 * **日付は日本時間で切る。** 配信日と同じ切り方にしておかないと、
 * 「今日で107日目」と「今夜の配信」が別の日を指す時間帯ができる。
 *
 * `until` に日付（YYYY-MM-DD）を渡すと、その日で止めて数える。
 * 出国した国の日数はここで止まる。
 */
export function stayDays(from: string, until: Date | string = new Date()): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const day = typeof until === "string" ? until : jstNow(until).date;
  const b = Date.parse(`${day}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  // 入った日を1日目と数える。0日目という言い方をしない
  return Math.round((b - a) / 86400000) + 1;
}

/**
 * いまいる国と、今日で何日目か。**旅に出たら `null`。**
 *
 * 「いまいる国」は、終わりの日の入っていない滞在。ただしその章が終わっていれば、
 * 終わりが書き入れられていなくても**もうその国にはいない**（`stayClosedOn`）。
 */
export function stayNow(now: Date = new Date()): StayNow | null {
  for (const c of COUNTRIES) {
    const s = c.stays.find((x) => !x.to);
    if (!s) continue;
    if (stayClosedOn(c.slug, now)) continue;
    const days = stayDays(s.from, now);
    return days > 0 ? { name: c.name, slug: c.slug, days, from: s.from } : null;
  }
  return null;
}

/**
 * いま歩いている旅。**いる国が引けるあいだは `null`**（そちらのほうが細かい）。
 *
 * 国が引けなくなるのは、次の島へ渡ったとき。そこから先は章が「いまどこ」になる。
 */
export function travelNow(now: Date = new Date()): TravelNow | null {
  if (stayNow(now)) return null;
  const c = chapterNow(now);
  if (!c) return null;
  return {
    name: c.name,
    slug: c.slug,
    href: `/island/${c.slug}`,
    note: c.note,
    days: chapterDays(c, now),
  };
}

/**
 * 「いまどこ」を、人の書いた欄ではなく**旅そのもの**で言う日か。
 *
 * 旅に出ていて、かつ人の欄がその旅より前のままのときだけ。
 * あやとが旅の途中で書き替えたら（「リガ・ラトビア」）、そちらのほうが細かいので
 * **人の字が勝つ。** ここが返すのは、誰も書けていない日の答え。
 */
export function tripAsPlace(updatedAt: string | undefined, now: Date = new Date()): TravelNow | null {
  const t = travelNow(now);
  return t && placeOutdated(updatedAt, now) ? t : null;
}
