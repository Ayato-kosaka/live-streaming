"use client";

import { useCallback, useEffect, useState } from "react";
import {
  PLAN_STATUS_NAME,
  archiveNextPlan,
  archiveSticky,
  getArchivedPlans,
  getArchivedStickies,
  getMyStickies,
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
import Icon from "@/components/ui/IconCore";
import Longer from "@/components/ui/Longer";

/** 「2026-09-06T…」→「9月6日」 */
const day = (iso: string) =>
  `${Number(iso.slice(5, 7))}月${Number(iso.slice(8, 10))}日`;

/**
 * まだ返していない付箋。
 *
 * **運営者が立てた付箋（`byOwner`）は数えない。** あれは返事を待つ
 * 質問ではなく、こちらから出した選択肢なので、返さなくても片づいている。
 *
 * **あやと自身が貼った付箋も、返す一覧に出さない**（あやとの言葉・2026-09-09
 * 「付箋返しのリストに私の付箋を載せるのはやめてほしい」）。自分の付箋に
 * 自分で返す用事は無いのに、返していない数に入って赤いままになっていた。
 *
 * ## 見分けかた
 *
 * **名前では突き合わせない。** 表示名は本人が決めるもので、同じ名前の人が
 * 2人いた事故がこの島で実際にある。`uid` で見分ける。
 *
 * ただし一覧の口（`stickyShape`）は uid も cid も返さない。返すと、
 * 同じ人の付箋を並べて数えられてしまうので、そこは開けない決めになっている。
 * かわりに**自分のぶんだけを返す口**（`/stickies?mine=1`。サーバー側で
 * uid で絞る）をもう1回引いて、その id を一覧から差し引く。
 * 公開する形は増えないし、名前を突き合わせずに済む。
 *
 * `byOwner` と同じ扱いにする。**消さずに、返す対象から外すだけ**なので、
 * 「ぜんぶ見る」と「しまったもの」には今までどおり出る。自分の付箋を
 * しまう道は残しておく。
 */
export function StickyCare() {
  const { token } = useAuth();
  const [notes, setNotes] = useState<Sticky[] | null>(null);
  /** あやと自身が貼った付箋の id。引けるまでは null（0枚と区別する） */
  const [own, setOwn] = useState<Set<string> | null>(null);
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

  useEffect(() => {
    let gone = false;
    (async () => {
      const t = await token();
      if (gone) return;
      if (!t) return setOwn(new Set());
      try {
        const r = await getMyStickies(t);
        if (!gone) setOwn(new Set(r.notes.map((n) => n.id)));
      } catch {
        /* 引けなかった日は、差し引かずに出す。**返す道が消えるより、
           自分のぶんが混ざるほうがまし。** */
        if (!gone) setOwn(new Set());
      }
    })();
    return () => {
      gone = true;
    };
  }, [token]);

  /** 返す相手のいる付箋か。**数と一覧で同じ物差しを使う**（片方だけ減らさない） */
  const todo = (n: Sticky) => !n.reply && !n.byOwner && !own?.has(n.id);
  const shown = (notes ?? []).filter((n) => bin || all || todo(n));
  const waiting = (notes ?? []).filter(todo).length;
  /* 自分のぶんを引く前に数を出すと、開いた直後だけ多い数が見えて、
     すぐ減る。**動く数字を出すくらいなら、出るのを待つ。** */
  const reading = notes === null || own === null;

  return (
    <>
      <p className="mp-now">
        {reading ? "読んでいます…" : <>まだ返していないのが <b>{waiting}</b> 枚</>}
      </p>
      {reading ? (
        <div className="wait is-row" aria-hidden>
          <span />
          <span />
        </div>
      ) : shown.length === 0 ? (
        <p className="muted">
          {bin ? "しまったものはありません。" : "ぜんぶ返しました。"}
        </p>
      ) : (
        /* 返していない付箋は、返すまで減らない。**上から順に返す道具**なので、
           はじめは4枚だけ出す。1枚が「本文・札・打つ欄・押しどころ2つ」の
           4段（約 350px）あるので、8枚出すと机が 3,600px になる（実測）。
           片づけるのに、6枚目が見えている必要はない。 */
        <Longer items={shown} first={4} step={12} unit="枚" className="mp-care">
          {(n) => (
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
          )}
        </Longer>
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
    </>
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
export function PlanCare() {
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
    <>
      <p className="mp-now">
        {plans === null ? "読んでいます…" : <>いま <b>{plans.length}</b> 件</>}
      </p>
      {plans === null ? (
        <div className="wait is-row" aria-hidden>
          <span />
          <span />
        </div>
      ) : plans.length === 0 ? (
        <p className="muted">{bin ? "しまったものはありません。" : "まだ1件もありません。"}</p>
      ) : (
        /* 1件が「題・札・段の欄・id の欄・押しどころ2つ」の6段ある。
           付箋と同じ理由で4件（`StickyCare`）。 */
        <Longer items={plans} first={4} step={12} unit="件" className="mp-care">
          {(p) => (
            <PlanRow
              key={p.id}
              plan={p}
              stowed={bin}
              onChanged={(next) =>
                setPlans((cur) => cur?.map((x) => (x.id === p.id ? next : x)) ?? cur)
              }
              onStowed={() => setPlans((cur) => cur?.filter((x) => x.id !== p.id) ?? cur)}
            />
          )}
        </Longer>
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
    </>
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
