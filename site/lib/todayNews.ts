/**
 * 今日の島に出す板の中身を決める。
 *
 * 上から順に見て、当たったものを並べる（`docs/island-play.md` 仕掛け1）。
 * **板に出すのは先頭の1つだけ。** 2つめは「今夜のおたずね」が無い日にだけ、
 * 板の中でもう1段深いところに出る（`components/today/Today.tsx`）。
 * おたずねが出ていない日に板の中身が1つしか無いと、
 * 島に降りて押すものが1つで終わる（`docs/island-review-2.md` 12.1）。
 *
 *   1.  いま配信中（JST 22:00〜25:00）
 *   2.  今日が企画の当日
 *   3.  節目 — 新しい国に入った日・配信をはじめた日・滞在の100日目
 *   4.  きのう新しい料理が増えた
 *   5.  配信まで2時間を切っている
 *   6.  前に来てから、これだけあった（3日以上あいた人にだけ）
 *   7.  1年前の今日に配信があった
 *   8.  どれも無い日 → 今夜まであと何分
 *
 * 3 は**ほとんどの日は当たらない**。当たらない日があるから、当たった日が効く
 * （`docs/island-play.md` 1章 G）。乱数の当たりではなく、本当に稀な出来事だけを置く。
 *
 * 6 以外は**全部ブラウザ側だけで決まる。** サーバーにも Firestore にも聞きにいかない。
 * 島を開いた瞬間に出したいので、往復を1つも増やさない。
 * 6 だけは「その人が最後に来た日」が要るので、呼ぶ側から渡してもらう。
 *
 * 静的書き出しなので、この関数を **描画のたびに呼んではいけない**。
 * 画面が出てから1回呼んで、あとは1分ごとに数え直す（`components/today/Today.tsx`）。
 */

import { COUNTRIES } from "@/content/countries";
import { PLANS } from "@/content/plans";
import { RECIPES } from "@/content/recipes";
import { LINKS, NOW_FALLBACK, STATS_FALLBACK } from "@/content/site";
import { LATEST_DAY, lastYearOn, streamDaysBetween } from "@/content/onThisDay";
import { jstNow, jstShift, readNight, spanText } from "@/lib/nightly";
import { atText, watchAt } from "@/lib/peak";

/** 配信の行き先。島のやぐらの札も配信中はここへ送るので、出どころを1つにする。 */
export const YOUTUBE = LINKS.find((l) => l.id === "youtube")?.href ?? "https://youtube.com";
const watch = (videoId: string) => `https://www.youtube.com/watch?v=${videoId}`;

/** 何日ぶんの節目を「節目」と呼ぶか。3〜4か月に1度しか当たらない間隔にする。 */
const STAY_STEP = 100;

/** 前に来てから何日あいたら「留守のあいだに」を出すか。 */
const AWAY_DAYS = 3;

export type TodayNews = {
  /** 種類。板の色を出し分けるのに使う */
  kind: "live" | "plan" | "milestone" | "recipe" | "away" | "past" | "tonight";
  /**
   * 板に添える絵。島に置いてあるスプライト（`site/public/sprites`）の名前。
   * 場所と物は自前のSVGではなくスプライトを使う（`docs/island-design.md` 1章）。
   */
  icon: string;
  /** 閉じているときの1行。ここだけで「今日は何が違うか」が分かる長さにする */
  line: string;
  /** 開いたときの見出し */
  title: string;
  /** 開いたときの本文。1〜2行でとめる */
  body: string;
  /** 配信のタイトルなど、そのまま写すもの。引用なので絵文字が入っていてもよい */
  quote?: string;
  /** 押したときの行き先 */
  href: string;
  /** 島の外（YouTube）へ出るか */
  out?: boolean;
  /** 行き先のボタンの言葉。動作そのものの言葉にする */
  go: string;
};

/** 板の中身を決めるのに、ブラウザからしか分からないもの。 */
export type TodayWho = {
  /**
   * その人が前に島へ来た日（JST の YYYY-MM-DD）。島の到着演出と同じ鍵。
   * 分からなければ渡さない。**空けた日数を責めることには使わない。**
   */
  lastVisit?: string | null;
};

/** 日付の差（日数）。どちらも JST の YYYY-MM-DD。 */
function daysApart(from: string, to: string): number {
  const t = (s: string) => Date.parse(`${s}T00:00:00Z`);
  const a = t(from);
  const b = t(to);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86400000);
}

/**
 * 今日が何かの節目か。
 *
 * **作り出した節目を置かない。** ここに並ぶのは countries.ts に書いてある
 * 実際の日付だけで、どれも年に数回しか当たらない。
 * 毎日必ず何かが当たるようにすると、3日で背景になる（`docs/island-play.md` 1章 G）。
 */
function milestone(today: string): TodayNews | null {
  // 新しい国に入った日。旅そのものが動いた日なので、いちばん強い
  for (const c of COUNTRIES) {
    for (const s of c.stays) {
      if (s.from !== today) continue;
      return {
        kind: "milestone",
        icon: "signpost",
        line: `今日、${c.name}に入りました`,
        title: `今日から ${c.name}`,
        body: `${c.stays.length > 1 ? `${c.name}は2度目。` : ""}${c.summary}`,
        href: `/map/${c.slug}`,
        go: "地図で見る",
      };
    }
  }

  // 配信をはじめた日。1年に1度しか当たらない
  const since = STATS_FALLBACK.since;
  const years = daysApart(since, today) / 365.25;
  if (since.slice(5) === today.slice(5) && years >= 0.9) {
    const n = Number(today.slice(0, 4)) - Number(since.slice(0, 4));
    return {
      kind: "milestone",
      icon: "tower-studio",
      line: `今日で、配信をはじめて${n}年`,
      title: `配信をはじめて${n}年`,
      body: `${since.replace(/-/g, "/")} にパリで1回目。そこから${STATS_FALLBACK.countries}カ国。`,
      href: "/streams",
      go: "これまでを見る",
    };
  }

  // いまいる国に、今日で何日いるか。100日ごとにだけ言う
  const now = COUNTRIES.find((c) => c.stays.some((s) => !s.to));
  const stay = now?.stays.find((s) => !s.to);
  if (now && stay) {
    const days = daysApart(stay.from, today) + 1;
    if (days > 0 && days % STAY_STEP === 0) {
      return {
        kind: "milestone",
        icon: "signpost",
        line: `${now.name}にいて、今日で${days}日`,
        title: `${now.name} ${days}日目`,
        body: `${stay.from.replace(/-/g, "/")} に入って、まだいる。${stay.cities.join("・")}。`,
        href: `/map/${now.slug}`,
        go: "地図で見る",
      };
    }
  }
  return null;
}

/**
 * 前に来てから、島の外で何があったか。
 *
 * 留守のあいだも世界が動いていた、を事実だけで置く（`docs/island-play.md` 1章 A-3）。
 * **空けた日数は言わない。** 「10日ぶりですね」は督促に読める。
 * 数えるのは向こうで起きたことのほうで、来なかったことのほうではない。
 *
 * 焼き込みの表がきのうまで届いていない日は、**何も出さない**。
 * まだ焼いていないだけの日を「配信が無かった日」として数えると、島が嘘をつく。
 */
function away(now: Date, today: string, lastVisit?: string | null): TodayNews | null {
  if (!lastVisit || lastVisit >= today) return null;
  if (daysApart(lastVisit, today) < AWAY_DAYS) return null;
  const yesterday = jstShift(now, -1);
  if (LATEST_DAY < yesterday) return null;

  const nights = streamDaysBetween(lastVisit, yesterday);
  const dishes = RECIPES.filter((r) => r.date > lastVisit && r.date <= yesterday);
  if (nights === 0 && dishes.length === 0) return null;

  const bits = [
    nights > 0 ? `配信が${nights}日ぶん` : "",
    dishes.length > 0 ? `料理が${dishes.length}品` : "",
  ].filter(Boolean);
  // 「配信が15日ぶんと料理が1品」は続けて読むと切れ目が分からない。読点で割る
  return {
    kind: "away",
    icon: "mailbox",
    line: `前に来てから、${bits.join("、")}`,
    title: "前に来てから、あったこと",
    body: `${jstShift(now, -daysApart(lastVisit, today) + 1).replace(/-/g, "/")} から昨日まで。${
      dishes.length > 0 ? `いちばん新しいのは${dishes[dishes.length - 1].name}。` : "見逃したぶんは、これだけ。"
    }`,
    // 追いつく場所へ送る。配信があったなら「配信」（一覧がある）、
    // 料理だけの留守なら、その1品のところへ直に
    href: nights > 0 ? "/streams" : `/kitchen/${dishes[dishes.length - 1].slug}`,
    go: nights > 0 ? "配信を見る" : "見にいく",
  };
}

/**
 * 今日の板に出せるもの。**当たったものだけ**が、効く順に並ぶ。
 * 先頭が板の1行になる。2つめは、おたずねが無い日にだけ使う。
 */
export function todayNewsList(now: Date = new Date(), who: TodayWho = {}): TodayNews[] {
  const j = jstNow(now);
  const night = readNight(now);
  const out: TodayNews[] = [];

  // 1. いま配信中。島に留めずに外へ出すのが正解（島は留守番の場所）
  if (night.onAir) {
    out.push({
      kind: "live",
      icon: "tower-studio",
      line: "いま、配信の時間",
      title: "いま、配信の時間",
      body: `${NOW_FALLBACK.place}から繋いでます。`,
      href: YOUTUBE,
      out: true,
      go: "見にいく",
    });
  }

  // 2. 今日が企画の当日
  const plan = PLANS.find((p) => p.date === j.date);
  if (plan) {
    out.push({
      kind: "plan",
      icon: "tent",
      line: `今日は ${plan.title}`,
      title: plan.title,
      body: plan.note,
      href: plan.href ?? "/next",
      go: "くわしく",
    });
  }

  // 3. 節目。年に数回しか当たらない
  const mile = milestone(j.date);
  if (mile) out.push(mile);

  // 4. きのう、新しい料理が増えた
  const dish = RECIPES.find((r) => r.date === jstShift(now, -1));
  if (dish) {
    out.push({
      kind: "recipe",
      icon: dish.icon,
      line: `きのう、${dish.name}を作りました`,
      title: `きのう、${dish.name}を作りました`,
      body: dish.note,
      href: `/kitchen/${dish.slug}`,
      go: "見にいく",
    });
  }

  // 5. 配信まで2時間を切ったら、それを先に言う。
  //
  // 1年前の記録は365日ぶん埋まっているので、放っておくと毎日7番が当たり、
  // 「今夜22時から。あと20分」が21時台にも出なくなる。
  // だが配信の直前だけは、思い出より「もうすぐ始まる」のほうが役に立つ。
  if (night.mins > 0 && night.mins <= 120) {
    out.push({
      kind: "tonight",
      icon: "lantern",
      line: `今夜22時から。あと${spanText(night.mins)}`,
      title: "もうすぐ始まる",
      body: `あと${spanText(night.mins)}。日本時間の22時から、だいたい2〜3時間。`,
      href: YOUTUBE,
      out: true,
      go: "チャンネルへ",
    });
  }

  // 6. 前に来てから、これだけあった
  const back = away(now, j.date, who.lastVisit);
  if (back) out.push(back);

  // 7. 1年前の今日。コンテンツを書かずに毎日ちがうものが出る、唯一の仕掛け
  const past = lastYearOn(j.md, j.y);
  if (past) {
    const when = `${past.ago}年前の今日`;
    // 「その日を見る」の行き先が3時間の頭だと、押しても誰も再生しない。
    // コメントがいちばん重なったところが分かっている日は、そこから開く
    // （`content/streamPeaks.ts`・`docs/island-play.md` 仕掛け15）。
    // **どこから始まるかを本文で言う。** 言わずに途中から始まると壊れて見える。
    const spot = past.s.k;
    // 滞在の記録から国が引けなかった日（移動の途中など）は、場所を言わない。
    // 分からないものを埋めると、島が嘘をつくことになる。
    out.push({
      kind: "past",
      icon: "signpost",
      line: past.s.p ? `${when}は${past.s.p}にいました` : `${when}も、配信していました`,
      title: past.s.p ? `${when}は、${past.s.p}` : when,
      body: `${past.s.d.replace(/-/g, "/")} の配信。コメントは ${past.s.n.toLocaleString()} 件ついた。${
        spot === undefined ? "" : `いちばん重なった ${atText(spot)} のところから開きます。`
      }`,
      quote: past.s.t,
      href: spot === undefined ? watch(past.s.v) : watchAt(past.s.v, spot),
      out: true,
      go: spot === undefined ? "その日を見る" : "そこを見る",
    });
  }

  // 8. どれも無い日。ここに落ちる日があるから、1〜7の日が効く
  if (!night.onAir) {
    out.push({
      kind: "tonight",
      icon: "lantern",
      line: `今夜22時から。あと${spanText(night.mins)}`,
      title: "今夜も22時から",
      body: `あと${spanText(night.mins)}。日本時間の22時から、だいたい2〜3時間。`,
      href: YOUTUBE,
      out: true,
      go: "チャンネルへ",
    });
  }

  return out;
}

/** 板の1行になるもの。島のほうもこれで「!」を出す建物を決める（`IslandStage.tsx`）。 */
export function todayNews(now: Date = new Date(), who: TodayWho = {}): TodayNews {
  return todayNewsList(now, who)[0];
}

/**
 * 板が、押されなくても自分から開く日か。
 *
 * **この判断を2か所に置かない。** 板が自分から開く日は島のカモメが黙り、
 * 開かない日はカモメが名乗る（`components/island/IslandStage.tsx`）。
 * 片方だけ直すと、板とカモメが同時に開いて島が見えなくなるか、
 * どちらも出ない日ができる。
 *
 * - 開くのは、今日ほんとうに何かある日だけ。1年前の今日と「あとN分」は
 *   畳んだ1行で足りている
 * - **スマホでは開かない。** 390×844 で板と問いが同時に開くと、
 *   島の絵が上端の帯しか見えなくなる（`docs/island-review-2.md` 8.3）
 */
export function opensByItself(kind: TodayNews["kind"], phone: boolean): boolean {
  if (phone) return false;
  return kind === "live" || kind === "plan" || kind === "recipe" || kind === "milestone";
}
