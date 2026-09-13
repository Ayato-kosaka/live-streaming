"use client";

import Link from "next/link";
import { useState } from "react";
import {
  PLAN_STATUS_NAME,
  canEditPlan,
  myPlans,
  type NextPlan,
  type Sticky,
} from "@/lib/api";
import { themeById } from "@/content/themes";
import { jstDay } from "@/lib/nightly";
import Icon from "@/components/ui/IconCore";
import Longer from "@/components/ui/Longer";
import { Pin } from "@/components/live/art";
import CardOne from "@/components/cards/CardOne";
import type { PlanDays, ShownCard } from "@/components/cards/cards";
import ReadAgain, { Waiting } from "./ReadAgain";
import Wrote from "@/components/ui/Wrote";

/**
 * 取りに行った結果。**3つを別のものとして持つ。**
 *
 * 前は「取りに行っている最中は `null`、それ以外は配列」の2つしか無くて、
 * 読めなかったときに空の配列を入れていた。すると札の数が **0** と出て、
 * 中身は「まだ1枚も貼っていません」になる。20枚貼ってくれた人の画面が、
 * 電波の細い日に「0枚」と言い切る（`docs/island-standards.md` 10）。
 */
export type Bag<T> = { st: "wait" } | { st: "ok"; list: T[] } | { st: "down" };

/* 日付は `lib/nightly.ts` の `jstDay` で切る。**写しを作らない。**
   ここは前に字をそのまま切っていて、UTC の日付が出ていた */

type Tab = "note" | "plan" | "card";

/**
 * じぶんが島に置いてきたもの。**3つの紙を、1つの棚に寄せた。**
 *
 * ## なぜ札で切り替えるのか
 *
 * 付箋・企画・カードは、前はそれぞれ独立した紙で、上から順に積んであった。
 * **3つとも「溜まるほど伸びる」もの**なので、よく来てくれている人ほど
 * 下の紙が遠くなる。付箋を20枚貼った人は、カードを見るまでにスマホ4画面ぶん
 * 送ることになっていた。溜まっても背が変わらない形にするには、
 * **同時に1つしか出さない**のがいちばん確実で、押す回数も1回しか増えない。
 *
 * ## 数は札が持つ
 *
 * どれに何枚あるかは、開かなくても札に出ている。「開いてみないと分からない」
 * のは、畳んだのではなく隠したのと同じ。
 *
 * ## 出す枚数
 *
 * 1件の背が高い順に、付箋3・企画4・カード4。押せば最後まで出る
 * （`components/ui/Longer.tsx`）。
 */
export default function MyStuff({
  stickies,
  plans,
  cards,
  planDays,
  uid,
  hasChannel,
  onRetry,
  quiet = false,
}: {
  stickies: Bag<Sticky>;
  plans: Bag<NextPlan>;
  cards: Bag<ShownCard>;
  planDays: PlanDays;
  uid: string;
  /** YouTube のチャンネルが結び付いているか。カードの持ち主はこれで決まる */
  hasChannel: boolean;
  onRetry: () => void;
  /** 面のうえに、押しどころつきの「もう一度よみこむ」がもう出ているか */
  quiet?: boolean;
}) {
  const [tab, setTab] = useState<Tab>("note");
  /** **読めた数しか出さない。** 待っているあいだも、読めなかったときも空欄 */
  const count = (b: Bag<unknown>) => (b.st === "ok" ? String(b.list.length) : "");

  return (
    <section className="panel paper">
      <h2>じぶんのもの</h2>
      <div className="mp-tabs is-3" role="tablist" aria-label="じぶんのもの">
        {(
          [
            ["note", "付箋", count(stickies)],
            ["plan", "企画", count(plans)],
            ["card", "カード", hasChannel ? count(cards) : ""],
          ] as const
        ).map(([id, label, n]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            className={`mp-tab${tab === id ? " is-on" : ""}`}
            onClick={() => setTab(id as Tab)}
          >
            <span className="mp-tab-l">{label}</span>
            <span className="mp-tab-n">{n}</span>
          </button>
        ))}
      </div>

      <div className="mp-stuff">
        {tab === "note" && <Notes notes={stickies} onRetry={onRetry} quiet={quiet} />}
        {tab === "plan" && (
          <Plans plans={plans} uid={uid} onRetry={onRetry} quiet={quiet} />
        )}
        {tab === "card" && (
          <Cards
            cards={cards}
            planDays={planDays}
            hasChannel={hasChannel}
            onRetry={onRetry}
            quiet={quiet}
          />
        )}
      </div>
    </section>
  );
}

function Notes({
  notes,
  onRetry,
  quiet,
}: {
  notes: Bag<Sticky>;
  onRetry: () => void;
  quiet: boolean;
}) {
  if (notes.st === "wait") return <Waiting />;
  if (notes.st === "down") return <ReadAgain what="付箋" onRetry={onRetry} quiet={quiet} />;
  if (notes.list.length === 0)
    return (
      <div className="blank">
        <b>まだ1枚も貼っていません</b>
        <p>むちゃな注文ほど、だいたい通ります。</p>
        <Link className="blank-go" href="/board">
          板に貼りにいく
          <Icon name="right" size={14} />
        </Link>
      </div>
    );
  return (
    <Longer items={notes.list} first={3} step={8} unit="枚" className="mp-notes">
      {(n, i) => {
        const th = themeById(n.theme);
        return (
          <li key={n.id}>
            <Pin tone={["#e8879a", "#5fbde0", "#8dd06a", "#f2b53d"][i % 4]} />
            {/* **自分が書いたまま出す**（#83） */}
            <Wrote t={n.text} as="p" className="mp-note-text" />
            {/* テーマと日付は札にしない。**枠と余白のぶんだけ背が伸びる**し、
                押せない札が押しどころの隣に並ぶと、合図が濁る。 */}
            <p className="mp-note-foot">
              <span>{th?.name ?? n.theme}</span>
              {jstDay(n.createdAt) && <span>{jstDay(n.createdAt)}</span>}
              {n.hearts > 0 && (
                <span className="mp-hearts">
                  <svg viewBox="0 0 24 22" aria-hidden>
                    <path
                      d="M12 20.6C6.2 16.6 2 13 2 8.6 2 5.5 4.4 3 7.5 3c1.8 0 3.5.9 4.5 2.3C13 3.9 14.7 3 16.5 3 19.6 3 22 5.5 22 8.6c0 4.4-4.2 8-10 12z"
                      fill="currentColor"
                    />
                  </svg>
                  {n.hearts}
                </span>
              )}
            </p>
            {n.reply && (
              <p className="mp-reply">
                <b>あやとから</b>
                <Wrote t={n.reply} />
              </p>
            )}
          </li>
        );
      }}
    </Longer>
  );
}

function Plans({
  plans,
  uid,
  onRetry,
  quiet,
}: {
  plans: Bag<NextPlan>;
  uid: string;
  onRetry: () => void;
  quiet: boolean;
}) {
  if (plans.st === "wait") return <Waiting />;
  if (plans.st === "down") return <ReadAgain what="企画" onRetry={onRetry} quiet={quiet} />;
  if (plans.list.length === 0)
    return (
      <div className="blank">
        <b>まだ1つも出していません</b>
        <p>題ひとつでいい。日にちも場所も、あとから足せる。</p>
        <Link className="blank-go" href="/board">
          企画を出しにいく
          <Icon name="right" size={14} />
        </Link>
      </div>
    );
  return (
    <Longer items={plans.list} first={4} step={10} unit="件" className="mp-plans">
      {(p) => {
        const edit = canEditPlan(p, uid, myPlans());
        return (
          <li key={p.id}>
            <span className="mp-plan-t">
              <b>{p.title || "（題なし）"}</b>
              <i>
                <span>{PLAN_STATUS_NAME[p.status]}</span>
                {jstDay(p.createdAt) && <span>{jstDay(p.createdAt)}</span>}
                {p.hearts > 0 && <span>さんせい {p.hearts}</span>}
              </i>
            </span>
            {edit === "ok" && (
              <Link className="mp-go" href={`/next/new?id=${p.id}`}>
                そだてる
                <Icon name="right" size={13} />
              </Link>
            )}
          </li>
        );
      }}
    </Longer>
  );
}

/**
 * もらったカード。
 *
 * カードは配られておらず、その日の写真とその日の名簿から引くたびに
 * 組み立てられている（`functions/src/cards.ts`）。だから、あとから名簿が
 * 入った日のカードも、次に開いたときには並んでいる。
 *
 * チャンネルが結び付いていない人には「無い」と言わない（本人のせいではないし、
 * 実際にはもらっているかもしれない）。全部の並びへの行き先だけを出す。
 */
function Cards({
  cards,
  planDays,
  hasChannel,
  onRetry,
  quiet,
}: {
  cards: Bag<ShownCard>;
  planDays: PlanDays;
  hasChannel: boolean;
  onRetry: () => void;
  quiet: boolean;
}) {
  if (cards.st === "down")
    return <ReadAgain what="カード" onRetry={onRetry} quiet={quiet} />;
  if (cards.st === "wait")
    return (
      <div className="wait is-card" aria-hidden>
        <span />
        <span />
      </div>
    );
  if (cards.list.length === 0)
    return (
      <div className="blank">
        <b>{hasChannel ? "まだ1枚もありません" : "ここに、もらったカードが並びます"}</b>
        <p>配信で投げ銭すると、翌朝1枚とどきます。</p>
        <Link className="blank-go" href="/cards">
          配られたカードを見る
          <Icon name="right" size={14} />
        </Link>
      </div>
    );
  return (
    <Longer items={cards.list} first={4} step={8} unit="枚" as="div" className="akd-grid">
      {(c) => <CardOne key={c.id} card={c} plans={planDays[c.day]} showName={false} />}
    </Longer>
  );
}
