"use client";

import { useEffect, useState } from "react";
import { getIdeas, postIdea, rememberVote, voteIdea, votedLocally, type Idea } from "@/lib/api";
import { BOARD } from "@/content/voice";

export default function Board() {
  const [ideas, setIdeas] = useState<Idea[] | null>(null);
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [sending, setSending] = useState(false);
  const [voted, setVoted] = useState<Set<string>>(new Set());
  const [err, setErr] = useState<string | null>(null);
  const [sort, setSort] = useState<"votes" | "new">("votes");

  useEffect(() => {
    setVoted(votedLocally());
    getIdeas()
      .then((r) => setIdeas(r.ideas))
      .catch(() => setIdeas([]));
  }, []);

  const submit = async () => {
    const t = text.trim();
    if (t.length < 4) {
      setErr(BOARD.tooShort);
      return;
    }
    setSending(true);
    setErr(null);
    try {
      const { idea } = await postIdea(t, name.trim() || undefined);
      setIdeas((cur) => [idea, ...(cur ?? [])]);
      setText("");
    } catch (e) {
      setErr(String(e).includes("429") ? BOARD.tooMany : BOARD.failed);
    } finally {
      setSending(false);
    }
  };

  const vote = async (id: string) => {
    if (voted.has(id)) return;
    setIdeas((cur) => cur?.map((i) => (i.id === id ? { ...i, votes: i.votes + 1 } : i)) ?? cur);
    rememberVote(id);
    setVoted(new Set([...voted, id]));
    try {
      await voteIdea(id);
    } catch {
      /* 楽観更新のまま。次の読み込みで正しい数に戻る */
    }
  };

  const list = [...(ideas ?? [])].sort((a, b) =>
    sort === "votes" ? b.votes - a.votes || (a.createdAt < b.createdAt ? 1 : -1) : a.createdAt < b.createdAt ? 1 : -1,
  );

  return (
    <>
      <section className="panel">
        <h2>{BOARD.postTitle}</h2>
        <p className="muted">{BOARD.postNote}</p>
        <textarea
          className="bin"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          maxLength={200}
          placeholder={BOARD.placeholder}
        />
        <div className="brow">
          <input
            className="bin"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
            placeholder={BOARD.namePlaceholder}
          />
          <button className="bbtn" onClick={submit} disabled={sending}>
            {sending ? BOARD.submitting : BOARD.submit}
          </button>
        </div>
        {err && <p className="err">{err}</p>}
      </section>

      <section className="panel">
        <div className="bhead">
          <h2 style={{ margin: 0 }}>{BOARD.listTitle}</h2>
          <div className="bsort">
            <button className={sort === "votes" ? "is-on" : ""} onClick={() => setSort("votes")}>
              {BOARD.sortVotes}
            </button>
            <button className={sort === "new" ? "is-on" : ""} onClick={() => setSort("new")}>
              {BOARD.sortNew}
            </button>
          </div>
        </div>

        {ideas === null && <p className="muted">{BOARD.loading}</p>}
        {ideas?.length === 0 && <p className="muted">{BOARD.empty}</p>}

        <ul className="ideas">
          {list.map((i) => (
            <li key={i.id} className={i.status === "picked" ? "is-picked" : ""}>
              <button
                className={`vote${voted.has(i.id) ? " is-on" : ""}`}
                onClick={() => vote(i.id)}
                aria-label={BOARD.agree}
              >
                <svg viewBox="0 0 24 22" aria-hidden>
                  <path
                    d="M12 20.6C6.2 16.6 2 13 2 8.6 2 5.5 4.4 3 7.5 3c1.8 0 3.5.9 4.5 2.3C13 3.9 14.7 3 16.5 3 19.6 3 22 5.5 22 8.6c0 4.4-4.2 8-10 12z"
                    fill="currentColor"
                  />
                </svg>
                <b>{i.votes}</b>
              </button>
              <div className="idea-body">
                <p>{i.text}</p>
                <div className="idea-meta">
                  {i.name && <span>{i.name} さん</span>}
                  <time>{i.createdAt.slice(0, 10).replace(/-/g, "/")}</time>
                  {i.status === "picked" && <em>{BOARD.picked}</em>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
