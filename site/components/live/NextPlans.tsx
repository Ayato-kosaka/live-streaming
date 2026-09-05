"use client";

import { useEffect, useState } from "react";
import { getState, postNote, type NextNote } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { PLANS, daysUntil, type Plan } from "@/content/plans";
import Fold from "@/components/ui/Fold";
import Icon from "@/components/ui/Icon";
import PlanCard from "./PlanCard";

/** 日付の早い順。日付の無いものは後ろ。 */
const byDate = (a: Plan, b: Plan) => (a.date ?? "9999").localeCompare(b.date ?? "9999");

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
  notes: NextNote[];
  draft: string;
  busy: boolean;
  onDraft: (v: string) => void;
  onAdd: () => void;
}) {
  return (
    <>
      <h3 className="sub" id={`${plan.id}-notes`} style={{ scrollMarginTop: 78 }}>
        みんなの付箋{notes.length > 0 && `（${notes.length}枚）`}
      </h3>
      {notes.length === 0 ? (
        <p className="muted">まだ1枚もありません。知ってることがあったら貼ってください。</p>
      ) : (
        <ul className="notes">
          {notes.map((n) => (
            <li key={n.id}>{n.text}</li>
          ))}
        </ul>
      )}

      <div className="noteform">
        <input
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
    </>
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
  const [notes, setNotes] = useState<NextNote[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [today, setToday] = useState<Date | null>(null);
  const { token } = useAuth();

  useEffect(() => {
    setToday(new Date());
    getState()
      .then((s) => setNotes(s.notes ?? []))
      .catch(() => setNotes([]));
  }, []);

  const add = async (planId: string) => {
    const text = (draft[planId] ?? "").trim();
    if (!text) return;
    setBusy(planId);
    setErr(null);
    try {
      const { note } = await postNote(planId, text, await token());
      setNotes((n) => [note, ...n]);
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

  const notesFor = (p: Plan) => notes.filter((n) => n.planId === p.id);
  const notesProps = (p: Plan) => ({
    plan: p,
    notes: notesFor(p),
    draft: draft[p.id] ?? "",
    busy: busy === p.id,
    onDraft: (v: string) => setDraft((d) => ({ ...d, [p.id]: v })),
    onAdd: () => add(p.id),
  });

  return (
    <>
      {lead && (
        <>
          <p className="nextup-eyebrow">いちばん近いのはこれ</p>
          <PlanCard plan={lead} lead>
            <PlanNotes {...notesProps(lead)} />
          </PlanCard>
        </>
      )}

      {/* 予定がいくつあって、どの順で来るのか。
          札を縦に読ませる前に、道のりの形だけ先に見せる。 */}
      {ahead.length > 1 && (
        <section className="panel">
          <h2>これからの道のり</h2>
          <ul className="tl">
            {ahead.map((p, i) => {
              const d = today ? daysUntil(p.date, today) : null;
              return (
                <li key={p.id}>
                  <span
                    className="tl-dot"
                    style={{ background: i === 0 ? "var(--accent)" : "var(--frame)" }}
                  />
                  <div className="tl-head">
                    <time>{p.when}</time>
                    {d !== null && (
                      <span className={`count${d === 0 ? " is-today" : ""}`} style={{ marginLeft: 0 }}>
                        {d === 0 ? "今日" : <>あと<b>{d}</b>日</>}
                      </span>
                    )}
                  </div>
                  <div className="tl-body">
                    <b>{p.title}</b>
                    <i>{p.note}</i>
                    <a href={`#${p.id}`}>{i === 0 ? "上のカードに書いてあります" : "この企画を見る"}</a>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {rest.map((p) => (
        <PlanCard plan={p} key={p.id}>
          <PlanNotes {...notesProps(p)} />
        </PlanCard>
      ))}

      {done.length > 0 && (
        <div style={{ marginBottom: 22 }}>
          <Fold
            title="もう行ってきた企画"
            note={`${done.length}件`}
            lead="貼ってもらった付箋も、そのまま残してあります"
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
