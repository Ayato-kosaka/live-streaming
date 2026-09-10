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
export default function Tonight({ week, free }: { week: WeekKind[]; free: FreeKind[] }) {
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
        <Link className="wk-now-go" href={trip.href}>
          {trip.name}
        </Link>
        のとちゅう。{trip.day}日目の夜も、どこかから配信します。
      </p>
    );

  const j = jstNow(now);
  const dow = (new Date(Date.UTC(j.y, j.m - 1, j.d)).getUTCDay() + 6) % 7;
  const last = new Date(Date.UTC(j.y, j.m, 0)).getUTCDate();
  const monthend = free.find((f) => f.monthend);
  const anytime = free.find((f) => !f.monthend);
  const hit = week.filter((k) => dow >= k.from && dow <= k.to);
  const day = DAYS[dow];

  /* 月末は曜日より強い。その日は月末配信をやると決まっている */
  if (j.d === last && monthend)
    return (
      <p className="wk-now">
        今夜は{j.m}月の最後の日。<b>{monthend.name}</b>の日。
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
