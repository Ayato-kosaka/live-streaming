"use client";

import { useCallback, useEffect, useState } from "react";
import {
  PLAN_STATUS_NAME,
  archiveNextPlan,
  archiveSticky,
  getArchivedPlans,
  getArchivedStickies,
  getNextPlans,
  getStickies,
  replySticky,
  setPlanStatus,
  type NextPlan,
  type PlanStatus,
  type Sticky,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { themeById } from "@/content/themes";
import Fold from "@/components/ui/Fold";
import Icon from "@/components/ui/IconCore";

/**
 * 島の手入れ。**あやとだけ。**
 *
 * 付箋への返信も、企画の段も、いままで掲示板（`/board`）の中にあった。
 * あれは**貼ってある順に並んだ板**なので、「まだ返していないもの」を
 * 探すには全部を目で追うことになる。返す側の用事は「返していないものが
 * 何枚あるか」なので、そこだけを抜いた一覧をここに置く。
 *
 * 掲示板側の道具は**そのまま残してある。** 読んでいる流れで返せるのが
 * あちらの良さで、ここは「たまった順に片づける」ほう。用事が違う。
 *
 * 出るかどうかは `/me` の `admin` で決めているが、それは道具を出すかどうかの
 * 話でしかない。実際に書けるかは、書く先の口がもう一度見ている
 * （`functions/src/islandApi.ts` の `ownerUid`）。
 *
 * **畳んで置く。** 旅の途中に開くものではないので、旅の道具の下。
 */
export default function OwnerCare() {
  return (
    <section className="panel paper">
      <h2>島の手入れ</h2>
      <div className="folds">
        <StickyCare />
        <PlanCare />
      </div>
    </section>
  );
}

/** 「2026-09-06T…」→「9月6日」 */
const day = (iso: string) =>
  `${Number(iso.slice(5, 7))}月${Number(iso.slice(8, 10))}日`;

/**
 * まだ返していない付箋。
 *
 * **運営者が立てた付箋（`byOwner`）は数えない。** あれは returns を待つ
 * 質問ではなく、こちらから出した選択肢なので、返さなくても片づいている。
 */
function StickyCare() {
  const { token } = useAuth();
  const [notes, setNotes] = useState<Sticky[] | null>(null);
  /** しまったものを見ているか */
  const [bin, setBin] = useState(false);
  const [all, setAll] = useState(false);

  const load = useCallback(async () => {
    setNotes(null);
    try {
      const r = await getStickies({ limit: 300 });
      setNotes(r.notes);
    } catch {
      setNotes([]);
    }
  }, []);

  const loadBin = useCallback(async () => {
    setNotes(null);
    const t = await token();
    if (!t) return setNotes([]);
    try {
      const r = await getArchivedStickies(t);
      setNotes(r.notes);
    } catch {
      setNotes([]);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const shown = (notes ?? []).filter(
    (n) => bin || all || (!n.reply && !n.byOwner),
  );
  const waiting = (notes ?? []).filter((n) => !n.reply && !n.byOwner).length;

  return (
    <Fold
      title="付箋に返す"
      lead={notes === null ? "読んでいます…" : `まだ返していないのが ${waiting} 枚`}
      note={notes === null ? undefined : String(waiting)}
    >
      {notes === null ? (
        <div className="wait is-row" aria-hidden>
          <span />
          <span />
        </div>
      ) : shown.length === 0 ? (
        <p className="muted">
          {bin ? "しまったものはありません。" : "ぜんぶ返しました。"}
        </p>
      ) : (
        <ul className="mp-care">
          {shown.map((n) => (
            <StickyRow
              key={n.id}
              note={n}
              stowed={bin}
              onChanged={(next) =>
                setNotes(
                  (cur) => cur?.map((x) => (x.id === n.id ? next : x)) ?? cur,
                )
              }
              onStowed={() =>
                setNotes((cur) => cur?.filter((x) => x.id !== n.id) ?? cur)
              }
            />
          ))}
        </ul>
      )}
      <div className="mp-care-acts">
        <button
          className="nt-obtn"
          onClick={() => {
            setBin(false);
            setAll((v) => !v);
            if (bin) load();
          }}
        >
          {all && !bin ? "返していないものだけ" : "ぜんぶ見る"}
        </button>
        <button
          className="nt-obtn"
          onClick={() => {
            const next = !bin;
            setBin(next);
            setAll(false);
            next ? loadBin() : load();
          }}
        >
          {bin ? "貼ってあるものに戻る" : "しまったものを見る"}
        </button>
      </div>
    </Fold>
  );
}

/** 1枚。返す・しまう。**押しどころは、旅の途中でも押せる大きさにする。** */
function StickyRow({
  note,
  stowed,
  onChanged,
  onStowed,
}: {
  note: Sticky;
  stowed: boolean;
  onChanged: (n: Sticky) => void;
  onStowed: () => void;
}) {
  const { token } = useAuth();
  const [text, setText] = useState(note.reply ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const th = themeById(note.theme);

  const reply = async () => {
    const t = await token();
    if (!t) return;
    setBusy(true);
    setErr(false);
    try {
      const r = await replySticky(note.id, text.trim(), t);
      onChanged({
        ...note,
        reply: r.reply ?? undefined,
        repliedAt: r.repliedAt ?? undefined,
      });
    } catch {
      // 書けなかったら、打った字はそのまま残す
      setErr(true);
    } finally {
      setBusy(false);
    }
  };

  const stow = async () => {
    const t = await token();
    if (!t) return;
    setBusy(true);
    setErr(false);
    try {
      await archiveSticky(note.id, !stowed, t);
      onStowed();
    } catch {
      setErr(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <li>
      <p className="mp-care-text">{note.text}</p>
      <p className="mp-note-foot">
        <span className="chip">{th?.name ?? note.theme}</span>
        <span className="chip">{day(note.createdAt)}</span>
        {note.by && <span className="chip">{note.by}</span>}
      </p>
      <textarea
        className="bin"
        value={text}
        rows={2}
        maxLength={300}
        placeholder="ここに返す。空にすると取り消し"
        onChange={(e) => setText(e.target.value)}
      />
      <div className="mp-care-acts">
        <button className="mp-send is-small" disabled={busy} onClick={reply}>
          {busy ? "送っています…" : note.reply ? "返しなおす" : "返す"}
        </button>
        <button className="mp-send is-small is-quiet" disabled={busy} onClick={stow}>
          {stowed ? "もどす" : "しまう"}
        </button>
      </div>
      {err && (
        <p className="err">
          <Icon name="alert" size={13} /> いま送れませんでした。もう一度押してください。
        </p>
      )}
    </li>
  );
}

/**
 * 企画の段を動かす。
 *
 * 提案 → これから → やった。「これから」に上げるときは、Git 側の企画の id を
 * 結び付ける。**結び付けないと、板に出た提案と、実際に立っているページが、
 * 画面の上で他人のまま**になる（掲示板の道具と同じ決まり）。
 */
function PlanCare() {
  const { token } = useAuth();
  const [plans, setPlans] = useState<NextPlan[] | null>(null);
  const [bin, setBin] = useState(false);

  const load = useCallback(async () => {
    setPlans(null);
    try {
      const r = await getNextPlans(200);
      setPlans(r.plans);
    } catch {
      setPlans([]);
    }
  }, []);

  const loadBin = useCallback(async () => {
    setPlans(null);
    const t = await token();
    if (!t) return setPlans([]);
    try {
      const r = await getArchivedPlans(t);
      setPlans(r.plans);
    } catch {
      setPlans([]);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Fold
      title="企画の段を動かす"
      lead={plans === null ? "読んでいます…" : `いま ${plans.length} 件`}
    >
      {plans === null ? (
        <div className="wait is-row" aria-hidden>
          <span />
          <span />
        </div>
      ) : plans.length === 0 ? (
        <p className="muted">{bin ? "しまったものはありません。" : "まだ1件もありません。"}</p>
      ) : (
        <ul className="mp-care">
          {plans.map((p) => (
            <PlanRow
              key={p.id}
              plan={p}
              stowed={bin}
              onChanged={(next) =>
                setPlans((cur) => cur?.map((x) => (x.id === p.id ? next : x)) ?? cur)
              }
              onStowed={() => setPlans((cur) => cur?.filter((x) => x.id !== p.id) ?? cur)}
            />
          ))}
        </ul>
      )}
      <div className="mp-care-acts">
        <button
          className="nt-obtn"
          onClick={() => {
            const next = !bin;
            setBin(next);
            next ? loadBin() : load();
          }}
        >
          {bin ? "出ているものに戻る" : "しまったものを見る"}
        </button>
      </div>
    </Fold>
  );
}

function PlanRow({
  plan,
  stowed,
  onChanged,
  onStowed,
}: {
  plan: NextPlan;
  stowed: boolean;
  onChanged: (p: NextPlan) => void;
  onStowed: () => void;
}) {
  const { token } = useAuth();
  const [status, setStatus] = useState<PlanStatus>(plan.status);
  const [planId, setPlanId] = useState(plan.planId ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);

  const move = async () => {
    const t = await token();
    if (!t) return;
    setBusy(true);
    setErr(false);
    try {
      const r = await setPlanStatus(plan.id, status, planId.trim(), t);
      onChanged(r.plan);
    } catch {
      setErr(true);
    } finally {
      setBusy(false);
    }
  };

  const stow = async () => {
    const t = await token();
    if (!t) return;
    setBusy(true);
    setErr(false);
    try {
      await archiveNextPlan(plan.id, !stowed, t);
      onStowed();
    } catch {
      setErr(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <li>
      <p className="mp-care-text">{plan.title || "（題なし）"}</p>
      <p className="mp-note-foot">
        <span className="chip">いま {PLAN_STATUS_NAME[plan.status]}</span>
        {plan.by && <span className="chip">{plan.by}</span>}
        {plan.hearts > 0 && <span className="chip">さんせい {plan.hearts}</span>}
      </p>
      <label className="nph-post-row">
        <span>どの段へ</span>
        <select value={status} onChange={(e) => setStatus(e.target.value as PlanStatus)}>
          {(Object.keys(PLAN_STATUS_NAME) as PlanStatus[]).map((s) => (
            <option key={s} value={s}>
              {PLAN_STATUS_NAME[s]}
            </option>
          ))}
        </select>
      </label>
      <label className="nph-post-row">
        <span>ページの id</span>
        <input
          type="text"
          value={planId}
          maxLength={40}
          placeholder="nordic / iran-walk。空で外す"
          onChange={(e) => setPlanId(e.target.value)}
        />
      </label>
      <div className="mp-care-acts">
        <button className="mp-send is-small" disabled={busy} onClick={move}>
          {busy ? "動かしています…" : "動かす"}
        </button>
        <button className="mp-send is-small is-quiet" disabled={busy} onClick={stow}>
          {stowed ? "もどす" : "しまう"}
        </button>
      </div>
      {err && (
        <p className="err">
          <Icon name="alert" size={13} /> いま動かせませんでした。もう一度押してください。
        </p>
      )}
    </li>
  );
}
