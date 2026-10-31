"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { jstNow } from "@/lib/nightly";
import { tripNow, type TripDest } from "@/content/trip";
import { DAYS } from "./days";

/** 曜日に貼りついている型（`week` が範囲のもの）を、答えるのに要るぶんだけ */
export type WeekKind = { slug: string; name: string; from: number; to: number };
/** 曜日に貼りつかない型。天気しだいのものと、月末のもの */
export type FreeKind = { slug: string; name: string; monthend: boolean };

/**
 * 「今夜は、何をやってる日」の**答え。**
 *
 * 見出しは読む人の頭の中の問いにする決まりで（`docs/island-design.md` 5-3）、
 * ここはそうなっている。**なのに、下に出るのは1週間の回りかたの図だけだった。**
 * 図から今夜を読み取るには、まず今日が何曜日かを自分で思い出さないといけない。
 * しかも水曜と日曜はどの帯にも入っていないので、その2日は図を読んでも答えが無い。
 *
 * **問いには、その場で答える。** 図はそのあとの「だいたいこう回っている」を言う。
 *
 * 旅のあいだは、曜日ではなく旅が答えになる。ヒッチハイクの夜は、
 * どこまで進めたかで配信の中身が変わるので、曜日の型を答えにすると嘘になる。
 *
 * **焼かない。** 今日も、旅の途中かどうかも、画面が出てから決める。
 */
export default function Tonight({
  week,
  free,
  monthendDays,
}: {
  week: WeekKind[];
  free: FreeKind[];
  /**
   * 月末配信が立っている日（`YYYY-MM-DD`。`content/plans.ts` の `streamPlanDays`）。
   * **ここに今日が無ければ、月末配信のことは言わない。**
   */
  monthendDays: string[];
}) {
  const [now, setNow] = useState<Date | null>(null);
  const [trip, setTrip] = useState<TripDest | null>(null);
  useEffect(() => {
    const t = new Date();
    setNow(t);
    setTrip(tripNow(t));
  }, []);

  // 画面が出るまでは何も言わない。焼いた曜日を出すと、その日から嘘になる
  if (!now) return null;

  if (trip)
    return (
      <p className="wk-now is-trip">
        いまは
        <Link prefetch={false} className="wk-now-go" href={trip.href}>
          {trip.name}
        </Link>
        のとちゅう。{trip.dayNo}日目の夜も、どこかから配信します。
      </p>
    );

  const j = jstNow(now);
  const dow = (new Date(Date.UTC(j.y, j.m - 1, j.d)).getUTCDay() + 6) % 7;
  const monthend = free.find((f) => f.monthend);
  const anytime = free.find((f) => !f.monthend);
  const hit = week.filter((k) => dow >= k.from && dow <= k.to);
  const day = DAYS[dow];

  /* 月末配信は曜日より強い。**ただし「その月の最終日」で当てない。**

     ここは `j.d === last`（月の最終日）で「今夜は◯月の最後の日。月末配信の日。」
     と言っていた。実測（焼き込みの配信）では 9/26・8/29・7/26・6/28・5/31 で、
     **最終日だったのは 5/31 の1回だけ。** 11月は最終日の 11/30 が月曜なので、
     そのまま置くと**その晩に嘘になる**（`docs/island-standards.md` 16章・
     `island-misses.md` #228 と同じ根っこ）。曜日に賭けても当たらない
     （土3回・日2回で割れている）。

     **日付を持っているものから引く。** 企画として立っている日だけ言って、
     立っていない夜は曜日の答え（下）に落ちる。日付の計算が1つも残らないので、
     次に日が進んでも古くならない。 */
  if (monthend && monthendDays.includes(j.date))
    return (
      <p className="wk-now">
        今夜は<b>{monthend.name}</b>の日。
      </p>
    );

  if (hit.length)
    return (
      <p className="wk-now">
        今夜は{day}曜。だいたい
        {hit.map((k, i) => (
          <span key={k.slug}>
            {i > 0 && "か"}
            <b>{k.name}</b>
          </span>
        ))}
        の日。
      </p>
    );

  /* 水曜と日曜。**帯が空いているからといって、黙らない。**
     この2日は決まった型を置いていないだけで、配信そのものは毎晩ある */
  return (
    <p className="wk-now">
      今夜は{day}曜。決まった型を置いていない日で、
      {anytime ? <b>{anytime.name}</b> : "その日やりたいこと"}になることが多い。
    </p>
  );
}
