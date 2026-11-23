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

import {
  CHAPTERS,
  chapterDayNo,
  chapterHref,
  chapterNow,
  chapterRunning,
  chapterSpan,
  type Chapter,
} from "@/content/chapters";
import { COUNTRIES } from "@/content/countries";
import { chapterCountrySlugs } from "@/content/stayChapters";
import { chapterCountries } from "@/content/walked";
import { jstNow } from "@/lib/nightly";

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
  /** その旅の島（`chapterHref`。いまいる章でも章の島そのもの） */
  href: string;
  /**
   * 入口の札に添える1行。**押した先に何が在るか。**
   *
   * **呼ぶ側で書かない。** 面ごとに書いてあったせいで、章が変わった日に
   * 見出しだけ新しくなって中身が前の旅のまま残った（`travelNow` の注）。
   */
  sub: string;
  /** 章の一行（`content/chapters.ts` の note） */
  note: string;
  /**
   * 旅に出て何日目か。**出発した日の翌日が1日目**（`chapterDayNo`）。
   *
   * 旅程表（`/nordic` の「2日目 9月13日(日)」）と同じ番号。出発の日は 0。
   * 字にするのは `tripDayWord()`——**数の言い方も1か所に置く。**
   */
  days: number;
};

/**
 * 「旅に出て ◯日目」の字。**出発の日は「旅に出た日」。**
 *
 * 出発は現地 23:30 の飛行機なので、その日は旅程表でも「出発」で番号を持たない
 * （`content/nordic.ts` の `DAYS`）。0日目という言い方をしないのは
 * 滞在の日数（`stayDays`）と同じ。
 *
 * 面が2つ（`/now` の帯とその下の紙）あるので、字はここから配る。
 * 前は面ごとに書いてあって、片方が「旅に出て 3日目」、もう片方が
 * 「2日目」と出ていた。
 */
export function tripDayWord(days: number): string {
  return days > 0 ? `旅に出て ${days.toLocaleString()}日目` : "旅に出た日";
}

/**
 * 滞在の長さの、ざっくりした言い方（「1週間ほど」「1か月ほど」）。国の面の一言に使う。
 *
 * 日数は国の面の「いた日数」と同じ数えかた（入った日は0日目。`app/travel/parts.tsx` の `StayLen`）。
 * 同じ面で「6日」と「2週間ほど」が並ばないように、切れ目は7日・14日・21日・30日のまわりに置く。
 *
 * @param open まだ続いている滞在か。続いていて日が浅いうちは「まだ数日」と言う
 */
export function stayWord(days: number, open = false): string {
  if (days <= 3) return open ? "まだ数日" : "数日";
  if (days <= 10) return "1週間ほど";
  if (days <= 17) return "2週間ほど";
  if (days <= 24) return "3週間ほど";
  if (days <= 45) return "1か月ほど";
  return `${Math.round(days / 30)}か月ほど`;
}

/**
 * その国を歩いた章。**本線のうち、いちばん新しいもの。**
 *
 * 枝（イランまで歩く）は本線の滞在を閉じる側ではないので見ない。
 * 同じ国に何度も入っている場合、滞在を閉じるのはいちばん新しい章。
 */
function chapterOfCountry(slug: string): Chapter | undefined {
  return [...CHAPTERS].reverse().find((c) => !c.branchOf && chapterCountrySlugs(c).includes(slug));
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
 *
 * **終わった旅は「いま歩いている旅」ではない。** `chapterNow()` は章を必ず1つ返す
 * （画面を落とさないため、終わっていてもいちばん新しい章で受ける）ので、
 * 返ってきたものが**まだ続いているか**をここで見る。見ていなかったので、
 * 旅から帰った 9/28 以降も表紙・`/now`・`/about` が「北欧周遊のとちゅう」、
 * 札が「旅に出て 20日目」と、日ごとに増えつづけていた。
 * そのときの次の章は日どりが決まっていなかったので、**待っていても始まらなかった。**
 */
export function travelNow(now: Date = new Date()): TravelNow | null {
  if (stayNow(now)) return null;
  const c = chapterNow(now);
  if (!c || !chapterRunning(c, now)) return null;
  /* **行き先を手で組み立てない。** 章の島の道は `chapterHref` 1か所が持つ
     （道を動かした日に、ここだけ古い道を指さないように。#1201） */
  const href = chapterHref(c);
  /* **「旅の◯カ国」を字に焼かない。** 下の `sub` を作る前は、呼ぶ側2か所
     （`app/now/parts.tsx` と `components/live/NowLive.tsx`）が
     「この旅のこと、旅の6カ国、旅のしおり」を**それぞれベタ書き**していた。
     見出し（`{trip.name}の島へ`）は章から引いていたので、#224 で章が
     バルカン諸国周遊に変わった日に**見出しだけ変わって、中身が北欧のまま**
     残った。バルカンは2カ国で、旅のしおりは北欧の面にしか無い。

     数は `chapterCountries` から引く。**章の `countries` だけでは足りない**
     ——あれは歩き終わった国の欄で、歩いている最中の国はまだ入らない
     （`content/walked.ts` にその理由が書いてある）。

     **0カ国とは書かない。** まだ1国も記録の無い章では、数ごと落とす
     （`docs/island-standards.md` 16章「0件になりうる数を札に入れない」）。
     **「旅のしおり」も書かない。** あれは北欧の面が持っているもので、
     章ぜんぶに在るものではない。島に建っているものは、押した先が並べる。 */
  const kuni = chapterCountries(c, now).length;
  return {
    name: c.name,
    slug: c.slug,
    href,
    sub: kuni > 0 ? `この旅のこと、旅の${kuni}カ国` : "この旅のこと",
    note: c.note,
    days: chapterDayNo(c, now),
  };
}

/* 人の打った「いまどこ」（Firestore `island/state.current.place`）を、古ければ章か国で受ける
   継ぎ当て（`tripAsPlace` `stayAsPlace` `placeWord`）は外した（#1278）。居場所は滞在の表の
   ［いまここ］（`lib/leadPlan.ts` の `stayHere`）1本で、画面は人の字を読まない。 */
