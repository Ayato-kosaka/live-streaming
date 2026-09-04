"use client";

import { useEffect, useState } from "react";
import { getState, postNote, type NextNote } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { PLANS } from "@/content/plans";
import PlanCard from "./PlanCard";

export default function NextPlans() {
  const [notes, setNotes] = useState<NextNote[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const { token } = useAuth();

  useEffect(() => {
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

  return (
    <>
      {PLANS.map((p) => {
        const mine = notes.filter((n) => n.planId === p.id);
        return (
          <PlanCard plan={p} key={p.id}>
            <h3 className="sub">みんなの付箋</h3>
            {mine.length === 0 ? (
              <p className="muted">まだ付箋はありません。知ってることがあったら貼ってください。</p>
            ) : (
              <ul className="notes">
                {mine.map((n) => (
                  <li key={n.id}>{n.text}</li>
                ))}
              </ul>
            )}

            <div className="noteform">
              <input
                value={draft[p.id] ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, [p.id]: e.target.value }))}
                placeholder="ここ行くといいよ / これ食べて / これ気をつけて"
                maxLength={120}
                onKeyDown={(e) => {
                  if (e.key === "Enter") add(p.id);
                }}
              />
              <button onClick={() => add(p.id)} disabled={busy === p.id || !(draft[p.id] ?? "").trim()}>
                貼る
              </button>
            </div>
          </PlanCard>
        );
      })}
      {err && <p className="err">{err}</p>}
    </>
  );
}
