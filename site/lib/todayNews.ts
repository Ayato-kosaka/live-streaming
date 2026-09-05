/**
 * 今日の島に出す1枚の中身を決める。
 *
 * 上から順に見て、最初に当たったものを出す（`docs/island-play.md` 仕掛け1）。
 *
 *   1. いま配信中（JST 22:00〜25:00）
 *   2. 今日が企画の当日
 *   3. きのう新しい料理が増えた
 *   3.5 配信まで2時間を切っている
 *   4. 1年前の今日に配信があった
 *   5. どれも無い日 → 今夜まであと何分
 *
 * 1〜4 は毎日中身が変わり、5に落ちる日があることが1〜4の日を効かせる。
 * **全部ブラウザ側だけで決まる。** サーバーにも Firestore にも聞きにいかない。
 * 島を開いた瞬間に出したいので、往復を1つも増やさない。
 *
 * 静的書き出しなので、この関数を **描画のたびに呼んではいけない**。
 * 画面が出てから1回呼んで、あとは1分ごとに数え直す（`components/today/Today.tsx`）。
 */

import { PLANS } from "@/content/plans";
import { RECIPES } from "@/content/recipes";
import { LINKS, NOW_FALLBACK } from "@/content/site";
import { lastYearOn } from "@/content/onThisDay";
import { jstNow, jstShift, readNight, spanText } from "@/lib/nightly";

const YOUTUBE = LINKS.find((l) => l.id === "youtube")?.href ?? "https://youtube.com";
const watch = (videoId: string) => `https://www.youtube.com/watch?v=${videoId}`;

export type TodayNews = {
  /** 種類。板の色を出し分けるのに使う */
  kind: "live" | "plan" | "recipe" | "past" | "tonight";
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

export function todayNews(now: Date = new Date()): TodayNews {
  const j = jstNow(now);
  const night = readNight(now);

  // 1. いま配信中。島に留めずに外へ出すのが正解（島は留守番の場所）
  if (night.onAir) {
    return {
      kind: "live",
      icon: "tower-studio",
      line: "いま、配信の時間",
      title: "いま、配信の時間",
      body: `${NOW_FALLBACK.place}から繋いでます。`,
      href: YOUTUBE,
      out: true,
      go: "見にいく",
    };
  }

  // 2. 今日が企画の当日
  const plan = PLANS.find((p) => p.date === j.date);
  if (plan) {
    return {
      kind: "plan",
      icon: "tent",
      line: `今日は ${plan.title}`,
      title: plan.title,
      body: plan.note,
      href: plan.href ?? "/next",
      go: "くわしく",
    };
  }

  // 3. きのう、新しい料理が増えた
  const y = jstShift(now, -1);
  const dish = RECIPES.find((r) => r.date === y);
  if (dish) {
    return {
      kind: "recipe",
      icon: dish.icon,
      line: `きのう、${dish.name}を作りました`,
      title: `きのう、${dish.name}を作りました`,
      body: dish.note,
      href: `/kitchen/${dish.slug}`,
      go: "見にいく",
    };
  }

  // 3.5 配信まで2時間を切ったら、それを先に言う。
  //
  // 1年前の記録は365日ぶん埋まっているので、放っておくと毎日4番が当たり、
  // 「今夜22時から。あと20分」が21時台にも出なくなる。
  // だが配信の直前だけは、思い出より「もうすぐ始まる」のほうが役に立つ。
  if (night.mins > 0 && night.mins <= 120) {
    return {
      kind: "tonight",
      icon: "lantern",
      line: `今夜22時から。あと${spanText(night.mins)}`,
      title: "もうすぐ始まる",
      body: `あと${spanText(night.mins)}。日本時間の22時から、だいたい2〜3時間。`,
      href: YOUTUBE,
      out: true,
      go: "チャンネルへ",
    };
  }

  // 4. 1年前の今日。コンテンツを書かずに毎日ちがうものが出る、唯一の仕掛け
  const past = lastYearOn(j.md, j.y);
  if (past) {
    const when = `${past.ago}年前の今日`;
    // 滞在の記録から国が引けなかった日（移動の途中など）は、場所を言わない。
    // 分からないものを埋めると、島が嘘をつくことになる。
    const line = past.s.p ? `${when}は${past.s.p}にいました` : `${when}も、配信していました`;
    return {
      kind: "past",
      icon: "signpost",
      line,
      title: past.s.p ? `${when}は、${past.s.p}` : when,
      body: `${past.s.d.replace(/-/g, "/")} の配信。コメントは ${past.s.n.toLocaleString()} 件ついた。`,
      quote: past.s.t,
      href: watch(past.s.v),
      out: true,
      go: "その日を見る",
    };
  }

  // 5. どれも無い日。ここに落ちる日があるから、1〜4の日が効く
  return {
    kind: "tonight",
    icon: "lantern",
    line: `今夜22時から。あと${spanText(night.mins)}`,
    title: "今夜も22時から",
    body: `あと${spanText(night.mins)}。日本時間の22時から、だいたい2〜3時間。`,
    href: YOUTUBE,
    out: true,
    go: "チャンネルへ",
  };
}
