"use client";

import { useEffect, useRef, useState } from "react";
import { getState, postNote, type NextNote } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { PLANS, daysUntil, planDaysLeft, type Plan } from "@/content/plans";
import Fold from "@/components/ui/Fold";
import Icon from "@/components/ui/Icon";
import PlanCard from "./PlanCard";
import { NoticeBell, Pin, Stone } from "./art";

/** 日付の早い順。日付の無いものは後ろ。 */
const byDate = (a: Plan, b: Plan) => (a.date ?? "9999").localeCompare(b.date ?? "9999");

/** 「9/6」 */
const short = (date?: string) => {
  if (!date) return "";
  const [, m, d] = date.split("-");
  return `${Number(m)}/${Number(d)}`;
};

/**
 * 付箋に何を書けばいいのかの見本。
 *
 * 空の入力欄と「貼る」ボタンだけ置いても、人は何も書けない。
 * 押すと書き出しが入るところまで用意して、続きだけ書けばいい形にする。
 */
const SEEDS = [
  "ここ行くといいよ：",
  "これ食べてみて：",
  "これ気をつけて：",
  "去年行った人から：",
];

/**
 * 企画1つぶんの付箋。
 *
 * 親の中で定義すると、1文字打つたびに作り直されて入力欄からカーソルが外れる。
 * 必ずここ（モジュールの直下）に置く。
 */
function PlanNotes({
  plan,
  notes,
  draft,
  busy,
  onDraft,
  onAdd,
}: {
  plan: Plan;
  /** 取りに行っている最中は null。0枚と区別する（読む前に「まだ1枚もありません」と言わない） */
  notes: NextNote[] | null;
  draft: string;
  busy: boolean;
  onDraft: (v: string) => void;
  onAdd: () => void;
}) {
  const box = useRef<HTMLInputElement>(null);
  // 画びょうの色。並べたときに同じ色が続かないよう、4色を順に回す
  const pins = ["#e8879a", "#5fbde0", "#8dd06a", "#f2b53d"];

  return (
    <>
      <div className="nx-noteshead">
        <h3 className="sub" id={`${plan.id}-notes`} style={{ scrollMarginTop: 78, margin: "18px 0 0" }}>
          みんなの付箋
        </h3>
        {!!notes?.length && (
          <span className="bd-count">
            <b>{notes.length}</b>枚
          </span>
        )}
      </div>

      {notes === null ? (
        /* 取りに行っているあいだは、出てくる付箋と同じ形の灰色を置く。
           空の配列から始めると、読む前に「まだ1枚もありません」と嘘をつくことになる。 */
        <ul className="nx-notes is-wait" aria-hidden>
          <li />
          <li />
          <li />
        </ul>
      ) : notes.length === 0 ? (
        <p className="muted" style={{ marginTop: "var(--sp-2)" }}>
          まだ1枚もありません。行ったことがある、聞いたことがある、なんでも。
        </p>
      ) : (
        <ul className="nx-notes">
          {notes.map((n, i) => (
            <li key={n.id}>
              <span className="nx-pin">
                <Pin tone={pins[i % pins.length]} size={19} />
              </span>
              {n.text}
            </li>
          ))}
        </ul>
      )}

      <div className="noteform" style={{ marginTop: "var(--sp-4)" }}>
        <input
          ref={box}
          value={draft}
          onChange={(e) => onDraft(e.target.value)}
          placeholder="ここ行くといいよ / これ食べて / これ気をつけて"
          maxLength={120}
          aria-label={`${plan.title} に付箋を貼る`}
          onKeyDown={(e) => {
            if (e.key === "Enter") onAdd();
          }}
        />
        <button onClick={onAdd} disabled={busy || !draft.trim()}>
          貼る
        </button>
      </div>

      <div className="nx-seeds">
        <span>書き出しを選ぶ</span>
        {SEEDS.map((s) => (
          <button
            key={s}
            className="nx-seed"
            onClick={() => {
              // すでに書いてあるものを消さない。書き出しは前に足すだけ
              onDraft(draft.startsWith(s) ? draft : s + draft);
              box.current?.focus();
            }}
          >
            {s}
          </button>
        ))}
      </div>
    </>
  );
}

/**
 * これからの道のり。
 *
 * 予定を縦の点線でつなぐのではなく、島の道の飛び石として並べる。
 * 何個あって、どの順に来るのかが、字を読む前に形で分かる。
 */
function Road({ plans, today }: { plans: Plan[]; today: Date | null }) {
  return (
    <ul className="nx-road">
      {plans.map((p, i) => {
        const d = today ? planDaysLeft(p, today) : null;
        return (
          <li key={p.id}>
            <span className="nx-stone">
              <Stone tone={i === 0 ? "now" : "stone"} />
              <b>{i + 1}</b>
            </span>
            <div className="nx-road-b">
              <div className="nx-road-when">
                <time>{p.when}</time>
                {d !== null && (
                  <span className={`count${d === 0 ? " is-today" : ""}`}>
                    {d === 0 ? "今日" : <>あと<b>{d}</b>日</>}
                  </span>
                )}
              </div>
              <a className="nx-road-t" href={`#${p.id}`}>
                <b>{p.title}</b>
                <i>{p.note}</i>
              </a>
              <a className="nx-road-go" href={`#${p.id}`}>
                {i === 0 ? "上に書いてあります" : "この企画を見る"}
                {/* いちばん近い企画の札はこの上にあるので、矢印も上を向ける */}
                <Icon name={i === 0 ? "up" : "chevron"} size={13} />
              </a>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * これからの企画ぜんぶ。
 *
 * 島に来た人がまっさきに知りたいのは「次に何をするのか」。
 * だからいちばん近い企画だけを主役として大きく開いておき、
 * そのあとの企画は日付順に、題名と日付で追えるように並べる。
 *
 * 静的書き出しなので「もう終わったかどうか」はビルド時の日付で焼き込まれてしまう。
 * 画面が出るまでは日付順に全部を「これから」として出し、
 * 出てから今日の日付で、終わったものを畳む。
 */
export default function NextPlans() {
  const [notes, setNotes] = useState<NextNote[] | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [today, setToday] = useState<Date | null>(null);
  const { token } = useAuth();

  useEffect(() => {
    setToday(new Date());
    getState()
      .then((s) => setNotes(s.notes ?? []))
      // 読めなかったときも0枚として置く。付箋は読めなくても「貼る」はできるので、
      // ここで手を止めさせない
      .catch(() => setNotes([]));
  }, []);

  const add = async (planId: string) => {
    const text = (draft[planId] ?? "").trim();
    if (!text) return;
    setBusy(planId);
    setErr(null);
    try {
      const { note } = await postNote(planId, text, await token());
      setNotes((n) => [note, ...(n ?? [])]);
      setDraft((d) => ({ ...d, [planId]: "" }));
    } catch {
      setErr("いま貼れなかった。少し待ってから、もう一度ためしてみて。");
    } finally {
      setBusy(null);
    }
  };

  const sorted = [...PLANS].sort(byDate);
  const done = today ? sorted.filter((p) => (daysUntil(p.date, today) ?? 0) < 0) : [];
  const ahead = sorted.filter((p) => !done.includes(p));
  const [lead, ...rest] = ahead;

  const notesFor = (p: Plan) => notes?.filter((n) => n.planId === p.id) ?? null;
  const notesProps = (p: Plan) => ({
    plan: p,
    notes: notesFor(p),
    draft: draft[p.id] ?? "",
    busy: busy === p.id,
    onDraft: (v: string) => setDraft((d) => ({ ...d, [p.id]: v })),
    onAdd: () => add(p.id),
  });

  const leadDays = lead && today ? planDaysLeft(lead, today) : null;

  return (
    <>
      {/* しらせ。「何件あって、次は何か」だけを、いちばん上で言う。
          赤い丸は「まだ見ていないものがある」の合図で、島じゅうでこれ1種類しか使わない。
          あと何日かは、すぐ下の札が大きい数字で言う。ここで先に言うと同じ数が2回出る。 */}
      {ahead.length > 0 && (
        <div className="nx-notice">
          <NoticeBell size={34} />
          <span className="nx-notice-t">
            <b>これからの予定が{ahead.length}件</b>
            {lead && (
              <i>
                {leadDays === 0 ? "今日は " : `つぎは ${short(lead.date)} `}
                {lead.title}
              </i>
            )}
          </span>
        </div>
      )}

      {lead && (
        <PlanCard plan={lead} lead>
          <PlanNotes {...notesProps(lead)} />
        </PlanCard>
      )}

      {/* 予定がいくつあって、どの順で来るのか。
          札を縦に読ませる前に、道のりの形だけ先に見せる。 */}
      {ahead.length > 1 && (
        <section className="panel paper">
          <h2>これからの道のり</h2>
          <p className="muted">上から順に踏んでいきます。押すと、その企画のところまで飛びます。</p>
          <Road plans={ahead} today={today} />
        </section>
      )}

      {rest.map((p) => (
        <PlanCard plan={p} key={p.id}>
          <PlanNotes {...notesProps(p)} />
        </PlanCard>
      ))}

      {done.length > 0 && (
        <div style={{ marginBottom: "var(--sp-5)" }}>
          <Fold
            title="もう行ってきた企画"
            note={`${done.length}件`}
            lead="貼ってもらった付箋も、そのまま残っている"
          >
            {done.map((p) => (
              <PlanCard plan={p} key={p.id}>
                <PlanNotes {...notesProps(p)} />
              </PlanCard>
            ))}
          </Fold>
        </div>
      )}

      {err && (
        <p className="err">
          <Icon name="alert" size={13} /> {err}
        </p>
      )}
    </>
  );
}
