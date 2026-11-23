"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { BUILT_AT, daysUntil, planDaysLeft, planPhase, type Plan } from "@/content/plans";
import { upNext, type StayCard, type UpNext } from "@/lib/leadPlan";
import { guideOn, type GuideSpan } from "@/lib/guideDay";
import Icon from "@/components/ui/IconCore";
import Wrote from "@/components/ui/Wrote";
import Phrase from "@/components/ui/Phrase";

/** その国の案内の面。**面（サーバ側）で `guidesOf` から引いて渡す**（島の札と同じ表・同じ式） */
export type GuideItem = GuideSpan & {
  href: string;
  name: string;
  lead: string;
  /** 国の絵。**面で描いて渡す**——`Icon.tsx` の 257 種を部品から名前で引くと、174KB がまるごと束に入る */
  art: ReactNode;
};

/**
 * 表紙の「これから」。上から ［いまここ］→［つぎ］→ 日にちの決まった回（#1276）。
 *
 * ## 滞在の表から引く。企画の表から引かない
 *
 * 前は企画の表（`content/plans.ts`）のいちばん近い1件を出していた。国を移る日も企画の行
 * （「ブルガリア・ソフィアへ移動」）だったので、**着いたあとも題が「へ移動」、印が「進行中」**で、
 * 下に「企画を、ぜんぶ見る」が出ていた。あやと（2026-11-18）:「ソフィアに**いる**、は欲しい。
 * **へ移動**は変。移動はもうしちゃってる」「企画をぜんぶ見る、は要らない」。
 *
 * いまは居場所を滞在の表（`content/stays.ts`）から引く（`docs/spec/model.md` 6章「引きかた」・
 * M-32）。移動の企画は読まない（`lib/leadPlan.ts` の `isMovePlan`）。
 *
 * ## ［いまここ］は日付で消えない
 *
 * つぎの行が始まった日に入れ替わる（M-22）。だからこの段が0件になる日は無い。
 *
 * ## 日付の判定は、画面が出てから
 *
 * 静的書き出しなので、最初の1枚は**焼いた日**（`BUILT_AT`）で出す。ここで `new Date()` を
 * 呼ぶと、焼いた HTML とブラウザの最初の描画が別の国を指して水あわせが落ちる。
 * 画面が出たら今日で引き直し、1分ごとに数え直す（開いたまま0時をまたぐ人がいる）。
 *
 * ## 案内の面は、島の札と同じ式で選ぶ
 *
 * 行き先は `components/isle/spec.ts` の `guidesOf`（面で引いて渡す）から、
 * `lib/guideDay.ts` の `guideOn` で選ぶ。島の札（`guideOf`）と同じ1本で、写しを持たない。
 */
export default function NextUp({ guides, guideLabel }: { guides: GuideItem[]; guideLabel: string }) {
  const [view, setView] = useState<UpNext>(() => upNext(BUILT_AT));
  /** 今日。**画面が出るまでは `null`**——日数（「あと3日」）は、今日を知ってから出す */
  const [today, setToday] = useState<Date | null>(null);

  useEffect(() => {
    const read = () => {
      const now = new Date();
      setToday(now);
      setView(upNext(now));
    };
    read();
    const id = setInterval(read, 60_000);
    return () => clearInterval(id);
  }, []);

  const { here, next, plans } = view;
  const [lead, ...rest] = plans;
  return (
    <section className="nextup">
      {here && (
        <StayBlock
          stay={here}
          role="here"
          guide={guideOf(guides, here, today ?? BUILT_AT)}
          label={guideLabel}
          today={today}
        />
      )}
      {next && (
        <>
          <p className="nextup-eyebrow nextup-eyebrow2">つぎ</p>
          <StayBlock
            stay={next}
            role="next"
            guide={guideOf(guides, next, noonOf(next.from))}
            label={guideLabel}
            today={today}
            small
          />
        </>
      )}
      {lead && (
        <>
          <p className="nextup-eyebrow nextup-eyebrow2">日にちの決まった回</p>
          <PlanBlock plan={lead} today={today} />
          {rest.length > 0 && (
            <div className="nextup-rest">
              <span>ほかにも</span>
              {rest.map((p) => (
                <Link key={p.id} href={p.href ?? `/next#${p.id}`} prefetch={p.href ? false : undefined}>
                  {p.title}
                  <i>{p.when}</i>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

/**
 * その滞在の案内。**選ぶのは `guideOn`**（島の札と同じ式）。選んだ案内が**その滞在の行のもの**
 * （同じ日に着いた行）でなければ出さない——前の国の案内を、つぎの国の札に付けない。
 *
 * @param on ［いまここ］は今日（画面が出るまでは焼いた日）、［つぎ］は着く日
 */
function guideOf(guides: GuideItem[], stay: StayCard, on: Date): GuideItem | null {
  const g = guideOn(guides, on);
  return g && g.from === stay.from ? g : null;
}

/** 着く日の日本時間の正午。0時ちょうどだと、日の境目で前の日の行に当たることがある */
const noonOf = (day: string) => new Date(`${day}T12:00:00+09:00`);

/** 札の題を、折ってよい所で切ったもの。［つぎ］は「◯◯へ」 */
function titleParts(stay: StayCard, role: "here" | "next"): string[] {
  const parts = stay.place === stay.countryName ? [stay.place] : [`${stay.countryName}・`, stay.place.slice(stay.countryName.length + 1)];
  if (role === "next") parts[parts.length - 1] += "へ";
  return parts;
}

/** 「2026-11-21」→「11月21日」 */
const md = (d: string) => `${Number(d.slice(5, 7))}月${Number(d.slice(8, 10))}日`;

/**
 * 滞在1行の札。［いまここ］は「ルーマニア／11月21日から」、［つぎ］は「ルーマニアへ／11月21日から」。
 *
 * 案内の面があれば、札ごとその面へ。**無ければ押せない板**にする（押した先の無い札を建てない）。
 */
function StayBlock({
  stay,
  role,
  guide,
  label,
  today,
  small,
}: {
  stay: StayCard;
  role: "here" | "next";
  guide: GuideItem | null;
  label: string;
  today: Date | null;
  small?: boolean;
}) {
  const days = role === "next" && today ? daysUntil(stay.from, today) : null;
  const inner = (
    <>
      <span className="nextup-count">
        {role === "here" ? (
          /* 「あと<b>3</b>日」と同じ組み。4文字を大きい字で並べると、札の幅（3文字ぶん）で折れる */
          <>
            いま<b>ここ</b>
          </>
        ) : days === null ? (
          /* 今日を知るまでは日付だけ。いつ読んでも本当（`docs/island-misses.md` #143） */
          <b>{shortDate(stay.from)}</b>
        ) : days <= 0 ? (
          <b>今日</b>
        ) : (
          <>
            あと<b>{days}</b>日
          </>
        )}
      </span>
      <span className="nextup-body">
        {/* 折ってよい所は「・」のあとだけ。ひと続きにすると 390px で「ソフ／ィア」と街の名前の中で折れた */}
        <b className="nextup-title">
          <Phrase parts={titleParts(stay, role)} />
        </b>
        <i className="nextup-when">{md(stay.from)}から</i>
        {/* ひとことは滞在の行が持つ（`note`）。無ければ案内の面の1行 */}
        <Wrote t={stay.note ?? guide?.lead} className="nextup-note" />
      </span>
      {guide && (
        <span className="nextup-go" aria-hidden>
          {guide.art}
          {label}
          <Icon name="right" size={14} />
        </span>
      )}
    </>
  );
  const cls = `nextup-card nextup-stay is-${role}${small ? " is-small" : ""}${guide ? "" : " is-still"}`;
  /* 国の案内の面は地図と写真を抱えているので、先読みしない（前の `Card` と同じ理由。
     この札は島の1画面目に出るので、島に降りただけの人が払う） */
  return guide ? (
    <Link className={cls} href={guide.href} prefetch={false} data-stay={stay.country} data-role={role}>
      {inner}
    </Link>
  ) : (
    <div className={cls} data-stay={stay.country} data-role={role}>
      {inner}
    </div>
  );
}

/** 「9/11」。数え直す前に出しておく、日付だけの表示（`components/live/PlanCard.tsx` と同じ形）。 */
function shortDate(date?: string) {
  if (!date) return "";
  const [, m, d] = date.split("-");
  return `${Number(m)}/${Number(d)}`;
}

/**
 * 日にちの決まった回の札。
 *
 * **「進行中」と言わない**（あやと 2026-11-18）。何日かにまたがる回が始まっていれば「開催中」。
 * 終わった回はここに来ない（`lib/leadPlan.ts` の `planBoard` は行ってきたものを返さない）。
 */
function PlanBlock({ plan, today }: { plan: Plan; today: Date | null }) {
  const href = plan.href ?? `/next#${plan.id}`;
  const days = today ? planDaysLeft(plan, today) : null;
  const phase = today ? planPhase(plan, today) : null;
  return (
    <Link className="nextup-card is-small" href={href} prefetch={plan.href ? false : undefined} data-plan={plan.id}>
      <span className="nextup-count">
        {days === null || phase === null ? (
          <b>{shortDate(plan.date) || "未定"}</b>
        ) : phase === "during" && (plan.endsWhen || plan.until || days < 0) ? (
          <b>開催中</b>
        ) : days <= 0 ? (
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
        <Wrote t={plan.note} className="nextup-note" />
      </span>
      <span className="nextup-go" aria-hidden>
        くわしく見る
        <Icon name="right" size={14} />
      </span>
    </Link>
  );
}
