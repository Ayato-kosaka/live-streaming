"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { livePlans, planDaysLeft, planPhase, nextPlan, type Plan } from "@/content/plans";
import { HOME } from "@/content/voice";
import { loadState } from "@/lib/liveStats";
import Icon from "@/components/ui/IconCore";
import { NoticeBell } from "./art";

/**
 * いま、いちばん近い企画。
 *
 * 島に来た人がまっさきに知りたいのは「次に何をするのか」なので、
 * 島のすぐ下、どのコーナーよりも先に、いちばん大きく置く。
 *
 * ここは配信に来てくれている人がいちばん気にしているところでもあるので、
 * 「新しいものがある」と分かる合図（しらせのベルと赤い丸）を1つだけ付ける。
 * 合図を混ぜると、どれが合図でどれが飾りか分からなくなるので、これ1種類にする。
 *
 * 静的書き出しなので「いちばん近い」はビルド時の日付で焼き込まれてしまう。
 * 画面が出たあとに今日の日付で計算し直す。
 */
export default function NextUp() {
  const [plan, setPlan] = useState<Plan | undefined>(() => nextPlan());
  const [days, setDays] = useState<number | null>(null);
  const [today, setToday] = useState<Date | null>(null);
  /**
   * 島から届く2つの日。**着いた日と、旅が終わった日は別**
   * （`content/plans.ts` の `reached` と `doneFromState`）。
   */
  const [facts, setFacts] = useState<{ arrived: string | null; ended: string | null } | null>(null);

  useEffect(() => {
    const now = new Date();
    const p = nextPlan(now);
    setToday(now);
    setPlan(p);
    setDays(p ? planDaysLeft(p, now) : null);
  }, []);

  /* 島から日が届いたら、企画の並びを組み直す。**届くまでは何もしない。**
     読めなくても、旅の最中と同じ「進行中」のままで、嘘にはならない。 */
  useEffect(() => {
    let alive = true;
    loadState().then((s) => {
      const a = s?.nordic?.arrivedOn ?? null;
      const e = s?.nordic?.endedOn ?? null;
      if (!alive || (!a && !e)) return;
      setFacts({ arrived: a, ended: e });
      setPlan(nextPlan(new Date()));
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!plan) return null;
  const PL = livePlans(facts);
  // いちばん近い企画のあとに、まだ来ていない「大物」があれば、それも札ではなく札より大きく出す。
  // 9/11 の北欧のように、日は先でもみんなが知りたい企画があるため。
  const rest = PL.filter((p) => p.id !== plan.id && (planDaysLeft(p, today ?? undefined) ?? -1) >= 0);
  const big = rest.find((p) => p.big);
  const others = rest.filter((p) => p !== big);
  const ahead = rest.length + 1;

  return (
    <section className="nextup">
      {/* ベルの赤い丸は落としてある。すぐ下の札の角に「新しいことがある」の赤い印が
          付いているので（app/css/plans.css）、同じ合図をこの狭い範囲に2つ置かない。
          ここのベルは、しらせの見出しであることを示す絵として置く。 */}
      {/* 件数はここには置かない。この見出しが指しているのは1つの企画で、
          「ぜんぶで何件あるか」は下の「ぜんぶ見る」の側の話。 */}
      <p className="nextup-eyebrow has-bell">
        <NoticeBell size={21} quiet />
        {HOME.nextUp}
      </p>
      <Card plan={PL.find((p) => p.id === plan.id) ?? plan} days={days} today={today} />
      {big && (
        <>
          <p className="nextup-eyebrow nextup-eyebrow2">そのあと、いちばん大きい企画</p>
          <Card plan={big} days={today ? planDaysLeft(big, today) : null} today={today} small />
        </>
      )}
      {others.length > 0 && (
        <div className="nextup-rest">
          <span>ほかにも</span>
          {others.map((p) => (
            <Link key={p.id} href={p.href ?? `/next#${p.id}`}>
              {p.title}
              <i>{p.when}</i>
            </Link>
          ))}
        </div>
      )}
      {/* 予定そのものを見にいく口。札を押すと1つの企画に入ってしまうので、
          「ぜんぶ見る」は別に置く。付箋が貼れることも、ここで先に言っておく。 */}
      <Link className="nextup-all" href="/next">
        <span>
          <b>これからの予定を、ぜんぶ見る</b>
          <i>付箋を貼って、行き先に口を出せます</i>
        </span>
        <em>{ahead}件</em>
      </Link>
    </section>
  );
}

/**
 * 企画1つぶんの札。small はふたつ目以降に使う、ひとまわり小さいもの。
 *
 * **「進行中」を日数の正負で決めない。** 終わった企画も日数はマイナスなので、
 * それだけで決めると、旅から帰ってきたあとも「進行中」と出続ける
 * （`content/plans.ts` の `planPhase`）。
 */
function Card({
  plan,
  days,
  today,
  small,
}: {
  plan: Plan;
  days: number | null;
  today: Date | null;
  small?: boolean;
}) {
  const href = plan.href ?? `/next#${plan.id}`;
  const phase = today ? planPhase(plan, today) : null;
  return (
    <Link className={`nextup-card${small ? " is-small" : ""}`} href={href}>
      <span className="nextup-count">
        {days === null || phase === null ? (
          <b>まもなく</b>
        ) : phase === "after" ? (
          <b>行ってきた</b>
        ) : /* その日1日で終わるものは、当日も「今日」のまま
               （`components/live/PlanCard.tsx` と同じ決め方）。 */
        phase === "during" && (plan.endsWhen || days < 0) ? (
          <b>進行中</b>
        ) : days === 0 ? (
          <b>今日</b>
        ) : (
          <>
            あと<b>{days}</b>日
          </>
        )}
      </span>
      <span className="nextup-body">
        <b className="nextup-title">{plan.title}</b>
        <i className="nextup-when">{plan.when}</i>
        <span className="nextup-note">{plan.note}</span>
        <span className="nextup-tags">
          {plan.tags.map((t) => (
            <em key={t}>{t}</em>
          ))}
        </span>
      </span>
      <span className="nextup-go" aria-hidden>
        くわしく見る
        <Icon name="right" size={14} />
      </span>
    </Link>
  );
}
