"use client";

import { useEffect, useRef, useState } from "react";
import { getState, postNote, type NextNote } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { PLANS, daysUntil, type Plan } from "@/content/plans";
import Fold from "@/components/ui/Fold";
import Icon from "@/components/ui/Icon";
import PlanCard, { PlanRow } from "./PlanCard";
import { Pin } from "./art";

/** 日付の早い順。日付の無いものは後ろ。 */
const byDate = (a: Plan, b: Plan) => (a.date ?? "9999").localeCompare(b.date ?? "9999");

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
/**
 * 付箋の欄。
 *
 * 企画が5つあると、入力欄が5つ縦に並ぶ（`docs/island-ux.md` 5.8）。
 * いちばん近い1つだけ開いておいて、残りは枚数だけ見せて畳む。
 * 畳んだ側も、見出しに枚数が出ているので「何枚貼られているか」は分かる。
 */
function PlanNotes({
  plan,
  notes,
  draft,
  busy,
  onDraft,
  onAdd,
  open = false,
}: {
  plan: Plan;
  /** 取りに行っている最中は null。0枚と区別する（読む前に「まだ1枚もありません」と言わない） */
  notes: NextNote[] | null;
  draft: string;
  busy: boolean;
  onDraft: (v: string) => void;
  onAdd: () => void;
  /** いちばん近い企画だけ開いておく */
  open?: boolean;
}) {
  const box = useRef<HTMLInputElement>(null);
  // 画びょうの色。並べたときに同じ色が続かないよう、4色を順に回す
  const pins = ["#e8879a", "#5fbde0", "#8dd06a", "#f2b53d"];

  const body = (
    <>
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

  if (open) {
    return (
      <>
        <div className="nx-noteshead">
          <h3 className="sub" id={`${plan.id}-notes`} style={{ scrollMarginTop: 78, margin: "var(--sp-4) 0 0" }}>
            みんなの付箋
          </h3>
          {!!notes?.length && (
            <span className="bd-count">
              <b>{notes.length}</b>枚
            </span>
          )}
        </div>
        {body}
      </>
    );
  }

  return (
    <div id={`${plan.id}-notes`} style={{ scrollMarginTop: 78, marginTop: "var(--sp-4)" }}>
      <Fold
        title="みんなの付箋"
        note={notes === null ? undefined : `${notes.length}枚`}
        lead={notes?.length ? "知ってることを1行だけ足せる" : "1枚目を貼れる"}
      >
        {body}
      </Fold>
    </div>
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

  return (
    <>
      {/* しらせの帯を外した。すぐ下の札が「あと何日」を大きい数字で言っていて、
          帯はその同じことを小さい字でもう一度言っていた（同じ数が2回出る）。
          件数は道のりの見出しが持っている。 */}
      {lead && (
        <PlanCard plan={lead}>
          <PlanNotes {...notesProps(lead)} open />
        </PlanCard>
      )}

      {/* これからの予定が1つも無い日。「まだ何も無い」で終わらせず、
          次にすることを1つ置く（`docs/island-design.md` 4章）。
          today が入るまでは出さない。焼き込みの日付で「予定なし」と言わない。 */}
      {today && ahead.length === 0 && (
        <section className="panel paper">
          <h2>いま、決まっている予定はありません</h2>
          <p>
            次の企画は、たいてい掲示板から生まれます。むちゃなものほど通るので、思いついたことをそのまま。
          </p>
        </section>
      )}

      {/* このあとの予定。**一覧と札を分けない。**
          飛び石の段がそのまま開いて中身になる（`docs/island-ux.md` 5.8）。
          目次と本文を並べて置くと、押した先に同じ題名がもう一度出てくる。 */}
      {rest.length > 0 && (
        <section className="panel paper">
          <h2>このあと、どこへ行くんだろう</h2>
          <p className="muted">
            石の上の日付が、その企画の日。押すと、その場で中身が開きます。
          </p>
          <ul className="nx-road">
            {rest.map((p) => (
              <PlanRow plan={p} key={p.id}>
                <PlanNotes {...notesProps(p)} />
              </PlanRow>
            ))}
          </ul>
        </section>
      )}

      {done.length > 0 && (
        <section className="panel paper">
          <h2>もう行ってきた</h2>
          <p className="muted">貼ってもらった付箋も、そのまま残っています。</p>
          <ul className="nx-road">
            {done.map((p) => (
              <PlanRow plan={p} key={p.id}>
                <PlanNotes {...notesProps(p)} />
              </PlanRow>
            ))}
          </ul>
        </section>
      )}

      {err && (
        <p className="err">
          <Icon name="alert" size={13} /> {err}
        </p>
      )}
    </>
  );
}
