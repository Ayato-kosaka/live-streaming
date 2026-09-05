"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PLANS, planDaysLeft, nextPlan, type Plan } from "@/content/plans";
import { HOME } from "@/content/voice";
import Icon from "@/components/ui/Icon";
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

  useEffect(() => {
    const now = new Date();
    const p = nextPlan(now);
    setToday(now);
    setPlan(p);
    setDays(p ? planDaysLeft(p, now) : null);
  }, []);

  if (!plan) return null;
  // いちばん近い企画のあとに、まだ来ていない「大物」があれば、それも札ではなく札より大きく出す。
  // 9/11 の北欧のように、日は先でもみんなが知りたい企画があるため。
  const rest = PLANS.filter((p) => p.id !== plan.id && (planDaysLeft(p, today ?? undefined) ?? -1) >= 0);
  const big = rest.find((p) => p.big);
  const others = rest.filter((p) => p !== big);
  const ahead = rest.length + 1;

  return (
    <section className="nextup">
      <p className="nextup-eyebrow has-bell">
        <NoticeBell size={21} />
        {HOME.nextUp}
        <em className="nextup-n">{ahead}</em>
      </p>
      <Card plan={plan} days={days} />
      {big && (
        <>
          <p className="nextup-eyebrow nextup-eyebrow2">そのあと、いちばん大きい企画</p>
          <Card plan={big} days={today ? planDaysLeft(big, today) : null} small />
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

/** 企画1つぶんの札。small はふたつ目以降に使う、ひとまわり小さいもの。 */
function Card({ plan, days, small }: { plan: Plan; days: number | null; small?: boolean }) {
  const href = plan.href ?? `/next#${plan.id}`;
  return (
    <Link className={`nextup-card${small ? " is-small" : ""}`} href={href}>
      <span className="nextup-count">
        {days === null ? (
          <b>まもなく</b>
        ) : days === 0 ? (
          <b>今日</b>
        ) : days > 0 ? (
          <>
            あと<b>{days}</b>日
          </>
        ) : (
          <b>進行中</b>
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
